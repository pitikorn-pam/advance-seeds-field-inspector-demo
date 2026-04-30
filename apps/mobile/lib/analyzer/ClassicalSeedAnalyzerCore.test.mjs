import assert from "node:assert/strict";
import test from "node:test";
import { analyzePixels, downsamplePixels } from "./ClassicalSeedAnalyzerCore.mjs";

function makePixels(width, height, rects) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 24;
    data[i * 4 + 1] = 24;
    data[i * 4 + 2] = 24;
    data[i * 4 + 3] = 255;
  }
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = rect.r ?? 210;
        data[idx + 1] = rect.g ?? 166;
        data[idx + 2] = rect.b ?? 74;
        data[idx + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

test("analyzePixels detects seed blobs and converts dimensions to millimeters", () => {
  const pixels = makePixels(120, 80, [
    { x: 10, y: 20, width: 30, height: 10 },
    { x: 70, y: 30, width: 20, height: 12 },
  ]);

  const result = analyzePixels(pixels, { pxPerMm: 10 });

  assert.equal(result.summary.total_seeds, 2);
  assert.equal(result.seeds[0].length_mm, 3);
  assert.equal(result.seeds[0].width_mm, 1);
  assert.equal(result.seeds[1].length_mm, 2);
  assert.equal(result.seeds[1].width_mm, 1.2);
  assert.equal(result.summary.mean_length_mm, 2.5);
  assert.equal(result.summary.mean_width_mm, 1.1);
});

test("analyzePixels ignores blobs outside the committed ROI", () => {
  const pixels = makePixels(100, 100, [
    { x: 10, y: 10, width: 18, height: 10 },
    { x: 70, y: 70, width: 18, height: 10 },
  ]);

  const result = analyzePixels(pixels, {
    pxPerMm: 9,
    roi: {
      kind: "rect",
      x: 0,
      y: 0,
      w: 0.5,
      h: 0.5,
    },
  });

  assert.equal(result.summary.total_seeds, 1);
  assert.deepEqual(result.seeds[0].bbox, { x: 10, y: 10, width: 18, height: 10 });
});

test("downsamplePixels caps analysis width and preserves calibration scale", () => {
  const pixels = makePixels(200, 100, [{ x: 40, y: 20, width: 60, height: 20 }]);

  const resized = downsamplePixels(pixels, { maxWidth: 100, pxPerMm: 10 });
  const result = analyzePixels(resized.pixels, { pxPerMm: resized.pxPerMm });

  assert.equal(resized.pixels.width, 100);
  assert.equal(resized.pixels.height, 50);
  assert.equal(resized.pxPerMm, 5);
  assert.equal(result.summary.total_seeds, 1);
  assert.equal(result.seeds[0].length_mm, 6);
  assert.equal(result.seeds[0].width_mm, 2);
});
