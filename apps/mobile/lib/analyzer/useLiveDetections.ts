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
import { loadSharedTfliteModel, type TfliteOutputKind } from "./TfliteSeedAnalyzer";
import { useHyperParams } from "./hyperparams";

const COREML_ASSET = "yolo26n";

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
 *            vision-camera-resize-plugin; inference runs on the JS
 *            thread because capturing fast-tflite's HybridObject in a
 *            worklet closure crashes Vision Camera's prop walk.
 *
 * Both paths funnel into the same `decodeOutputOnJS` callback so the
 * KPI strip + DetectionOverlay are platform-agnostic.
 */
export function useLiveDetections(options: Options): State {
  if (Platform.OS === "ios") {
    return useLiveDetectionsCoreML(options);
  }
  return useLiveDetectionsTflite(options);
}

// ---------------------------------------------------------------------
// iOS — Core ML frame-processor plugin
// ---------------------------------------------------------------------

function useLiveDetectionsCoreML(options: Options): State {
  const { enabled, pxPerMm, classFilter, roi } = options;
  const hp = useHyperParams();
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);

  // Initialised once. Vision Camera proxies the native plugin lookup
  // through JSI; the resulting object is worklet-shareable.
  const plugin = useMemo(
    () => VisionCameraProxy.initFrameProcessorPlugin("advanceSeedsRunCoreML", {}),
    [],
  );

  const scoreThreshold = hp.scoreThreshold;
  const iouThreshold = hp.iouThreshold;
  const targetFps = hp.targetFpsIos;

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
        ) => {
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
          setDetections({
            seeds,
            summary: summarizeSeeds(seeds),
            frameTimestampMs,
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
          const result = plugin.call(frame, { assetName: COREML_ASSET });
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
// Android — TFLite + JS-thread inference (worklet does resize only)
// ---------------------------------------------------------------------

function useLiveDetectionsTflite(options: Options): State {
  const { enabled, pxPerMm, classFilter, roi } = options;
  const modelRef = useRef<TfliteModel | null>(null);
  const outputKindRef = useRef<TfliteOutputKind>("raw");
  const [ready, setReady] = useState(false);
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  const { resize } = useResizePlugin();
  const hp = useHyperParams();
  const scoreThreshold = hp.scoreThreshold;
  const iouThreshold = hp.iouThreshold;
  const targetFps = hp.targetFpsAndroid;

  useEffect(() => {
    let cancelled = false;
    loadSharedTfliteModel()
      .then((loaded) => {
        if (cancelled) return;
        modelRef.current = loaded.model;
        outputKindRef.current = loaded.outputKind;
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
          rawBuffer: ArrayBuffer,
          frameWidth: number,
          frameHeight: number,
          letterboxScale: number,
          letterboxPadX: number,
          letterboxPadY: number,
          frameTimestampMs: number,
        ) => {
          const model = modelRef.current;
          if (!model) return;
          let outputs: ArrayBuffer[];
          try {
            outputs = model.runSync([rawBuffer]);
          } catch (err) {
            console.warn("[live-detections] runSync failed", err);
            return;
          }
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
          setDetections({
            seeds,
            summary: summarizeSeeds(seeds),
            frameTimestampMs,
            analyzerId: "tflite-yolo-live",
          });
        },
      ),
    [classFilter, pxPerMm, roi, scoreThreshold, iouThreshold],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled) return;
      runAtTargetFps(targetFps, () => {
        "worklet";
        try {
          const resized = resize(frame, {
            scale: { width: YOLO_INPUT_SIZE, height: YOLO_INPUT_SIZE },
            pixelFormat: "rgb",
            dataType: "float32",
          });
          const cropSize = Math.min(frame.width, frame.height);
          const fpScale = YOLO_INPUT_SIZE / cropSize;
          const fpPadX = -((frame.width - cropSize) / 2) * fpScale;
          const fpPadY = -((frame.height - cropSize) / 2) * fpScale;
          // Clone the resize plugin's worklet-owned buffer; structured-clone
          // can't transfer the SharedArrayBuffer view it returns directly.
          const cloned = resized.slice().buffer;
          inferOnJS(
            cloned as ArrayBuffer,
            frame.width,
            frame.height,
            fpScale,
            fpPadX,
            fpPadY,
            frame.timestamp,
          );
        } catch (err) {
          console.warn("[live-detections] frame processing failed", err);
        }
      });
    },
    [enabled, resize, inferOnJS, targetFps],
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
