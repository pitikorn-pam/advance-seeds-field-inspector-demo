import type { CalibrationReading } from "@advance-seeds/types";
import type { Frame } from "react-native-vision-camera";
import { VisionCameraProxy } from "react-native-vision-camera";

const MARKER_SIZE_MM = 50;
const MIN_CONFIDENCE = 0.6;

interface NativeArucoDetection {
  pxPerMm: number;
  markerId: number;
  confidence: number;
  observedAtMs: number;
  markerSizeMm: number;
  pixelWidth: number;
}

interface NativeArucoCalibratorModule {
  detectInImageAsync(uri: string, markerSizeMm: number): Promise<NativeArucoDetection | null>;
}

let nativeModule: NativeArucoCalibratorModule | null | undefined;
const frameProcessorPlugin = (() => {
  try {
    return VisionCameraProxy.initFrameProcessorPlugin("detectArucoCalibration", {}) ?? null;
  } catch (err) {
    console.warn("[aruco] frame processor unavailable", err);
    return null;
  }
})();

function module(): NativeArucoCalibratorModule | null {
  if (nativeModule !== undefined) return nativeModule;
  try {
    // Native dependency is optional at JS runtime so older dev clients keep
    // falling back to manual calibration instead of crashing on require().
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require("@advance-seeds/aruco-calibrator") as NativeArucoCalibratorModule;
  } catch (err) {
    console.warn("[aruco] native detector unavailable", err);
    nativeModule = null;
  }
  return nativeModule;
}

export interface ArucoCalibrationResult {
  reading: CalibrationReading;
  markerId: number;
  markerSizeMm: number;
  pixelWidth: number;
}

function readingFromNative(result: NativeArucoDetection): ArucoCalibrationResult | null {
  "worklet";
  if (!result || result.confidence < MIN_CONFIDENCE || result.pxPerMm <= 0) return null;
  return {
    reading: {
      pxPerMm: result.pxPerMm,
      source: "aruco",
      confidence: result.confidence,
      observedAtMs: result.observedAtMs,
    },
    markerId: result.markerId,
    markerSizeMm: result.markerSizeMm,
    pixelWidth: result.pixelWidth,
  };
}

export async function detectArucoCalibration(uri: string): Promise<ArucoCalibrationResult | null> {
  const detector = module();
  if (!detector) return null;
  const result = await detector.detectInImageAsync(uri, MARKER_SIZE_MM);
  return result ? readingFromNative(result) : null;
}

export function detectArucoCalibrationInFrame(frame: Frame): ArucoCalibrationResult | null {
  "worklet";
  if (!frameProcessorPlugin) return null;
  const result = frameProcessorPlugin.call(frame, { markerSizeMm: MARKER_SIZE_MM }) as
    | NativeArucoDetection
    | null
    | undefined;
  return result ? readingFromNative(result) : null;
}
