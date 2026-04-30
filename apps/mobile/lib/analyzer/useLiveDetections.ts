import { useEffect, useMemo, useState } from "react";
import { runAtTargetFps, useFrameProcessor } from "react-native-vision-camera";
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

const SCORE_THRESHOLD = 0.5;
const IOU_THRESHOLD = 0.75;
const TARGET_FPS = 5;

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
 * Real worklet-thread ML inference for live mode. Loads the bundled YOLO TFLite
 * model once via the shared singleton, resizes each Vision Camera frame to
 * 640×640 RGB float32 with vision-camera-resize-plugin, and runs `model.runSync`
 * directly on the worklet thread — no JS-bridge round-trip per frame.
 *
 * Decoding (NMS / class filter / px→mm) happens on the JS thread via a
 * `runOnJS` callback so we don't ship the heavy yolo helpers across the
 * worklet boundary on every tick.
 *
 * The hook owns its frame processor — the camera screen swaps between this
 * and the aruco frame processor based on calibration lock state.
 */
export function useLiveDetections(options: Options): State {
  const { enabled, pxPerMm, classFilter, roi } = options;
  const [model, setModel] = useState<TfliteModel | null>(null);
  const [outputKind, setOutputKind] = useState<TfliteOutputKind>("raw");
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  const { resize } = useResizePlugin();

  useEffect(() => {
    let cancelled = false;
    loadSharedTfliteModel()
      .then((loaded) => {
        if (cancelled) return;
        setModel(loaded.model);
        setOutputKind(loaded.outputKind);
      })
      .catch((err) => {
        console.warn("[live-detections] tflite unavailable", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The decode step runs on the JS thread; the worklet posts the raw output
  // tensor and frame dimensions, the JS side converts to AnalyzedSeed[].
  const decodeOnJS = useMemo(
    () =>
      Worklets.createRunOnJS(
        (
          rawBuffer: ArrayBuffer,
          frameWidth: number,
          frameHeight: number,
          letterboxScale: number,
          letterboxPadX: number,
          letterboxPadY: number,
          shape0: number,
          shape1: number,
          shape2: number,
          frameTimestampMs: number,
        ) => {
          const out = new Float32Array(rawBuffer);
          const lb = {
            scale: letterboxScale,
            padX: letterboxPadX,
            padY: letterboxPadY,
            target: YOLO_INPUT_SIZE,
          };
          const shape = [shape0, shape1, shape2] as unknown as readonly [number, number, number];
          const decodeOpts = {
            letterbox: lb,
            scoreThreshold: SCORE_THRESHOLD,
            classFilter: classFilter ? [...classFilter] : null,
          };
          const raw =
            outputKind === "nms"
              ? decodeYoloNms(out, shape, decodeOpts)
              : decodeYolo(out, shape, decodeOpts);
          const kept = outputKind === "nms" ? raw : nonMaxSuppression(raw, IOU_THRESHOLD);
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
    [classFilter, outputKind, pxPerMm, roi],
  );

  // Live worklet path is gated off until we resolve the
  // "Cannot get hybrid property HybridTfliteModelSpec.outputs" crash that
  // fires when Vision Camera serializes a frameProcessor closing over a
  // fast-tflite HybridObject across fast-refresh / re-mount. The single-shot
  // photo path still uses the loaded model, so processing screens keep
  // working — only the live KPI strip falls back to the mock ticker for now.
  const LIVE_WORKLET_ENABLED = false;

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!LIVE_WORKLET_ENABLED || !enabled || !model) return;
      runAtTargetFps(TARGET_FPS, () => {
        "worklet";
        try {
          const resized = resize(frame, {
            scale: { width: YOLO_INPUT_SIZE, height: YOLO_INPUT_SIZE },
            pixelFormat: "rgb",
            dataType: "float32",
          });
          const out = model.runSync([resized.buffer as ArrayBuffer]);
          // The resize plugin center-crops to the model's square aspect, then
          // scales to 640. Detections come out in 640-px space measured from
          // the top-left of the *cropped square*, NOT the full camera frame.
          // To map them back to original frame coords we mirror the letterbox
          // inverse: a detection at cx maps to (cx / scale) + offset.
          //
          //   scale = 640 / cropSize           (cropSize = min(w, h))
          //   offsetX = (frame.w - cropSize)/2  (left margin shaved off)
          //   offsetY = (frame.h - cropSize)/2
          //
          // decodeYolo computes original_x = (cx - padX) / scale, so:
          //   padX = -offsetX * scale, padY = -offsetY * scale.
          // Without this fix every bbox piles up in the top-left corner
          // and the live count drifts as soon as the frame isn't square.
          const cropSize = Math.min(frame.width, frame.height);
          const fpScale = YOLO_INPUT_SIZE / cropSize;
          const fpPadX = -((frame.width - cropSize) / 2) * fpScale;
          const fpPadY = -((frame.height - cropSize) / 2) * fpScale;
          decodeOnJS(
            out[0],
            frame.width,
            frame.height,
            fpScale,
            fpPadX,
            fpPadY,
            1,
            outputKind === "nms" ? 300 : 84,
            outputKind === "nms" ? 6 : 8400,
            frame.timestamp,
          );
        } catch (err) {
          // Worklet exceptions don't propagate to JS by default; surface them
          // so we can see resize/runSync failures in dev.
          console.warn("[live-detections] frame processing failed", err);
        }
      });
    },
    [enabled, model, outputKind, resize, decodeOnJS],
  );

  useEffect(() => {
    if (!enabled) setDetections(null);
  }, [enabled]);

  return useMemo(
    () => ({
      detections,
      ready: model !== null,
      // Don't expose the worklet to <Camera> while the gate above is off —
      // even a "no-op worklet" still trips Vision Camera's prop walk if it
      // captures `model`. Returning undefined keeps the camera on its
      // existing aruco frame processor.
      frameProcessor: LIVE_WORKLET_ENABLED && enabled && model ? frameProcessor : undefined,
    }),
    [detections, enabled, frameProcessor, model],
  );
}
