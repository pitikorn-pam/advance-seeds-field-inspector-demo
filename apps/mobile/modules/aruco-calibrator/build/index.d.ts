export interface ArucoDetectionResult {
  pxPerMm: number;
  markerId: number;
  confidence: number;
  observedAtMs: number;
  markerSizeMm: number;
  pixelWidth: number;
}

declare const AdvanceSeedsArucoCalibrator: {
  detectInImageAsync(uri: string, markerSizeMm: number): Promise<ArucoDetectionResult | null>;
};

export = AdvanceSeedsArucoCalibrator;
