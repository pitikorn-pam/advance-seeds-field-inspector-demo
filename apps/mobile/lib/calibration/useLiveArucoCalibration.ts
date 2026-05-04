import { useEffect, useMemo, useRef, useState } from "react";
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

// Phase-2 calibration: hysteresis + temporal smoothing.
//   - LOCK_CONFIDENCE: required to *enter* a locked state
//   - HOLD_CONFIDENCE: required to *maintain* it (looser, fights flicker
//     when the marker partially occludes for one frame)
//   - SMOOTHING_WINDOW: rolling median of px/mm — kills 1-frame outliers
//     from motion blur, lighting flicker, marker corner ambiguity
//   - GRACE_MS: how long we keep showing a locked reading after the marker
//     drops out of frame; prevents the calibration pill from flashing every
//     time the user briefly tilts the device
const LOCK_CONFIDENCE = 0.6;
const HOLD_CONFIDENCE = 0.45;
const SMOOTHING_WINDOW = 5;
const GRACE_MS = 1500;
const DETECTION_TARGET_FPS = 1;

interface SmoothedReading {
  pxPerMm: number;
  markerId: number;
  confidence: number;
  observedAtMs: number;
  markerSizeMm: number;
  pixelWidth: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function useLiveArucoCalibration(enabled: boolean): LiveArucoState {
  const [result, setResult] = useState<ArucoCalibrationResult | null>(null);
  // Rolling buffer of recent valid samples; we publish the median which
  // suppresses single-frame spikes (motion blur / partial-occlusion noise).
  const bufferRef = useRef<SmoothedReading[]>([]);
  const lastLockedAtRef = useRef(0);
  const wasLockedRef = useRef(false);

  const onDetection = useRunOnJS(
    (
      pxPerMm: number | null,
      markerId: number,
      confidence: number,
      observedAtMs: number,
      markerSizeMm: number,
      pixelWidth: number,
      markerCount: number,
      multiMedianPxPerMm: number,
    ) => {
      const buffer = bufferRef.current;
      const now = Date.now();
      const threshold = wasLockedRef.current ? HOLD_CONFIDENCE : LOCK_CONFIDENCE;

      // When the native detector saw multiple markers in this frame, the
      // median across all of them is a tighter estimate than any single
      // marker's pxPerMm. Fall back to the single-marker value otherwise.
      const effectivePxPerMm = markerCount > 1 ? multiMedianPxPerMm : pxPerMm;

      if (effectivePxPerMm !== null && effectivePxPerMm > 0 && confidence >= threshold) {
        buffer.push({
          pxPerMm: effectivePxPerMm,
          markerId,
          confidence,
          observedAtMs,
          markerSizeMm,
          pixelWidth,
        });
        if (buffer.length > SMOOTHING_WINDOW) buffer.shift();
        const smoothedPxPerMm = median(buffer.map((r) => r.pxPerMm));
        const smoothedConfidence = median(buffer.map((r) => r.confidence));
        wasLockedRef.current = true;
        lastLockedAtRef.current = now;
        setResult({
          reading: {
            pxPerMm: smoothedPxPerMm,
            source: "aruco",
            confidence: smoothedConfidence,
            observedAtMs,
          },
          markerId,
          markerSizeMm,
          pixelWidth,
        });
        return;
      }

      // No valid reading this frame. Stay locked through a short grace window
      // so the pill doesn't flicker off when the marker briefly clips an edge
      // or the user tilts the device. After the grace expires, drop the lock.
      if (wasLockedRef.current && now - lastLockedAtRef.current < GRACE_MS) return;
      wasLockedRef.current = false;
      buffer.length = 0;
      setResult(null);
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = [];
      wasLockedRef.current = false;
      lastLockedAtRef.current = 0;
      setResult(null);
    }
  }, [enabled]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (!enabled) return;
      runAtTargetFps(DETECTION_TARGET_FPS, () => {
        "worklet";
        const next = detectNativeArucoCalibrationInFrame(frame);
        if (!next) {
          onDetection(null, 0, 0, 0, 0, 0, 0, 0);
          return;
        }
        onDetection(
          next.pxPerMm,
          next.markerId,
          next.confidence,
          next.observedAtMs,
          next.markerSizeMm,
          next.pixelWidth,
          next.markerCount ?? 1,
          next.multiMedianPxPerMm ?? next.pxPerMm,
        );
      });
    },
    [enabled, onDetection],
  );

  return useMemo(
    () => ({
      result,
      locked: result !== null,
      frameProcessor: enabled ? frameProcessor : undefined,
    }),
    [enabled, frameProcessor, result],
  );
}
