import type {
  CalibrationProfile,
  CalibrationReading,
  Frame,
  LiveCalibrator,
} from "@advance-seeds/types";

/**
 * Manual calibration — returns the user's chosen calibration profile's
 * static `px_per_mm` on every observe() call, regardless of frame content.
 *
 * This is the pragmatic default when no automatic source (ArUco / LiDAR)
 * is available. The frame argument is ignored, but the class still
 * implements `LiveCalibrator` so screens can swap implementations
 * without branching when ArUco / LiDAR land.
 *
 * Confidence is hardcoded to 1 because the value comes from a profile
 * the user explicitly selected — there's no per-frame uncertainty to
 * account for. Compare with ArUco where confidence depends on marker
 * pose accuracy and lighting.
 */
export class ManualCalibrator implements LiveCalibrator {
  readonly id = "manual";

  constructor(private readonly profile: CalibrationProfile) {}

  observe(_frame: Frame): CalibrationReading {
    return {
      pxPerMm: this.profile.px_per_mm,
      source: "manual",
      confidence: 1,
      observedAtMs: Date.now(),
    };
  }
}
