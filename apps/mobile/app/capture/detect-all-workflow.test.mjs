import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const appRoot = dirname(root);
const mobileRoot = dirname(appRoot);

test("setup defaults capture to ALL without requiring a variety", () => {
  const source = readFileSync(join(root, "setup.tsx"), "utf8");

  assert.match(source, /detectorFilterMode === "all"/);
  assert.match(source, /detectorFilterMode: "all", detectorClassNames: \[\]/);
  assert.doesNotMatch(source, /const canTapContinue = !!session\.varietyId/);
  assert.doesNotMatch(source, /invalid=\{!session\.varietyId\}/);
});

for (const file of ["scan.tsx", "precise.tsx"]) {
  test(`${file} uses the shared detector filter resolver for live inference`, () => {
    const source = readFileSync(join(root, file), "utf8");

    assert.match(source, /resolveDetectorFilter/);
    assert.match(source, /classFilter: detectorFilter\.classFilter/);
    assert.doesNotMatch(source, /DEFAULT_CAPTURE_CLASS_IDS/);
  });
}

test("processing uses the shared detector filter resolver for post-shutter analysis", () => {
  const source = readFileSync(join(root, "processing.tsx"), "utf8");

  assert.match(source, /resolveDetectorFilter/);
  assert.match(source, /classFilter: detectorFilter\.classFilter/);
  assert.doesNotMatch(source, /inferVarietyFromDetections/);
  assert.doesNotMatch(source, /DEFAULT_CAPTURE_CLASS_IDS/);
});

test("remote insert and offline replay preserve per-seed class fields", () => {
  const queries = readFileSync(join(mobileRoot, "lib", "queries.ts"), "utf8");
  const replay = readFileSync(join(mobileRoot, "lib", "sync", "replay.ts"), "utf8");

  assert.match(queries, /class_id: typeof s\.class_id === "number" \? s\.class_id : null/);
  assert.match(queries, /class_name: s\.class_name \?\? null/);
  assert.match(replay, /seeds: payload\.seeds/);
});
