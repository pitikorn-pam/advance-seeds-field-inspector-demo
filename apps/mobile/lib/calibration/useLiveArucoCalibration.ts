import { useEffect, useMemo, useState } from "react";
import { runAtTargetFps, useFrameProcessor } from "react-native-vision-camera";
import type { ReadonlyFrameProcessor } from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";
import { detectArucoCalibrationInFrame } from "./ArucoCalibrator";
import type { ArucoCalibrationResult } from "./ArucoCalibrator";

interface LiveArucoState {
  result: ArucoCalibrationResult | null;
  locked: boolean;
  frameProcessor: ReadonlyFrameProcessor | undefined;
}

const MIN_CONFIDENCE = 0.6;

export function useLiveArucoCalibration(enabled: boolean): LiveArucoState {
  const [result, setResult] = useState<ArucoCalibrationResult | null>(null);
  const onDetection = useRunOnJS((next: ArucoCalibrationResult | null) => {
    setResult(next);
  }, []);

  useEffect(() => {
    if (!enabled) setResult(null);
  }, [enabled]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled) return;
      runAtTargetFps(2, () => {
        "worklet";
        const next = detectArucoCalibrationInFrame(frame);
        onDetection(next);
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
