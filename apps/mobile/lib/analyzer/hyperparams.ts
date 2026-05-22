import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

// User-tunable inference hyperparameters. Persisted to AsyncStorage so
// changes survive a JS reload. Surfaced from More → Reference →
// Hyperparameters for QA / threshold tuning while we work with a
// generic COCO model. `targetFps` controls sampled inference cadence, not the
// native camera preview frame rate.
//
// Reads are synchronous (defaults until disk hydrates, then merged) so
// analyzers can grab the current value at the start of every `analyze()`
// without going async per frame. The live worklet hook
// (`useLiveDetections`) subscribes via `useHyperParams()` and bakes
// the values into its useFrameProcessor deps, so changing TargetFps
// recreates the worklet with the new value.

export interface HyperParams {
  /** Detection score cutoff applied in `decodeYolo` / `decodeYoloNms`. */
  scoreThreshold: number;
  /** IoU threshold for our JS-side NMS (raw YOLO11/8 head only). */
  iouThreshold: number;
  /** Live worklet inference sampling rate (preview FPS is configured separately). */
  targetFps: number;
  /** QA override for model input preprocessing. "model" defers to active model metadata. */
  preprocessProfile: "model" | "raw_rgb" | "morph_fused_v1";
}

export const DEFAULT_HYPERPARAMS: HyperParams = {
  // 0.75 favours precision over recall — appropriate for the field-grade
  // detector where false positives are more disruptive than missed seeds.
  // 0.85 IoU keeps NMS tight against duplicate boxes around the same seed.
  // 30 fps keeps the iOS Core ML live overlay matched to the camera
  // preview cadence by default. Android still applies its platform
  // safety cap in useLiveDetections. Operators can dial any of these
  // via More → Hyperparameters.
  scoreThreshold: 0.75,
  iouThreshold: 0.85,
  targetFps: 30,
  preprocessProfile: "model",
};

// v9: live detection default fps 15 → 30.
const STORAGE_KEY = "advance-seeds.hyperparams.v9";
const LEGACY_STORAGE_KEYS = [
  "advance-seeds.hyperparams.v8",
  "advance-seeds.hyperparams.v7",
  "advance-seeds.hyperparams.v6",
  "advance-seeds.hyperparams.v5",
  "advance-seeds.hyperparams.v4",
  "advance-seeds.hyperparams.v3",
  "advance-seeds.hyperparams.v2",
  "advance-seeds.hyperparams.v1",
];

let current: HyperParams = { ...DEFAULT_HYPERPARAMS };
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function ensureHyperParamsLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        let legacyRaw: string | null = null;
        let legacyKey: string | null = null;
        if (!raw) {
          for (const key of LEGACY_STORAGE_KEYS) {
            legacyRaw = await AsyncStorage.getItem(key);
            if (legacyRaw) {
              legacyKey = key;
              break;
            }
          }
        }
        if (raw || legacyRaw) {
          const isLegacy = !raw && Boolean(legacyRaw);
          const parsed = JSON.parse(raw ?? legacyRaw ?? "{}") as Partial<HyperParams>;
          current = isLegacy
            ? migrateLegacyHyperParams(parsed)
            : clamp({ ...DEFAULT_HYPERPARAMS, ...parsed });
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
          if (legacyKey) await AsyncStorage.removeItem(legacyKey);
        }
      } catch (err) {
        console.warn("[hyperparams] load failed; using defaults", err);
      } finally {
        loaded = true;
        emit();
      }
    })();
  }
  return loadPromise;
}

/** Synchronous current value. Returns defaults until first hydrate. */
export function getHyperParamsSync(): HyperParams {
  return current;
}

export async function setHyperParams(patch: Partial<HyperParams>): Promise<void> {
  current = clamp({ ...current, ...patch });
  loaded = true;
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn("[hyperparams] save failed", err);
  }
}

export async function resetHyperParams(): Promise<void> {
  current = { ...DEFAULT_HYPERPARAMS };
  loaded = true;
  emit();
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[hyperparams] reset failed", err);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Lazy hydrate on first subscribe so the hook always sees disk state.
  void ensureHyperParamsLoaded();
  return () => listeners.delete(listener);
}

function snapshot() {
  return current;
}

export function useHyperParams(): HyperParams {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function clamp(p: HyperParams): HyperParams {
  return {
    scoreThreshold: clampNumber(p.scoreThreshold, 0.05, 0.95),
    iouThreshold: clampNumber(p.iouThreshold, 0.1, 0.95),
    targetFps: clampNumber(Math.round(p.targetFps), 1, 60),
    preprocessProfile:
      p.preprocessProfile === "raw_rgb" || p.preprocessProfile === "morph_fused_v1"
        ? p.preprocessProfile
        : "model",
  };
}

function migrateLegacyHyperParams(parsed: Partial<HyperParams>): HyperParams {
  const migrated = { ...DEFAULT_HYPERPARAMS, ...parsed };
  // v8 shipped with a 15 fps inference default. v9 restores the iOS default
  // request to 30 fps; Android still applies its native safety cap in
  // useLiveDetections. Treat 15 as the old default during migration.
  if (parsed.targetFps === undefined || parsed.targetFps === 15) {
    migrated.targetFps = DEFAULT_HYPERPARAMS.targetFps;
  }
  return clamp(migrated);
}

function clampNumber(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v) || !Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
