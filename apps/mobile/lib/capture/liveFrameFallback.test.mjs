import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeFrameOrientation } from "./frameOrientation.ts";
import {
  graftLiveMasksOntoAnalysisSeeds,
  orientLiveSeeds,
  rotateLiveBox,
  rotateLivePoint,
} from "./liveFrameGeometry.ts";

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

test("normalizes Android VisionCamera landscape orientation aliases", () => {
  assert.equal(normalizeFrameOrientation("landscape-right"), "right");
  assert.equal(normalizeFrameOrientation("landscape-left"), "left");
  assert.equal(normalizeFrameOrientation("portrait-upside-down"), "down");
});

test("rotateLiveBox accepts Android landscape orientation aliases", () => {
  assert.deepEqual(rotateLiveBox(seed.bbox, 100, 200, "landscape-right"), {
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

test("orientLiveSeeds rotates and scales live mask polygons with the bbox", () => {
  const polygonSeed = {
    ...seed,
    mask: {
      polygon: [
        { x: 10, y: 20 },
        { x: 40, y: 20 },
        { x: 40, y: 60 },
      ],
      area_px: 100,
      length_px: 30,
      width_px: 20,
      perimeter_px: 120,
      aspect_ratio: 1.5,
      circularity: 0.7,
      angle_deg: -10,
    },
  };
  const [oriented] = orientLiveSeeds([polygonSeed], {
    frameWidth: 100,
    frameHeight: 200,
    imageWidth: 400,
    imageHeight: 200,
    orientation: "right",
  });

  assert.deepEqual(oriented.mask?.polygon, [
    { x: 360, y: 20 },
    { x: 360, y: 80 },
    { x: 280, y: 80 },
  ]);
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

test("rotateLivePoint maps right-oriented points into upright image space", () => {
  assert.deepEqual(rotateLivePoint(10, 20, 100, 200, "right"), { x: 180, y: 10 });
});

test("graftLiveMasksOntoAnalysis preserves analysis bbox while adding live polygon", () => {
  const analysis = {
    analyzerId: "coreml-yolo",
    durationMs: 10,
    seeds: [
      {
        ...seed,
        bbox: { x: 100, y: 200, width: 300, height: 150 },
      },
    ],
    summary: {
      total_seeds: 1,
      mean_length_mm: 10,
      mean_width_mm: 4,
      mean_area_mm2: 40,
    },
  };
  const live = {
    analyzerId: "coreml-yolo-live",
    frameTimestampMs: 1,
    frameWidth: 1920,
    frameHeight: 1080,
    frameOrientation: "left",
    seeds: [
      {
        ...seed,
        bbox: { x: 20, y: 40, width: 100, height: 50 },
        mask: {
          polygon: [
            { x: 20, y: 40 },
            { x: 120, y: 40 },
            { x: 120, y: 90 },
          ],
          area_px: 5000,
          length_px: 100,
          width_px: 50,
          perimeter_px: 300,
          aspect_ratio: 2,
          circularity: 0.5,
          angle_deg: 0,
        },
      },
    ],
    summary: analysis.summary,
  };

  const graftedSeeds = graftLiveMasksOntoAnalysisSeeds(analysis.seeds, live.seeds);

  assert.deepEqual(graftedSeeds?.[0].bbox, analysis.seeds[0].bbox);
  assert.deepEqual(graftedSeeds?.[0].mask?.polygon, [
    { x: 100, y: 200 },
    { x: 400, y: 200 },
    { x: 400, y: 350 },
  ]);
});
