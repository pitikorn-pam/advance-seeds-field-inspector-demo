import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { VisionCameraProxy, runAtTargetFps, useFrameProcessor } from "react-native-vision-camera";
import type { ReadonlyFrameProcessor } from "react-native-vision-camera";
import { useResizePlugin } from "vision-camera-resize-plugin";
import { Worklets } from "react-native-worklets-core";
import type { TfliteModel } from "react-native-fast-tflite";
import type { AnalysisFrameResult, AnalysisRoi } from "@advance-seeds/types";
import {
  YOLO_INPUT_SIZE,
  decodeYolo,
  decodeYoloNms,
  mapDetectionsToSeeds,
  nonMaxSuppression,
  summarizeSeeds,
} from "./yolo";
import {
  loadSharedTfliteModel,
  type TfliteDelegate,
  type TfliteOutputKind,
} from "./TfliteSeedAnalyzer";
import { useHyperParams } from "./hyperparams";
import { recordInference, type InferenceSource } from "./inferenceStats";

const COREML_ASSET = "yolo26n";

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
  roi?: AnalysisRoi | null;
}

interface State {
  detections: AnalysisFrameResult | null;
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
  const { enabled, pxPerMm, classFilter, roi } = options;
  const hp = useHyperParams();
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  const lastSetAtRef = useRef(0);
  const RENDER_THROTTLE_MS = 33;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initialised once. Vision Camera proxies the native plugin lookup
  // through JSI; the resulting object is worklet-shareable.
  const plugin = useMemo(
    () => VisionCameraProxy.initFrameProcessorPlugin("advanceSeedsRunCoreML", {}),
    [],
  );

  const scoreThreshold = hp.scoreThreshold;
  const iouThreshold = hp.iouThreshold;
  const targetFps = hp.targetFps;

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
        ) => {
          recordInference("coreml", inferElapsedMs);
          const out = Float32Array.from(values);
          const outputKind: "raw" | "nms" = shape2 === 6 ? "nms" : "raw";
          // Vision uses `scaleFit` (aspect-fit + center crop) when handing
          // the frame to the model; mirror its inverse so detection boxes
          // land in original-frame pixel space.
          const cropSize = Math.min(frameWidth, frameHeight);
          const scale = YOLO_INPUT_SIZE / cropSize;
          const padX = -((frameWidth - cropSize) / 2) * scale;
          const padY = -((frameHeight - cropSize) / 2) * scale;
          const decodeOpts = {
            letterbox: { scale, padX, padY, target: YOLO_INPUT_SIZE },
            scoreThreshold,
            classFilter: classFilter ? [...classFilter] : null,
          };
          const shape = [shape0, shape1, shape2] as unknown as readonly [number, number, number];
          const raw =
            outputKind === "nms"
              ? decodeYoloNms(out, shape, decodeOpts)
              : decodeYolo(out, shape, decodeOpts);
          const kept = outputKind === "nms" ? raw : nonMaxSuppression(raw, iouThreshold);
          const seeds = mapDetectionsToSeeds(kept, {
            frameWidth,
            frameHeight,
            pxPerMm,
            roi: roi ?? null,
          });
          if (!mountedRef.current) return;
          const now = Date.now();
          if (now - lastSetAtRef.current < RENDER_THROTTLE_MS) return;
          lastSetAtRef.current = now;
          setDetections({
            seeds,
            summary: summarizeSeeds(seeds),
            frameTimestampMs,
            frameWidth,
            frameHeight,
            analyzerId: "coreml-yolo-live",
          });
        },
      ),
    [classFilter, pxPerMm, roi, scoreThreshold, iouThreshold],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled || !plugin) return;
      runAtTargetFps(targetFps, () => {
        "worklet";
        try {
          // Time only the native plugin call, which is where the Core ML
          // VNCoreMLRequest runs synchronously on the worklet thread; that
          // dominates everything else this worklet does.
          const startedAt = Date.now();
          const result = plugin.call(frame, { assetName: COREML_ASSET });
          const inferElapsedMs = Date.now() - startedAt;
          if (!result) return;
          // Plugin returns { outputName, shape: number[], values: number[] }.
          const r = result as unknown as {
            shape: number[];
            values: number[];
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
          );
        } catch (err) {
          console.warn("[live-detections coreml] frame processing failed", err);
        }
      });
    },
    [enabled, plugin, decodeOnJS, targetFps],
  );

  useEffect(() => {
    if (!enabled) setDetections(null);
  }, [enabled]);

  return useMemo(
    () => ({
      detections,
      ready: plugin !== null,
      frameProcessor: enabled && plugin ? frameProcessor : undefined,
    }),
    [detections, enabled, frameProcessor, plugin],
  );
}

// ---------------------------------------------------------------------
// Android — native TFLite frame-processor plugin
// ---------------------------------------------------------------------

function useLiveDetectionsAndroidNative(options: Options): State {
  const { enabled, pxPerMm, classFilter, roi } = options;
  const hp = useHyperParams();
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  const lastSetAtRef = useRef(0);
  const RENDER_THROTTLE_MS = 33;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const plugin = useMemo(
    () => VisionCameraProxy.initFrameProcessorPlugin("advanceSeedsRunTFLite", {}),
    [],
  );

  const scoreThreshold = hp.scoreThreshold;
  const iouThreshold = hp.iouThreshold;
  const targetFps = hp.targetFps;
  const roiCropNorm = useMemo(() => roiBboxSquareNorm(roi ?? null), [roi]);

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
        ) => {
          recordInference("tflite-cpu", inferElapsedMs);
          const out = Float32Array.from(values);
          const outputKind: "raw" | "nms" = shape2 === 6 ? "nms" : "raw";
          const fpScale = YOLO_INPUT_SIZE / cropSize;
          const decodeOpts = {
            letterbox: {
              scale: fpScale,
              padX: -cropX * fpScale,
              padY: -cropY * fpScale,
              target: YOLO_INPUT_SIZE,
            },
            scoreThreshold,
            classFilter: classFilter ? [...classFilter] : null,
          };
          const shape = [shape0, shape1, shape2] as unknown as readonly [number, number, number];
          const raw =
            outputKind === "nms"
              ? decodeYoloNms(out, shape, decodeOpts)
              : decodeYolo(out, shape, decodeOpts);
          const kept = outputKind === "nms" ? raw : nonMaxSuppression(raw, iouThreshold);
          const seeds = mapDetectionsToSeeds(kept, {
            frameWidth,
            frameHeight,
            pxPerMm,
            roi: roi ?? null,
          });
          if (!mountedRef.current) return;
          const now = Date.now();
          if (now - lastSetAtRef.current < RENDER_THROTTLE_MS) return;
          lastSetAtRef.current = now;
          setDetections({
            seeds,
            summary: summarizeSeeds(seeds),
            frameTimestampMs,
            frameWidth,
            frameHeight,
            analyzerId: "tflite-yolo-live-native",
          });
        },
      ),
    [classFilter, pxPerMm, roi, scoreThreshold, iouThreshold],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled || !plugin) return;
      runAtTargetFps(targetFps, () => {
        "worklet";
        try {
          let cropX = 0;
          let cropY = 0;
          let cropSize = Math.min(frame.width, frame.height);
          if (roiCropNorm) {
            cropSize = Math.round(roiCropNorm.size * Math.min(frame.width, frame.height));
            cropX = Math.round(roiCropNorm.x * frame.width);
            cropY = Math.round(roiCropNorm.y * frame.height);
            if (cropX + cropSize > frame.width) cropX = frame.width - cropSize;
            if (cropY + cropSize > frame.height) cropY = frame.height - cropSize;
          } else {
            cropX = Math.round((frame.width - cropSize) / 2);
            cropY = Math.round((frame.height - cropSize) / 2);
          }
          const startedAt = Date.now();
          const result = plugin.call(frame, {
            assetName: "yolo11n-seeds.tflite",
            cropX,
            cropY,
            cropSize,
          });
          const inferElapsedMs = Date.now() - startedAt;
          if (!result) return;
          const r = result as unknown as {
            shape: number[];
            values: number[];
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
          );
        } catch (err) {
          console.warn("[live-detections tflite-native] frame processing failed", err);
        }
      });
    },
    [enabled, plugin, decodeOnJS, targetFps, roiCropNorm],
  );

  useEffect(() => {
    if (!enabled) setDetections(null);
  }, [enabled]);

  return useMemo(
    () => ({
      detections,
      ready: plugin !== null,
      frameProcessor: enabled && plugin ? frameProcessor : undefined,
    }),
    [detections, enabled, frameProcessor, plugin],
  );
}

// ---------------------------------------------------------------------
// Android — TFLite + JS-thread inference (worklet does resize only)
// ---------------------------------------------------------------------

function useLiveDetectionsTflite(options: Options): State {
  const { enabled, pxPerMm, classFilter, roi } = options;
  const modelRef = useRef<TfliteModel | null>(null);
  const outputKindRef = useRef<TfliteOutputKind>("raw");
  const delegateRef = useRef<TfliteDelegate>("cpu");
  const [ready, setReady] = useState(false);
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  const lastSetAtRef = useRef(0);
  // Tracks whether the consuming screen is still mounted. A worklet-dispatched
  // inferOnJS callback can land on the JS thread after the user has already
  // navigated away from /capture/scan, and a stale setDetections then triggers
  // React's "state update on unmounted component" warning.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Pre-allocate the inference tensor once; reusing avoids ~5 MB Float32Array
  // allocations per frame. The worklet ships compact uint8 RGB pixels across
  // the JS boundary, then this tensor is filled with normalized float input
  // for TFLite.
  const tensorRef = useRef<Float32Array | null>(null);
  // Worklet-readable in-flight flag so the frame processor can skip frames
  // while a previous inference is still running on the JS thread. Without
  // this, frames pile up in the JS queue (model.runSync is ~30–60 ms; at
  // 30 fps the queue grows by ~17 ms per frame) and detections lag visibly
  // behind motion. SharedValue gives us atomic worklet↔JS reads.
  const inFlight = useMemo(() => Worklets.createSharedValue(false), []);
  const { resize } = useResizePlugin();
  const hp = useHyperParams();
  const scoreThreshold = hp.scoreThreshold;
  const iouThreshold = hp.iouThreshold;
  const targetFps = hp.targetFps;
  const RENDER_THROTTLE_MS = 50;
  // Re-derive the ROI crop window only when the ROI shape changes; the worklet
  // captures a stable plain object via the deps array. `null` keeps the
  // previous center-crop-to-square behaviour for un-bounded captures.
  const roiCropNorm = useMemo(() => roiBboxSquareNorm(roi ?? null), [roi]);

  useEffect(() => {
    let cancelled = false;
    loadSharedTfliteModel()
      .then((loaded) => {
        if (cancelled) return;
        modelRef.current = loaded.model;
        outputKindRef.current = loaded.outputKind;
        delegateRef.current = loaded.delegate;
        setReady(true);
      })
      .catch((err) => {
        console.warn("[live-detections] tflite unavailable", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const inferOnJS = useMemo(
    () =>
      Worklets.createRunOnJS(
        (
          input: Uint8Array,
          frameWidth: number,
          frameHeight: number,
          letterboxScale: number,
          letterboxPadX: number,
          letterboxPadY: number,
          frameTimestampMs: number,
        ) => {
          const model = modelRef.current;
          if (!model) {
            inFlight.value = false;
            return;
          }
          // Copy into a reusable Float32Array and normalize [0..255] → [0..1].
          // Keeping the worklet output as Uint8Array cuts the cross-runtime
          // copy from ~4.9 MB to ~1.2 MB for 640x640 RGB and avoids the native
          // resize plugin's float conversion while the ImageProxy is held.
          const len = input.length;
          if (!tensorRef.current || tensorRef.current.length !== len) {
            tensorRef.current = new Float32Array(len);
          }
          const tensor = tensorRef.current;
          const inv255 = 1 / 255;
          for (let i = 0; i < len; i++) tensor[i] = input[i] * inv255;
          // Async `model.run()` runs inference on a Nitro background thread
          // instead of blocking the JS thread for the full 30-50 ms NNAPI
          // window. That matters when objects are detected: the JS thread
          // can keep handling React reconciliation + Vision Camera frame
          // dispatch in parallel with the model. With runSync the same JS
          // thread did all three serially, which read as visible lag.
          const inferStartedAt = Date.now();
          model
            .run([tensor.buffer as ArrayBuffer])
            .then((outputs) => {
              recordInference(
                `tflite-${delegateRef.current}` as InferenceSource,
                Date.now() - inferStartedAt,
              );
              const out = new Float32Array(outputs[0]);
              const outputKind = outputKindRef.current;
              const lb = {
                scale: letterboxScale,
                padX: letterboxPadX,
                padY: letterboxPadY,
                target: YOLO_INPUT_SIZE,
              };
              const shape = (outputKind === "nms"
                ? [1, 300, 6]
                : [1, 84, 8400]) as unknown as readonly [number, number, number];
              const decodeOpts = {
                letterbox: lb,
                scoreThreshold,
                classFilter: classFilter ? [...classFilter] : null,
              };
              const raw =
                outputKind === "nms"
                  ? decodeYoloNms(out, shape, decodeOpts)
                  : decodeYolo(out, shape, decodeOpts);
              const kept = outputKind === "nms" ? raw : nonMaxSuppression(raw, iouThreshold);
              const seeds = mapDetectionsToSeeds(kept, {
                frameWidth,
                frameHeight,
                pxPerMm,
                roi: roi ?? null,
              });
              const now = Date.now();
              if (mountedRef.current && now - lastSetAtRef.current >= RENDER_THROTTLE_MS) {
                lastSetAtRef.current = now;
                setDetections({
                  seeds,
                  summary: summarizeSeeds(seeds),
                  frameTimestampMs,
                  frameWidth,
                  frameHeight,
                  analyzerId: "tflite-yolo-live",
                });
              }
            })
            .catch((err) => {
              console.warn("[live-detections] run failed", err);
            })
            .finally(() => {
              inFlight.value = false;
            });
        },
      ),
    [classFilter, pxPerMm, roi, scoreThreshold, iouThreshold, inFlight],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled) return;
      // Drop frames while the JS thread is still inferring the previous
      // one. Without this back-pressure, runSync calls queue up indefinitely
      // and detection visibly lags real motion.
      if (inFlight.value) return;
      runAtTargetFps(targetFps, () => {
        "worklet";
        // Re-check + set inFlight as the FIRST thing inside the gated block.
        // Setting after `resize()` opened a 5-10 ms race window during which
        // multiple worklet invocations could pass the check, each acquiring an
        // image from CameraX's `ImageAnalysis` pool (size 6). When the pool
        // ran out, Camera2 threw `IllegalStateException: maxImages (6) has
        // already been acquired` and stalled the preview — the visible
        // "stuck/laggy when objects detected" symptom. Atomic gate first;
        // resize the frame only if we won the race.
        if (inFlight.value) return;
        inFlight.value = true;
        try {
          // ROI-aware crop: when the user has bounded a region, hand the
          // resize plugin only the ROI bbox (square-padded) so YOLO sees more
          // pixels per object inside the ROI and detections outside are
          // physically impossible — both faster and more accurate. With no
          // ROI we keep the original center-crop-to-square fallback.
          let cropX = 0;
          let cropY = 0;
          let cropSize = Math.min(frame.width, frame.height);
          if (roiCropNorm) {
            cropSize = Math.round(roiCropNorm.size * Math.min(frame.width, frame.height));
            cropX = Math.round(roiCropNorm.x * frame.width);
            cropY = Math.round(roiCropNorm.y * frame.height);
            // Re-clamp in pixel space — rounding can push us 1 px past the edge.
            if (cropX + cropSize > frame.width) cropX = frame.width - cropSize;
            if (cropY + cropSize > frame.height) cropY = frame.height - cropSize;
          } else {
            cropX = Math.round((frame.width - cropSize) / 2);
            cropY = Math.round((frame.height - cropSize) / 2);
          }
          const resized = resize(frame, {
            crop: { x: cropX, y: cropY, width: cropSize, height: cropSize },
            scale: { width: YOLO_INPUT_SIZE, height: YOLO_INPUT_SIZE },
            pixelFormat: "rgb",
            dataType: "uint8",
          });
          const fpScale = YOLO_INPUT_SIZE / cropSize;
          const fpPadX = -cropX * fpScale;
          const fpPadY = -cropY * fpScale;
          // Worklets-core 1.6 rejects raw ArrayBuffer as a shared value but
          // accepts typed arrays. .slice() detaches us from the resize plugin's
          // worklet-owned buffer so the JS thread owns a private copy; using
          // uint8 keeps that critical section small while CameraX is waiting
          // for the ImageProxy to be released.
          inferOnJS(
            resized.slice(),
            frame.width,
            frame.height,
            fpScale,
            fpPadX,
            fpPadY,
            frame.timestamp,
          );
        } catch (err) {
          const e = err as { message?: string; name?: string } | undefined;
          console.warn(
            "[live-detections] frame processing failed",
            String(e?.name ?? "?"),
            String(e?.message ?? err),
          );
          inFlight.value = false;
        }
      });
    },
    [enabled, resize, inferOnJS, targetFps, inFlight, roiCropNorm],
  );

  useEffect(() => {
    if (!enabled) setDetections(null);
  }, [enabled]);

  return useMemo(
    () => ({
      detections,
      ready,
      frameProcessor: enabled && ready ? frameProcessor : undefined,
    }),
    [detections, enabled, frameProcessor, ready],
  );
}
