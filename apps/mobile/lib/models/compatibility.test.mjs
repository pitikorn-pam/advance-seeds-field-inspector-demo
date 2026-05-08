import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, "compatibility.ts"), "utf8");
const analyzerRoot = join(root, "..", "analyzer");
const liveSource = readFileSync(join(analyzerRoot, "useLiveDetections.ts"), "utf8");

test("segmentation model class filters do not pass through COCO ids", () => {
  assert.doesNotMatch(source, /Tier 4/);
  assert.doesNotMatch(source, /mapped\.add\(id\)/);
  assert.match(source, /COCO_TO_MODEL_NAMES/);
});

test("iOS live detection waits for a verified active model path", () => {
  assert.match(liveSource, /if \(!modelPath\) return;/);
  assert.match(
    liveSource,
    /frameProcessor: enabled && plugin && modelReady \? frameProcessor : undefined/,
  );
  assert.doesNotMatch(
    liveSource,
    /void readActiveModel\(\)\.then\(\(rec\) => \{\s*if \(!cancelled\) setActiveModel\(rec\);/,
  );
});

test("YOLO26 segmentation compatibility accepts non-nano variants", () => {
  assert.doesNotMatch(source, /yolo26\[ns\]-seg/);
  assert.match(source, /\^yolo26\[a-z0-9\]\+-seg\$/);
  assert.match(source, /yolo26m-seg/);
});
