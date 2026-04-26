import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Persisted flag: has the user finished the welcome flow at least once? */
const STORAGE_KEY = "as.mobile.onboarded";

export async function readOnboarded(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v === "true";
  } catch {
    return false;
  }
}

export async function setOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Best-effort: failing to persist isn't fatal — user just sees welcome
    // again on next launch, which is recoverable.
  }
}

/**
 * Hook returning the onboarding flag once read. `null` while the read is
 * in flight; `true` / `false` afterwards. Components can branch on null
 * to render a loading state.
 */
export function useOnboarded(): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void readOnboarded().then((v) => {
      if (active) setValue(v);
    });
    return () => {
      active = false;
    };
  }, []);
  return value;
}
