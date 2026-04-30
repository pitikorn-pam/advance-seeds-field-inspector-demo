import { useEffect, useMemo, useRef, useState } from "react";
import {
  getLidarCalibration,
  isLidarCalibrationSupported,
  startLidarCalibration,
  stopLidarCalibration,
} from "./LidarCalibrator";
import type { LidarCalibrationResult } from "./LidarCalibrator";
import type { MutableRefObject } from "react";

interface LiveLidarState {
  result: LidarCalibrationResult | null;
  supported: boolean | null;
  locked: boolean;
  distanceLabel: string | null;
}

const MIN_CONFIDENCE = 0.8;
const STABLE_MS = 1000;
const MAX_DISTANCE_DELTA_M = 0.015;
const MAX_SCALE_DELTA_RATIO = 0.025;

export function useLiveLidarCalibration(enabled: boolean): LiveLidarState {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [result, setResult] = useState<LidarCalibrationResult | null>(null);
  const stableCandidateRef = useRef<LidarCalibrationResult | null>(null);
  const stableSinceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function start() {
      if (!enabled) {
        setResult(null);
        stableCandidateRef.current = null;
        stableSinceRef.current = null;
        return;
      }
      const canUse = await isLidarCalibrationSupported();
      if (cancelled) return;
      setSupported(canUse);
      if (!canUse) {
        setResult(null);
        stableCandidateRef.current = null;
        stableSinceRef.current = null;
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
        stableCandidateRef.current = null;
        stableSinceRef.current = null;
        return;
      }
      interval = setInterval(() => {
        void getLidarCalibration().then((next) => {
          if (!cancelled) setResult(updateStableReading(next, stableCandidateRef, stableSinceRef));
        });
      }, 180);
    }

    void start();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      setResult(null);
      stableCandidateRef.current = null;
      stableSinceRef.current = null;
      void stopLidarCalibration();
    };
  }, [enabled]);

  return useMemo(
    () => ({
      result,
      supported,
      locked: result !== null && result.reading.confidence >= MIN_CONFIDENCE,
      distanceLabel: result ? `${Math.round(result.distanceMeters * 100)} cm` : null,
    }),
    [result, supported],
  );
}

function updateStableReading(
  next: LidarCalibrationResult | null,
  candidateRef: MutableRefObject<LidarCalibrationResult | null>,
  stableSinceRef: MutableRefObject<number | null>,
): LidarCalibrationResult | null {
  if (!next || next.reading.confidence < MIN_CONFIDENCE) {
    candidateRef.current = null;
    stableSinceRef.current = null;
    return null;
  }

  const candidate = candidateRef.current;
  const now = Date.now();
  if (!candidate || !isStable(candidate, next)) {
    candidateRef.current = next;
    stableSinceRef.current = now;
    return null;
  }

  if (stableSinceRef.current !== null && now - stableSinceRef.current >= STABLE_MS) {
    candidateRef.current = next;
    return next;
  }

  candidateRef.current = next;
  return null;
}

function isStable(prev: LidarCalibrationResult, next: LidarCalibrationResult) {
  const distanceDelta = Math.abs(prev.distanceMeters - next.distanceMeters);
  const scaleDeltaRatio =
    Math.abs(prev.reading.pxPerMm - next.reading.pxPerMm) / Math.max(prev.reading.pxPerMm, 0.001);
  return distanceDelta <= MAX_DISTANCE_DELTA_M && scaleDeltaRatio <= MAX_SCALE_DELTA_RATIO;
}
