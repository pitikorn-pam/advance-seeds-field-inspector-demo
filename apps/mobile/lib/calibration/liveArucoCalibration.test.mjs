import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, "useLiveArucoCalibration.ts"), "utf8");

test("live ArUco calibration samples fast enough for handheld lock", () => {
  assert.match(source, /const DETECTION_TARGET_FPS = 3;/);
  assert.match(source, /runAtTargetFps\(DETECTION_TARGET_FPS,/);
  assert.doesNotMatch(source, /runAtTargetFps\(1,/);
});
