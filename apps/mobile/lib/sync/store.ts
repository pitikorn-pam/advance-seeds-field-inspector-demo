import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import type { SyncQueueEntry, SyncQueuePayload, SyncQueueStatus } from "./types";

const STORAGE_KEY = "advance-seeds.syncQueue.v1";

let entries: SyncQueueEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void ensureQueueLoaded();
  return () => listeners.delete(listener);
}

function snapshot() {
  return entries;
}

async function persist(next: SyncQueueEntry[]) {
  entries = next;
  loaded = true;
  emit();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function ensureQueueLoaded(): Promise<SyncQueueEntry[]> {
  if (loaded) return entries;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  entries = raw ? (JSON.parse(raw) as SyncQueueEntry[]) : [];
  loaded = true;
  emit();
  return entries;
}

export function useSyncQueueEntries(): SyncQueueEntry[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export async function addQueueEntry(payload: SyncQueuePayload): Promise<SyncQueueEntry> {
  const now = new Date().toISOString();
  const entry: SyncQueueEntry = {
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    lastError: null,
    remoteId: null,
    payload,
  };
  const current = await ensureQueueLoaded();
  await persist([entry, ...current]);
  return entry;
}

export async function updateQueueEntry(
  id: string,
  patch: Partial<Omit<SyncQueueEntry, "id" | "payload">> & { payload?: SyncQueuePayload },
): Promise<void> {
  const current = await ensureQueueLoaded();
  await persist(
    current.map((entry) =>
      entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry,
    ),
  );
}

export async function removeQueueEntry(id: string): Promise<void> {
  const current = await ensureQueueLoaded();
  await persist(current.filter((entry) => entry.id !== id));
}

export async function clearFailedQueueEntries(): Promise<void> {
  const current = await ensureQueueLoaded();
  await persist(current.filter((entry) => entry.status !== "failed"));
}

// Recovers both failed entries AND entries left stuck in `syncing` because a
// previous replay was killed mid-upload (e.g. app force-quit). Without the
// `syncing` reset, those rows would never run again — replaySyncQueue only
// processes pending+failed.
export async function retryAllFailedQueueEntries(): Promise<void> {
  const current = await ensureQueueLoaded();
  await persist(
    current.map((entry) =>
      entry.status === "failed" || entry.status === "syncing"
        ? { ...entry, status: "pending", lastError: null, updatedAt: new Date().toISOString() }
        : entry,
    ),
  );
}

export async function markQueueEntryFailed(id: string, error: unknown): Promise<void> {
  const current = await ensureQueueLoaded();
  const entry = current.find((row) => row.id === id);
  await updateQueueEntry(id, {
    status: "failed",
    attempts: (entry?.attempts ?? 0) + 1,
    lastError: syncErrorMessage(error),
  });
}

function syncErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "details", "hint"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

export function queueCounts(rows: SyncQueueEntry[]) {
  return {
    pending: rows.filter((row) => row.status === "pending" || row.status === "syncing").length,
    failed: rows.filter((row) => row.status === "failed").length,
    synced: rows.filter((row) => row.status === "synced").length,
  };
}

export function activeQueueStatuses(): SyncQueueStatus[] {
  return ["pending", "syncing", "failed"];
}
