import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { resetSharedTfliteModel } from "@/lib/analyzer/TfliteSeedAnalyzer";
import { installCandidate, loadCandidatesFromIndex } from "./modelRegistry";
import { activateInstalledModel } from "./modelStore";
import { listDeployedModelsUrl } from "./registryService";
import type { ModelUpdateAvailable } from "./updateStore";

const PREF_KEY = "as.mobile.models.autoInstallOnWifi";
const MAX_AUTO_INSTALL_BYTES = 50 * 1_000_000;

type NetworkState = {
  type: "wifi" | "cellular" | "none" | "unknown";
  isInternetReachable: boolean;
};

type Prefs = { autoInstallOnWifi: boolean };

/**
 * Pure policy: should we auto-install this update without user interaction?
 *
 * Rules:
 * - Wi-Fi only — never spend cellular data on a model artifact.
 * - User must have opted in (`autoInstallOnWifi`); default is off.
 * - We must know the size up-front and it must be under the cap, so we
 *   can't accidentally pull a multi-hundred-MB file in the background.
 */
export function shouldAutoInstall(
  update: ModelUpdateAvailable,
  network: NetworkState,
  prefs: Prefs,
): boolean {
  if (!prefs.autoInstallOnWifi) return false;
  if (network.type !== "wifi" || !network.isInternetReachable) return false;
  if (typeof update.size_bytes !== "number" || update.size_bytes <= 0) return false;
  if (update.size_bytes > MAX_AUTO_INSTALL_BYTES) return false;
  return true;
}

let prefCache: boolean | null = null;
const prefSubscribers = new Set<(value: boolean) => void>();

export async function readAutoInstallOnWifi(): Promise<boolean> {
  if (prefCache !== null) return prefCache;
  try {
    prefCache = (await AsyncStorage.getItem(PREF_KEY)) === "true";
  } catch {
    prefCache = false;
  }
  return prefCache;
}

export async function setAutoInstallOnWifi(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PREF_KEY, value ? "true" : "false");
  } catch {
    // Best-effort persistence; in-memory still updates so the toggle reflects intent.
  }
  prefCache = value;
  for (const fn of prefSubscribers) fn(value);
}

export function useAutoInstallOnWifi(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(prefCache ?? false);
  useEffect(() => {
    if (prefCache === null) {
      void readAutoInstallOnWifi().then((v) => setValue(v));
    }
    prefSubscribers.add(setValue);
    return () => {
      prefSubscribers.delete(setValue);
    };
  }, []);
  return [value, (next) => void setAutoInstallOnWifi(next)];
}

let inflightVersionId: string | null = null;

export async function runAutoInstallIfEligible(update: ModelUpdateAvailable): Promise<void> {
  if (inflightVersionId === update.version_id) return;
  const [prefs, netState] = await Promise.all([
    readAutoInstallOnWifi().then((autoInstallOnWifi) => ({ autoInstallOnWifi })),
    NetInfo.fetch().then((s) => ({
      type: (s.type as NetworkState["type"]) ?? "unknown",
      isInternetReachable: s.isInternetReachable !== false,
    })),
  ]);
  if (!shouldAutoInstall(update, netState, prefs)) return;

  inflightVersionId = update.version_id;
  try {
    const indexUrl = listDeployedModelsUrl({ channel: "production" });
    if (!indexUrl) return;
    const candidates = await loadCandidatesFromIndex(indexUrl);
    const candidate = candidates.find((c) => {
      if (!c.supported) return false;
      const reg = c.metadata?.registry as { version_id?: string } | undefined;
      return reg?.version_id === update.version_id;
    });
    if (!candidate) return;
    const record = await installCandidate(candidate);
    await activateInstalledModel(record);
    resetSharedTfliteModel();
  } catch (e) {
    console.warn("[registry] auto-install failed", e);
  } finally {
    inflightVersionId = null;
  }
}
