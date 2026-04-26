// Shape-conformance smoke test for the SeedAnalyzer interface.
// We can't import the TS interface from a node test directly, but we can
// pin the runtime contract by hand-rolling a minimal SeedAnalyzer here and
// asserting the shapes that screens depend on. The real MockSeedAnalyzer
// (apps/mobile) implements the same TS interface and is enforced at compile
// time by `pnpm typecheck`.

import { test } from "node:test";
import assert from "node:assert/strict";

function buildContractMock() {
  return {
    id: "contract-mock",
    async analyze() {
      return {
        analyzerId: "contract-mock",
        durationMs: 1,
        seeds: [],
        summary: {
          total_seeds: 0,
          mean_length_mm: 0,
          mean_width_mm: 0,
          mean_area_mm2: 0,
        },
      };
    },
    analyzeFrame(frame) {
      return {
        analyzerId: "contract-mock",
        frameTimestampMs: frame.timestampMs,
        seeds: [
          {
            index: 1,
            length_mm: 11.4,
            width_mm: 4.6,
            area_mm2: 42.3,
            grade: "A",
            defects: {},
            bbox: { x: 0, y: 0, width: 40, height: 28 },
          },
        ],
        summary: {
          total_seeds: 1,
          mean_length_mm: 11.4,
          mean_width_mm: 4.6,
          mean_area_mm2: 42.3,
        },
      };
    },
  };
}

test("AnalysisResult shape", async () => {
  const a = buildContractMock();
  const result = await a.analyze();
  assert.equal(result.analyzerId, "contract-mock");
  assert.ok(Array.isArray(result.seeds));
  assert.equal(typeof result.durationMs, "number");
  assert.equal(typeof result.summary.total_seeds, "number");
  assert.equal(typeof result.summary.mean_length_mm, "number");
  assert.equal(typeof result.summary.mean_width_mm, "number");
  assert.equal(typeof result.summary.mean_area_mm2, "number");
});

test("AnalysisFrameResult shape", () => {
  const a = buildContractMock();
  const frame = { width: 1920, height: 1080, timestampMs: 12345 };
  const result = a.analyzeFrame(frame);
  assert.ok(result, "analyzeFrame should return a result for the contract mock");
  assert.equal(result.frameTimestampMs, frame.timestampMs);
  assert.equal(result.analyzerId, "contract-mock");
  assert.equal(result.seeds.length, 1);
  const s = result.seeds[0];
  assert.equal(typeof s.index, "number");
  assert.equal(typeof s.length_mm, "number");
  assert.equal(typeof s.width_mm, "number");
  assert.equal(typeof s.area_mm2, "number");
  assert.ok(["A", "B", "C", "reject"].includes(s.grade));
  assert.equal(typeof s.bbox.x, "number");
  assert.equal(typeof s.bbox.y, "number");
  assert.equal(typeof s.bbox.width, "number");
  assert.equal(typeof s.bbox.height, "number");
});

test("analyzeFrame may return null (frame skipped)", () => {
  const skipper = {
    id: "skipper",
    async analyze() {
      return {
        analyzerId: "skipper",
        durationMs: 0,
        seeds: [],
        summary: { total_seeds: 0, mean_length_mm: 0, mean_width_mm: 0, mean_area_mm2: 0 },
      };
    },
    analyzeFrame() {
      return null;
    },
  };
  const result = skipper.analyzeFrame({ width: 1, height: 1, timestampMs: 0 });
  assert.equal(result, null);
});
