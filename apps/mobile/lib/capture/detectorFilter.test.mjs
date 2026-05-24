import test from "node:test";
import assert from "node:assert/strict";

import { buildClassBreakdown, resolveDetectorFilter } from "./detectorFilter.ts";

test("resolveDetectorFilter maps ALL to no analyzer class filter", () => {
  const resolved = resolveDetectorFilter({ mode: "all", classNames: [] }, ["banana", "watermelon"]);

  assert.equal(resolved.mode, "all");
  assert.equal(resolved.classFilter, null);
  assert.deepEqual(resolved.classNames, []);
  assert.deepEqual(resolved.classIds, []);
});

test("resolveDetectorFilter maps selected model class names to indexes and aliases", () => {
  const resolved = resolveDetectorFilter({ mode: "classes", classNames: ["watermelon"] }, [
    "banana",
    "watermelon",
  ]);

  assert.equal(resolved.mode, "classes");
  assert.deepEqual(resolved.classFilter, [1]);
  assert.deepEqual(resolved.classIds, [1]);
  assert.deepEqual(resolved.modelClassAliases, ["watermelon"]);
});

test("buildClassBreakdown counts persisted and resolved class labels", () => {
  const rows = buildClassBreakdown(
    [
      { class_id: 0, class_name: "banana" },
      { class_id: 0, class_name: "banana" },
      { class_id: 1 },
      {},
    ],
    ["banana", "watermelon"],
  );

  assert.deepEqual(rows, [
    { class_id: 0, class_name: "banana", count: 2 },
    { class_id: null, class_name: "unknown", count: 1 },
    { class_id: 1, class_name: "watermelon", count: 1 },
  ]);
});
