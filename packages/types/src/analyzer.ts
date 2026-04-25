// SeedAnalyzer — the ML adapter seam (design.md D4).
//
// Demo ships MockSeedAnalyzer (apps/mobile/lib/analyzer/MockSeedAnalyzer.ts).
// Build phase swaps in TfliteSeedAnalyzer (react-native-fast-tflite, YOLOv11n .tflite)
// and optionally CoreMLSeedAnalyzer (custom Expo Module, .mlpackage on Apple Neural Engine).
// Screen layer never imports a concrete analyzer — only this interface and the
// useAnalyzer() hook backed by an AnalyzerProvider.

import type { BoundingBox, SeedDefects, SeedGrade } from "./domain.js";

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

export interface SeedAnalyzer {
  /** Stable identifier (e.g. "mock", "tflite-yolo11n", "coreml-yolo11n"). */
  readonly id: string;
  analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult>;
}
