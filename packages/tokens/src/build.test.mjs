// Parity test: every CSS variable defined in docs/handoff/design-tokens.css
// must also appear in the generated dist/css-vars.css with the same value.
//
// This is the safety net for the token pipeline — a snapshot of the canonical
// handoff against the generated output. If a token name or value drifts, the
// test fails and forces a deliberate update on either side.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

const handoffCss = readFileSync(resolve(repoRoot, "docs/handoff/design-tokens.css"), "utf8");
const generatedCss = readFileSync(resolve(__dirname, "../dist/css-vars.css"), "utf8");

/** Pulls `--as-name: value;` declarations into a Map<name, value>. */
function parseVars(src) {
  const map = new Map();
  const pattern = /--as-([a-z0-9-]+):\s*([^;]+);/gi;
  for (const match of src.matchAll(pattern)) {
    const [, name, value] = match;
    // Keep the first occurrence per name (light values come before dark in both files).
    if (!map.has(name)) map.set(name, value.trim());
  }
  return map;
}

test("every handoff token is present in generated CSS with the same value", () => {
  const handoff = parseVars(handoffCss);
  const generated = parseVars(generatedCss);

  const missing = [];
  const drifted = [];

  for (const [name, value] of handoff) {
    if (!generated.has(name)) {
      missing.push(name);
      continue;
    }
    if (generated.get(name) !== value) {
      drifted.push({ name, handoff: value, generated: generated.get(name) });
    }
  }

  assert.deepEqual(missing, [], `Missing tokens in dist/css-vars.css: ${missing.join(", ")}`);
  assert.deepEqual(
    drifted,
    [],
    `Drifted token values:\n${drifted.map((d) => `  ${d.name}: handoff=${d.handoff} generated=${d.generated}`).join("\n")}`,
  );
});

test("dark theme block exists and uses the JSON darkValue for primary", () => {
  // Generated CSS uses [data-theme="dark"] for explicit override.
  assert.match(generatedCss, /\[data-theme="dark"\]\s*\{/);
  // The dark primary value from the JSON should appear inside the dark block.
  const darkBlock = generatedCss.split('[data-theme="dark"]')[1] ?? "";
  assert.match(darkBlock, /--as-brand:\s*#8F75FF/i);
});

test("tailwind preset references CSS vars (not hex) for brand", () => {
  const preset = readFileSync(resolve(__dirname, "../dist/tailwind.preset.cjs"), "utf8");
  assert.match(preset, /"DEFAULT":\s*"var\(--as-brand\)"/);
  // No hex colors should leak into the preset — values must indirect via CSS vars.
  const hexInPreset = preset.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
  assert.equal(
    hexInPreset.length,
    0,
    `Tailwind preset contains hex literals: ${hexInPreset.join(", ")}`,
  );
});
