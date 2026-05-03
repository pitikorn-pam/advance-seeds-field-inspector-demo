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
  ModelQuantization,
} from "./types";
import { currentModelPlatform, modelInstallDir, upsertInstalledModel } from "./modelStore";
import { sha256Base64 } from "./sha256";
import { validateModelMetadata } from "./compatibility";

const EXPORT_PREFIX = "runs/mobile-exports/";
const REGISTRY_MODEL_LINE = "seeds-poc";

type DeploymentChannel = "staging" | "production";
type DeploymentMetadata = Record<string, unknown> & {
  artifacts?: {
    tflite?: { precision?: unknown };
    coreml?: { precision?: unknown };
  };
  dataset?: unknown;
  source_weights?: unknown;
  input_size?: unknown;
  class_names?: unknown;
  output_shape?: unknown;
  metrics?: unknown;
  hyperparameters?: unknown;
};

type DeployedModelsResponse = {
  model_line: string;
  channel: DeploymentChannel;
  platform: ModelPlatform;
  models: DeployedModel[];
};

type DeployedModel = {
  version_id: string;
  semver: string;
  platform: ModelPlatform;
  is_default: boolean;
  status: "ready" | "artifact_missing";
  artifact_url?: string;
  artifact_kind?: "tflite" | "coreml";
  r2_key?: string;
  content_hash?: string | null;
  size_bytes?: number | null;
  metadata?: DeploymentMetadata | null;
};

export function defaultDeploymentIndexUrl(channel: DeploymentChannel = "staging"): string {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return "";
  const platform = currentModelPlatform();
  const params = new URLSearchParams({
    model_line: REGISTRY_MODEL_LINE,
    channel,
    platform,
    ready_only: "false",
  });
  return `${baseUrl.replace(/\/$/, "")}/functions/v1/list-deployed-models?${params.toString()}`;
}

export async function loadCandidatesFromIndex(indexUrl: string): Promise<ModelCandidate[]> {
  const cleanUrl = indexUrl.trim();
  if (!cleanUrl) throw new Error("Model index URL is required.");
  const index = await readJsonUrl<ModelCandidatesIndex | DeployedModelsResponse>(cleanUrl, "Index");
  if (isDeployedModelsResponse(index)) {
    return index.models.map((model) => candidateFromDeployment(cleanUrl, index.channel, model));
  }
  if (!Array.isArray(index.models)) throw new Error("Index is missing models[]");
  const platform = currentModelPlatform();
  return index.models.map((manifest) => candidateFromManifest(cleanUrl, manifest, platform));
}

function isDeployedModelsResponse(value: unknown): value is DeployedModelsResponse {
  const maybe = value as DeployedModelsResponse;
  return (
    typeof maybe?.model_line === "string" &&
    (maybe.channel === "staging" || maybe.channel === "production") &&
    Array.isArray(maybe.models) &&
    maybe.models.some((model) => typeof model?.version_id === "string")
  );
}

function candidateFromDeployment(
  responseUrl: string,
  channel: DeploymentChannel,
  model: DeployedModel,
): ModelCandidate {
  const platform = currentModelPlatform();
  const artifactKind = platform === "ios" ? "coreml" : "tflite";
  const hash = stripShaPrefix(model.content_hash);
  const sizeBytes = typeof model.size_bytes === "number" ? model.size_bytes : 0;
  const artifact: { path: string; sha256: string; size_bytes: number } | undefined =
    model.status === "ready" && model.artifact_url && hash && sizeBytes > 0
      ? { path: model.artifact_url, sha256: hash, size_bytes: sizeBytes }
      : undefined;
  const manifest: ModelCandidateManifest = {
    key: `${channel}-${model.version_id}-${platform}`,
    display_name: `${model.semver}${model.is_default ? " default" : ""}`,
    quantized: platform === "android",
    quantization: deploymentQuantization(platform, model.metadata),
    metadata: "__embedded__",
    artifacts: {
      ...(platform === "android" && artifact ? { tflite: artifact } : {}),
      ...(platform === "ios" && artifact ? { coreml: artifact } : {}),
    },
    dataset_config:
      typeof model.metadata?.dataset === "string" ? model.metadata.dataset : undefined,
    weights:
      typeof model.metadata?.source_weights === "string"
        ? model.metadata.source_weights
        : undefined,
  };
  const unsupportedReason =
    platform === "ios"
      ? "Core ML package import/compile is not enabled in this build yet."
      : artifact
        ? undefined
        : `Missing ${artifactKind} artifact from ${channel}.`;
  return {
    id: manifest.key,
    displayName: `${model.semver} · ${channel}`,
    quantization: manifest.quantization,
    manifest,
    manifestUrl: "",
    metadataUrl: "",
    metadata: metadataFromDeployment(model),
    artifactUrl: artifact?.path ?? null,
    platform,
    supported: !unsupportedReason,
    unsupportedReason,
    channel,
    isDefault: model.is_default,
  };
}

function deploymentQuantization(
  platform: ModelPlatform,
  metadata?: DeploymentMetadata | null,
): ModelQuantization {
  const precision =
    platform === "ios"
      ? metadata?.artifacts?.coreml?.precision
      : metadata?.artifacts?.tflite?.precision;
  if (precision === "fp16" || precision === "int8") return precision;
  return platform === "android" ? "int8" : "fp16";
}

function metadataFromDeployment(model: DeployedModel): ModelMetadata {
  const md = model.metadata ?? {};
  const sourceWeights =
    typeof md.source_weights === "string" ? md.source_weights : "yolo26n-seg.pt";
  const modelName = sourceWeights.replace(/\.pt$/i, "") || "yolo26n-seg";
  return {
    model_name: modelName,
    model_version: model.semver,
    task: "instance-segmentation",
    input_size: typeof md.input_size === "number" ? md.input_size : 640,
    class_names: Array.isArray(md.class_names) ? md.class_names : [],
    output_kind: "segmentation",
    output_shape: Array.isArray(md.output_shape) ? md.output_shape : [1, 300, 38],
    score_threshold: 0.25,
    iou_threshold: 0.45,
    calibration: {
      required: true,
      supported_sources: ["aruco", "manual"],
      default_marker_mm: 50,
    },
    registry: {
      version_id: model.version_id,
      status: model.status,
      is_default: model.is_default,
      r2_key: model.r2_key,
    },
    metrics: md.metrics,
    hyperparameters: md.hyperparameters,
  };
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
  const manifest = candidate.manifestUrl
    ? await readJsonUrl<ModelCandidateManifest>(candidate.manifestUrl, "Manifest").catch(
        () => candidate.manifest,
      )
    : candidate.manifest;
  const metadata =
    candidate.metadata ?? (await readJsonUrl<ModelMetadata>(candidate.metadataUrl, "Metadata"));
  const metadataErrors = validateModelMetadata(metadata);
  if (metadataErrors.length > 0) throw new Error(metadataErrors.join("; "));

  const artifact = manifest.artifacts.tflite;
  if (!artifact) throw new Error("Manifest is missing artifacts.tflite.");
  if (
    manifest.quantization !== "none" &&
    manifest.quantization !== "fp16" &&
    manifest.quantization !== "int8"
  ) {
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
  const response = await fetch(url, { headers: registryHeaders(url) });
  if (!response.ok) throw new Error(`${label} fetch failed: ${response.status}`);
  return (await response.json()) as T;
}

function registryHeaders(url: string): Record<string, string> | undefined {
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!anonKey || !supabaseUrl || !url.startsWith(supabaseUrl)) return undefined;
  return { apikey: anonKey, authorization: `Bearer ${anonKey}` };
}

function stripShaPrefix(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/^sha256:/i, "").toLowerCase();
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
