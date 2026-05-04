import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

// User-tunable inference hyperparameters. Persisted to AsyncStorage so
// changes survive a JS reload. Surfaced from More → Reference →
// Hyperparameters for QA / threshold tuning while we work with a
// generic COCO model.
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
  /** Live worklet inference rate (iOS Core ML + Android TFLite/GPU). */
  targetFps: number;
}

export const DEFAULT_HYPERPARAMS: HyperParams = {
  // Field telemetry on the YOLO26-seg custom model showed 11-17
  // detections per frame in the 0.05-0.20 confidence band but zero
  // crossing 0.25 — too aggressive for a fresh training. 0.10 lets
  // honest-but-uncertain detections through to the live overlay so
  // operators can see what the model is doing. Users can tune up via
  // More → Hyperparameters once a model has proven recall.
  scoreThreshold: 0.1,
  iouThreshold: 0.65,
  targetFps: 30,
};

const STORAGE_KEY = "advance-seeds.hyperparams.v3";
const LEGACY_STORAGE_KEYS = ["advance-seeds.hyperparams.v2", "advance-seeds.hyperparams.v1"];

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
  };
}

function migrateLegacyHyperParams(parsed: Partial<HyperParams>): HyperParams {
  const migrated = { ...DEFAULT_HYPERPARAMS, ...parsed };
  // v2 shipped with a conservative 15 fps live default while Android pixels
  // still crossed into JS. The Android detector is now native, so missing or
  // old default values migrate to the new 30 fps live target. Explicitly tuned
  // low values below 15 are preserved.
  if (parsed.targetFps === undefined || parsed.targetFps >= 15) {
    migrated.targetFps = DEFAULT_HYPERPARAMS.targetFps;
  }
  return clamp(migrated);
}

function clampNumber(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v) || !Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
