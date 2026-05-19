import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const coremlSource = readFileSync(join(root, "CoreMLSeedAnalyzer.ts"), "utf8");
const tfliteSource = readFileSync(join(root, "TfliteSeedAnalyzer.ts"), "utf8");

test("post-capture CoreML analyzer resolves the active model for every analyze call", () => {
  assert.match(coremlSource, /const \{ outputKind, source \} = await loadSharedCoreMLModel\(\);/);
  assert.doesNotMatch(coremlSource, /private readonly source/);
  assert.doesNotMatch(coremlSource, /this\.source/);
  assert.doesNotMatch(coremlSource, /this\.outputKind/);
});

test("post-capture TFLite analyzer resolves the active model for every analyze call", () => {
  // We extract everything (model, output meta, delegate, modelRecord, and
  // — when present — the segmentation mask prototype tensor) per analyze
  // call, so a model swap between captures takes effect immediately. The
  // destructure has grown over time; what matters is that it's a fresh
  // `await loadSharedTfliteModel()` invocation, not a stored instance
  // field on the analyzer class.
  assert.match(tfliteSource, /=\s+await loadSharedTfliteModel\(\);/);
  assert.match(tfliteSource, /const \{[^}]*\bmodel\b[^}]*\}\s*=/);
  assert.match(tfliteSource, /const \{[^}]*\boutputKind\b[^}]*\}\s*=/);
  assert.doesNotMatch(tfliteSource, /private readonly model/);
  assert.doesNotMatch(tfliteSource, /this\.model/);
  assert.doesNotMatch(tfliteSource, /this\.outputKind/);
  assert.doesNotMatch(tfliteSource, /this\.modelRecord/);
});
