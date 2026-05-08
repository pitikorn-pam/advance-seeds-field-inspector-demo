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
import { Worklets } from "react-native-worklets-core";
import type { AnalysisFrameResult, AnalysisRoi, SeedGradingConfig } from "@advance-seeds/types";
import {
  YOLO_INPUT_SIZE,
  decodeYolo,
  decodeYoloNms,
  decodeYoloSegmentationNms,
  unrotateBbox,
  mapDetectionsToSeeds,
  nonMaxSuppression,
  summarizeSeeds,
} from "./yolo";
import { useHyperParams } from "./hyperparams";
import { resolvePreprocessProfile } from "./preprocess";
import { recordInference, type InferenceSource } from "./inferenceStats";
import type { InstalledModelRecord } from "@/lib/models/types";
import { mapClassFilterForModel } from "@/lib/models/compatibility";
import { quickVerifyArtifact, readActiveModel } from "@/lib/models/modelStore";

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
  gradingConfig?: SeedGradingConfig | null;
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
  const { enabled, pxPerMm, classFilter, roi, varietyNames, modelClassAliases, gradingConfig } =
    options;
  const hp = useHyperParams();
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<InstalledModelRecord | null>(null);
  const modelReady = Boolean(modelPath && activeModel);
  const lastSetAtRef = useRef(0);
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
    if (!enabled) setDetections(null);
  }, [enabled]);

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
  }, [enabled]);

  // Translate COCO/variety class filter into the active model's class
  // index space *before* the worklet runs — worklets can't read JS
  // metadata. Re-runs when the active model or selection changes.
  const mappedClassFilter = useMemo(
    () =>
      mapClassFilterForModel(classFilter, activeModel?.metadata, varietyNames, modelClassAliases),
    [classFilter, activeModel, varietyNames, modelClassAliases],
  );
  // One-line diagnostic per change — useful for confirming which model
  // is loaded and which class indices the live filter resolves to.
  useEffect(() => {
    console.info(
      "[live-detections coreml] model=%s mappedFilter=%o",
      activeModel?.id ?? "none",
      mappedClassFilter,
    );
  }, [activeModel, mappedClassFilter]);

  const scoreThreshold = hp.scoreThreshold;
  const iouThreshold = hp.iouThreshold;
  const targetFps = hp.targetFps;
  useEffect(() => {
    console.info(
      "[live-detections coreml] inferenceFps requested=%d effective=%d previewFps=30",
      targetFps,
      targetFps,
    );
  }, [targetFps]);
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
        ) => {
          recordInference("coreml", inferElapsedMs);
          const out = Float32Array.from(values);
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
          };
          const shape = [shape0, shape1, shape2] as unknown as readonly [number, number, number];
          const rawDetections =
            outputKind === "nms"
              ? decodeYoloNms(out, shape, decodeOpts)
              : outputKind === "segmentation"
                ? decodeYoloSegmentationNms(out, shape, decodeOpts)
                : decodeYolo(out, shape, decodeOpts);
          // Bboxes are now in post-rotation pixel space. Inverse-rotate
          // each one back to sensor (frame.width × frame.height) coords
          // so DetectionOverlay can project them onto the camera preview.
          const sensorDetections = rotates
            ? rawDetections.map((d) => unrotateBbox(d, postW, postH, orientation))
            : rawDetections;
          const kept =
            outputKind === "raw"
              ? nonMaxSuppression(sensorDetections, iouThreshold)
              : sensorDetections;
          const seeds = mapDetectionsToSeeds(kept, {
            frameWidth,
            frameHeight,
            pxPerMm,
            roi: roi ?? null,
            gradingConfig: gradingConfig ?? null,
          });
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
          setDetections({
            seeds,
            summary: summarizeSeeds(seeds),
            frameTimestampMs,
            frameWidth,
            frameHeight,
            frameOrientation: orientation,
            analyzerId: "coreml-yolo-live",
          });
        },
      ),
    [mappedClassFilter, pxPerMm, roi, gradingConfig, scoreThreshold, iouThreshold],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled || !plugin) return;
      if (!modelPath) return;
      runAtTargetFps(targetFps, () => {
        "worklet";
        try {
          // Time only the native plugin call, which is where the Core ML
          // VNCoreMLRequest runs synchronously on the worklet thread; that
          // dominates everything else this worklet does.
          const startedAt = Date.now();
          const result = plugin.call(frame, {
            assetName: COREML_ASSET,
            modelPath,
            preprocessProfile,
          });
          const inferElapsedMs = Date.now() - startedAt;
          if (!result) return;
          const r = result as unknown as {
            shape: number[];
            values: number[];
            orientation?: string;
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
          );
        } catch (err) {
          console.warn("[live-detections coreml] frame processing failed", err);
        }
      });
    },
    [enabled, plugin, decodeOnJS, targetFps, modelPath, preprocessProfile],
  );

  return useMemo(
    () => ({
      detections,
      ready: plugin !== null && modelReady,
      frameProcessor: enabled && plugin && modelReady ? frameProcessor : undefined,
    }),
    [detections, enabled, frameProcessor, modelReady, plugin],
  );
}

// ---------------------------------------------------------------------
// Android — native TFLite frame-processor plugin
// ---------------------------------------------------------------------

// Cached so we only log delegate selection once per change, not per frame.
let lastLoggedDelegate: string | null = null;

function useLiveDetectionsAndroidNative(options: Options): State {
  const { enabled, pxPerMm, classFilter, roi, varietyNames, modelClassAliases, gradingConfig } =
    options;
  const hp = useHyperParams();
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  const [activeModel, setActiveModel] = useState<InstalledModelRecord | null>(null);
  const lastSetAtRef = useRef(0);
  const lastDecodeLogAtRef = useRef(0);
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
    if (!enabled) setDetections(null);
  }, [enabled]);

  const plugin = useMemo(
    () => VisionCameraProxy.initFrameProcessorPlugin("advanceSeedsRunTFLite", {}),
    [],
  );

  const scoreThreshold = hp.scoreThreshold;
  const liveScoreThreshold = Math.min(scoreThreshold, 0.25);
  const iouThreshold = hp.iouThreshold;
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
  }, [enabled]);

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
        ) => {
          const source: InferenceSource = delegate === "gpu" ? "tflite-android-gpu" : "tflite-cpu";
          recordInference(source, inferElapsedMs);
          if (__DEV__ && lastLoggedDelegate !== delegate) {
            lastLoggedDelegate = delegate;
            console.info(
              `[live-detections android-native] delegate=${delegate} (first inference: ${inferElapsedMs}ms)`,
            );
          }
          const out = Float32Array.from(values);
          const outputKind: "raw" | "nms" | "segmentation" =
            shape2 === 6 ? "nms" : shape2 > 6 ? "segmentation" : "raw";
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
          };
          const shape = [shape0, shape1, shape2] as unknown as readonly [number, number, number];
          const raw =
            outputKind === "nms"
              ? decodeYoloNms(out, shape, decodeOpts)
              : outputKind === "segmentation"
                ? decodeYoloSegmentationNms(out, shape, decodeOpts)
                : decodeYolo(out, shape, decodeOpts);
          const kept = outputKind === "raw" ? nonMaxSuppression(raw, iouThreshold) : raw;
          const seeds = mapDetectionsToSeeds(kept, {
            frameWidth,
            frameHeight,
            pxPerMm,
            roi: roi ?? null,
            gradingConfig: gradingConfig ?? null,
          });
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
              `[live-detections android-native] shape=${shape.join("x")} frame=${frameWidth}x${frameHeight} crop=${cropX},${cropY},${cropSize} delegate=${delegate} filter=${classFilter ? [...classFilter].join(",") : "any"} threshold=${liveScoreThreshold}/${scoreThreshold} all=${allRaw.length} raw=${raw.length} kept=${kept.length} seeds=${seeds.length} top=${top} tensor=${topTensor}`,
            );
          }
          if (!mountedRef.current) return;
          if (!enabledRef.current) return;
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
    [
      classFilter,
      varietyNames,
      modelClassAliases,
      pxPerMm,
      roi,
      gradingConfig,
      liveScoreThreshold,
      scoreThreshold,
      iouThreshold,
      activeModel,
    ],
  );

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
              modelPath: activeModel.artifactUri,
              cropX,
              cropY,
              cropSize,
              preprocessProfile,
            });
            const inferElapsedMs = Date.now() - startedAt;
            if (!result) return;
            const r = result as unknown as {
              shape: number[];
              values: number[];
              delegate?: string;
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
            );
          } catch (err) {
            console.warn("[live-detections tflite-native] frame processing failed", err);
          }
        });
      });
    },
    [enabled, plugin, decodeOnJS, targetFps, roiCropNorm, activeModel, preprocessProfile],
  );

  return useMemo(
    () => ({
      detections,
      ready: plugin !== null && activeModel !== null,
      frameProcessor: enabled && plugin && activeModel ? frameProcessor : undefined,
    }),
    [activeModel, detections, enabled, frameProcessor, plugin],
  );
}
