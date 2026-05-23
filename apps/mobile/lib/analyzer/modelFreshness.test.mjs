import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const coremlSource = readFileSync(join(root, "CoreMLSeedAnalyzer.ts"), "utf8");
const tfliteSource = readFileSync(join(root, "TfliteSeedAnalyzer.ts"), "utf8");
const liveSource = readFileSync(join(root, "useLiveDetections.ts"), "utf8");
const providerSource = readFileSync(join(root, "AnalyzerProvider.tsx"), "utf8");
const modelStoreSource = readFileSync(join(root, "..", "models", "modelStore.ts"), "utf8");

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

test("live CoreML detection reloads when the active model store changes", () => {
  const coremlLiveSource = liveSource.split("function useLiveDetectionsCoreML")[1].split("// ---------------------------------------------------------------------\n// Android")[0];
  assert.match(modelStoreSource, /export function useModelStoreVersion\(\): number/);
  assert.match(modelStoreSource, /FileSystem\.writeAsStringAsync\(registryUri,[\s\S]*emitModelStoreChanged\(\);/);
  assert.match(coremlLiveSource, /const modelStoreVersion = useModelStoreVersion\(\);/);
  assert.match(coremlLiveSource, /\}, \[enabled, modelStoreVersion\]\);/);
});

test("live Android TFLite detection reloads when the active model store changes", () => {
  const androidLiveSource = liveSource.split("function useLiveDetectionsAndroidNative")[1];
  assert.match(androidLiveSource, /const modelStoreVersion = useModelStoreVersion\(\);/);
  assert.match(androidLiveSource, /\}, \[enabled, modelStoreVersion\]\);/);
});

test("analyzer provider reselects after model store changes and retries transient fallbacks", () => {
  assert.match(providerSource, /const modelStoreVersion = useModelStoreVersion\(\);/);
  assert.match(providerSource, /const FALLBACK_RETRY_DELAYS_MS = \[500, 1500, 3000\];/);
  assert.match(providerSource, /if \(FALLBACK_ANALYZER_IDS\.has\(picked\.id\)/);
  assert.match(providerSource, /\}, \[modelStoreVersion\]\);/);
});
