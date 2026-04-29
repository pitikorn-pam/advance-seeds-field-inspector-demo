import { useMemo } from "react";
import type { CalibrationReading } from "@advance-seeds/types";
import { useCalibrations } from "@/lib/queries";
import { useCaptureSession } from "@/lib/capture/session";
import { ManualCalibrator } from "./ManualCalibrator";

interface CalibratorState {
  reading: CalibrationReading | null;
  profileName: string | null;
  /** Human label like "28 cm" derived from px/mm + a known marker size.
   *  Null until LiDAR or ArUco supplies an actual distance reading. */
  distanceLabel: string | null;
}

/**
 * Returns the active calibration reading for the current capture session.
 *
 * Manual-only today: looks up the profile pointed to by
 * `session.calibrationId` and emits a synthetic reading at every render.
 * Future ArUco / LiDAR impls compose into this hook — they'd watch the
 * camera frame stream, return their own reading when a marker is
 * detected, and fall back to the manual reading otherwise.
 *
 * `distanceLabel` stays null in the manual path because we have no
 * depth signal — the prototype's "28 cm" comes from LiDAR. Precise
 * mode shows "— cm" when this is null.
 */
export function useCalibrator(): CalibratorState {
  const session = useCaptureSession();
  const { data } = useCalibrations();

  return useMemo(() => {
    const profile = data?.find((c) => c.id === session.calibrationId) ?? null;
    if (!profile) return { reading: null, profileName: null, distanceLabel: null };
    const calibrator = new ManualCalibrator(profile);
    return {
      reading: calibrator.observe({
        width: 1,
        height: 1,
        timestampMs: Date.now(),
      }),
      profileName: profile.name,
      distanceLabel: null,
    };
  }, [data, session.calibrationId]);
}
