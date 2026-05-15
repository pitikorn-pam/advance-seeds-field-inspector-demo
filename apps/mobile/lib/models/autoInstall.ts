import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { resetSharedTfliteModel } from "@/lib/analyzer/TfliteSeedAnalyzer";
import { installCandidate, loadCandidatesFromIndex } from "./modelRegistry";
import { activateInstalledModel } from "./modelStore";
import { listDeployedModelsUrl } from "./registryService";
import {
  beginBackgroundModelInstall,
  completeBackgroundModelInstall,
  failBackgroundModelInstall,
  updateBackgroundModelInstall,
} from "./installProgressStore";
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
 * - User must have the pref on (`autoInstallOnWifi`); default is ON
 *   because field-inspector deployments are typically Wi-Fi only when
 *   docked and benefit from staying current without a manual install
 *   step. Users can opt out from the Models screen.
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
    // Default to ON for never-touched installs (stored value === null).
    // Users who have explicitly toggled it off see "false" persisted.
    const stored = await AsyncStorage.getItem(PREF_KEY);
    prefCache = stored === null ? true : stored === "true";
  } catch {
    prefCache = true;
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
  const [value, setValue] = useState<boolean>(prefCache ?? true);
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

// First-launch default install was removed: it downloaded ~60 MB on
// post-login wakeup and made the app feel stuck. The Inspect tab gate
// (useModelInstallInspectionGate) and the Models screen are the two
// supported install entry points, both user-initiated.

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
    const runId = beginBackgroundModelInstall({
      kind: "autoUpdate",
      candidateId: candidate.id,
      displayName: candidate.displayName,
      versionId: update.version_id,
    });
    try {
      const record = await installCandidate(candidate, (progress) => {
        updateBackgroundModelInstall(runId, progress);
      });
      await activateInstalledModel(record);
      resetSharedTfliteModel();
      completeBackgroundModelInstall(runId);
    } catch (e) {
      failBackgroundModelInstall(runId, e);
      throw e;
    }
  } catch (e) {
    console.warn("[registry] auto-install failed", e);
  } finally {
    inflightVersionId = null;
  }
}
