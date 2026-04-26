import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Persisted flag: has the user finished the welcome flow at least once? */
const STORAGE_KEY = "as.mobile.onboarded";

// Module-scope cache + subscriber set so writes from any component
// instantly notify every `useOnboarded()` consumer. Without this, the
// StartupGate would still see the stale (false) value even after the
// welcome screen sets the flag — causing a /splash ⇄ /welcome loop.
let cached: boolean | null = null;
const subscribers = new Set<(value: boolean) => void>();

function notify(next: boolean) {
  cached = next;
  for (const fn of subscribers) fn(next);
}

export async function readOnboarded(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    cached = v === "true";
  } catch {
    cached = false;
  }
  return cached;
}

export async function setOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Best-effort: failing to persist isn't fatal — user just sees welcome
    // again on next launch, which is recoverable. We still notify in-memory
    // so the current navigation transition completes correctly.
  }
  notify(true);
}

/**
 * Dev-only helper: clear the onboarding flag so /splash and /welcome show
 * again on the next gate evaluation. Useful during testing without having
 * to clear app data.
 */
export async function resetOnboarded(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify(false);
}

/**
 * Hook returning the onboarding flag. `null` while the first read is in
 * flight; `true` / `false` thereafter. Subscribes to module-level updates
 * so calls to `setOnboarded()` propagate to every consumer immediately
 * without a remount.
 */
export function useOnboarded(): boolean | null {
  const [value, setValue] = useState<boolean | null>(cached);
  useEffect(() => {
    let active = true;
    if (cached === null) {
      void readOnboarded().then((v) => {
        if (active) setValue(v);
      });
    }
    subscribers.add(setValue);
    return () => {
      active = false;
      subscribers.delete(setValue);
    };
  }, []);
  return value;
}
