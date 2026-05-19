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
import { createRequire } from "node:module";

import type { DesignTokensJson } from "./types.js";
import { mapColorsForTailwind } from "./mapping.js";

// Prettier is workspace-hoisted (public-hoist-pattern[]=*prettier* in .npmrc).
// We resolve it via createRequire so this stays a build-time dependency that
// the tokens package doesn't have to declare — and so CI's `pnpm install`
// (which triggers `prepare → pnpm build`) emits already-formatted CSS that
// passes `prettier --check`. Without this, every fresh install produces a
// raw-uppercase-hex global.css that fails the format gate.
const require = createRequire(import.meta.url);
const prettier = require("prettier") as typeof import("prettier");

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
pushColor("primary", tokens.color.brand.primary.value, tokens.color.brand.primary.darkValue);
pushColor(
  "primary-pressed",
  tokens.color.brand.primaryPressed?.value ?? tokens.color.brand.primary.value,
  tokens.color.brand.primaryPressed?.darkValue ?? tokens.color.brand.primary.darkValue,
);
pushColor(
  "primary-deep",
  tokens.color.brand.primaryDeep?.value ?? tokens.color.brand.deep.value,
  tokens.color.brand.primaryDeep?.darkValue ?? tokens.color.brand.deep.darkValue,
);
lightVars.push(`  --as-primary-on: #FFFFFF;`);
darkVars.push(`    --as-primary-on: #FFFFFF;`);
pushColor("brand", tokens.color.brand.primary.value, tokens.color.brand.primary.darkValue);
pushColor("brand-soft", tokens.color.brand.soft.value, tokens.color.brand.soft.darkValue);
pushColor("brand-deep", tokens.color.brand.deep.value, tokens.color.brand.deep.darkValue);
lightVars.push(`  --as-brand-on: #FFFFFF;`);
darkVars.push(`    --as-brand-on: #FFFFFF;`);

const optionalBrandColors = {
  "brand-navy": tokens.color.brand.navy,
  "brand-navy-deep": tokens.color.brand.navyDeep,
  "brand-navy-mid": tokens.color.brand.navyMid,
  "link-blue": tokens.color.brand.linkBlue,
  "link-blue-pressed": tokens.color.brand.linkBluePressed,
  "brand-green": tokens.color.brand.seedGreen,
  "brand-pink": tokens.color.brand.pink,
  "brand-orange": tokens.color.brand.orange,
  "brand-teal": tokens.color.brand.teal,
  "brand-yellow": tokens.color.brand.yellow,
  "brand-brown": tokens.color.brand.brown,
} as const;
for (const [name, token] of Object.entries(optionalBrandColors)) {
  if (!token) continue;
  pushColor(name, token.value, token.darkValue);
}

for (const [name, token] of Object.entries(tokens.color.cardTint ?? {})) {
  const cssName = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  pushColor(`card-${cssName}`, token.value, token.darkValue);
}

// surfaces
for (const k of ["primary", "secondary", "tertiary"] as const) {
  pushColor(`bg-${k}`, tokens.color.background[k].value, tokens.color.background[k].darkValue);
}
for (const k of ["primary", "secondary", "tertiary"] as const) {
  pushColor(`text-${k}`, tokens.color.text[k].value, tokens.color.text[k].darkValue);
}
if (tokens.color.text.onDark) {
  pushColor("text-on-dark", tokens.color.text.onDark.value, tokens.color.text.onDark.darkValue);
}
if (tokens.color.text.onDarkMuted) {
  pushColor(
    "text-on-dark-muted",
    tokens.color.text.onDarkMuted.value,
    tokens.color.text.onDarkMuted.darkValue,
  );
}
for (const k of ["primary", "secondary", "tertiary"] as const) {
  pushColor(`border-${k}`, tokens.color.border[k].value, tokens.color.border[k].darkValue);
}

for (const k of ["success", "warning", "danger", "info"] as const) {
  pushColor(`${k}-bg`, tokens.color.semantic[k].bg.value, tokens.color.semantic[k].bg.darkValue);
  pushColor(
    `${k}-text`,
    tokens.color.semantic[k].text.value,
    tokens.color.semantic[k].text.darkValue,
  );
}

// variety thumbs
for (const [name, val] of Object.entries(tokens.color.variety)) {
  if (typeof val === "string") continue;
  lightVars.push(`  --as-${name}-bg: ${val.bg};`);
  lightVars.push(`  --as-${name}-text: ${val.text};`);
}

// grade chips — flat literal pairs, same convention as variety. No dark
// variant: a graded seed's color must stay constant across themes (the chip
// reads like a label, not a surface).
for (const [name, val] of Object.entries(tokens.color.grade ?? {})) {
  if (typeof val === "string") continue;
  lightVars.push(`  --as-grade-${name}-bg: ${val.bg};`);
  lightVars.push(`  --as-grade-${name}-ink: ${val.ink};`);
}

// glass — viewfinder chrome over live camera preview. No dark variant on
// purpose: the substrate is the camera image, not a theme surface, so a
// dark-mode shift would just darken an already-darkening overlay.
for (const [name, val] of Object.entries(tokens.color.glass)) {
  if (typeof val === "string") continue;
  const cssName = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  lightVars.push(`  --as-glass-${cssName}: ${val.value};`);
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

// ----- 2b. apps/mobile/global.css ---------------------------------------
//
// NativeWind reads CSS variables from the mobile app's own entry stylesheet
// (it does NOT auto-pick up packages/tokens/dist/css-vars.css). Write the
// same vars there too, in NativeWind's expected shape: wrapped in
// `@layer base` and using the `.dark` class selector (instead of the web
// dashboard's `[data-theme="dark"]`). Without this step, NativeWind bakes
// stale hex values into the JS bundle at transform time and a token edit
// only shows up after a hand-paste — exactly the bug that took out the
// first device build on the Field Inspector redesign.
const mobileGlobalCssPath = resolve(repoRoot, "apps/mobile/global.css");
const mobileGlobalCssRaw = `@tailwind base;
@tailwind components;
@tailwind utilities;

/*
  Tokens preset emits Tailwind utilities that resolve to var(--as-*).
  Browsers handle CSS variables natively; NativeWind 4 needs them defined
  in this file to translate them at bundle time. AUTO-GENERATED from
  docs/handoff/design-tokens.json — do not edit by hand.
  Run \`pnpm -F @advance-seeds/tokens build\` to regenerate.
*/
@layer base {
  :root {
${lightVars.join("\n")}
  }

  :root.dark,
  .dark:root,
  .dark {
${darkVars.join("\n")}
  }
}
`;
// Pipe through prettier so CI's `pnpm install` (which runs `prepare`) emits
// a file that already passes `prettier --check .`. Resolves the workspace's
// .prettierrc.json automatically because the target path is inside the repo.
const mobileGlobalCss = await prettier.format(mobileGlobalCssRaw, {
  ...(await prettier.resolveConfig(mobileGlobalCssPath)),
  parser: "css",
  filepath: mobileGlobalCssPath,
});
writeFileSync(mobileGlobalCssPath, mobileGlobalCss);

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
