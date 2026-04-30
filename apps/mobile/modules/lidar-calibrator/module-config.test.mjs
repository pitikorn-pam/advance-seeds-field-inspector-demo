import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

test("LiDAR calibrator Expo module is registered for Apple only", () => {
  const config = JSON.parse(readFileSync(join(root, "expo-module.config.json"), "utf8"));

  assert.deepEqual(config.platforms, ["apple"]);
  assert.deepEqual(config.apple.modules, ["AdvanceSeedsLidarCalibratorModule"]);
  assert.equal(existsSync(join(root, "ios/AdvanceSeedsLidarCalibrator.podspec")), true);
  assert.equal(existsSync(join(root, "ios/AdvanceSeedsLidarCalibratorModule.swift")), true);
});
