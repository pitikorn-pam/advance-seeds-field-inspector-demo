import assert from "node:assert/strict";
import test from "node:test";

import { gradeSeedByConfig } from "./grading.ts";

test("gradeSeedByConfig grades from configured A/B/C criteria first", () => {
  const criteria = {
    A: {
      length_mm: { min: 1, max: 1.2 },
      width_mm: { min: 0.8, max: 1 },
    },
    B: {
      length_mm: { min: 0.8, max: 0.99 },
      width_mm: { min: 0.6, max: 1 },
    },
    C: {
      length_mm: { min: 0.5, max: 0.79 },
      width_mm: { min: 0.4, max: 1 },
    },
  };
  assert.equal(gradeSeedByConfig(1.1, 0.9, { criteria, targetLengthMm: 2, targetWidthMm: 2 }), "A");
  assert.equal(gradeSeedByConfig(0.9, 0.9, { criteria, targetLengthMm: 2, targetWidthMm: 2 }), "B");
  assert.equal(gradeSeedByConfig(0.7, 0.7, { criteria, targetLengthMm: 2, targetWidthMm: 2 }), "C");
  assert.equal(
    gradeSeedByConfig(1.4, 0.9, { criteria, targetLengthMm: 2, targetWidthMm: 2 }),
    "reject",
  );
});

test("gradeSeedByConfig allows partial criteria dimensions", () => {
  assert.equal(
    gradeSeedByConfig(1.2, 0.3, {
      criteria: {
        A: {
          length_mm: { min: 1, max: null },
          width_mm: { min: null, max: null },
        },
      },
      targetLengthMm: null,
      targetWidthMm: null,
    }),
    "A",
  );
});

test("gradeSeedByConfig grades exact configured fallback length and width as A", () => {
  assert.equal(
    gradeSeedByConfig(1, 1, {
      targetLengthMm: 1,
      targetWidthMm: 1,
      toleranceMm: 0,
    }),
    "A",
  );
});

test("gradeSeedByConfig grades below fallback dimensions as C", () => {
  assert.equal(
    gradeSeedByConfig(0.9, 1, {
      targetLengthMm: 1,
      targetWidthMm: 1,
      toleranceMm: 0,
    }),
    "C",
  );
});

test("gradeSeedByConfig maps above fallback dimensions to reject", () => {
  assert.equal(
    gradeSeedByConfig(1.1, 1, {
      targetLengthMm: 1,
      targetWidthMm: 1,
      toleranceMm: 0,
    }),
    "reject",
  );
});

test("gradeSeedByConfig supports grade tiers beyond C (D, E, ...)", () => {
  // Variety defines A through D in letter order; analyzer must walk
  // GRADE_LETTERS not a hardcoded [A,B,C] array, so a D-matching seed
  // resolves to "D" instead of falling through to "reject".
  const criteria = {
    A: { length_mm: { min: 1.5, max: 2.0 }, width_mm: { min: 0, max: 10 } },
    B: { length_mm: { min: 1.2, max: 1.49 }, width_mm: { min: 0, max: 10 } },
    C: { length_mm: { min: 0.9, max: 1.19 }, width_mm: { min: 0, max: 10 } },
    D: { length_mm: { min: 0.5, max: 0.89 }, width_mm: { min: 0, max: 10 } },
  };
  assert.equal(gradeSeedByConfig(0.7, 1, { criteria }), "D");
  assert.equal(gradeSeedByConfig(1.0, 1, { criteria }), "C");
  assert.equal(gradeSeedByConfig(1.3, 1, { criteria }), "B");
  assert.equal(gradeSeedByConfig(1.7, 1, { criteria }), "A");
  // No tier matches → reject
  assert.equal(gradeSeedByConfig(0.3, 1, { criteria }), "reject");
});

test("gradeSeedByConfig keeps fallback grading without configured dimensions", () => {
  assert.equal(gradeSeedByConfig(3, 1, null), "A");
  assert.equal(gradeSeedByConfig(0.9, 0.5, null), "reject");
});

test("gradeSeedByConfig falls back when criteria object is empty", () => {
  assert.equal(
    gradeSeedByConfig(1, 1, {
      criteria: {},
      targetLengthMm: 1,
      targetWidthMm: 1,
      toleranceMm: 0,
    }),
    "A",
  );
});
