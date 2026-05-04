import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const androidPlugin = join(
  root,
  "android/src/main/java/com/advanceseeds/coreml/AdvanceSeedsTfliteFrameProcessorPlugin.kt",
);

test("Android TFLite frame processor selects YOLO detection output by shape", () => {
  const source = readFileSync(androidPlugin, "utf8");

  assert.match(source, /selectDetectionOutputTensorIndex/);
  assert.match(source, /shape\[0\] == 1 && shape\[1\] == 300 && \(shape\[2\] == 6 \|\| shape\[2\] >= 38\)/);
  assert.doesNotMatch(source, /private val outputTensor = cpuInterpreter\.getOutputTensor\(0\)/);
  assert.match(source, /selectedOutputIndex/);
});
