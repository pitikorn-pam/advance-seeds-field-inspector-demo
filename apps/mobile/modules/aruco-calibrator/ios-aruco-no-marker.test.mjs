import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(root, "ios/AdvanceSeedsArucoDetector.mm"),
  "utf8",
);

test("iOS single-shot ArUco returns zero-confidence sentinel when no marker is found", () => {
  assert.match(source, /zeroConfidenceDetection/);
  assert.match(source, /markerIds\.empty\(\)/);
  assert.doesNotMatch(source, /if \(markerIds\.empty\(\) \{\n\s*return nil;/);
});
