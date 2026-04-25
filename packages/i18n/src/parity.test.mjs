// Parity test: every key in en/* must exist in th/*, and vice-versa.
// This catches partial translations early — a missing key in TH means the
// app falls back to EN at runtime, which the spec forbids ("complete UI
// translations for English and Thai covering every visible string").

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const enDir = resolve(__dirname, "en");
const thDir = resolve(__dirname, "th");

function loadJsonsFrom(dir) {
  const out = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const ns = file.replace(/\.json$/, "");
    out[ns] = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
  }
  return out;
}

function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

test("every namespace exists in both en and th", () => {
  const en = loadJsonsFrom(enDir);
  const th = loadJsonsFrom(thDir);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(th).sort());
});

test("every key in en has a matching key in th, recursively", () => {
  const en = loadJsonsFrom(enDir);
  const th = loadJsonsFrom(thDir);

  for (const ns of Object.keys(en)) {
    const enKeys = flattenKeys(en[ns]);
    const thKeys = flattenKeys(th[ns]);
    assert.deepEqual(
      thKeys,
      enKeys,
      `Namespace "${ns}" key mismatch.\nEN: ${enKeys.join(", ")}\nTH: ${thKeys.join(", ")}`,
    );
  }
});

test("no empty string values (would render blank in UI)", () => {
  const en = loadJsonsFrom(enDir);
  const th = loadJsonsFrom(thDir);

  for (const [locale, bundle] of [
    ["en", en],
    ["th", th],
  ]) {
    for (const [ns, tree] of Object.entries(bundle)) {
      const walk = (node, path) => {
        if (typeof node === "string") {
          assert.notEqual(node.trim(), "", `${locale}.${ns}.${path} is empty`);
        } else if (node && typeof node === "object") {
          for (const [k, v] of Object.entries(node)) {
            walk(v, path ? `${path}.${k}` : k);
          }
        }
      };
      walk(tree, "");
    }
  }
});
