import { useEffect, useMemo, useState } from "react";
import { runAtTargetFps, useFrameProcessor } from "react-native-vision-camera";
import type { ReadonlyFrameProcessor } from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";
import { detectNativeArucoCalibrationInFrame } from "./ArucoCalibrator";
import type { ArucoCalibrationResult } from "./ArucoCalibrator";

interface LiveArucoState {
  result: ArucoCalibrationResult | null;
  locked: boolean;
  frameProcessor: ReadonlyFrameProcessor | undefined;
}

const MIN_CONFIDENCE = 0.6;

export function useLiveArucoCalibration(enabled: boolean): LiveArucoState {
  const [result, setResult] = useState<ArucoCalibrationResult | null>(null);
  const onDetection = useRunOnJS(
    (
      pxPerMm: number | null,
      markerId: number,
      confidence: number,
      observedAtMs: number,
      markerSizeMm: number,
      pixelWidth: number,
    ) => {
      if (pxPerMm === null || confidence < MIN_CONFIDENCE) {
        setResult(null);
        return;
      }
      setResult({
        reading: {
          pxPerMm,
          source: "aruco",
          confidence,
          observedAtMs,
        },
        markerId,
        markerSizeMm,
        pixelWidth,
      });
    },
    [],
  );

  useEffect(() => {
    if (!enabled) setResult(null);
  }, [enabled]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled) return;
      runAtTargetFps(1, () => {
        "worklet";
        const next = detectNativeArucoCalibrationInFrame(frame);
        if (!next) {
          onDetection(null, 0, 0, 0, 0, 0);
          return;
        }
        onDetection(
          next.pxPerMm,
          next.markerId,
          next.confidence,
          next.observedAtMs,
          next.markerSizeMm,
          next.pixelWidth,
        );
      });
    },
    [enabled, onDetection],
  );

  return useMemo(
    () => ({
      result,
      locked: result !== null && result.reading.confidence >= MIN_CONFIDENCE,
      frameProcessor: enabled ? frameProcessor : undefined,
    }),
    [enabled, frameProcessor, result],
  );
}
