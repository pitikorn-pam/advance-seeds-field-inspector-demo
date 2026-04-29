import { Alert, Linking } from "react-native";
import * as Location from "expo-location";
import type { TFunction } from "i18next";

/**
 * Auto-tag location helper.
 *
 * The session's `locationTagEnabled` toggle on /capture/setup records intent.
 * When intent is on and we hit a capture moment that wants coords (live
 * snapshot, recording start, precise capture, review save), we call
 * `getCurrentLocation()` here.
 *
 * Permission policy is "ask once per session" — the user explicitly chose
 * this in the v0.2.0 review:
 *   • First call → read current state, prompt if undetermined, alert with
 *     a Settings link if denied permanently. The result (granted / not)
 *     is cached at the module level.
 *   • Subsequent calls in the same app session → no prompt, no alert. If
 *     the cached result was denied, return null silently; if granted,
 *     fetch coords.
 *
 * The "session" here is per-app-launch — module state resets on cold start.
 * That matches the capture session's lifecycle (`session.reset()` at save
 * time clears form fields but does NOT reset this flag, because the user's
 * choice "stop asking me about Location" should outlive a single capture).
 */

let ensured = false;
let cachedGranted = false;

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy in meters, when the OS reports it. */
  accuracy: number | null;
  /** ISO 8601 timestamp from the OS reading. */
  timestamp: string;
}

/**
 * Reads the current permission state, prompts once if undetermined, alerts
 * once if denied. After the first call, the result is cached and re-asks
 * are skipped.
 *
 * Returns true if location is usable on this device for this session.
 */
async function ensureLocationPermission(t: TFunction): Promise<boolean> {
  if (ensured) return cachedGranted;
  ensured = true;

  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) {
    cachedGranted = true;
    return true;
  }

  if (!current.canAskAgain) {
    // Hard deny — iOS will not re-prompt. Show a single alert with a
    // Settings deep link so the user can flip it manually if they
    // change their mind.
    Alert.alert(
      t("inspections:capture.location.deniedTitle"),
      t("inspections:capture.location.deniedBody"),
      [
        { text: t("common:actions.cancel"), style: "cancel" },
        { text: t("common:actions.openSettings"), onPress: () => void Linking.openSettings() },
      ],
    );
    cachedGranted = false;
    return false;
  }

  const next = await Location.requestForegroundPermissionsAsync();
  cachedGranted = next.granted;
  return cachedGranted;
}

/**
 * Fetches a single GPS reading, or null if location is unavailable/denied.
 *
 * Quietly returns null on permission deny — the caller is expected to be
 * tolerant ("auto-tag location is best-effort"). The first deny in a
 * session triggers the alert via `ensureLocationPermission`.
 */
export async function getCurrentLocation(t: TFunction): Promise<CapturedLocation | null> {
  const ok = await ensureLocationPermission(t);
  if (!ok) return null;
  try {
    const reading = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: reading.coords.latitude,
      longitude: reading.coords.longitude,
      accuracy: reading.coords.accuracy ?? null,
      timestamp: new Date(reading.timestamp).toISOString(),
    };
  } catch (err) {
    // Common in field conditions: GPS off, no signal, or a transient
    // hardware error. Drop quietly — auto-tag is opportunistic.
    console.warn("[location] reading failed", err);
    return null;
  }
}
