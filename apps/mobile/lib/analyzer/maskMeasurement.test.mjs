import assert from "node:assert/strict";
import test from "node:test";
import {
  convexHull,
  measureInstance,
  minAreaRect,
  polygonArea,
  polygonBoundingRect,
  polygonPerimeter,
} from "./maskMeasurement.mjs";

test("polygonArea matches the shoelace formula for a CCW square", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  assert.equal(polygonArea(square), 100);
});

test("polygonArea is direction-invariant (CW square equals CCW square)", () => {
  const cw = [
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 0 },
  ];
  assert.equal(polygonArea(cw), 100);
});

test("polygonPerimeter closes the loop back to the first vertex", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  assert.equal(polygonPerimeter(square), 40);
});

test("polygonBoundingRect returns AABB min/max regardless of vertex order", () => {
  const shape = [
    { x: 4, y: -3 },
    { x: 1, y: 7 },
    { x: 9, y: 2 },
    { x: 6, y: 5 },
  ];
  assert.deepEqual(polygonBoundingRect(shape), { x: 1, y: -3, w: 8, h: 10 });
});

test("convexHull drops interior points and emits CCW order", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 5, y: 5 }, // interior
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const hull = convexHull(pts);
  assert.equal(hull.length, 4);
  // First (lowest-x, lowest-y) entry must be (0,0); subsequent entries go CCW.
  assert.deepEqual(hull[0], { x: 0, y: 0 });
});

test("minAreaRect on an axis-aligned rectangle reports its native sides", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 4 },
    { x: 0, y: 4 },
  ];
  const m = minAreaRect(rect);
  const sides = [m.width, m.height].sort((a, b) => b - a);
  assert.ok(Math.abs(sides[0] - 12) < 1e-6, `long side ${sides[0]} ≠ 12`);
  assert.ok(Math.abs(sides[1] - 4) < 1e-6, `short side ${sides[1]} ≠ 4`);
  assert.ok(Math.abs(m.cx - 6) < 1e-6);
  assert.ok(Math.abs(m.cy - 2) < 1e-6);
  // Axis-aligned rect → angle is 0 or -90 depending on which edge the
  // calipers locked onto; both are valid OpenCV minAreaRect outputs.
  assert.ok(m.angleDeg <= 0 && m.angleDeg >= -90);
});

test("minAreaRect on a 30°-rotated rectangle recovers the same side lengths", () => {
  const w = 14;
  const h = 6;
  const theta = (30 * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cx = 100;
  const cy = 50;
  const rotate = (px, py) => ({
    x: cx + (px - 0) * cos - (py - 0) * sin,
    y: cy + (px - 0) * sin + (py - 0) * cos,
  });
  const corners = [
    rotate(-w / 2, -h / 2),
    rotate(w / 2, -h / 2),
    rotate(w / 2, h / 2),
    rotate(-w / 2, h / 2),
  ];
  // Sample a few extra interior points to mimic a real mask polygon.
  const points = corners.concat([
    rotate(0, 0),
    rotate(2, 1),
    rotate(-3, -2),
  ]);
  const m = minAreaRect(points);
  const sides = [m.width, m.height].sort((a, b) => b - a);
  assert.ok(Math.abs(sides[0] - w) < 0.05, `long side ${sides[0]} ≠ ${w}`);
  assert.ok(Math.abs(sides[1] - h) < 0.05, `short side ${sides[1]} ≠ ${h}`);
  assert.ok(Math.abs(m.cx - cx) < 0.05);
  assert.ok(Math.abs(m.cy - cy) < 0.05);
});

test("measureInstance returns {} for fewer than 3 vertices (script parity)", () => {
  assert.deepEqual(measureInstance([]), {});
  assert.deepEqual(measureInstance([{ x: 0, y: 0 }]), {});
  assert.deepEqual(measureInstance([{ x: 0, y: 0 }, { x: 1, y: 1 }]), {});
});

test("measureInstance on a 12×4 rect: bbox area when no mask, mask count when given", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 4 },
    { x: 0, y: 4 },
  ];
  const noMask = measureInstance(rect);
  assert.equal(noMask.length_px, 12);
  assert.equal(noMask.width_px, 4);
  assert.equal(noMask.area_px, 48);
  assert.equal(noMask.perimeter_px, 32);
  assert.equal(noMask.aabb_w_px, 12);
  assert.equal(noMask.aabb_h_px, 4);
  assert.ok(Math.abs(noMask.aspect_ratio - 3) < 1e-6);

  const withMask = measureInstance(rect, { maskPixelCount: 41 });
  assert.equal(withMask.area_px, 41);
  // Circularity recomputes against the new area.
  const expectedCirc = (4 * Math.PI * 41) / (32 * 32);
  assert.ok(Math.abs(withMask.circularity - expectedCirc) < 1e-9);
});

test("measureInstance adds mm fields scaled by 1/pxPerMm when pxPerMm > 0", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
    { x: 0, y: 10 },
  ];
  // pxPerMm = 5 → 1 px is 0.2 mm.
  const m = measureInstance(rect, { pxPerMm: 5 });
  assert.equal(m.mm_per_pixel, 0.2);
  assert.equal(m.px_per_mm, 5);
  assert.equal(m.length_mm, 4);
  assert.equal(m.width_mm, 2);
  assert.equal(m.area_mm2, 8);
  assert.equal(m.perimeter_mm, 12);
});

test("measureInstance omits mm fields when pxPerMm is missing or invalid", () => {
  const rect = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 },
  ];
  const m1 = measureInstance(rect);
  assert.ok(!("length_mm" in m1));
  assert.ok(!("area_mm2" in m1));
  const m2 = measureInstance(rect, { pxPerMm: 0 });
  assert.ok(!("length_mm" in m2));
  const m3 = measureInstance(rect, { pxPerMm: -1 });
  assert.ok(!("length_mm" in m3));
});

test("circularity of a regular polygon approaches 1 as vertex count grows", () => {
  const n = 64;
  const r = 50;
  const points = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    points.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
  }
  const m = measureInstance(points);
  // 4π·area/perimeter² → 1.0 for a true circle; the 64-gon approximation
  // lands within 1% of unity.
  assert.ok(m.circularity > 0.99 && m.circularity <= 1.0001, `circ=${m.circularity}`);
});
