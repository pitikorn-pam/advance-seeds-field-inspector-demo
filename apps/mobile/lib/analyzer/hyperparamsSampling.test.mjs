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

test("live inference defaults to sampled 15 fps and migrates the old 30 fps default", () => {
  assert.match(hyperparamsSource, /targetFps:\s*15/);
  assert.match(hyperparamsSource, /advance-seeds\.hyperparams\.v5/);
  assert.match(hyperparamsSource, /"advance-seeds\.hyperparams\.v4"/);
  assert.match(hyperparamsSource, /parsed\.targetFps === undefined \|\| parsed\.targetFps === 30/);
  assert.doesNotMatch(hyperparamsSource, /parsed\.targetFps >= 15/);
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

test("iOS live detector keeps the worklet enabled ref synchronized", () => {
  assert.match(
    liveSource,
    /function useLiveDetectionsCoreML[\s\S]*enabledRef\.current = enabled;[\s\S]*if \(!enabled\) setDetections\(null\);[\s\S]*\}, \[enabled\]\);/,
  );
});
