export interface NativeLidarReading {
  pxPerMm: number;
  confidence: number;
  observedAtMs: number;
  distanceMeters: number;
  focalLengthPx: number;
  sampleCount: number;
}

export interface AdvanceSeedsLidarCalibratorModule {
  isSupportedAsync(): Promise<boolean>;
  startAsync(): Promise<boolean>;
  stopAsync(): Promise<void>;
  getReadingAsync(): Promise<NativeLidarReading | null>;
}

declare const module: AdvanceSeedsLidarCalibratorModule;
export default module;
