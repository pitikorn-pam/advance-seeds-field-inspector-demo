import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { loadTensorflowModel } from "react-native-fast-tflite";
import type {
  InstalledModelRecord,
  ModelCandidate,
  ModelCandidateManifest,
  ModelCandidatesIndex,
  ModelMetadata,
  ModelPlatform,
} from "./types";
import { currentModelPlatform, modelInstallDir, upsertInstalledModel } from "./modelStore";
import { sha256Base64 } from "./sha256";
import { validateModelMetadata } from "./compatibility";

const EXPORT_PREFIX = "runs/mobile-exports/";

export async function loadCandidatesFromIndex(indexUrl: string): Promise<ModelCandidate[]> {
  const cleanUrl = indexUrl.trim();
  if (!cleanUrl) throw new Error("Model index URL is required.");
  const index = await readJsonUrl<ModelCandidatesIndex>(cleanUrl, "Index");
  if (!Array.isArray(index.models)) throw new Error("Index is missing models[]");
  const platform = currentModelPlatform();
  return index.models.map((manifest) => candidateFromManifest(cleanUrl, manifest, platform));
}

function candidateFromManifest(
  indexUrl: string,
  manifest: ModelCandidateManifest,
  platform: ModelPlatform,
): ModelCandidate {
  const artifact = platform === "ios" ? manifest.artifacts.coreml : manifest.artifacts.tflite;
  const unsupportedReason =
    platform === "ios"
      ? "Core ML package import/compile is not enabled in this build yet."
      : artifact
        ? undefined
        : "Missing Android TFLite artifact.";
  return {
    id: manifest.key,
    displayName: manifest.display_name,
    quantization: manifest.quantization,
    manifest,
    manifestUrl: resolveExportUrl(indexUrl, `${manifest.key}/manifest.json`),
    metadataUrl: resolveExportUrl(indexUrl, manifest.metadata),
    artifactUrl: artifact ? resolveExportUrl(indexUrl, artifact.path) : null,
    platform,
    supported: !unsupportedReason,
    unsupportedReason,
  };
}

function resolveExportUrl(indexUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith("file://")) return path;
  const relative = path.startsWith(EXPORT_PREFIX) ? path.slice(EXPORT_PREFIX.length) : path;
  return new URL(
    relative,
    indexUrl.endsWith("/") ? indexUrl : indexUrl.replace(/[^/]*$/, ""),
  ).toString();
}

export async function installCandidate(candidate: ModelCandidate): Promise<InstalledModelRecord> {
  if (!candidate.supported || !candidate.artifactUrl) {
    throw new Error(candidate.unsupportedReason ?? "Candidate is not supported on this platform.");
  }
  if (Platform.OS !== "android") {
    throw new Error("Only Android TFLite dynamic activation is enabled in this build.");
  }
  const manifest = await readJsonUrl<ModelCandidateManifest>(
    candidate.manifestUrl,
    "Manifest",
  ).catch(() => candidate.manifest);
  const metadata = await readJsonUrl<ModelMetadata>(candidate.metadataUrl, "Metadata");
  const metadataErrors = validateModelMetadata(metadata);
  if (metadataErrors.length > 0) throw new Error(metadataErrors.join("; "));

  const artifact = manifest.artifacts.tflite;
  if (!artifact) throw new Error("Manifest is missing artifacts.tflite.");
  if (manifest.quantization !== "none" && manifest.quantization !== "fp16") {
    throw new Error(`Unsupported quantization ${manifest.quantization}`);
  }

  const cacheRoot = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheRoot) throw new Error("File system cache is unavailable.");
  const tmpDir = `${cacheRoot}model-install-${encodeURIComponent(manifest.key)}-${Date.now()}/`;
  const finalDir = modelInstallDir(manifest.key);
  await FileSystem.deleteAsync(tmpDir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(tmpDir, { intermediates: true });
  const tmpModel = `${tmpDir}model.tflite`;
  const artifactUrl = resolveExportUrl(candidate.manifestUrl, artifact.path);
  await copyOrDownload(artifactUrl, tmpModel);
  const actualHash = await sha256File(tmpModel);
  if (actualHash !== artifact.sha256.toLowerCase()) {
    throw new Error(`SHA-256 mismatch: expected ${artifact.sha256}, got ${actualHash}`);
  }
  await smokeTestTflite(tmpModel, metadata);
  await FileSystem.writeAsStringAsync(`${tmpDir}manifest.json`, JSON.stringify(manifest, null, 2));
  await FileSystem.writeAsStringAsync(
    `${tmpDir}model-metadata.json`,
    JSON.stringify(metadata, null, 2),
  );
  await FileSystem.deleteAsync(finalDir, { idempotent: true });
  await FileSystem.moveAsync({ from: tmpDir, to: finalDir });

  const record: InstalledModelRecord = {
    id: manifest.key,
    displayName: manifest.display_name,
    platform: "android",
    quantization: manifest.quantization,
    installedAt: new Date().toISOString(),
    status: "installed",
    artifactUri: `${finalDir}model.tflite`,
    artifactSha256: artifact.sha256.toLowerCase(),
    artifactSizeBytes: artifact.size_bytes,
    metadata,
    manifest,
    lastError: null,
  };
  await upsertInstalledModel(record);
  return record;
}

async function readJsonUrl<T>(url: string, label: string): Promise<T> {
  if (url.startsWith("file://")) {
    return JSON.parse(await FileSystem.readAsStringAsync(url)) as T;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} fetch failed: ${response.status}`);
  return (await response.json()) as T;
}

async function copyOrDownload(from: string, to: string): Promise<void> {
  if (from.startsWith("file://")) {
    await FileSystem.copyAsync({ from, to });
    return;
  }
  await FileSystem.downloadAsync(from, to);
}

export async function sha256File(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return sha256Base64(base64);
}

async function smokeTestTflite(uri: string, metadata: ModelMetadata): Promise<void> {
  const model = await loadTensorflowModel({ url: uri }, []);
  const input = model.inputs[0];
  if (!input || input.shape[1] !== metadata.input_size || input.shape[2] !== metadata.input_size) {
    throw new Error(`Smoke test input shape mismatch: ${input?.shape.join("x") ?? "none"}`);
  }
  const output = model.outputs[0];
  if (!output || output.shape.length !== 3 || output.shape[1] !== 300 || output.shape[2] < 38) {
    throw new Error(`Smoke test output shape mismatch: ${output?.shape.join("x") ?? "none"}`);
  }
  const inputCount = input.shape.reduce((acc, n) => acc * n, 1);
  const tensor =
    input.dataType === "uint8" ? new Uint8Array(inputCount) : new Float32Array(inputCount);
  await model.run([tensor.buffer as ArrayBuffer]);
}
