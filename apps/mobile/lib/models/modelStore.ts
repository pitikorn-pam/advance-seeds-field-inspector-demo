import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type { InstalledModelRecord, ModelPlatform } from "./types";
import { sha256Base64 } from "./sha256";

const root = `${FileSystem.documentDirectory ?? ""}models/`;
const registryUri = `${root}registry.json`;
const activeUri = `${root}active-model.json`;
const previousUri = `${root}previous-active-model.json`;

export const MODELS_DIR = root;

export function currentModelPlatform(): ModelPlatform {
  return Platform.OS === "ios" ? "ios" : "android";
}

export async function ensureModelStore(): Promise<void> {
  await FileSystem.makeDirectoryAsync(root, { intermediates: true }).catch(() => {});
}

export function modelInstallDir(id: string): string {
  return `${root}${encodeURIComponent(id)}/`;
}

export async function readInstalledModels(): Promise<InstalledModelRecord[]> {
  await ensureModelStore();
  try {
    const raw = await FileSystem.readAsStringAsync(registryUri);
    const parsed = JSON.parse(raw) as InstalledModelRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeInstalledModels(models: InstalledModelRecord[]): Promise<void> {
  await ensureModelStore();
  await FileSystem.writeAsStringAsync(registryUri, JSON.stringify(models, null, 2));
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
    return JSON.parse(raw) as InstalledModelRecord;
  } catch {
    return null;
  }
}

export async function readPreviousActiveModel(): Promise<InstalledModelRecord | null> {
  await ensureModelStore();
  try {
    const raw = await FileSystem.readAsStringAsync(previousUri);
    return JSON.parse(raw) as InstalledModelRecord;
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
