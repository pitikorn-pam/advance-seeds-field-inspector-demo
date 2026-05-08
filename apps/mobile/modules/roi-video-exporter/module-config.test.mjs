import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL(".", import.meta.url).pathname;

test("ROI video exporter Expo module is registered for Apple and Android", () => {
  const config = JSON.parse(readFileSync(join(root, "expo-module.config.json"), "utf8"));

  assert.deepEqual(config.platforms, ["apple", "android"]);
  assert.deepEqual(config.apple.modules, ["AdvanceSeedsRoiVideoExporterModule"]);
  assert.deepEqual(config.android.modules, [
    "com.advanceseeds.roivideo.AdvanceSeedsRoiVideoExporterModule",
  ]);
  assert.equal(existsSync(join(root, "ios/AdvanceSeedsRoiVideoExporterModule.swift")), true);
  assert.equal(
    existsSync(
      join(
        root,
        "android/src/main/java/com/advanceseeds/roivideo/AdvanceSeedsRoiVideoExporterModule.kt",
      ),
    ),
    true,
  );
});
