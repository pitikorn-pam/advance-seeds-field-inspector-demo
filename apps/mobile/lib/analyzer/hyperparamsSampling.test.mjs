import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const hyperparamsSource = readFileSync(join(root, "hyperparams.ts"), "utf8");
const liveSource = readFileSync(join(root, "useLiveDetections.ts"), "utf8");
const i18nSource = readFileSync(
  join(root, "..", "..", "..", "..", "packages", "i18n", "src", "en", "more.json"),
  "utf8",
);

test("live inference defaults to requested 30 fps and migrates the old 15 fps default", () => {
  assert.match(hyperparamsSource, /targetFps:\s*30/);
  assert.match(hyperparamsSource, /advance-seeds\.hyperparams\.v9/);
  assert.match(hyperparamsSource, /"advance-seeds\.hyperparams\.v8"/);
  assert.match(hyperparamsSource, /parsed\.targetFps === undefined \|\| parsed\.targetFps === 15/);
  assert.doesNotMatch(hyperparamsSource, /parsed\.targetFps === 30\)/);
});

test("live inference fps copy describes model sampling rather than preview fps", () => {
  assert.match(i18nSource, /"targetFps": "Inference fps"/);
  assert.match(i18nSource, /Model sampling rate for live detection/);
  assert.match(i18nSource, /camera preview keeps its native smoothness/);
});

test("live detectors keep requested fps configurable but cap native inference at 5 fps", () => {
  assert.match(liveSource, /const requestedTargetFps = hp\.targetFps;/);
  assert.match(liveSource, /const targetFps = Math\.min\(requestedTargetFps, 5\);/);
  assert.match(liveSource, /runAtTargetFps\(targetFps,\s*\(\) => \{/);
});

test("live detectors log requested and effective inference fps for QA", () => {
  assert.match(liveSource, /\[live-detections coreml\] inferenceFps requested=%d effective=%d/);
  assert.match(liveSource, /\[live-detections tflite\] inferenceFps requested=%d effective=%d/);
});

test("Android live detector does not call orientation normalizer inside the worklet", () => {
  const androidSource = liveSource.split("// Android — native TFLite frame-processor plugin")[1];
  assert.ok(androidSource);
  const androidWorklet = androidSource.match(
    /const frameProcessor = useFrameProcessor\([\s\S]*?console\.warn\("\[live-detections tflite-native\] frame processing failed"/,
  )?.[0];
  assert.ok(androidWorklet);
  assert.doesNotMatch(androidWorklet, /normalizeFrameOrientation/);
});

test("iOS live detector keeps the worklet enabled ref synchronized", () => {
  assert.match(
    liveSource,
    /function useLiveDetectionsCoreML[\s\S]*enabledRef\.current = enabled;[\s\S]*if \(!enabled\) \{[\s\S]*setDetections\(null\);[\s\S]*detectionsShared\.value = null;[\s\S]*\}, \[enabled, detectionsShared\]\);/,
  );
});

test("iOS live detector requests native mask polygons every sampled frame and stabilizes masks", () => {
  const iosSource = liveSource
    .split("function useLiveDetectionsCoreML")[1]
    .split(
      "// ---------------------------------------------------------------------\n// Android",
    )[0];
  assert.match(iosSource, /const warmupFrameCounter = useSharedValue\(0\);/);
  assert.match(iosSource, /const MASK_WARMUP_FRAMES = 0;/);
  assert.match(iosSource, /const MASK_THROTTLE = 1;/);
  assert.match(iosSource, /warmupCounter > MASK_WARMUP_FRAMES && counter % MASK_THROTTLE === 0/s);
  assert.doesNotMatch(iosSource, /maxPolygons:/);
  assert.doesNotMatch(iosSource, /lastCoreMLPolygonsByRowRef/);
  assert.match(
    iosSource,
    /const lastCoreMLMaskSeedsRef = useRef<AnalysisFrameResult\["seeds"\] \| null>\(null\);/,
  );
  assert.match(iosSource, /const lastCoreMLMaskHoldFramesRef = useRef\(0\);/);
  assert.match(
    iosSource,
    /stabilizeMaskedLiveSeeds\([\s\S]*seeds,[\s\S]*lastCoreMLMaskSeedsRef\.current,[\s\S]*lastCoreMLMaskHoldFramesRef,/,
  );
  assert.match(iosSource, /lastCoreMLMaskSeedsRef\.current = maskedDisplaySeeds;/);
  assert.match(iosSource, /lastCoreMLMaskSeedsRef\.current = null;/);
});
