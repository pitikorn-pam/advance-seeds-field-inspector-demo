import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import {
  VisionCameraProxy,
  runAsync,
  runAtTargetFps,
  useFrameProcessor,
} from "react-native-vision-camera";
import type { ReadonlyFrameProcessor } from "react-native-vision-camera";
import { Worklets, useSharedValue } from "react-native-worklets-core";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue as useReanimatedSharedValue,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type {
  AnalysisFrameResult,
  AnalysisRoi,
  AnalyzedSeed,
  SeedGradingConfig,
} from "@advance-seeds/types";
import {
  YOLO_INPUT_SIZE,
  decodeYolo,
  decodeYoloNms,
  decodeYoloSegmentationNms,
  detectionWithinRoi,
  unrotateBbox,
  unrotatePoint,
  mapDetectionsToSeeds,
  nonMaxSuppression,
  summarizeSeeds,
} from "./yolo";
import type { Point } from "./maskMeasurement";
import { useHyperParams } from "./hyperparams";
import { resolvePreprocessProfile } from "./preprocess";
import { recordInference, type InferenceSource } from "./inferenceStats";
import type { InstalledModelRecord } from "@/lib/models/types";
import { mapClassFilterForModel } from "@/lib/models/compatibility";
import {
  quickVerifyArtifact,
  readActiveModel,
  useModelStoreVersion,
} from "@/lib/models/modelStore";
import { normalizeFrameOrientation } from "@/lib/capture/frameOrientation";

const COREML_ASSET = "yolo26n";

// Per-frame buffer reuse: avoid re-allocating an ~11400-element Float32Array
// every frame (Float32Array.from copies values into a fresh allocation). The
// buffer grows on demand if a model with a different output shape lands. Two
// buffers — one per branch — so iOS and Android can run independently without
// stepping on each other's slot.
let __coremlValuesBuf: Float32Array | null = null;
let __tfliteValuesBuf: Float32Array | null = null;
const LIVE_MASK_HOLD_FRAMES = 8;
const LIVE_MASK_MISSING_HOLD_FRAMES = 4;
const LIVE_MASK_SMOOTH_ALPHA = 0.32;
function reuseFloat32Array(slot: Float32Array | null, src: number[]): Float32Array {
  let buf = slot;
  if (buf === null || buf.length < src.length) {
    buf = new Float32Array(Math.max(src.length, 8192));
  }
  // Copy into the (possibly oversized) reusable buffer. Downstream readers
  // honor the logical length via shape/maxDet, so trailing capacity is
  // harmless. Using set() avoids `Float32Array.from`'s allocation.
  buf.set(src as unknown as ArrayLike<number>);
  return buf;
}

// Dev-only: rate-limited log so we can confirm at a glance whether the
// active model is producing a segmentation output and whether the native
// plugin is surfacing the mask prototype tensor. If outputKind stays
// "raw"/"nms" → not a seg model. If outputKind="segmentation" but
// hasProto=false → native binary predates a369aa2 (rebuild needed).
let __lastMaskDiagAtMs = 0;
function logMaskDiagnostic(
  source: string,
  outputKind: "raw" | "nms" | "segmentation",
  hasProto: boolean,
  polygonCount: number,
) {
  if (!__DEV__) return;
  const now = Date.now();
  if (now - __lastMaskDiagAtMs < 2000) return;
  __lastMaskDiagAtMs = now;
  console.info(
    `[live-detections ${source}] outputKind=${outputKind} hasProto=${hasProto} polygons=${polygonCount}`,
  );
}

/** Bounding box of a ROI in normalized [0..1] frame coords, padded to a square
 *  so the YOLO input keeps its trained 1:1 aspect. */
interface RoiBboxNorm {
  x: number;
  y: number;
  size: number;
}

function roiBboxSquareNorm(roi: AnalysisRoi | null | undefined): RoiBboxNorm | null {
  if (!roi) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  if (roi.kind === "rect") {
    minX = roi.x;
    minY = roi.y;
    maxX = roi.x + roi.w;
    maxY = roi.y + roi.h;
  } else if (roi.kind === "circle") {
    minX = roi.cx - roi.r;
    minY = roi.cy - roi.r;
    maxX = roi.cx + roi.r;
    maxY = roi.cy + roi.r;
  } else {
    if (!roi.closed || roi.points.length < 3) return null;
    for (const p of roi.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  if (w <= 0 || h <= 0) return null;
  // Pad to square around the ROI center so YOLO's 1:1 input doesn't distort.
  // Clamp to [0..1] but allow the longer axis to drive the crop size; if the
  // ROI is too close to an edge we shift the square inward instead of shrinking.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const size = Math.min(1, Math.max(w, h));
  let x = cx - size / 2;
  let y = cy - size / 2;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + size > 1) x = 1 - size;
  if (y + size > 1) y = 1 - size;
  return { x, y, size };
}

interface Options {
  enabled: boolean;
  pxPerMm: number;
  classFilter?: readonly number[] | null;
  /**
   * Variety display names from the active session. Used to match against
   * the active model's `class_names` when the model isn't COCO — e.g. a
   * custom-trained model with classes ["banana", "banana_spot", …]. The
   * variety name "Banana" matches both via case-insensitive substring.
   */
  varietyNames?: readonly string[] | null;
  /**
   * Operator-chosen class names from the active model. Highest-priority
   * input to `mapClassFilterForModel`; bypasses name/COCO heuristics.
   */
  modelClassAliases?: readonly string[] | null;
  roi?: AnalysisRoi | null;
  roiStage?: { width: number; height: number } | null;
  gradingConfig?: SeedGradingConfig | null;
}

interface State {
  detections: AnalysisFrameResult | null;
  /**
   * Reanimated shared value mirroring `detections`. Phase 3 groundwork:
   * consumers that render at frame rate (overlays, KPI strips) can
   * subscribe via `useAnimatedReaction` and avoid forcing the parent
   * component to re-render 15× per second. The React-state `detections`
   * field is kept for event-handler reads (button presses etc.) where
   * synchronous JS-thread access is what we want. Writes happen
   * together inside the same runOnJS callback, so the two views never
   * drift more than one frame.
   */
  detectionsShared: SharedValue<AnalysisFrameResult | null>;
  /** True once the model is loaded; consumers can hide a "warming up" hint. */
  ready: boolean;
  /** Pass to <Camera frameProcessor= /> when this hook owns the camera frame stream. */
  frameProcessor: ReadonlyFrameProcessor | undefined;
}

/**
 * Live ML inference for the camera preview.
 *
 *   • iOS  — Core ML via the `advanceSeedsRunCoreML` Vision Camera frame
 *            processor plugin. Inference runs entirely on the worklet
 *            thread; only the decoded output values cross to JS.
 *   • Android — TFLite. The worklet does the resize via
 *            native Vision Camera frame-processor plugin. Pixels stay in
 *            CameraX/YUV memory, the plugin crops/resizes/runs TFLite, and
 *            only the detector output crosses back to JS.
 *
 * Both paths funnel into the same `decodeOutputOnJS` callback so the
 * KPI strip + DetectionOverlay are platform-agnostic.
 */
export function useLiveDetections(options: Options): State {
  if (Platform.OS === "ios") {
    return useLiveDetectionsCoreML(options);
  }
  return useLiveDetectionsAndroidNative(options);
}

// ---------------------------------------------------------------------
// iOS — Core ML frame-processor plugin
// ---------------------------------------------------------------------

function useLiveDetectionsCoreML(options: Options): State {
  const {
    enabled,
    pxPerMm,
    classFilter,
    roi,
    roiStage,
    varietyNames,
    modelClassAliases,
    gradingConfig,
  } = options;
  const hp = useHyperParams();
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  // Phase 3 groundwork: Reanimated shared value mirroring the React
  // state. Worklet-thread readers (overlays migrated to Skia or to
  // useAnimatedReaction subscriptions) can read from here without
  // forcing parent re-renders on every frame.
  const detectionsShared = useReanimatedSharedValue<AnalysisFrameResult | null>(null);
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<InstalledModelRecord | null>(null);
  const modelStoreVersion = useModelStoreVersion();
  const modelReady = Boolean(modelPath && activeModel);
  const lastSetAtRef = useRef(0);
  // Cap detection→React re-renders to ~30 fps. The camera preview stays at
  // its native cadence, while this guard prevents accidental back-to-back
  // setState() bursts when frame timings cluster.
  const RENDER_THROTTLE_MS = 33;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Tracks current `enabled` state from a worklet's perspective. Inflight
  // results (decoded async on the JS thread) check this before writing
  // to React state — without it, results that started before enabled
  // flipped false land *after* the cleanup setDetections(null), pinning
  // a stale bbox on the live overlay until the next ArUco re-detect.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      setDetections(null);
      detectionsShared.value = null;
    }
  }, [enabled, detectionsShared]);

  // Initialised once. Vision Camera proxies the native plugin lookup
  // through JSI; the resulting object is worklet-shareable.
  const plugin = useMemo(
    () => VisionCameraProxy.initFrameProcessorPlugin("advanceSeedsRunCoreML", {}),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    readActiveModel()
      .then(async (active) => {
        if (cancelled) return;
        const compiledUri = active?.compiledArtifactUri ?? null;
        const compiledExists = compiledUri
          ? (await FileSystem.getInfoAsync(compiledUri).catch(() => ({ exists: false }))).exists
          : false;
        if (
          active?.platform === "ios" &&
          active.status === "active" &&
          compiledUri &&
          compiledExists &&
          (await quickVerifyArtifact(active))
        ) {
          if (!cancelled) {
            setModelPath(compiledUri);
            setActiveModel(active);
          }
          return;
        }
        if (!cancelled) {
          setModelPath(null);
          setActiveModel(null);
        }
      })
      .catch((err) => {
        console.warn(
          "[live-detections coreml] active model unavailable; live inference disabled",
          err,
        );
        if (!cancelled) {
          setModelPath(null);
          setActiveModel(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, modelStoreVersion]);

  // Translate COCO/variety class filter into the active model's class
  // index space *before* the worklet runs — worklets can't read JS
  // metadata. Re-runs when the active model or selection changes.
  const mappedClassFilter = useMemo(
    () =>
      mapClassFilterForModel(classFilter, activeModel?.metadata, varietyNames, modelClassAliases),
    [classFilter, activeModel, varietyNames, modelClassAliases],
  );
  // One-line diagnostic per change — useful for confirming which model
  // is loaded, which class indices the live filter resolves to, and
  // what each of those class indices actually means in the active
  // model's class_names list (resolves the "what is class 2?" question
  // when the displayed detection doesn't match the expected variety).
  useEffect(() => {
    const classNames = (activeModel?.metadata?.class_names as string[] | undefined) ?? [];
    const filterLabels = (mappedClassFilter ?? []).map((idx) => classNames[idx] ?? `<#${idx}>`);
    console.info(
      "[live-detections coreml] model=%s mappedFilter=%o resolves-to=%o classNames=%o",
      activeModel?.id ?? "none",
      mappedClassFilter,
      filterLabels,
      classNames,
    );
  }, [activeModel, mappedClassFilter]);

  const scoreThreshold = hp.scoreThreshold;
  const iouThreshold = hp.iouThreshold;
  const requestedTargetFps = hp.targetFps;
  const targetFps = Math.min(requestedTargetFps, 5);
  useEffect(() => {
    console.info(
      "[live-detections coreml] inferenceFps requested=%d effective=%d previewFps=30",
      requestedTargetFps,
      targetFps,
    );
  }, [requestedTargetFps, targetFps]);
  const preprocessProfile = useMemo(
    () => resolvePreprocessProfile(hp.preprocessProfile, activeModel?.metadata ?? null),
    [hp.preprocessProfile, activeModel],
  );
  useEffect(() => {
    if (preprocessProfile === "morph_fused_v1") {
      console.warn(
        "[live-detections coreml] preprocess=morph_fused_v1 requested; iOS Core ML frame processor runs raw_rgb in v1",
      );
    }
  }, [preprocessProfile]);

  const lastCoreMLMaskSeedsRef = useRef<AnalysisFrameResult["seeds"] | null>(null);
  const lastCoreMLMaskHoldFramesRef = useRef(0);
  const decodeOnJS = useMemo(
    () =>
      Worklets.createRunOnJS(
        (
          values: number[],
          shape0: number,
          shape1: number,
          shape2: number,
          frameWidth: number,
          frameHeight: number,
          frameTimestampMs: number,
          inferElapsedMs: number,
          orientation: string,
          // Native-decoded polygons, parallel to the raw row iteration in
          // `decodeYoloSegmentationNms`. Each entry is a flat
          // [x0, y0, x1, y1, ...] in post-rotation source-image pixel
          // space (same as bbox before unrotateBbox). Empty entry =
          // filtered out / failed; absent = wantMask was NO for this frame.
          // Do not reuse these by row across frames: YOLO row index is not a
          // stable object identity, and reattaching stale row polygons causes
          // visible mask jumps when the output order changes.
          polygonsByRow: number[][] | null,
        ) => {
          recordInference("coreml", inferElapsedMs);
          __coremlValuesBuf = reuseFloat32Array(__coremlValuesBuf, values);
          const out = __coremlValuesBuf;
          const outputKind: "raw" | "nms" | "segmentation" =
            shape2 === 6 ? "nms" : shape2 > 6 ? "segmentation" : "raw";
          // Vision rotates the camera buffer based on `frame.orientation`
          // before running the model, so the model output's 640-canvas
          // coords are relative to the *post-rotation* image dims, not
          // the sensor-native ones we receive as frame.width/frame.height.
          // Use post-rotation dims to compute the letterbox-inverse, then
          // map the resulting bboxes back to sensor coords with the
          // matching inverse rotation. This eliminates the edge-of-frame
          // drift on iOS live overlays.
          const rotates =
            orientation === "left" ||
            orientation === "right" ||
            orientation === "left-mirrored" ||
            orientation === "right-mirrored";
          const postW = rotates ? frameHeight : frameWidth;
          const postH = rotates ? frameWidth : frameHeight;
          const scale = YOLO_INPUT_SIZE / Math.max(postW, postH);
          const newW = Math.round(postW * scale);
          const newH = Math.round(postH * scale);
          const padX = Math.floor((YOLO_INPUT_SIZE - newW) / 2);
          const padY = Math.floor((YOLO_INPUT_SIZE - newH) / 2);
          const decodeOpts = {
            letterbox: { scale, padX, padY, target: YOLO_INPUT_SIZE },
            scoreThreshold,
            classFilter: mappedClassFilter,
            // Native plugin computes mask polygons; skip per-row Float32Array
            // allocation for mask coefs that JS no longer reads.
            skipMaskCoefs: true,
          };
          const shape = [shape0, shape1, shape2] as unknown as readonly [number, number, number];
          const rawDetections =
            outputKind === "nms"
              ? decodeYoloNms(out, shape, decodeOpts)
              : outputKind === "segmentation"
                ? decodeYoloSegmentationNms(out, shape, decodeOpts)
                : decodeYolo(out, shape, decodeOpts);
          const incomingPolygonCount =
            polygonsByRow?.reduce((count, row) => count + (row.length >= 6 ? 1 : 0), 0) ?? 0;
          const currentPolygonsByRow =
            polygonsByRow && polygonsByRow.length === shape1 && incomingPolygonCount > 0
              ? polygonsByRow
              : null;
          if (
            outputKind === "segmentation" &&
            currentPolygonsByRow &&
            currentPolygonsByRow.length === shape1
          ) {
            for (const detection of rawDetections) {
              const row = detection.sourceRow;
              if (row === undefined) continue;
              const poly = currentPolygonsByRow[row];
              if (poly && poly.length >= 6) {
                const pts: Point[] = [];
                for (let i = 0; i + 1 < poly.length; i += 2) {
                  pts.push({ x: poly[i], y: poly[i + 1] });
                }
                detection.polygon = pts;
              }
            }
          }
          const nativePolygonCount = rawDetections.reduce((n, d) => n + (d.polygon ? 1 : 0), 0);
          logMaskDiagnostic(
            "coreml",
            outputKind,
            currentPolygonsByRow !== null,
            nativePolygonCount,
          );
          if (
            outputKind === "segmentation" &&
            nativePolygonCount === 0 &&
            !lastCoreMLMaskSeedsRef.current?.length
          ) {
            return;
          }
          // Bboxes are now in post-rotation pixel space. Inverse-rotate
          // each one back to sensor (frame.width × frame.height) coords
          // so DetectionOverlay can project them onto the camera preview.
          // Same rotation applies to polygon vertices when present.
          const keptInDisplaySpace =
            outputKind === "raw" ? nonMaxSuppression(rawDetections, iouThreshold) : rawDetections;
          const roiFilteredDisplayDetections = roi
            ? keptInDisplaySpace.filter((detection) =>
                detectionWithinRoi(detection, postW, postH, roi, roiStage),
              )
            : keptInDisplaySpace;
          const sensorDetections = rotates
            ? roiFilteredDisplayDetections.map((d) => {
                const r = unrotateBbox(d, postW, postH, orientation);
                if (d.polygon) {
                  r.polygon = d.polygon.map((p) =>
                    unrotatePoint(p.x, p.y, postW, postH, orientation),
                  );
                  r.maskPixelCount = d.maskPixelCount;
                }
                return r;
              })
            : roiFilteredDisplayDetections;
          const seeds = mapDetectionsToSeeds(sensorDetections, {
            frameWidth,
            frameHeight,
            pxPerMm,
            roi: null,
            gradingConfig: gradingConfig ?? null,
          });
          const displaySeeds = stabilizeMaskedLiveSeeds(
            seeds,
            lastCoreMLMaskSeedsRef.current,
            lastCoreMLMaskHoldFramesRef,
          );
          const maskedDisplaySeeds = displaySeeds.filter(
            (seed) => seed.mask?.polygon && seed.mask.polygon.length >= 3,
          );
          if (maskedDisplaySeeds.length > 0) {
            lastCoreMLMaskSeedsRef.current = maskedDisplaySeeds;
          } else if (displaySeeds.length === 0) {
            lastCoreMLMaskSeedsRef.current = null;
            lastCoreMLMaskHoldFramesRef.current = 0;
          }
          if (!mountedRef.current) return;
          // Discard inflight results that landed *after* the consumer
          // disabled the hook (e.g., user navigated away from the scan
          // screen). Without this, the live overlay sticks on the last
          // detection from before the navigation until ArUco re-detects
          // and resets the camera flow.
          if (!enabledRef.current) return;
          const now = Date.now();
          if (now - lastSetAtRef.current < RENDER_THROTTLE_MS) return;
          lastSetAtRef.current = now;
          const nextResult: AnalysisFrameResult = {
            seeds: displaySeeds,
            summary: summarizeSeeds(displaySeeds),
            frameTimestampMs,
            frameWidth,
            frameHeight,
            frameOrientation: orientation,
            analyzerId: "coreml-yolo-live",
          };
          setDetections(nextResult);
          detectionsShared.value = nextResult;
        },
      ),
    [
      mappedClassFilter,
      pxPerMm,
      roi,
      roiStage,
      gradingConfig,
      scoreThreshold,
      iouThreshold,
      detectionsShared,
    ],
  );

  // Polygon decode runs natively so live can show every kept detection.
  // Do not cap this path: seed-lot tests may need many objects in one scene.
  const maskFrameCounter = useSharedValue(0);
  const warmupFrameCounter = useSharedValue(0);
  const MASK_THROTTLE = 1;
  const MASK_WARMUP_FRAMES = 0;
  useEffect(() => {
    warmupFrameCounter.value = 0;
    lastCoreMLMaskSeedsRef.current = null;
    lastCoreMLMaskHoldFramesRef.current = 0;
    if (enabled) {
      setDetections(null);
      detectionsShared.value = null;
    }
  }, [enabled, modelPath, roi, warmupFrameCounter, detectionsShared]);
  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled || !plugin) return;
      if (!modelPath) return;
      runAtTargetFps(targetFps, () => {
        "worklet";
        try {
          const counter = maskFrameCounter.value + 1;
          maskFrameCounter.value = counter;
          const warmupCounter = warmupFrameCounter.value + 1;
          warmupFrameCounter.value = warmupCounter;
          const wantMask = warmupCounter > MASK_WARMUP_FRAMES && counter % MASK_THROTTLE === 0;
          // Time only the native plugin call, which is where the Core ML
          // VNCoreMLRequest runs synchronously on the worklet thread; that
          // dominates everything else this worklet does.
          const startedAt = Date.now();
          const result = plugin.call(frame, {
            assetName: COREML_ASSET,
            modelPath,
            preprocessProfile,
            wantMask,
            // Native polygon-decode args (only consulted when wantMask).
            // The plugin derives the letterbox + src dims itself from
            // frame.width/height/orientation, mirroring what JS does in
            // decodeOnJS — keeps the worklet call argument shape simple
            // and avoids shipping floats that the plugin can recompute
            // for free.
            scoreThreshold,
            classFilter: mappedClassFilter ?? [],
          });
          const inferElapsedMs = Date.now() - startedAt;
          if (!result) return;
          const r = result as unknown as {
            shape: number[];
            values: number[];
            orientation?: string;
            polygons?: number[][];
          };
          const shape = r.shape;
          decodeOnJS(
            r.values,
            shape[0],
            shape[1],
            shape[2],
            frame.width,
            frame.height,
            frame.timestamp,
            inferElapsedMs,
            r.orientation ?? "up",
            r.polygons ?? null,
          );
        } catch (err) {
          console.warn("[live-detections coreml] frame processing failed", err);
        }
      });
    },
    [
      enabled,
      plugin,
      decodeOnJS,
      targetFps,
      modelPath,
      preprocessProfile,
      maskFrameCounter,
      warmupFrameCounter,
      scoreThreshold,
      mappedClassFilter,
    ],
  );

  return useMemo(
    () => ({
      detections,
      detectionsShared,
      ready: plugin !== null && modelReady,
      frameProcessor: enabled && plugin && modelReady ? frameProcessor : undefined,
    }),
    [detections, detectionsShared, enabled, frameProcessor, modelReady, plugin],
  );
}

// ---------------------------------------------------------------------
// Android — native TFLite frame-processor plugin
// ---------------------------------------------------------------------

// Cached so we only log delegate selection once per change, not per frame.
let lastLoggedDelegate: string | null = null;

function useLiveDetectionsAndroidNative(options: Options): State {
  const {
    enabled,
    pxPerMm,
    classFilter,
    roi,
    roiStage,
    varietyNames,
    modelClassAliases,
    gradingConfig,
  } = options;
  const hp = useHyperParams();
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  // Phase 3 groundwork: Reanimated shared value mirroring the React
  // state. Worklet-thread readers (overlays migrated to Skia or to
  // useAnimatedReaction subscriptions) can read from here without
  // forcing parent re-renders on every frame.
  const detectionsShared = useReanimatedSharedValue<AnalysisFrameResult | null>(null);
  const [activeModel, setActiveModel] = useState<InstalledModelRecord | null>(null);
  const modelStoreVersion = useModelStoreVersion();
  const lastSetAtRef = useRef(0);
  const lastAcceptedFrameTimestampRef = useRef(0);
  const lastDecodeLogAtRef = useRef(0);
  const lastTfliteMaskSeedsRef = useRef<AnalysisFrameResult["seeds"] | null>(null);
  const lastTfliteMaskHoldFramesRef = useRef(0);
  // Android native inference is still capped below the shared hyperparameter
  // default, so a 66 ms render gate remains enough to prevent accidental
  // back-to-back setState() bursts when frame timings cluster.
  const RENDER_THROTTLE_MS = 66;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Tracks current `enabled` state from a worklet's perspective. Inflight
  // results (decoded async on the JS thread) check this before writing
  // to React state — without it, results that started before enabled
  // flipped false land *after* the cleanup setDetections(null), pinning
  // a stale bbox on the live overlay until the next ArUco re-detect.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    lastTfliteMaskSeedsRef.current = null;
    lastTfliteMaskHoldFramesRef.current = 0;
    if (!enabled) {
      setDetections(null);
      detectionsShared.value = null;
      lastAcceptedFrameTimestampRef.current = 0;
    } else {
      setDetections(null);
      detectionsShared.value = null;
    }
  }, [enabled, roi, detectionsShared]);

  const plugin = useMemo(
    () => VisionCameraProxy.initFrameProcessorPlugin("advanceSeedsRunTFLite", {}),
    [],
  );

  const scoreThreshold = hp.scoreThreshold;
  const liveScoreThreshold = scoreThreshold;
  const iouThreshold = hp.iouThreshold;
  // Pre-resolve the class filter into the active model's class index
  // space so the native polygon decode can apply the same filter
  // identically to JS. (Worklets can't read JS metadata at frame time.)
  const mappedClassFilterForAndroid = useMemo(
    () =>
      mapClassFilterForModel(classFilter, activeModel?.metadata, varietyNames, modelClassAliases),
    [classFilter, activeModel, varietyNames, modelClassAliases],
  );
  // The current Android CPU/native YOLO11n path is too slow for every camera
  // frame. Keep inference intentionally sparse; runAsync below lets preview
  // delivery continue while the latest eligible frame is analyzed.
  const requestedTargetFps = hp.targetFps;
  const targetFps = Math.min(requestedTargetFps, 5);
  useEffect(() => {
    console.info(
      "[live-detections tflite] inferenceFps requested=%d effective=%d previewProfile=%s",
      requestedTargetFps,
      targetFps,
      Platform.OS === "android" ? "android-low-pressure" : "default",
    );
  }, [requestedTargetFps, targetFps]);
  const roiCropNorm = useMemo(() => roiBboxSquareNorm(roi ?? null), [roi]);
  const preprocessProfile = useMemo(
    () => resolvePreprocessProfile(hp.preprocessProfile, activeModel?.metadata ?? null),
    [hp.preprocessProfile, activeModel],
  );

  useEffect(() => {
    let cancelled = false;
    readActiveModel()
      .then(async (record) => {
        if (cancelled) return;
        if (record?.platform === "android" && (await quickVerifyArtifact(record))) {
          if (!cancelled) setActiveModel(record);
        } else if (!cancelled) {
          setActiveModel(null);
        }
      })
      .catch(() => {
        if (!cancelled) setActiveModel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, modelStoreVersion]);

  useEffect(() => {
    const mapped = mapClassFilterForModel(
      classFilter,
      activeModel?.metadata,
      varietyNames,
      modelClassAliases ?? null,
    );
    console.info(
      "[live-detections tflite] model=%s preprocess=%s mappedFilter=%o",
      activeModel?.id ?? "none",
      preprocessProfile,
      mapped,
    );
  }, [activeModel, classFilter, varietyNames, modelClassAliases, preprocessProfile]);

  const decodeOnJS = useMemo(
    () =>
      Worklets.createRunOnJS(
        (
          values: number[],
          shape0: number,
          shape1: number,
          shape2: number,
          frameWidth: number,
          frameHeight: number,
          cropX: number,
          cropY: number,
          cropSize: number,
          frameTimestampMs: number,
          inferElapsedMs: number,
          delegate: string,
          orientation: string,
          // Native-decoded polygons, parallel to the raw row iteration.
          // See iOS comment above; same contract.
          polygonsByRow: number[][] | null,
        ) => {
          orientation = normalizeFrameOrientation(orientation);
          const source: InferenceSource = delegate === "gpu" ? "tflite-android-gpu" : "tflite-cpu";
          recordInference(source, inferElapsedMs);
          if (__DEV__ && lastLoggedDelegate !== delegate) {
            lastLoggedDelegate = delegate;
            console.info(
              `[live-detections android-native] delegate=${delegate} (first inference: ${inferElapsedMs}ms)`,
            );
          }
          __tfliteValuesBuf = reuseFloat32Array(__tfliteValuesBuf, values);
          const out = __tfliteValuesBuf;
          const outputKind: "raw" | "nms" | "segmentation" =
            shape2 === 6 ? "nms" : shape2 > 6 ? "segmentation" : "raw";
          const rotates =
            orientation === "left" ||
            orientation === "right" ||
            orientation === "left-mirrored" ||
            orientation === "right-mirrored";
          const postW = rotates ? frameHeight : frameWidth;
          const postH = rotates ? frameWidth : frameHeight;
          const fpScale = YOLO_INPUT_SIZE / cropSize;
          const decodeOpts = {
            letterbox: {
              scale: fpScale,
              padX: -cropX * fpScale,
              padY: -cropY * fpScale,
              target: YOLO_INPUT_SIZE,
            },
            scoreThreshold: liveScoreThreshold,
            classFilter: mapClassFilterForModel(
              classFilter,
              activeModel?.metadata,
              varietyNames,
              modelClassAliases,
            ),
            skipMaskCoefs: true,
          };
          const shape = [shape0, shape1, shape2] as unknown as readonly [number, number, number];
          const raw =
            outputKind === "nms"
              ? decodeYoloNms(out, shape, decodeOpts)
              : outputKind === "segmentation"
                ? decodeYoloSegmentationNms(out, shape, decodeOpts)
                : decodeYolo(out, shape, decodeOpts);
          // Attach native-decoded polygons by their source tensor row.
          // Native Android samples the frame in post-rotation space before
          // inference, so polygons start in the same post-rotation source
          // coords as the bbox.
          if (outputKind === "segmentation" && polygonsByRow && polygonsByRow.length === shape1) {
            for (const detection of raw) {
              const row = detection.sourceRow;
              if (row === undefined) continue;
              const poly = polygonsByRow[row];
              if (poly && poly.length >= 6) {
                const pts: Point[] = [];
                for (let i = 0; i + 1 < poly.length; i += 2) {
                  pts.push({ x: poly[i], y: poly[i + 1] });
                }
                detection.polygon = pts;
              }
            }
          }
          logMaskDiagnostic(
            "tflite",
            outputKind,
            polygonsByRow !== null,
            raw.reduce((n, d) => n + (d.polygon ? 1 : 0), 0),
          );
          const keptInDisplaySpace = nonMaxSuppression(raw, iouThreshold);
          const roiFilteredDisplayDetections = roi
            ? keptInDisplaySpace.filter((detection) =>
                detectionWithinRoi(detection, postW, postH, roi, roiStage),
              )
            : keptInDisplaySpace;
          const sensorDetections = rotates
            ? roiFilteredDisplayDetections.map((d) => {
                const r = unrotateBbox(d, postW, postH, orientation);
                if (d.polygon) {
                  r.polygon = d.polygon.map((p) =>
                    unrotatePoint(p.x, p.y, postW, postH, orientation),
                  );
                  r.maskPixelCount = d.maskPixelCount;
                }
                return r;
              })
            : roiFilteredDisplayDetections;
          const seeds = mapDetectionsToSeeds(sensorDetections, {
            frameWidth,
            frameHeight,
            pxPerMm,
            roi: null,
            gradingConfig: gradingConfig ?? null,
          });
          const displaySeeds = stabilizeMaskedLiveSeeds(
            seeds,
            lastTfliteMaskSeedsRef.current,
            lastTfliteMaskHoldFramesRef,
          );
          const maskedDisplaySeeds = displaySeeds.filter(
            (seed) => seed.mask?.polygon && seed.mask.polygon.length >= 3,
          );
          if (maskedDisplaySeeds.length > 0) {
            lastTfliteMaskSeedsRef.current = maskedDisplaySeeds;
          } else if (displaySeeds.length === 0) {
            lastTfliteMaskSeedsRef.current = null;
            lastTfliteMaskHoldFramesRef.current = 0;
          }
          const logNow = Date.now();
          if (__DEV__ && logNow - lastDecodeLogAtRef.current > 2000) {
            lastDecodeLogAtRef.current = logNow;
            const allRaw =
              outputKind === "nms"
                ? decodeYoloNms(out, shape, {
                    ...decodeOpts,
                    classFilter: null,
                  })
                : outputKind === "segmentation"
                  ? decodeYoloSegmentationNms(out, shape, {
                      ...decodeOpts,
                      classFilter: null,
                    })
                  : decodeYolo(out, shape, {
                      ...decodeOpts,
                      classFilter: null,
                    });
            const top = allRaw
              .slice()
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map((d) => `${d.classId}:${d.score.toFixed(2)}`)
              .join(",");
            const topTensor =
              outputKind === "nms"
                ? Array.from({ length: Math.min(shape1, 5) }, (_, i) => {
                    const base = i * 6;
                    return `${Math.round(out[base + 5] ?? -1)}:${(out[base + 4] ?? 0).toFixed(3)}@[${(out[base + 0] ?? 0).toFixed(2)},${(out[base + 1] ?? 0).toFixed(2)},${(out[base + 2] ?? 0).toFixed(2)},${(out[base + 3] ?? 0).toFixed(2)}]`;
                  }).join(",")
                : "raw-head";
            console.info(
              `[live-detections android-native] shape=${shape.join("x")} frame=${frameWidth}x${frameHeight} post=${postW}x${postH} orientation=${orientation} crop=${cropX},${cropY},${cropSize} delegate=${delegate} filter=${classFilter ? [...classFilter].join(",") : "any"} threshold=${liveScoreThreshold}/${scoreThreshold} all=${allRaw.length} raw=${raw.length} kept=${roiFilteredDisplayDetections.length} seeds=${displaySeeds.length} top=${top} tensor=${topTensor}`,
            );
          }
          if (!mountedRef.current) return;
          if (!enabledRef.current) return;
          if (
            frameTimestampMs > 0 &&
            lastAcceptedFrameTimestampRef.current > 0 &&
            frameTimestampMs <= lastAcceptedFrameTimestampRef.current
          ) {
            return;
          }
          const now = Date.now();
          if (now - lastSetAtRef.current < RENDER_THROTTLE_MS) return;
          lastSetAtRef.current = now;
          if (frameTimestampMs > 0) {
            lastAcceptedFrameTimestampRef.current = frameTimestampMs;
          }
          const nextResult: AnalysisFrameResult = {
            seeds: displaySeeds,
            summary: summarizeSeeds(displaySeeds),
            frameTimestampMs,
            frameWidth,
            frameHeight,
            frameOrientation: orientation,
            analyzerId: "tflite-yolo-live-native",
          };
          setDetections(nextResult);
          detectionsShared.value = nextResult;
        },
      ),
    [
      detectionsShared,
      classFilter,
      varietyNames,
      modelClassAliases,
      pxPerMm,
      roi,
      roiStage,
      gradingConfig,
      liveScoreThreshold,
      scoreThreshold,
      iouThreshold,
      activeModel,
    ],
  );

  // Polygon decode runs every frame now that the mask matmul + trace
  // happen natively (see CoreML branch's matching comment). One-in-three
  // gate was the JS-perf workaround for the old prototype-tensor bridge
  // crossing; obsolete now that polygons are computed in-plugin.
  const maskFrameCounter = useSharedValue(0);
  const MASK_THROTTLE = 1;
  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled || !plugin) return;
      if (!activeModel) return;
      runAtTargetFps(targetFps, () => {
        "worklet";
        runAsync(frame, () => {
          "worklet";
          try {
            const rawOrientation = String(frame.orientation ?? "up");
            const rotates =
              rawOrientation === "landscape-left" ||
              rawOrientation === "landscape-right" ||
              rawOrientation === "left" ||
              rawOrientation === "right" ||
              rawOrientation === "left-mirrored" ||
              rawOrientation === "right-mirrored";
            const cropFrameWidth = rotates ? frame.height : frame.width;
            const cropFrameHeight = rotates ? frame.width : frame.height;
            let cropX = 0;
            let cropY = 0;
            let cropSize = Math.min(cropFrameWidth, cropFrameHeight);
            if (roiCropNorm) {
              cropSize = Math.round(roiCropNorm.size * Math.min(cropFrameWidth, cropFrameHeight));
              cropX = Math.round(roiCropNorm.x * cropFrameWidth);
              cropY = Math.round(roiCropNorm.y * cropFrameHeight);
              if (cropX + cropSize > cropFrameWidth) cropX = cropFrameWidth - cropSize;
              if (cropY + cropSize > cropFrameHeight) cropY = cropFrameHeight - cropSize;
            } else {
              cropX = Math.round((cropFrameWidth - cropSize) / 2);
              cropY = Math.round((cropFrameHeight - cropSize) / 2);
            }
            const counter = maskFrameCounter.value + 1;
            maskFrameCounter.value = counter;
            const wantMask = counter % MASK_THROTTLE === 0;
            // Native polygon-decode args (when wantMask). The plugin
            // derives the letterbox from cropX/cropY/cropSize itself so
            // we don't ship redundant floats; only the filtering knobs
            // need to cross the bridge to keep native + JS in lockstep.
            const startedAt = Date.now();
            const result = plugin.call(frame, {
              modelPath: activeModel.artifactUri,
              cropX,
              cropY,
              cropSize,
              orientation: rawOrientation,
              preprocessProfile,
              wantMask,
              scoreThreshold: liveScoreThreshold,
              classFilter: mappedClassFilterForAndroid ?? [],
            });
            const inferElapsedMs = Date.now() - startedAt;
            if (!result) return;
            const r = result as unknown as {
              shape: number[];
              values: number[];
              delegate?: string;
              orientation?: string;
              polygons?: number[][];
            };
            const shape = r.shape;
            decodeOnJS(
              r.values,
              shape[0],
              shape[1],
              shape[2],
              frame.width,
              frame.height,
              cropX,
              cropY,
              cropSize,
              frame.timestamp,
              inferElapsedMs,
              r.delegate ?? "cpu",
              r.orientation ?? rawOrientation,
              r.polygons ?? null,
            );
          } catch (err) {
            console.warn("[live-detections tflite-native] frame processing failed", err);
          }
        });
      });
    },
    [
      enabled,
      plugin,
      decodeOnJS,
      targetFps,
      roiCropNorm,
      activeModel,
      preprocessProfile,
      maskFrameCounter,
      liveScoreThreshold,
      mappedClassFilterForAndroid,
    ],
  );

  return useMemo(
    () => ({
      detections,
      detectionsShared,
      ready: plugin !== null && activeModel !== null,
      frameProcessor: enabled && plugin && activeModel ? frameProcessor : undefined,
    }),
    [activeModel, detections, detectionsShared, enabled, frameProcessor, plugin],
  );
}

function stabilizeMaskedLiveSeeds(
  seeds: AnalysisFrameResult["seeds"],
  fallback: AnalysisFrameResult["seeds"] | null,
  holdFramesRef: { current: number },
): AnalysisFrameResult["seeds"] {
  const masked = seeds.filter((seed) => seed.mask?.polygon && seed.mask.polygon.length >= 3);
  const fallbackMasked =
    fallback?.filter((seed) => seed.mask?.polygon && seed.mask.polygon.length >= 3) ?? [];
  if (masked.length === 0) {
    if (fallbackMasked.length > 0 && holdFramesRef.current < LIVE_MASK_HOLD_FRAMES) {
      holdFramesRef.current += 1;
      return reindexLiveSeeds(fallbackMasked);
    }
    holdFramesRef.current = 0;
    return seeds;
  }
  if (fallbackMasked.length === 0) {
    holdFramesRef.current = 0;
    return reindexLiveSeeds(masked);
  }

  const usedFallback = new Set<number>();
  const stabilized: Array<{ seed: AnalyzedSeed; previousIndex: number | null }> = [];
  for (const current of masked) {
    const match = bestLiveSeedMatch(current, fallbackMasked, usedFallback);
    if (match && isLikelySameLiveSeed(match.seed, current)) {
      usedFallback.add(match.index);
      stabilized.push({
        seed: smoothSeed(match.seed, current, LIVE_MASK_SMOOTH_ALPHA),
        previousIndex: match.index,
      });
    } else {
      stabilized.push({ seed: current, previousIndex: null });
    }
  }

  const canHoldMissing =
    stabilized.length < fallbackMasked.length &&
    holdFramesRef.current < LIVE_MASK_MISSING_HOLD_FRAMES;
  if (canHoldMissing) {
    for (let index = 0; index < fallbackMasked.length; index += 1) {
      if (usedFallback.has(index)) continue;
      const previous = fallbackMasked[index];
      const alreadyRepresented = stabilized.some(({ seed }) =>
        isLikelySameLiveSeed(seed, previous),
      );
      if (alreadyRepresented) continue;
      stabilized.push({ seed: previous, previousIndex: index });
    }
    holdFramesRef.current += 1;
  } else {
    holdFramesRef.current = 0;
  }

  stabilized.sort((a, b) => {
    if (a.previousIndex !== null && b.previousIndex !== null) {
      return a.previousIndex - b.previousIndex;
    }
    if (a.previousIndex !== null) return -1;
    if (b.previousIndex !== null) return 1;
    return spatialSeedOrder(a.seed, b.seed);
  });
  return reindexLiveSeeds(stabilized.map(({ seed }) => seed));
}

function bestLiveSeedMatch(
  current: AnalyzedSeed,
  candidates: AnalyzedSeed[],
  usedIndexes: Set<number>,
): { index: number; seed: AnalyzedSeed } | null {
  let bestIndex = -1;
  let best: AnalyzedSeed | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < candidates.length; index += 1) {
    if (usedIndexes.has(index)) continue;
    const candidate = candidates[index];
    if (
      typeof current.class_id === "number" &&
      typeof candidate.class_id === "number" &&
      current.class_id !== candidate.class_id
    ) {
      continue;
    }
    const overlap = bboxIou(current.bbox, candidate.bbox);
    const distance = centerDistance(current.bbox, candidate.bbox);
    const sizeDelta =
      Math.abs(current.bbox.width - candidate.bbox.width) / Math.max(1, current.bbox.width) +
      Math.abs(current.bbox.height - candidate.bbox.height) / Math.max(1, current.bbox.height);
    const score = distance * 3 + sizeDelta - overlap * 2;
    if (score < bestScore) {
      best = candidate;
      bestIndex = index;
      bestScore = score;
    }
  }
  return best && bestIndex >= 0 ? { index: bestIndex, seed: best } : null;
}

function isLikelySameLiveSeed(a: AnalyzedSeed, b: AnalyzedSeed): boolean {
  return bboxIou(a.bbox, b.bbox) >= 0.12 || centerDistance(a.bbox, b.bbox) <= 0.28;
}

function spatialSeedOrder(a: AnalyzedSeed, b: AnalyzedSeed): number {
  const ay = a.bbox.y + a.bbox.height / 2;
  const by = b.bbox.y + b.bbox.height / 2;
  if (Math.abs(ay - by) > 24) return ay - by;
  const ax = a.bbox.x + a.bbox.width / 2;
  const bx = b.bbox.x + b.bbox.width / 2;
  return ax - bx;
}

function reindexLiveSeeds(seeds: AnalysisFrameResult["seeds"]): AnalysisFrameResult["seeds"] {
  return seeds.map((seed, index) => ({ ...seed, id: index + 1 }));
}

function smoothSeed(previous: AnalyzedSeed, current: AnalyzedSeed, alpha: number): AnalyzedSeed {
  const bbox = {
    x: Math.round(lerp(previous.bbox.x, current.bbox.x, alpha)),
    y: Math.round(lerp(previous.bbox.y, current.bbox.y, alpha)),
    width: Math.round(lerp(previous.bbox.width, current.bbox.width, alpha)),
    height: Math.round(lerp(previous.bbox.height, current.bbox.height, alpha)),
  };
  const previousPolygon = previous.mask?.polygon ?? [];
  const currentPolygon = current.mask?.polygon ?? [];
  const canSmoothPolygon =
    previousPolygon.length >= 3 && previousPolygon.length === currentPolygon.length;
  return {
    ...current,
    bbox,
    length_mm: lerp(previous.length_mm, current.length_mm, alpha),
    width_mm: lerp(previous.width_mm, current.width_mm, alpha),
    area_mm2: lerp(previous.area_mm2, current.area_mm2, alpha),
    ...(typeof previous.volume_ml === "number" && typeof current.volume_ml === "number"
      ? { volume_ml: lerp(previous.volume_ml, current.volume_ml, alpha) }
      : null),
    ...(current.mask
      ? {
          mask: {
            ...current.mask,
            polygon: canSmoothPolygon
              ? currentPolygon.map((point, index) => ({
                  x: lerp(previousPolygon[index].x, point.x, alpha),
                  y: lerp(previousPolygon[index].y, point.y, alpha),
                }))
              : currentPolygon,
          },
        }
      : null),
  };
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function bboxIou(a: AnalyzedSeed["bbox"], b: AnalyzedSeed["bbox"]): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function centerDistance(a: AnalyzedSeed["bbox"], b: AnalyzedSeed["bbox"]): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  const normalizer = Math.max(
    1,
    Math.hypot(Math.max(a.width, b.width), Math.max(a.height, b.height)),
  );
  return Math.hypot(ax - bx, ay - by) / normalizer;
}

/**
 * Subscribe to a live-detections SharedValue inside a leaf component
 * (an overlay, a KPI strip). The hook runs `useAnimatedReaction` on the
 * UI thread, then funnels each change back to React state on the JS
 * thread — so only the leaf component re-renders, not the whole
 * capture screen.
 *
 * Drop-in replacement for reading `liveDetections.detections` directly,
 * but the parent no longer sees the state churn. Use sparingly: each
 * subscriber adds a runOnJS hop per frame, so colocating multiple HUD
 * pieces into one subscriber is cheaper than spreading them across many.
 */
export function useLiveDetectionsSnapshot(
  shared: SharedValue<AnalysisFrameResult | null>,
): AnalysisFrameResult | null {
  const [snapshot, setSnapshot] = useState<AnalysisFrameResult | null>(null);
  useAnimatedReaction(
    () => shared.value,
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setSnapshot)(current);
      }
    },
    [shared],
  );
  return snapshot;
}
