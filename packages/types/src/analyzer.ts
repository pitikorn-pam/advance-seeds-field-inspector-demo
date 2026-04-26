// SeedAnalyzer — the ML adapter seam (design.md D4).
//
// Demo ships MockSeedAnalyzer (apps/mobile/lib/analyzer/MockSeedAnalyzer.ts).
// Build phase swaps in TfliteSeedAnalyzer (react-native-fast-tflite, YOLOv11n .tflite)
// and optionally CoreMLSeedAnalyzer (custom Expo Module, .mlpackage on Apple Neural Engine).
// Screen layer never imports a concrete analyzer — only this interface and the
// useAnalyzer() hook backed by an AnalyzerProvider.

import type { BoundingBox, CalibrationSource, SeedDefects, SeedGrade } from "./domain.js";

/** Minimal handle to image data the analyzer should run on. */
export type ImageRef =
  | { kind: "uri"; uri: string }
  | { kind: "base64"; data: string; mimeType: string }
  | { kind: "asset"; assetId: string };

export interface AnalyzeOptions {
  /** Pixels per millimeter, from the active calibration profile. */
  pxPerMm: number;
  /** Non-blocking progress hook (0..1). */
  onProgress?: (progress: number) => void;
  /** Caller-supplied AbortSignal so screens can cancel long-running analysis. */
  signal?: AbortSignal;
}

/**
 * One seed in the analysis result. Measurements are already in millimeters
 * (the analyzer applies pxPerMm internally). Persistence layer can write these
 * straight into `seeds` rows without UI-side conversion.
 */
export interface AnalyzedSeed {
  index: number;
  length_mm: number;
  width_mm: number;
  area_mm2: number;
  grade: SeedGrade;
  defects: SeedDefects;
  bbox: BoundingBox;
}

export interface AnalysisSummary {
  total_seeds: number;
  mean_length_mm: number;
  mean_width_mm: number;
  mean_area_mm2: number;
}

export interface AnalysisResult {
  summary: AnalysisSummary;
  seeds: AnalyzedSeed[];
  /** ms elapsed from analyze() invocation to result. Useful for UX timing tests. */
  durationMs: number;
  /** Identifier of the analyzer impl that produced this result, for telemetry. */
  analyzerId: string;
}

/**
 * Library-agnostic frame descriptor. vision-camera's `Frame` (with its richer
 * shape — pixelFormat, planesCount, toArrayBuffer, etc.) structurally extends
 * this when the caller projects only the fields below. Keeping this minimal
 * means @advance-seeds/types stays free of react-native-vision-camera, which
 * matters because the dashboard depends on this same package.
 *
 * `timestampMs` is monotonic (e.g. performance.now-style) so consumers can
 * throttle by interval without pulling in clock libraries.
 */
export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly timestampMs: number;
  /** Counter-clockwise rotation in degrees needed to display upright. */
  readonly orientation?: 0 | 90 | 180 | 270;
}

/**
 * Per-frame inference result for live mode. Shape mirrors AnalysisResult but
 * carries `frameTimestampMs` so consumers can match results back to frames
 * (useful when the analyzer drops frames to keep up).
 */
export interface AnalysisFrameResult {
  seeds: AnalyzedSeed[];
  summary: AnalysisSummary;
  frameTimestampMs: number;
  analyzerId: string;
}

export interface SeedAnalyzer {
  /** Stable identifier (e.g. "mock", "tflite-yolo11n", "coreml-yolo11n"). */
  readonly id: string;
  /** Single-shot analysis on a captured photo. Used by precise mode. */
  analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult>;
  /**
   * Real-time per-frame inference. MUST be cheap (worklet thread budget is
   * ~16 ms). Implementations should throttle internally (e.g. skip if last
   * emit was < 200 ms ago) and may return null to drop a frame entirely.
   * Optional because precise-mode-only analyzers (e.g. server-side fallback)
   * don't need a live path.
   */
  analyzeFrame?(frame: Frame, options: AnalyzeOptions): AnalysisFrameResult | null;
}

// ---- Calibration -------------------------------------------------------
// LiveCalibrator is the runtime peer of SeedAnalyzer (design.md D3).
// Calibration is a separate concern from analysis: the analyzer consumes
// pxPerMm, doesn't compute it.

export interface CalibrationReading {
  pxPerMm: number;
  source: CalibrationSource | "manual";
  /** 0..1 — readings below 0.6 are unreliable; UI should fall back to manual. */
  confidence: number;
  observedAtMs: number;
}

export interface LiveCalibrator {
  readonly id: string;
  /** Synchronous per-frame observation. Returns null when no reading available. */
  observe(frame: Frame): CalibrationReading | null;
}
