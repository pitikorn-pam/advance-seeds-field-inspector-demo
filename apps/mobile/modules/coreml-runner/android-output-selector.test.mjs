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

test("Android TFLite frame processor compacts segmentation output before JS bridge", () => {
  const source = readFileSync(androidPlugin, "utf8");

  assert.match(source, /private const val LIVE_OUTPUT_FIELDS = 6/);
  assert.match(source, /val bridgeOutputShape: IntArray/);
  assert.match(source, /bridgeCompactsSegmentationOutput/);
  assert.match(source, /"shape" to activeRunner\.bridgeOutputShape\.toList\(\)/);
  assert.match(source, /for \(field in 0 until LIVE_OUTPUT_FIELDS\)/);
});

test("Android TFLite CPU runner uses four XNNPACK threads for live inference", () => {
  const source = readFileSync(androidPlugin, "utf8");

  assert.match(source, /private const val CPU_NUM_THREADS = 4/);
  assert.match(source, /setNumThreads\(CPU_NUM_THREADS\)/);
  assert.match(source, /setUseXNNPACK\(true\)/);
});

test("Android TFLite runner defers GPU delegate benchmark off the first frame", () => {
  const source = readFileSync(androidPlugin, "utf8");

  assert.doesNotMatch(source, /private val gpuDelegate/);
  assert.doesNotMatch(source, /private val gpuInterpreter/);
  assert.doesNotMatch(source, /if \(!benchmarked\) benchmarkDelegate\(\)/);
  assert.match(source, /startGpuBenchmarkAsync\(\)/);
  assert.match(source, /thread\(name = "AdvanceSeedsTfliteGpuBenchmark", isDaemon = true\)/);
  assert.match(source, /gpuMs < \(cpuMs \* GPU_WIN_MARGIN\)\.toLong\(\)/);
});
