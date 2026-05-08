import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("base app does not bundle detector model artifacts", () => {
  assert.equal(existsSync(join(root, "assets/models/yolo11n-seeds.tflite")), false);
  assert.equal(existsSync(join(root, "modules/coreml-runner/ios/yolo26n.mlmodelc")), false);
  assert.doesNotMatch(read("metro.config.js"), /assetExts\.push\("tflite"\)/);
  assert.doesNotMatch(read("modules/coreml-runner/android/build.gradle"), /assets\/models/);
  assert.doesNotMatch(read("modules/coreml-runner/ios/AdvanceSeedsCoreMLRunner.podspec"), /\.mlmodelc/);
});

test("distributed Android APK builds only ship physical-device arm64 libraries", () => {
  assert.match(read("android/gradle.properties"), /reactNativeArchitectures=arm64-v8a/);
});
