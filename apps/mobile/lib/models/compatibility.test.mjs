import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, "compatibility.ts"), "utf8");

test("segmentation model class filters do not pass through COCO ids", () => {
  assert.doesNotMatch(source, /Tier 4/);
  assert.doesNotMatch(source, /mapped\.add\(id\)/);
  assert.match(source, /COCO_TO_MODEL_NAMES/);
});
