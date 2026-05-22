import { useEffect, useState } from "react";
import type { AnalysisFrameResult, Frame, SeedAnalyzer } from "@advance-seeds/types";
import { useAnalyzer } from "./AnalyzerProvider";

interface Options {
  /**
   * Synthetic frame width passed to analyzeFrame. Real vision-camera frames
   * carry their actual capture width — once Phase 4 wires the worklet, this
   * default falls away.
   */
  width?: number;
  height?: number;
  /** Target tick rate. Mock analyzer throttles internally, so 5 fps is fine. */
  fps?: number;
  /** Calibration value handed to the analyzer (mock ignores it). */
  pxPerMm?: number;
}

/**
 * JS-side stand-in for vision-camera's frame processor. Walks a setInterval
 * and synthesises a `Frame` shape on each tick, letting the mock analyzer
 * produce live `AnalysisFrameResult` values that components can render.
 *
 * Phase 4 replaces this with a real worklet-thread frame processor calling
 * the analyzer with vision-camera's native Frame. The hook's return shape
 * stays the same so scan-screen consumers don't need to change.
 */
export function useFrameTicker(active: boolean, options: Options = {}): AnalysisFrameResult | null {
  const analyzer: SeedAnalyzer = useAnalyzer();
  const [result, setResult] = useState<AnalysisFrameResult | null>(null);

  useEffect(() => {
    if (!active) {
      setResult(null);
      return;
    }
    const analyze = analyzer.analyzeFrame;
    if (!analyze) return;

    const width = options.width ?? 1920;
    const height = options.height ?? 1080;
    const fps = options.fps ?? 5;
    const pxPerMm = options.pxPerMm ?? 38.4;
    const intervalMs = Math.max(1, Math.round(1000 / fps));

    const handle = setInterval(() => {
      const frame: Frame = {
        width,
        height,
        timestampMs: Date.now(),
      };
      const next = analyze.call(analyzer, frame, { pxPerMm });
      if (next) setResult(next);
    }, intervalMs);

    return () => clearInterval(handle);
  }, [active, analyzer, options.width, options.height, options.fps, options.pxPerMm]);

  return result;
}
