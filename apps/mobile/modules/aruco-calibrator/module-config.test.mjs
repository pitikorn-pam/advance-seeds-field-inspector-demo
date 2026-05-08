import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

test("ArUco calibrator Expo module is registered for Android", () => {
  const config = JSON.parse(readFileSync(join(root, "expo-module.config.json"), "utf8"));

  assert.deepEqual(config.platforms, ["apple", "android"]);
  assert.deepEqual(config.android.modules, [
    "com.advanceseeds.aruco.AdvanceSeedsArucoCalibratorModule",
  ]);
  assert.equal(existsSync(join(root, "android/build.gradle")), true);
  assert.equal(
    existsSync(
      join(
        root,
        "android/src/main/java/com/advanceseeds/aruco/AdvanceSeedsArucoCalibratorModule.kt",
      ),
    ),
    true,
  );
  assert.equal(
    existsSync(
      join(
        root,
        "android/src/main/java/com/advanceseeds/aruco/AdvanceSeedsArucoFrameProcessorPlugin.kt",
      ),
    ),
    true,
  );
});
