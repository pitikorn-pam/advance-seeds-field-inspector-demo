// Seed-grading thresholds — used by the inspections seed script to assign
// realistic grades to generated per-seed measurements. The real ML model in
// the build phase will replace this with classifier output, but until then
// these thresholds give the demo data a believable distribution.
//
// Heuristic (per agronomist guidance):
//   A      = ≥ 90% of variety baseline length AND no defects
//   B      = 75–90% of baseline OR minor cracking
//   C      = 60–75% of baseline OR discoloration
//   reject = < 60% of baseline OR cracked + discolored
//
// Baselines below are millimeters at the long axis. Numbers chosen to look
// plausible for the seven varieties in seed.sql.

import type { SeedDefects, SeedGrade } from "@advance-seeds/types";

interface VarietyBaseline {
  length_mm: number;
  width_mm: number;
}

export const varietyBaselines: Record<string, VarietyBaseline> = {
  "Rice — Hom Mali": { length_mm: 7.4, width_mm: 2.0 },
  "Rice — Riceberry": { length_mm: 6.8, width_mm: 2.0 },
  "Corn — Sweet Hybrid": { length_mm: 11.2, width_mm: 8.6 },
  "Soybean — Chiang Mai 60": { length_mm: 7.2, width_mm: 5.8 },
  "Mung bean — KU#2": { length_mm: 4.6, width_mm: 3.4 },
  "Sunflower — Pacific 88": { length_mm: 12.5, width_mm: 6.2 },
};

export function gradeSeed(args: {
  varietyName: string;
  length_mm: number;
  defects: SeedDefects;
}): SeedGrade {
  const baseline = varietyBaselines[args.varietyName];
  if (!baseline) {
    // Unknown variety — be generous, give B unless defects say otherwise.
    return args.defects.cracked && args.defects.discolored ? "reject" : "B";
  }

  const ratio = args.length_mm / baseline.length_mm;
  const cracked = !!args.defects.cracked;
  const discolored = !!args.defects.discolored;

  if (cracked && discolored) return "reject";
  if (ratio < 0.6) return "reject";
  if (ratio < 0.75 || discolored) return "C";
  if (ratio < 0.9 || cracked) return "B";
  return "A";
}
