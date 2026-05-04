import { useEffect, useMemo, useRef, useState } from "react";
import {
  getLidarCalibration,
  isLidarCalibrationSupported,
  startLidarCalibration,
  stopLidarCalibration,
} from "./LidarCalibrator";
import type { LidarCalibrationResult } from "./LidarCalibrator";

interface LiveLidarState {
  /** Latest smoothed reading. Null when LiDAR unsupported or below confidence. */
  result: LidarCalibrationResult | null;
  /** Null while initial support check is in flight, then true/false. */
  supported: boolean | null;
  /** True once we've ever produced a confident reading; stays true while
   *  readings keep coming. Drops back to false when the user moves out of
   *  range / the device tilts away from the surface. */
  locked: boolean;
  /** "28 cm" — derived from the depth reading for UI badges. */
  distanceLabel: string | null;
}

const MIN_CONFIDENCE = 0.6;
const POLL_INTERVAL_MS = 100;
// Exponential moving average coefficient for pxPerMm + distance. 0.30
// = "moderate smoothing": tracks real distance changes within ~150ms
// while damping single-frame depth-noise spikes that ARKit emits at
// glancing angles. Higher α → snappier but jitterier; lower α → calm
// but laggy when the operator moves.
const EMA_ALPHA = 0.3;

/**
 * Continuous LiDAR calibration. Streams the device's distance from
 * whatever surface the camera is pointed at, updating pxPerMm in real
 * time as the operator moves. Replaces the older "lock once stable
 * then freeze" UX so seed sizes recompute on every frame without the
 * inspector having to stand still.
 *
 * Smoothing strategy: keep a per-frame poll (100 ms = 10 Hz, matching
 * ARKit's typical depth refresh) and apply an exponential moving
 * average on the headline numbers. The EMA absorbs the ±2 cm
 * depth-noise that LiDAR emits at oblique angles without introducing
 * the multi-second lag of a stability gate.
 */
export function useLiveLidarCalibration(enabled: boolean): LiveLidarState {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [result, setResult] = useState<LidarCalibrationResult | null>(null);
  const lastSampleAtRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function start() {
      if (!enabled) {
        setResult(null);
        return;
      }
      const canUse = await isLidarCalibrationSupported();
      if (cancelled) return;
      setSupported(canUse);
      if (!canUse) {
        setResult(null);
        return;
      }
      const started = await startLidarCalibration();
      if (cancelled) {
        await stopLidarCalibration();
        return;
      }
      if (!started) {
        setSupported(false);
        setResult(null);
        return;
      }
      interval = setInterval(() => {
        void getLidarCalibration().then((next) => {
          if (cancelled) return;
          if (!next || next.reading.confidence < MIN_CONFIDENCE) {
            // Don't immediately drop a confident lock — keep the last
            // result for ~500ms so brief depth-noise doesn't wipe the
            // overlay. After that window, fall to null.
            const since = Date.now() - lastSampleAtRef.current;
            if (since > 500) setResult(null);
            return;
          }
          lastSampleAtRef.current = Date.now();
          setResult((prev) => smooth(prev, next));
        });
      }, POLL_INTERVAL_MS);
    }

    void start();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      setResult(null);
      void stopLidarCalibration();
    };
  }, [enabled]);

  return useMemo(
    () => ({
      result,
      supported,
      locked: result !== null,
      distanceLabel: result ? `${Math.round(result.distanceMeters * 100)} cm` : null,
    }),
    [result, supported],
  );
}

function smooth(
  prev: LidarCalibrationResult | null,
  next: LidarCalibrationResult,
): LidarCalibrationResult {
  if (!prev) return next;
  const a = EMA_ALPHA;
  return {
    reading: {
      pxPerMm: a * next.reading.pxPerMm + (1 - a) * prev.reading.pxPerMm,
      source: next.reading.source,
      confidence: a * next.reading.confidence + (1 - a) * prev.reading.confidence,
      observedAtMs: next.reading.observedAtMs,
    },
    distanceMeters: a * next.distanceMeters + (1 - a) * prev.distanceMeters,
    focalLengthPx: next.focalLengthPx,
    sampleCount: next.sampleCount,
  };
}
