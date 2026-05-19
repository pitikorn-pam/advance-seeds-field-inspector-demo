import assert from "node:assert/strict";
import test from "node:test";
import {
  attachSegmentationPolygons,
  decodeYolo,
  decodeYoloNms,
  decodeYoloSegmentationNms,
  letterbox,
  mapDetectionsToSeeds,
  nonMaxSuppression,
  summarizeSeeds,
} from "./yolo.mjs";

function makeSolid(width, height, rgb) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

// Build a fake YOLO output of shape [1, 4 + numClasses, anchors] with
// `boxes` injected at successive anchor slots.
function makeYoloOutput({ numClasses, anchors, boxes }) {
  const channels = 4 + numClasses;
  const out = new Float32Array(channels * anchors);
  boxes.forEach((b, i) => {
    out[0 * anchors + i] = b.cx;
    out[1 * anchors + i] = b.cy;
    out[2 * anchors + i] = b.w;
    out[3 * anchors + i] = b.h;
    out[(4 + b.classId) * anchors + i] = b.score;
  });
  return { tensor: out, shape: [1, channels, anchors] };
}

test("letterbox pads and scales to a square tensor", () => {
  const pixels = makeSolid(200, 100, [255, 0, 0]);
  const lb = letterbox(pixels, 100);
  assert.equal(lb.target, 100);
  assert.equal(lb.scale, 0.5);
  // 200x100 → 100x50 inside 100x100, pad 0/25 (top/bottom).
  assert.equal(lb.padX, 0);
  assert.equal(lb.padY, 25);
  // Padding rows should be grey (114/255).
  assert.ok(Math.abs(lb.tensor[0] - 114 / 255) < 1e-6);
  // Center row should be red (R=1, G=0, B=0).
  const centerOffset = (50 * 100 + 50) * 3;
  assert.ok(Math.abs(lb.tensor[centerOffset] - 1) < 1e-6);
  assert.equal(lb.tensor[centerOffset + 1], 0);
});

test("decodeYolo inverts letterbox and applies score threshold", () => {
  const lb = { scale: 0.5, padX: 0, padY: 25, target: 100 };
  const { tensor, shape } = makeYoloOutput({
    numClasses: 2,
    anchors: 4,
    boxes: [
      { cx: 50, cy: 50, w: 20, h: 10, classId: 0, score: 0.9 },
      { cx: 10, cy: 30, w: 8, h: 8, classId: 1, score: 0.1 }, // below threshold
      { cx: 80, cy: 60, w: 12, h: 6, classId: 0, score: 0.5 },
    ],
  });
  const detections = decodeYolo(tensor, shape, { letterbox: lb, scoreThreshold: 0.25 });
  assert.equal(detections.length, 2);
  const first = detections[0];
  // (50 - 10 - 0)/0.5 = 80, (50 - 5 - 25)/0.5 = 40, w=40, h=20.
  assert.equal(first.x, 80);
  assert.equal(first.y, 40);
  assert.equal(first.width, 40);
  assert.equal(first.height, 20);
  assert.equal(first.classId, 0);
});

test("nonMaxSuppression keeps highest score and drops overlap", () => {
  const detections = [
    { x: 0, y: 0, width: 10, height: 10, score: 0.9, classId: 0 },
    { x: 1, y: 1, width: 10, height: 10, score: 0.8, classId: 0 },
    { x: 50, y: 50, width: 10, height: 10, score: 0.7, classId: 0 },
  ];
  const kept = nonMaxSuppression(detections, 0.5);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].score, 0.9);
  assert.equal(kept[1].score, 0.7);
});

test("decodeYoloNms reads post-NMS [maxDet,6] rows and applies classFilter", () => {
  // YOLO26 export: [1, maxDet, 6] = [x1, y1, x2, y2, score, classId].
  const shape = [1, 4, 6];
  const out = new Float32Array(4 * 6);
  // row 0: apple (cls 47), score 0.8 — keep
  out.set([100, 100, 200, 180, 0.8, 47], 0);
  // row 1: orange (cls 49), score 0.4 — drop (below 0.5)
  out.set([0, 0, 50, 50, 0.4, 49], 6);
  // row 2: banana (cls 46), score 0.9 — keep
  out.set([20, 30, 80, 100, 0.9, 46], 12);
  // row 3: padding zeros — drop
  out.set([0, 0, 0, 0, 0, 0], 18);

  const lb = { scale: 1, padX: 0, padY: 0, target: 640 };
  const det = decodeYoloNms(out, shape, {
    letterbox: lb,
    scoreThreshold: 0.5,
    classFilter: [46, 47, 49, 50, 51],
  });
  assert.equal(det.length, 2);
  assert.equal(det[0].classId, 47);
  assert.equal(det[0].x, 100);
  assert.equal(det[0].width, 100);
  assert.equal(det[1].classId, 46);
});

test("decodeYoloNms supports normalized post-NMS boxes", () => {
  const shape = [1, 2, 6];
  const out = new Float32Array(2 * 6);
  out.set([0.25, 0.1, 0.5, 0.35, 0.7, 46], 0);
  out.set([0, 0, 0, 0, 0, 0], 6);

  const det = decodeYoloNms(out, shape, {
    letterbox: { scale: 1, padX: 0, padY: 0, target: 640 },
    scoreThreshold: 0.5,
    classFilter: [46],
  });

  assert.equal(det.length, 1);
  assert.equal(det[0].classId, 46);
  assert.equal(Math.round(det[0].x), 160);
  assert.equal(Math.round(det[0].width), 160);
});

test("decodeYoloSegmentationNms decodes first six fields and ignores mask coefficients", () => {
  const shape = [1, 1, 38];
  const out = new Float32Array(38);
  out.set([0.25, 0.1, 0.5, 0.35, 0.7, 2], 0);
  out.fill(0.5, 6);

  const det = decodeYoloSegmentationNms(out, shape, {
    letterbox: { scale: 1, padX: 0, padY: 0, target: 640 },
    scoreThreshold: 0.5,
    classFilter: [2],
  });

  assert.equal(det.length, 1);
  assert.equal(det[0].classId, 2);
  assert.equal(Math.round(det[0].x), 160);
  assert.equal(Math.round(det[0].width), 160);
});

test("mapDetectionsToSeeds applies ROI and converts mm", () => {
  const detections = [
    { x: 10, y: 10, width: 30, height: 10, score: 0.8, classId: 0 },
    { x: 80, y: 80, width: 30, height: 10, score: 0.8, classId: 0 },
  ];
  const seeds = mapDetectionsToSeeds(detections, {
    frameWidth: 100,
    frameHeight: 100,
    pxPerMm: 10,
    roi: { kind: "rect", x: 0, y: 0, w: 0.5, h: 0.5 },
  });
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].length_mm, 3);
  assert.equal(seeds[0].width_mm, 1);
  const summary = summarizeSeeds(seeds);
  assert.equal(summary.total_seeds, 1);
  assert.equal(summary.mean_length_mm, 3);
});

test("mapDetectionsToSeeds uses measure_instance math when a mask polygon is present", () => {
  // 12×4 rotated-rect polygon centered at (60, 50). length=12, width=4,
  // so at pxPerMm=2 we expect length=6mm, width=2mm. Area from the mask
  // pixel count (47) → 47 / 4 = 11.75 mm² (rounded to 11.75).
  const polygon = [
    { x: 54, y: 48 },
    { x: 66, y: 48 },
    { x: 66, y: 52 },
    { x: 54, y: 52 },
  ];
  const detections = [
    {
      x: 54,
      y: 48,
      width: 12,
      height: 4,
      score: 0.9,
      classId: 0,
      polygon,
      maskPixelCount: 47,
    },
  ];
  const seeds = mapDetectionsToSeeds(detections, {
    frameWidth: 200,
    frameHeight: 200,
    pxPerMm: 2,
  });
  assert.equal(seeds.length, 1);
  const s = seeds[0];
  assert.equal(s.length_mm, 6);
  assert.equal(s.width_mm, 2);
  // 47 px / (2 px/mm)² = 47 / 4 = 11.75 mm² (mask area beats bbox).
  assert.equal(s.area_mm2, 11.75);
  assert.ok(s.mask, "mask measurement bundle should be attached");
  assert.equal(s.mask.length_px, 12);
  assert.equal(s.mask.width_px, 4);
  assert.equal(s.mask.area_px, 47);
  assert.ok(Math.abs(s.mask.aspect_ratio - 3) < 1e-6);
});

test("attachSegmentationPolygons fills polygon + maskPixelCount on segmentation detections", () => {
  // Tiny synthetic prototype: 1 hot channel inside a 4×4 block at proto
  // coords (4..7), no scaling between proto and source.
  const protoH = 16;
  const protoW = 16;
  const protoC = 1;
  const protos = new Float32Array(protoH * protoW * protoC);
  for (let y = 4; y < 8; y++) {
    for (let x = 4; x < 8; x++) {
      protos[(y * protoW + x) * protoC] = 1;
    }
  }
  const detections = [
    {
      x: 4,
      y: 4,
      width: 4,
      height: 4,
      score: 0.9,
      classId: 0,
      maskCoefs: new Float32Array([10]),
    },
    // Second detection has no coefs — should be skipped.
    { x: 0, y: 0, width: 4, height: 4, score: 0.9, classId: 0 },
  ];
  attachSegmentationPolygons(detections, {
    prototypes: protos,
    protoShape: [1, protoH, protoW, protoC],
    letterbox: { scale: 1, padX: 0, padY: 0, target: 16 },
    srcWidth: 16,
    srcHeight: 16,
  });
  assert.ok(detections[0].polygon && detections[0].polygon.length >= 3);
  assert.equal(detections[0].maskPixelCount, 16);
  assert.equal(detections[1].polygon, undefined);
});
