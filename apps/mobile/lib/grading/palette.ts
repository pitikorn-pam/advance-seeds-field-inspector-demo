import type { SeedGrade } from "@advance-seeds/types";

/**
 * Per-grade colour pair: a soft background tint + a darker ink for the
 * letter glyph / text. Used by `GradeChip`, the seed-thumb tile tint on
 * the inspection grid, and the SVG ring overlay on the seed-detail hero.
 *
 * Tailwind class names are also exported because some surfaces (the seed
 * thumb tile and the inspection-detail card) still prefer atomic classes
 * for layout consistency with the surrounding card system. A/B/C and
 * reject map to the design-tokens classes that already exist
 * (`bg-grade-a` etc.); D–H fall back to inline hex because they aren't
 * in the Tailwind preset.
 */
export interface GradePalette {
  bg: string;
  ink: string;
  bgClass: string | null;
  inkClass: string | null;
}

const REJECT: GradePalette = {
  bg: "#FBE0E2",
  ink: "#A02828",
  bgClass: "bg-grade-reject",
  inkClass: "text-grade-reject-ink",
};

// A–H. A/B/C are wired to existing design tokens so their Tailwind
// classes keep working; D–H are fresh tints chosen to stay readable
// next to the existing palette without colliding.
const LETTER_PALETTES: Record<Exclude<SeedGrade, "reject">, GradePalette> = {
  A: { bg: "#DEEDD7", ink: "#2D6E3F", bgClass: "bg-grade-a", inkClass: "text-grade-a-ink" },
  B: { bg: "#FAEFC8", ink: "#7A5A12", bgClass: "bg-grade-b", inkClass: "text-grade-b-ink" },
  C: { bg: "#FBEBD9", ink: "#B85518", bgClass: "bg-grade-c", inkClass: "text-grade-c-ink" },
  D: { bg: "#D8E5F2", ink: "#2B4A7D", bgClass: null, inkClass: null },
  E: { bg: "#E7DDF2", ink: "#5A3A7D", bgClass: null, inkClass: null },
  F: { bg: "#D5EDE6", ink: "#1E6B5C", bgClass: null, inkClass: null },
  G: { bg: "#F4DCEA", ink: "#7D2F58", bgClass: null, inkClass: null },
  H: { bg: "#DCDFEC", ink: "#3F4180", bgClass: null, inkClass: null },
};

export function gradePalette(grade: SeedGrade): GradePalette {
  if (grade === "reject") return REJECT;
  return LETTER_PALETTES[grade] ?? LETTER_PALETTES.A;
}

/**
 * Localized grade label. Letter grades render as `Grade {letter}` (the
 * i18n template `inspections:seedGradeLabel` does the formatting); reject
 * uses its own key. Falls back to the raw letter if i18n isn't wired in
 * for the caller.
 */
export function gradeLabel(
  grade: SeedGrade,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (grade === "reject") return t("inspections:seedGrade.reject");
  return t("inspections:seedGradeLabel", { letter: grade, defaultValue: `Grade ${grade}` });
}
