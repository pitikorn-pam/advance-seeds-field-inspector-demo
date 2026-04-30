import { useEffect, useMemo, useState } from "react";
import {
  getLidarCalibration,
  isLidarCalibrationSupported,
  startLidarCalibration,
  stopLidarCalibration,
} from "./LidarCalibrator";
import type { LidarCalibrationResult } from "./LidarCalibrator";

interface LiveLidarState {
  result: LidarCalibrationResult | null;
  supported: boolean | null;
  locked: boolean;
  distanceLabel: string | null;
}

const MIN_CONFIDENCE = 0.6;

export function useLiveLidarCalibration(enabled: boolean): LiveLidarState {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [result, setResult] = useState<LidarCalibrationResult | null>(null);

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
        setResult(null);
        return;
      }
      interval = setInterval(() => {
        void getLidarCalibration().then((next) => {
          if (!cancelled) setResult(next);
        });
      }, 180);
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
      locked: result !== null && result.reading.confidence >= MIN_CONFIDENCE,
      distanceLabel: result ? `${Math.round(result.distanceMeters * 100)} cm` : null,
    }),
    [result, supported],
  );
}
