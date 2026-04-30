import { useEffect, useMemo, useRef, useState } from "react";
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
 * Live ML inference for the camera preview.
 *
 * The worklet thread does the cheap part: resize the Vision Camera frame
 * to 640×640 RGB float32 with vision-camera-resize-plugin. The expensive
 * part — `model.runSync` and YOLO decode — runs on the JS thread via
 * `Worklets.createRunOnJS`.
 *
 * Why JS-thread inference (not worklet-thread):
 *   When the captured `model` HybridObject travels across the worklet
 *   serialization boundary, react-native-worklets-core walks its enumerable
 *   properties to determine shareability. That walk fires the `outputs`
 *   getter, which throws "this does not have a NativeState" any time the
 *   model is mid-fast-refresh or has been re-instantiated. The crash kills
 *   the camera screen.
 *
 *   Keeping the model entirely on the JS thread (accessed via a ref) means
 *   nothing hybrid-shaped is captured by the worklet closure — only a plain
 *   `runOnJS` callback. ArrayBuffers cross threads cheaply, so the only
 *   added cost vs. pure-worklet inference is one bridge hop per ≤5 fps
 *   frame, which is fine for the live KPI strip.
 */
export function useLiveDetections(options: Options): State {
  const { enabled, pxPerMm, classFilter, roi } = options;
  const modelRef = useRef<TfliteModel | null>(null);
  const outputKindRef = useRef<TfliteOutputKind>("raw");
  const [ready, setReady] = useState(false);
  const [detections, setDetections] = useState<AnalysisFrameResult | null>(null);
  const { resize } = useResizePlugin();

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

  // JS-thread side: receives the resized frame buffer + frame metadata,
  // runs inference on the model held in `modelRef`, decodes, and writes
  // detections into React state. The worklet body only knows about this
  // function reference — never about `model` directly — so Vision Camera's
  // worklet serialization can't walk the hybrid object.
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
          // YOLO26 NMS-baked head: [1, 300, 6]. YOLO11 raw head: [1, 84, 8400].
          const shape = (outputKind === "nms"
            ? [1, 300, 6]
            : [1, 84, 8400]) as unknown as readonly [number, number, number];
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
    [classFilter, pxPerMm, roi],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled) return;
      runAtTargetFps(TARGET_FPS, () => {
        "worklet";
        try {
          const resized = resize(frame, {
            scale: { width: YOLO_INPUT_SIZE, height: YOLO_INPUT_SIZE },
            pixelFormat: "rgb",
            dataType: "float32",
          });
          // The resize plugin center-crops to the model's square aspect, then
          // scales to 640. Detections come out in 640-px space measured from
          // the top-left of the *cropped square*, NOT the full camera frame.
          // Pass the inverse-letterbox params so decodeYolo lands boxes in
          // original-frame coords.
          const cropSize = Math.min(frame.width, frame.height);
          const fpScale = YOLO_INPUT_SIZE / cropSize;
          const fpPadX = -((frame.width - cropSize) / 2) * fpScale;
          const fpPadY = -((frame.height - cropSize) / 2) * fpScale;
          // The resize plugin returns a Float32Array backed by a buffer the
          // worklet runtime owns. Passing it directly to runOnJS surfaces an
          // empty `{}` error when worklets-core tries to clone it. Build a
          // fresh ArrayBuffer with `.slice()` first — clones into the
          // structured-clone-friendly heap the JS thread can read.
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
    [enabled, resize, inferOnJS],
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
