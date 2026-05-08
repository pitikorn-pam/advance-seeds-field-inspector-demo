import { test } from "node:test";
import assert from "node:assert/strict";

import { orientLiveSeeds, rotateLiveBox } from "./liveFrameGeometry.ts";

const seed = {
  index: 1,
  length_mm: 10,
  width_mm: 4,
  area_mm2: 40,
  grade: "A",
  defects: {},
  bbox: { x: 10, y: 20, width: 30, height: 40 },
};

test("rotateLiveBox maps right-oriented live boxes into upright image space", () => {
  assert.deepEqual(rotateLiveBox(seed.bbox, 100, 200, "right"), {
    x: 140,
    y: 10,
    width: 40,
    height: 30,
  });
});

test("orientLiveSeeds rotates and scales live boxes to analyzed image dimensions", () => {
  const [oriented] = orientLiveSeeds([seed], {
    frameWidth: 100,
    frameHeight: 200,
    imageWidth: 400,
    imageHeight: 200,
    orientation: "right",
  });

  assert.deepEqual(oriented.bbox, {
    x: 280,
    y: 20,
    width: 80,
    height: 60,
  });
  assert.equal(oriented.index, 1);
});

test("orientLiveSeeds leaves upright boxes unrotated and scales directly", () => {
  const [oriented] = orientLiveSeeds([seed], {
    frameWidth: 100,
    frameHeight: 200,
    imageWidth: 200,
    imageHeight: 400,
    orientation: "up",
  });

  assert.deepEqual(oriented.bbox, {
    x: 20,
    y: 40,
    width: 60,
    height: 80,
  });
});
