// COLOR MAPPING — JSON tokens → Tailwind theme.colors shape.
//
// Decisions (defaults chosen for the demo):
//   Q1 brand DEFAULT     → A: nested with DEFAULT, so `bg-brand` + `bg-brand-soft` both work
//   Q2 semantic naming   → A: paired bg/text under each semantic name (`bg-success-bg`)
//   Q3 variety colors    → include in palette (`bg-rice-bg`, `text-rice-text`, etc.)
//
// All values reference CSS variables so the theme toggle flips at runtime
// without a rebuild. Hex values live in css-vars.css.

import type { DesignTokensJson } from "./types.js";

export function mapColorsForTailwind(
  color: DesignTokensJson["color"],
): Record<string, string | Record<string, string>> {
  return {
    // Brand — DEFAULT enables `bg-brand` shorthand
    brand: {
      DEFAULT: "var(--as-brand)",
      soft: "var(--as-brand-soft)",
      deep: "var(--as-brand-deep)",
      on: "var(--as-brand-on)",
    },

    // Surfaces, text, borders — three-stop ramps mirroring the JSON
    bg: {
      primary: "var(--as-bg-primary)",
      secondary: "var(--as-bg-secondary)",
      tertiary: "var(--as-bg-tertiary)",
    },
    fg: {
      primary: "var(--as-text-primary)",
      secondary: "var(--as-text-secondary)",
      tertiary: "var(--as-text-tertiary)",
    },
    line: {
      primary: "var(--as-border-primary)",
      secondary: "var(--as-border-secondary)",
      tertiary: "var(--as-border-tertiary)",
    },

    // Semantic — paired bg/text so the bg/text axis stays visible in class names
    success: { bg: "var(--as-success-bg)", text: "var(--as-success-text)" },
    warning: { bg: "var(--as-warning-bg)", text: "var(--as-warning-text)" },
    danger: { bg: "var(--as-danger-bg)", text: "var(--as-danger-text)" },
    info: { bg: "var(--as-info-bg)", text: "var(--as-info-text)" },

    // Variety thumbs — generated from JSON so adding a variety adds a class
    ...Object.fromEntries(
      Object.entries(color.variety)
        .filter(([, v]) => typeof v !== "string")
        .map(([name]) => [name, { bg: `var(--as-${name}-bg)`, text: `var(--as-${name}-text)` }]),
    ),

    // Glass — viewfinder chrome over the live camera preview. Single flat
    // group (no light/dark) so `bg-glass-surface` resolves to the same alpha
    // black on both themes.
    glass: Object.fromEntries(
      Object.entries(color.glass)
        .filter(([, v]) => typeof v !== "string")
        .map(([name]) => [name, `var(--as-glass-${name})`]),
    ) as Record<string, string>,
  };
}
