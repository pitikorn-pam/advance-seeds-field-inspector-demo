import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, "useLiveArucoCalibration.ts"), "utf8");

test("live ArUco calibration keeps Android ImageAnalysis below maxImages pressure", () => {
  assert.match(source, /const DETECTION_TARGET_FPS = 1;/);
  assert.match(source, /runAtTargetFps\(DETECTION_TARGET_FPS,/);
  assert.match(source, /runAsync\(frame,/);
  assert.doesNotMatch(source, /runAtTargetFps\(3,/);
});
