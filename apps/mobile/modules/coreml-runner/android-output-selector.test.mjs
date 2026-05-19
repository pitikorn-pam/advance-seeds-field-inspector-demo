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
  assert.match(
    source,
    /shape\[0\] == 1 && shape\[1\] == 300 && \(shape\[2\] == 6 \|\| shape\[2\] >= 38\)/,
  );
  assert.doesNotMatch(source, /private val outputTensor = cpuInterpreter\.getOutputTensor\(0\)/);
  assert.match(source, /selectedOutputIndex/);
});

test("Android TFLite frame processor compacts segmentation output before JS bridge", () => {
  const source = readFileSync(androidPlugin, "utf8");

  // Detection-only path (wantMask=false) still compacts seg rows to 6
  // fields. The full-row path activates only when the caller opts in via
  // wantMask=true on the throttled mask-extraction frames.
  assert.match(source, /private const val LIVE_OUTPUT_FIELDS = 6/);
  assert.match(source, /val bridgeOutputShape: IntArray/);
  assert.match(source, /bridgeCompactsSegmentationOutput/);
  assert.match(source, /detectionShape = activeRunner\.bridgeOutputShape\.toList\(\)/);
  assert.match(source, /detectionValues = activeRunner\.outputValues\(\)/);
  assert.match(source, /for \(field in 0 until LIVE_OUTPUT_FIELDS\)/);
});

test("Android TFLite frame processor surfaces mask prototype tensor when wantMask is set", () => {
  const source = readFileSync(androidPlugin, "utf8");

  assert.match(source, /selectPrototypeOutputTensorIndex/);
  assert.match(source, /prototypeOutputIndex/);
  assert.match(source, /val wantMask = \(params\?\.get\("wantMask"\) as\? Boolean\) == true/);
  assert.match(source, /result\["protoShape"\] = protoShape\.toList\(\)/);
  assert.match(source, /fun fullOutputValues\(\): List<Double>/);
  assert.match(source, /fun prototypeValues\(\): List<Double>\?/);
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

test("Android TFLite frame processor accepts opt-in morphology preprocessing", () => {
  const source = readFileSync(androidPlugin, "utf8");

  assert.match(source, /preprocessProfile/);
  assert.match(source, /"morph_fused_v1"/);
  assert.match(source, /fillInputMorphFusedFromYuv/);
  assert.match(source, /fillInputRawFromYuv/);
  assert.match(source, /preprocess=\$preprocessProfile/);
});

test("Android TFLite frame processor returns null instead of crashing release camera", () => {
  const source = readFileSync(androidPlugin, "utf8");

  assert.match(source, /catch \(t: Throwable\)/);
  assert.match(source, /Log\.w\(TAG, "live TFLite frame processing failed", t\)/);
  assert.match(source, /return null/);
});
