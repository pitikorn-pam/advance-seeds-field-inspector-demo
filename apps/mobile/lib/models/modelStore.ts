import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useSyncExternalStore } from "react";
import type { InstalledModelRecord, ModelPlatform } from "./types";
import { sha256Base64 } from "./sha256";

const root = `${FileSystem.documentDirectory ?? ""}models/`;
const registryUri = `${root}registry.json`;
const activeUri = `${root}active-model.json`;
const previousUri = `${root}previous-active-model.json`;
let storeVersion = 0;
const subscribers = new Set<() => void>();

export const MODELS_DIR = root;

function emitModelStoreChanged(): void {
  storeVersion += 1;
  for (const subscriber of subscribers) subscriber();
}

function subscribeModelStore(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function getModelStoreVersion(): number {
  return storeVersion;
}

export function useModelStoreVersion(): number {
  return useSyncExternalStore(subscribeModelStore, getModelStoreVersion, getModelStoreVersion);
}

export function currentModelPlatform(): ModelPlatform {
  return Platform.OS === "ios" ? "ios" : "android";
}

export async function ensureModelStore(): Promise<void> {
  await FileSystem.makeDirectoryAsync(root, { intermediates: true }).catch(() => {});
}

export function modelInstallDir(id: string): string {
  return `${root}${encodeURIComponent(id)}/`;
}

/**
 * Re-anchor any stored file URIs against the current `documentDirectory`.
 *
 * Why: iOS persists `registry.json` and `active-model.json` inside the
 * app's Documents container. The container's absolute path includes a
 * UUID that can rotate on reinstall (full-uninstall + reinstall, certain
 * OS updates, or simulator container swaps). When that happens, the
 * artifact URIs we baked at install time point at the *old* container
 * path that no longer exists. The model files themselves still live on
 * disk under the new path because the JSON document survived alongside
 * them — only the *prefix* is stale. We recover by stripping the
 * stored prefix back to the per-id install dir suffix and reattaching
 * the current root. The id-derived layout is deterministic
 * (`model.mlpackage.zip`, `model.tflite`, `model.mlmodelc/`), so the
 * suffix is enough.
 */
function reanchorRecord(record: InstalledModelRecord): InstalledModelRecord {
  const expectedDir = modelInstallDir(record.id);
  const reanchor = (uri: string | undefined): string | undefined => {
    if (!uri) return uri;
    if (uri.startsWith(expectedDir)) return uri;
    // Pull the per-id suffix from the stored absolute URI. The install
    // path always contains `/models/<encoded-id>/` followed by either a
    // file name or a subdirectory. Match on that anchor to stay robust
    // against differences in the Documents-prefix that precedes it.
    const marker = `/models/${encodeURIComponent(record.id)}/`;
    const idx = uri.indexOf(marker);
    if (idx === -1) return uri;
    const suffix = uri.slice(idx + marker.length);
    return `${expectedDir}${suffix}`;
  };
  const artifactUri = reanchor(record.artifactUri) ?? record.artifactUri;
  const compiledArtifactUri = reanchor(record.compiledArtifactUri);
  if (artifactUri === record.artifactUri && compiledArtifactUri === record.compiledArtifactUri) {
    return record;
  }
  return { ...record, artifactUri, compiledArtifactUri };
}

export async function readInstalledModels(): Promise<InstalledModelRecord[]> {
  await ensureModelStore();
  try {
    const raw = await FileSystem.readAsStringAsync(registryUri);
    const parsed = JSON.parse(raw) as InstalledModelRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(reanchorRecord);
  } catch {
    return [];
  }
}

export async function writeInstalledModels(models: InstalledModelRecord[]): Promise<void> {
  await ensureModelStore();
  await FileSystem.writeAsStringAsync(registryUri, JSON.stringify(models, null, 2));
  emitModelStoreChanged();
}

export async function upsertInstalledModel(record: InstalledModelRecord): Promise<void> {
  const models = await readInstalledModels();
  const next = [record, ...models.filter((m) => m.id !== record.id)];
  await writeInstalledModels(next);
}

export async function deleteInstalledModel(id: string): Promise<void> {
  const active = await readActiveModel();
  if (active?.id === id) {
    throw new Error("Cannot delete the active model. Roll back or activate another model first.");
  }
  await writeInstalledModels((await readInstalledModels()).filter((m) => m.id !== id));
  await FileSystem.deleteAsync(modelInstallDir(id), { idempotent: true });
}

export async function readActiveModel(): Promise<InstalledModelRecord | null> {
  await ensureModelStore();
  try {
    const raw = await FileSystem.readAsStringAsync(activeUri);
    return reanchorRecord(JSON.parse(raw) as InstalledModelRecord);
  } catch {
    return null;
  }
}

export async function readPreviousActiveModel(): Promise<InstalledModelRecord | null> {
  await ensureModelStore();
  try {
    const raw = await FileSystem.readAsStringAsync(previousUri);
    return reanchorRecord(JSON.parse(raw) as InstalledModelRecord);
  } catch {
    return null;
  }
}

export async function activateInstalledModel(record: InstalledModelRecord): Promise<void> {
  await ensureModelStore();
  const validArtifact = await verifyInstalledArtifact(record);
  if (!validArtifact) {
    throw new Error("Installed model artifact is missing or failed SHA-256 validation.");
  }
  const current = await readActiveModel();
  if (current && current.id !== record.id) {
    await FileSystem.writeAsStringAsync(previousUri, JSON.stringify(current, null, 2));
  }
  const active = { ...record, status: "active" as const, lastError: null };
  await FileSystem.writeAsStringAsync(activeUri, JSON.stringify(active, null, 2));
  const models = await readInstalledModels();
  await writeInstalledModels(
    models.map((m) =>
      m.id === active.id
        ? active
        : {
            ...m,
            status: m.status === "active" ? ("installed" as const) : m.status,
          },
    ),
  );
}

export async function rollbackActiveModel(): Promise<InstalledModelRecord | null> {
  const previous = await readPreviousActiveModel();
  if (!previous) return null;
  await activateInstalledModel(previous);
  return previous;
}

/**
 * Full SHA-256 verification — slow (2–8 s on a 6–25 MB model). Only
 * call from explicit user-triggered checks (install, activate, admin
 * "Verify integrity"). Do NOT use on every analyzer load — that
 * blocked the app's first paint in the field. Use `quickVerifyArtifact`
 * for the load path.
 */
export async function verifyInstalledArtifact(record: InstalledModelRecord): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(record.artifactUri);
  if (!info.exists) return false;
  try {
    const base64 = await FileSystem.readAsStringAsync(record.artifactUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const computed = await sha256Base64(base64);
    return computed === record.artifactSha256.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Cheap integrity check used on every analyzer load: file exists and
 * its byte size matches what we recorded at install time. SHA-256 was
 * verified once at install in the user's private app sandbox; an
 * unchanged file is overwhelmingly likely to still be intact. If iOS
 * trims the documents directory between launches the `info.exists`
 * branch catches it and inspection stays blocked until the model is
 * reinstalled.
 */
export async function quickVerifyArtifact(record: InstalledModelRecord): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(record.artifactUri);
  if (!info.exists) return false;
  if (typeof info.size === "number" && info.size !== record.artifactSizeBytes) return false;
  return true;
}
