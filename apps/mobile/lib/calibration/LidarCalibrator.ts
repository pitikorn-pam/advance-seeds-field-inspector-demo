import type { CalibrationReading } from "@advance-seeds/types";
import { Platform } from "react-native";

const MIN_CONFIDENCE = 0.6;

export interface NativeLidarReading {
  pxPerMm: number;
  confidence: number;
  observedAtMs: number;
  distanceMeters: number;
  focalLengthPx: number;
  sampleCount: number;
}

interface NativeLidarCalibratorModule {
  isSupportedAsync(): Promise<boolean>;
  startAsync(): Promise<boolean>;
  stopAsync(): Promise<void>;
  getReadingAsync(): Promise<NativeLidarReading | null>;
}

let nativeModule: NativeLidarCalibratorModule | null | undefined;

function module(): NativeLidarCalibratorModule | null {
  if (nativeModule !== undefined) return nativeModule;
  if (Platform.OS !== "ios") {
    nativeModule = null;
    return nativeModule;
  }
  try {
    // LiDAR is an optional native capability. Older dev clients and Android
    // should keep using ArUco/manual calibration instead of crashing on import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require("@advance-seeds/lidar-calibrator") as NativeLidarCalibratorModule;
  } catch (err) {
    console.warn("[lidar] native reader unavailable", err);
    nativeModule = null;
  }
  return nativeModule;
}

export interface LidarCalibrationResult {
  reading: CalibrationReading;
  distanceMeters: number;
  focalLengthPx: number;
  sampleCount: number;
}

export async function isLidarCalibrationSupported(): Promise<boolean> {
  const reader = module();
  if (!reader) return false;
  try {
    return await reader.isSupportedAsync();
  } catch (err) {
    console.warn("[lidar] support check failed", err);
    return false;
  }
}

export async function startLidarCalibration(): Promise<boolean> {
  const reader = module();
  if (!reader) return false;
  try {
    return await reader.startAsync();
  } catch (err) {
    console.warn("[lidar] start failed", err);
    return false;
  }
}

export async function stopLidarCalibration(): Promise<void> {
  const reader = module();
  if (!reader) return;
  try {
    await reader.stopAsync();
  } catch (err) {
    console.warn("[lidar] stop failed", err);
  }
}

export async function getLidarCalibration(): Promise<LidarCalibrationResult | null> {
  const reader = module();
  if (!reader) return null;
  const result = await reader.getReadingAsync();
  return result ? readingFromNative(result) : null;
}

function readingFromNative(result: NativeLidarReading): LidarCalibrationResult | null {
  if (!result || result.confidence < MIN_CONFIDENCE || result.pxPerMm <= 0) return null;
  return {
    reading: {
      pxPerMm: result.pxPerMm,
      source: "lidar",
      confidence: result.confidence,
      observedAtMs: result.observedAtMs,
    },
    distanceMeters: result.distanceMeters,
    focalLengthPx: result.focalLengthPx,
    sampleCount: result.sampleCount,
  };
}
