// Demo-only analyzer. Returns one of two pre-baked AnalysisResult sets after
// a 2 ± 0.3s delay. Build phase replaces this with TfliteSeedAnalyzer and/or
// CoreMLSeedAnalyzer behind the same interface (see packages/types/analyzer.ts).

import type {
  AnalysisResult,
  AnalyzedSeed,
  ImageRef,
  AnalyzeOptions,
  SeedAnalyzer,
} from "@advance-seeds/types";

const MOCK_DELAY_MS = 2000;
const MOCK_JITTER_MS = 300;

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

function summarize(seeds: AnalyzedSeed[]) {
  const n = seeds.length;
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  return {
    total_seeds: n,
    mean_length_mm: +(sum(seeds.map((s) => s.length_mm)) / n).toFixed(3),
    mean_width_mm: +(sum(seeds.map((s) => s.width_mm)) / n).toFixed(3),
    mean_area_mm2: +(sum(seeds.map((s) => s.area_mm2)) / n).toFixed(3),
  };
}

export class MockSeedAnalyzer implements SeedAnalyzer {
  readonly id = "mock";

  // Toggles between the two pre-baked sample sets per call.
  private flip = 0;

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
}
