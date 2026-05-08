import type {
  AnalyzedSeed,
  GradeCriteriaGrade,
  GradeCriteriaRule,
  SeedGradingConfig,
  VarietyGradeCriteria,
} from "@advance-seeds/types";

const DEFAULT_TOLERANCE_MM = 0.05;
const GRADE_ORDER: GradeCriteriaGrade[] = ["A", "B", "C"];

export function gradeSeedByConfig(
  lengthMm: number,
  widthMm: number,
  config?: SeedGradingConfig | null,
): AnalyzedSeed["grade"] {
  const criteriaGrade = gradeFromCriteria(lengthMm, widthMm, config?.criteria);
  if (criteriaGrade !== null) return criteriaGrade;

  const targetLengthMm = config?.targetLengthMm ?? config?.fallbackTargetLengthMm;
  const targetWidthMm = config?.targetWidthMm ?? config?.fallbackTargetWidthMm;
  if (!config || (!positive(targetLengthMm) && !positive(targetWidthMm))) {
    return gradeSeedFallback(lengthMm, widthMm);
  }
  const tolerance = Math.max(0, config.toleranceMm ?? DEFAULT_TOLERANCE_MM);
  const checks = [
    dimensionState(lengthMm, targetLengthMm, tolerance),
    dimensionState(widthMm, targetWidthMm, tolerance),
  ].filter((state): state is "match" | "below" | "above" => state !== null);

  if (checks.some((state) => state === "above")) return "reject";
  if (checks.some((state) => state === "below")) return "C";
  return "A";
}

function gradeFromCriteria(
  lengthMm: number,
  widthMm: number,
  criteria: VarietyGradeCriteria | null | undefined,
): AnalyzedSeed["grade"] | null {
  if (!hasAnyCriteria(criteria)) return null;
  for (const grade of GRADE_ORDER) {
    const rule = criteria?.[grade];
    if (rule && matchesRule(lengthMm, widthMm, rule)) return grade;
  }
  return "reject";
}

function hasAnyCriteria(
  criteria: VarietyGradeCriteria | null | undefined,
): criteria is VarietyGradeCriteria {
  if (!criteria || typeof criteria !== "object") return false;
  return GRADE_ORDER.some((grade) => {
    const rule = criteria[grade];
    return Boolean(rule && (hasRange(rule.length_mm) || hasRange(rule.width_mm)));
  });
}

function matchesRule(lengthMm: number, widthMm: number, rule: GradeCriteriaRule): boolean {
  return matchesRange(lengthMm, rule.length_mm) && matchesRange(widthMm, rule.width_mm);
}

function hasRange(range: GradeCriteriaRule["length_mm"] | null | undefined): boolean {
  return positive(range?.min) || positive(range?.max);
}

function matchesRange(
  value: number,
  range: GradeCriteriaRule["length_mm"] | null | undefined,
): boolean {
  if (!range) return true;
  if (positive(range.min) && value < range.min) return false;
  if (positive(range.max) && value > range.max) return false;
  return true;
}

function dimensionState(
  value: number,
  target: number | null | undefined,
  tolerance: number,
): "match" | "below" | "above" | null {
  if (!positive(target)) return null;
  if (value < target - tolerance) return "below";
  if (value > target + tolerance) return "above";
  return "match";
}

function positive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function gradeSeedFallback(lengthMm: number, widthMm: number): AnalyzedSeed["grade"] {
  const aspect = lengthMm / Math.max(widthMm, 0.001);
  if (lengthMm < 1 || widthMm < 0.6) return "reject";
  if (aspect > 4.5 || aspect < 1.2) return "B";
  return "A";
}
