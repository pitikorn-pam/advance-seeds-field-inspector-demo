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
  assert.match(
    tfliteSource,
    /const \{ model, outputKind, outputIndex, outputShape, delegate, modelRecord \} =\s+await loadSharedTfliteModel\(\);/,
  );
  assert.doesNotMatch(tfliteSource, /private readonly model/);
  assert.doesNotMatch(tfliteSource, /this\.model/);
  assert.doesNotMatch(tfliteSource, /this\.outputKind/);
  assert.doesNotMatch(tfliteSource, /this\.modelRecord/);
});
