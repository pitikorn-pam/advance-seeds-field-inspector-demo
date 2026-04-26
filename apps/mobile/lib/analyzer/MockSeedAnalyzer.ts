// Demo-only analyzer. Returns one of two pre-baked AnalysisResult sets after
// a 2 ± 0.3s delay. Build phase replaces this with TfliteSeedAnalyzer and/or
// CoreMLSeedAnalyzer behind the same interface (see packages/types/analyzer.ts).

import type {
  AnalysisFrameResult,
  AnalysisResult,
  AnalyzedSeed,
  AnalyzeOptions,
  Frame,
  ImageRef,
  SeedAnalyzer,
} from "@advance-seeds/types";

const MOCK_DELAY_MS = 2000;
const MOCK_JITTER_MS = 300;

/** Live mode emits a fresh result at most every FRAME_INTERVAL_MS. */
const FRAME_INTERVAL_MS = 200;

/**
 * Pre-baked count for live mode — matches the prototype's "47" KPI value
 * once we round to the nearest integer with a small wobble. Stays in
 * [LIVE_COUNT - 1, LIVE_COUNT + 1] across frames.
 */
const LIVE_COUNT = 47;

function buildSeeds(seed: number): AnalyzedSeed[] {
  // Deterministic-ish: derived from the seed input so the two pre-baked
  // result sets always look the same in the demo.
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const baseLen = seed === 1 ? 6.8 : 11.2;
  const baseWid = seed === 1 ? 2.0 : 8.6;
  const count = seed === 1 ? 18 : 14;
  const seeds: AnalyzedSeed[] = [];

  for (let i = 1; i <= count; i++) {
    const length_mm = +(baseLen * (0.85 + r() * 0.25)).toFixed(2);
    const width_mm = +(baseWid * (0.9 + r() * 0.2)).toFixed(2);
    const area_mm2 = +(length_mm * width_mm * 0.78).toFixed(2);
    const cracked = r() < 0.06;
    const discolored = r() < 0.04;
    const grade: AnalyzedSeed["grade"] =
      cracked && discolored
        ? "reject"
        : cracked
          ? "B"
          : discolored
            ? "C"
            : length_mm / baseLen > 0.92
              ? "A"
              : "B";

    seeds.push({
      index: i,
      length_mm,
      width_mm,
      area_mm2,
      grade,
      defects: { cracked, discolored },
      bbox: {
        x: Math.floor(80 + r() * 800),
        y: Math.floor(80 + r() * 560),
        width: Math.floor(20 + length_mm * 4),
        height: Math.floor(15 + width_mm * 4),
      },
    });
  }
  return seeds;
}

function summarize(seeds: AnalyzedSeed[]): AnalysisResult["summary"] {
  if (seeds.length === 0) {
    return { total_seeds: 0, mean_length_mm: 0, mean_width_mm: 0, mean_area_mm2: 0 };
  }
  const n = seeds.length;
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  return {
    total_seeds: n,
    mean_length_mm: +(sum(seeds.map((s) => s.length_mm)) / n).toFixed(3),
    mean_width_mm: +(sum(seeds.map((s) => s.width_mm)) / n).toFixed(3),
    mean_area_mm2: +(sum(seeds.map((s) => s.area_mm2)) / n).toFixed(3),
  };
}

/**
 * Build a live-mode frame's worth of synthetic seeds. The count, measurements,
 * and grade distribution stay near-constant frame-to-frame (otherwise the KPI
 * strip flickers wildly and looks broken), but bbox positions wobble on a
 * per-seed sine curve so detection rings *look* alive when overlaid.
 */
function buildLiveSeeds(frame: Frame): AnalyzedSeed[] {
  const tSec = frame.timestampMs / 1000;
  const out: AnalyzedSeed[] = [];
  // Hash the timestamp into a tiny count wobble so "47" oscillates 46–48.
  const countWobble = ((Math.floor(tSec * 0.7) % 3) + 3) % 3;
  const count = LIVE_COUNT - 1 + countWobble;

  for (let i = 1; i <= count; i++) {
    // Per-seed phase so each ring drifts independently.
    const phase = (i * 1.371) % (Math.PI * 2);
    const length_mm = +(11.4 + Math.sin(tSec + phase) * 0.3).toFixed(2);
    const width_mm = +(4.6 + Math.cos(tSec + phase) * 0.15).toFixed(2);
    const area_mm2 = +(length_mm * width_mm * 0.78).toFixed(2);
    const grade: AnalyzedSeed["grade"] = i % 7 === 0 ? "B" : i % 13 === 0 ? "C" : "A";

    // Distribute centroids across a 5-col grid that wobbles ±18 px each axis.
    const col = (i - 1) % 5;
    const row = Math.floor((i - 1) / 5);
    const cx = (col + 0.5) * (frame.width / 5);
    const cy = (row + 0.5) * (frame.height / Math.ceil(count / 5));
    const wobbleX = Math.sin(tSec * 1.4 + phase) * 18;
    const wobbleY = Math.cos(tSec * 1.1 + phase) * 14;
    const bw = 40;
    const bh = 28;

    out.push({
      index: i,
      length_mm,
      width_mm,
      area_mm2,
      grade,
      defects: {},
      bbox: {
        x: Math.round(cx + wobbleX - bw / 2),
        y: Math.round(cy + wobbleY - bh / 2),
        width: bw,
        height: bh,
      },
    });
  }
  return out;
}

export class MockSeedAnalyzer implements SeedAnalyzer {
  readonly id = "mock";

  // Toggles between the two pre-baked sample sets per call.
  private flip = 0;

  // Throttle gate for live mode (returns the result of the last emit and
  // skips work until FRAME_INTERVAL_MS has elapsed).
  private lastEmittedAt = 0;
  private lastFrameResult: AnalysisFrameResult | null = null;

  async analyze(_image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult> {
    const start = Date.now();
    const jitter = (Math.random() * 2 - 1) * MOCK_JITTER_MS;
    const total = MOCK_DELAY_MS + jitter;

    // Simulate progress for UX — 5 ticks across the wait.
    for (let i = 1; i <= 5; i++) {
      await new Promise<void>((resolve, reject) => {
        const handle = setTimeout(resolve, total / 5);
        options.signal?.addEventListener("abort", () => {
          clearTimeout(handle);
          reject(new Error("aborted"));
        });
      });
      options.onProgress?.(i / 5);
    }

    this.flip = this.flip === 0 ? 1 : 0;
    const seeds = buildSeeds(this.flip + 1);
    return {
      analyzerId: this.id,
      durationMs: Date.now() - start,
      seeds,
      summary: summarize(seeds),
    };
  }

  /**
   * Synchronous per-frame inference. Throttles internally — the worklet
   * thread can hand us frames at 30 fps without us doing real work each tick.
   * Returns null when inside the throttle window so consumers can cheaply
   * skip rendering.
   */
  analyzeFrame(frame: Frame, _options: AnalyzeOptions): AnalysisFrameResult | null {
    if (frame.timestampMs - this.lastEmittedAt < FRAME_INTERVAL_MS) {
      return null;
    }
    this.lastEmittedAt = frame.timestampMs;
    const seeds = buildLiveSeeds(frame);
    const result: AnalysisFrameResult = {
      analyzerId: this.id,
      frameTimestampMs: frame.timestampMs,
      seeds,
      summary: summarize(seeds),
    };
    this.lastFrameResult = result;
    return result;
  }

  /**
   * Best-effort accessor for the most recent frame result without producing
   * a new one. Useful for the KPI strip when it wants to render something
   * stable between throttle windows.
   */
  peekLastFrameResult(): AnalysisFrameResult | null {
    return this.lastFrameResult;
  }
}
