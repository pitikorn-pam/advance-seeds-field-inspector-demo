// Reads docs/handoff/design-tokens.json and emits three artifacts to dist/:
//   - tailwind.preset.cjs   ← Tailwind config consumed by both apps
//   - css-vars.css          ← runtime CSS custom properties (--as-*)
//   - tokens.ts             ← runtime TS export for non-CSS consumers (e.g. RN Animated values, inline styles)
//
// The color mapping (JSON token tree → Tailwind theme.colors shape) lives in
// ./mapping.ts so the naming choice stays in one place. Edit there, not here.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DesignTokensJson } from "./types.js";
import { mapColorsForTailwind } from "./mapping.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const tokensJsonPath = resolve(repoRoot, "docs/handoff/design-tokens.json");
const distDir = resolve(__dirname, "../dist");

const tokens = JSON.parse(readFileSync(tokensJsonPath, "utf8")) as DesignTokensJson;

mkdirSync(distDir, { recursive: true });

// ----- helpers -----------------------------------------------------------

const px = (n: number) => `${n}px`;
const ms = (n: number) => `${n}ms`;

const indent = (s: string, n = 2) =>
  s
    .split("\n")
    .map((l) => " ".repeat(n) + l)
    .join("\n");

const toJsLiteral = (v: unknown): string => JSON.stringify(v);

// ----- 1. tailwind.preset.cjs -------------------------------------------

const tailwindColors = mapColorsForTailwind(tokens.color);

const tailwindSpacing = Object.fromEntries(
  Object.entries(tokens.spacing).map(([k, v]) => [k, px(v.value)]),
);

const tailwindRadius = Object.fromEntries(
  Object.entries(tokens.radius).map(([k, v]) => [k, v.value === 9999 ? "9999px" : px(v.value)]),
);

const tailwindFontSize = Object.fromEntries(
  Object.entries(tokens.typography.scale).map(([k, v]) => [
    k,
    [px(v.size), { lineHeight: String(v.lineHeight), letterSpacing: v.letterSpacing }],
  ]),
);

const tailwindFontFamily = {
  sans: tokens.typography.fontFamily.sans.value.split(",").map((s) => s.trim()),
  mono: tokens.typography.fontFamily.mono.value.split(",").map((s) => s.trim()),
};

const tailwindTransitionDuration = Object.fromEntries(
  Object.entries(tokens.motion.duration).map(([k, v]) => [k, ms(v.value)]),
);

const tailwindTransitionTimingFunction = Object.fromEntries(
  Object.entries(tokens.motion.easing).map(([k, v]) => [k, v.value]),
);

const tailwindPreset = `// AUTO-GENERATED from docs/handoff/design-tokens.json — do not edit by hand.
// Run \`pnpm -F @advance-seeds/tokens build\` to regenerate.

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: ${toJsLiteral(tailwindColors)},
      spacing: ${toJsLiteral(tailwindSpacing)},
      borderRadius: ${toJsLiteral(tailwindRadius)},
      fontSize: ${toJsLiteral(tailwindFontSize)},
      fontFamily: ${toJsLiteral(tailwindFontFamily)},
      transitionDuration: ${toJsLiteral(tailwindTransitionDuration)},
      transitionTimingFunction: ${toJsLiteral(tailwindTransitionTimingFunction)},
    },
  },
};
`;

writeFileSync(resolve(distDir, "tailwind.preset.cjs"), tailwindPreset);

// ----- 2. css-vars.css --------------------------------------------------

const lightVars: string[] = [];
const darkVars: string[] = [];

const pushColor = (name: string, light: string, dark?: string) => {
  lightVars.push(`  --as-${name}: ${light};`);
  if (dark !== undefined) darkVars.push(`    --as-${name}: ${dark};`);
};

// brand
pushColor("brand", tokens.color.brand.primary.value, tokens.color.brand.primary.darkValue);
pushColor("brand-soft", tokens.color.brand.soft.value, tokens.color.brand.soft.darkValue);
pushColor("brand-deep", tokens.color.brand.deep.value, tokens.color.brand.deep.darkValue);
lightVars.push(`  --as-brand-on: #FFFFFF;`);
darkVars.push(`    --as-brand-on: #04342C;`);

// surfaces
for (const k of ["primary", "secondary", "tertiary"] as const) {
  pushColor(`bg-${k}`, tokens.color.background[k].value, tokens.color.background[k].darkValue);
}
for (const k of ["primary", "secondary", "tertiary"] as const) {
  pushColor(`text-${k}`, tokens.color.text[k].value, tokens.color.text[k].darkValue);
}
for (const k of ["primary", "secondary", "tertiary"] as const) {
  pushColor(`border-${k}`, tokens.color.border[k].value, tokens.color.border[k].darkValue);
}

// semantic — both bg and text; light only in JSON, dark values are pinned in source CSS,
// so we mirror them here as a deliberate runtime override matching docs/handoff/design-tokens.css.
const semanticDark = {
  success: { bg: "#173404", text: "#C0DD97" },
  warning: { bg: "#412402", text: "#FAC775" },
  danger: { bg: "#501313", text: "#F7C1C1" },
  info: { bg: "#042C53", text: "#B5D4F4" },
} as const;

for (const k of ["success", "warning", "danger", "info"] as const) {
  pushColor(`${k}-bg`, tokens.color.semantic[k].bg.value, semanticDark[k].bg);
  pushColor(`${k}-text`, tokens.color.semantic[k].text.value, semanticDark[k].text);
}

// variety thumbs
for (const [name, val] of Object.entries(tokens.color.variety)) {
  if (typeof val === "string") continue;
  lightVars.push(`  --as-${name}-bg: ${val.bg};`);
  lightVars.push(`  --as-${name}-text: ${val.text};`);
}

// glass — viewfinder chrome over live camera preview. No dark variant on
// purpose: the substrate is the camera image, not a theme surface, so a
// dark-mode shift would just darken an already-darkening overlay.
for (const [name, val] of Object.entries(tokens.color.glass)) {
  if (typeof val === "string") continue;
  lightVars.push(`  --as-glass-${name}: ${val.value};`);
}

// fonts — handoff CSS quotes family names with double quotes; JSON uses
// single quotes. Normalize so the parity test matches.
const normalizeFontFamily = (s: string) => s.replace(/'/g, '"');
lightVars.push(
  `  --as-font-sans: ${normalizeFontFamily(tokens.typography.fontFamily.sans.value)};`,
);
lightVars.push(
  `  --as-font-mono: ${normalizeFontFamily(tokens.typography.fontFamily.mono.value)};`,
);

// spacing
for (const [k, v] of Object.entries(tokens.spacing)) {
  lightVars.push(`  --as-space-${k}: ${px(v.value)};`);
}

// radii
for (const [k, v] of Object.entries(tokens.radius)) {
  lightVars.push(`  --as-radius-${k}: ${v.value === 9999 ? "9999px" : px(v.value)};`);
}

// motion
for (const [k, v] of Object.entries(tokens.motion.duration)) {
  lightVars.push(`  --as-duration-${k}: ${ms(v.value)};`);
}
// Handoff CSS uses short names (`decel`, not `decelerate`); the JSON is the
// value source but we keep the CSS-var names aligned with the handoff so that
// hand-written CSS in the prototype keeps working.
const easingAlias: Record<string, string> = {
  decelerate: "decel",
  accelerate: "accel",
};
for (const [k, v] of Object.entries(tokens.motion.easing)) {
  const alias = easingAlias[k] ?? k;
  lightVars.push(`  --as-easing-${alias}: ${v.value};`);
}

const cssOutput = `/* AUTO-GENERATED from docs/handoff/design-tokens.json — do not edit by hand. */
/* Run \`pnpm -F @advance-seeds/tokens build\` to regenerate. */

:root {
${lightVars.join("\n")}
}

[data-theme="dark"] {
${darkVars.join("\n")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${indent(darkVars.join("\n"), 2)}
  }
}
`;

writeFileSync(resolve(distDir, "css-vars.css"), cssOutput);

// ----- 3. tokens.ts (runtime TS) ----------------------------------------

// Flatten glass into a top-level constant so callers can write
// `glass.surface` instead of digging through `tokens.color.glass.surface.value`.
// Glass values are literal rgba/hex strings — no theme variant — which is the
// reason a flat shape is fine here (and matches how RN inline styles consume them).
const glassRuntime: Record<string, string> = {};
for (const [k, v] of Object.entries(tokens.color.glass)) {
  if (typeof v === "string") continue;
  glassRuntime[k] = v.value;
}

const tsOutput = `// AUTO-GENERATED from docs/handoff/design-tokens.json — do not edit by hand.
// Run \`pnpm -F @advance-seeds/tokens build\` to regenerate.

export const tokens = ${toJsLiteral(tokens)} as const;
export type Tokens = typeof tokens;

export const colors = ${toJsLiteral(tailwindColors)} as const;
export const spacing = ${toJsLiteral(tailwindSpacing)} as const;
export const radius = ${toJsLiteral(tailwindRadius)} as const;
export const glass = ${toJsLiteral(glassRuntime)} as const;
`;

writeFileSync(resolve(distDir, "tokens.ts"), tsOutput);
// Mirror as compiled JS + .d.ts so consumers using CJS-style import still work.
writeFileSync(resolve(distDir, "tokens.js"), tsOutput.replace(/ as const/g, ""));
writeFileSync(
  resolve(distDir, "tokens.d.ts"),
  `export declare const tokens: Record<string, unknown>;
export type Tokens = typeof tokens;
export declare const colors: Record<string, unknown>;
export declare const spacing: Record<string, string>;
export declare const radius: Record<string, string>;
export declare const glass: Record<string, string>;
`,
);

console.info(`[tokens] wrote tailwind.preset.cjs, css-vars.css, tokens.{ts,js,d.ts} to ${distDir}`);
