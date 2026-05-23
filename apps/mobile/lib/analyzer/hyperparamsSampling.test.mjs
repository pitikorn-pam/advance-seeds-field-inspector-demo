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

test("iOS live detector uses targetFps directly and Android keeps the 5 fps cap", () => {
  assert.match(liveSource, /const targetFps = hp\.targetFps;/);
  assert.match(liveSource, /runAtTargetFps\(targetFps,\s*\(\) => \{/);
  assert.match(liveSource, /const requestedTargetFps = hp\.targetFps;/);
  assert.match(liveSource, /const targetFps = Math\.min\(requestedTargetFps, 5\);/);
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
