import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

// Tracks the last time the replay worker successfully wrote a row server-side.
// SyncBanner reads it to render a real "last sync" timestamp instead of the
// stand-in "newest inspection's created_at" we used pre-sync-queue.

const STORAGE_KEY = "advance-seeds.lastSyncedAt.v1";

let cached: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export async function getLastSyncedAt(): Promise<string | null> {
  if (loaded) return cached;
  cached = await AsyncStorage.getItem(STORAGE_KEY);
  loaded = true;
  return cached;
}

export async function recordLastSyncedAt(iso: string = new Date().toISOString()): Promise<void> {
  cached = iso;
  loaded = true;
  emit();
  await AsyncStorage.setItem(STORAGE_KEY, iso);
}

export function useLastSyncedAt(): string | null {
  const [value, setValue] = useState<string | null>(cached);
  useEffect(() => {
    let cancelled = false;
    if (!loaded) {
      void getLastSyncedAt().then((v) => {
        if (!cancelled) setValue(v);
      });
    }
    const listener = () => setValue(cached);
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);
  return value;
}
