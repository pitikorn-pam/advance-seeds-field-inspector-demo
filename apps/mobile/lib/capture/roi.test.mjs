import test from "node:test";
import assert from "node:assert/strict";

import {
  isRoiCommitted,
  normalizeCentroid,
  pointInCircle,
  pointInPolygon,
  pointInRect,
  pointInRoi,
} from "./roi.mjs";

// ---- pointInRect --------------------------------------------------------

test("pointInRect: includes corners and the interior", () => {
  const rect = { kind: "rect", x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
  assert.equal(pointInRect({ x: 0.5, y: 0.5 }, rect), true); // center
  assert.equal(pointInRect({ x: 0.2, y: 0.2 }, rect), true); // top-left corner
  assert.equal(pointInRect({ x: 0.8, y: 0.8 }, rect), true); // bottom-right corner
});

test("pointInRect: excludes points outside the bounds", () => {
  const rect = { kind: "rect", x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
  assert.equal(pointInRect({ x: 0.1, y: 0.5 }, rect), false); // left of
  assert.equal(pointInRect({ x: 0.5, y: 0.9 }, rect), false); // below
  assert.equal(pointInRect({ x: 0.85, y: 0.5 }, rect), false); // right of
});

// ---- pointInCircle ------------------------------------------------------

test("pointInCircle: includes points within the radius", () => {
  const c = { kind: "circle", cx: 0.5, cy: 0.5, r: 0.2 };
  assert.equal(pointInCircle({ x: 0.5, y: 0.5 }, c), true); // center
  assert.equal(pointInCircle({ x: 0.55, y: 0.55 }, c), true); // inside
  assert.equal(pointInCircle({ x: 0.7, y: 0.5 }, c), true); // exactly on the boundary
});

test("pointInCircle: excludes points outside the radius", () => {
  const c = { kind: "circle", cx: 0.5, cy: 0.5, r: 0.2 };
  assert.equal(pointInCircle({ x: 0.8, y: 0.5 }, c), false);
  assert.equal(pointInCircle({ x: 0.5, y: 0.1 }, c), false);
});

// ---- pointInPolygon -----------------------------------------------------

test("pointInPolygon: simple convex quadrilateral", () => {
  const poly = {
    kind: "polygon",
    closed: true,
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ],
  };
  assert.equal(pointInPolygon({ x: 0.5, y: 0.5 }, poly), true);
  assert.equal(pointInPolygon({ x: 0.1, y: 0.5 }, poly), false);
  assert.equal(pointInPolygon({ x: 0.9, y: 0.5 }, poly), false);
});

test("pointInPolygon: concave shape (L-polygon) excludes the notch", () => {
  // L-shape: 0.2..0.8 wide, 0.2..0.8 tall, with a notch cut from
  // the top-right quadrant.
  //
  //   (0.2,0.2)──(0.5,0.2)
  //       │          │
  //       │       (0.5,0.5)──(0.8,0.5)
  //       │                       │
  //   (0.2,0.8)─────────────(0.8,0.8)
  const poly = {
    kind: "polygon",
    closed: true,
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.5 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ],
  };
  // Inside the bottom row.
  assert.equal(pointInPolygon({ x: 0.6, y: 0.7 }, poly), true);
  // Inside the left column.
  assert.equal(pointInPolygon({ x: 0.3, y: 0.4 }, poly), true);
  // Inside the cut-out (top-right) — must be excluded.
  assert.equal(pointInPolygon({ x: 0.7, y: 0.3 }, poly), false);
});

test("pointInPolygon: open polylines never include any point", () => {
  const poly = {
    kind: "polygon",
    closed: false,
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
    ],
  };
  assert.equal(pointInPolygon({ x: 0.5, y: 0.5 }, poly), false);
});

test("pointInPolygon: rejects polygons with fewer than 3 vertices", () => {
  const poly = {
    kind: "polygon",
    closed: true,
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
    ],
  };
  assert.equal(pointInPolygon({ x: 0.5, y: 0.2 }, poly), false);
});

// ---- pointInRoi ---------------------------------------------------------

test("pointInRoi dispatches by kind", () => {
  assert.equal(
    pointInRoi({ x: 0.5, y: 0.5 }, { kind: "rect", x: 0, y: 0, w: 1, h: 1 }),
    true,
  );
  assert.equal(
    pointInRoi({ x: 0.5, y: 0.5 }, { kind: "circle", cx: 0.5, cy: 0.5, r: 0.1 }),
    true,
  );
  assert.equal(
    pointInRoi(
      { x: 0.5, y: 0.5 },
      {
        kind: "polygon",
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ),
    true,
  );
});

// ---- normalizeCentroid --------------------------------------------------

test("normalizeCentroid: returns center fraction of bbox", () => {
  const c = normalizeCentroid({ x: 100, y: 200, width: 200, height: 100 }, 1000, 500);
  assert.equal(c.x, 0.2); // (100 + 100) / 1000
  assert.equal(c.y, 0.5); // (200 + 50) / 500
});

test("normalizeCentroid: returns 0/0 on zero frame dims (avoids NaN)", () => {
  const c = normalizeCentroid({ x: 10, y: 10, width: 5, height: 5 }, 0, 0);
  assert.equal(c.x, 0);
  assert.equal(c.y, 0);
});

// ---- isRoiCommitted -----------------------------------------------------

test("isRoiCommitted: rect needs both dims above 0.005", () => {
  assert.equal(isRoiCommitted({ kind: "rect", x: 0, y: 0, w: 0.5, h: 0.5 }), true);
  // Drag-in-progress: width is still tiny while user holds mouse.
  assert.equal(isRoiCommitted({ kind: "rect", x: 0, y: 0, w: 0.001, h: 0.5 }), false);
});

test("isRoiCommitted: circle needs radius above 0.005", () => {
  assert.equal(isRoiCommitted({ kind: "circle", cx: 0.5, cy: 0.5, r: 0.2 }), true);
  assert.equal(isRoiCommitted({ kind: "circle", cx: 0.5, cy: 0.5, r: 0.001 }), false);
});

test("isRoiCommitted: polygon must be closed AND have 3+ points", () => {
  const open = {
    kind: "polygon",
    closed: false,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
  };
  const tiny = {
    kind: "polygon",
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  };
  const ok = {
    kind: "polygon",
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
  };
  assert.equal(isRoiCommitted(open), false);
  assert.equal(isRoiCommitted(tiny), false);
  assert.equal(isRoiCommitted(ok), true);
});

test("isRoiCommitted: null / undefined returns false", () => {
  assert.equal(isRoiCommitted(null), false);
});
