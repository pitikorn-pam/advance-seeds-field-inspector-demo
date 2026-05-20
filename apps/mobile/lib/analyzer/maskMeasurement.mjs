// Pure measurement math for segmented seed instances.
// Mirrors the `measure_instance` function from scripts/run_segmentation.py
// in the ML repo so the demo produces the same length/width/area/perimeter
// numbers without depending on OpenCV. Kept side-effect-free so node --test
// can exercise the geometry directly.
//
// All inputs are in source-image pixel space. `pxPerMm` (pixels per mm) is
// the inverse of the script's `mm_per_pixel`; both metric paths are derived
// from it so the .ts wrapper and the live UI can stay on the existing
// pxPerMm field without a second calibration unit.

const TWO_PI = Math.PI * 2;

export function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(sum) * 0.5;
}

export function polygonPerimeter(points) {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const dx = points[i].x - points[j].x;
    const dy = points[i].y - points[j].y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum;
}

export function polygonBoundingRect(points) {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Andrew's monotone chain — O(n log n). Returns the hull in CCW order with
// no duplicated endpoint, which is the layout the rotating-calipers loop
// below expects.
export function convexHull(points) {
  if (points.length < 3) return points.slice();
  const sorted = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Rotating calipers — minimum-area enclosing rectangle. Returns
// { cx, cy, width, height, angleDeg } where `angleDeg` is the angle of the
// `width` side measured from the +x axis, in (-90, 0] to match OpenCV's
// minAreaRect convention. `width` and `height` here are raw side lengths;
// callers pick `length_px = max(...)` / `width_px = min(...)` themselves
// (mirroring the script).
export function minAreaRect(points) {
  if (points.length < 2) {
    return { cx: 0, cy: 0, width: 0, height: 0, angleDeg: 0 };
  }
  if (points.length === 2) {
    const [a, b] = points;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      width: len,
      height: 0,
      angleDeg: normalizeOpenCvAngle(angleDeg, len, 0),
    };
  }
  const hull = convexHull(points);
  if (hull.length < 3) {
    return minAreaRect(hull.length === 2 ? hull : [hull[0], hull[0]]);
  }

  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const edgeDx = b.x - a.x;
    const edgeDy = b.y - a.y;
    const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
    if (edgeLen <= 0) continue;
    const ux = edgeDx / edgeLen;
    const uy = edgeDy / edgeLen;
    // Perpendicular (left-hand): (-uy, ux).
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const u = dx * ux + dy * uy;
      const v = dx * -uy + dy * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU;
    const h = maxV - minV;
    const area = w * h;
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const cx = a.x + cu * ux + cv * -uy;
      const cy = a.y + cu * uy + cv * ux;
      const angleDeg = (Math.atan2(uy, ux) * 180) / Math.PI;
      best = { cx, cy, width: w, height: h, angleDeg, area };
    }
  }
  if (!best) return { cx: 0, cy: 0, width: 0, height: 0, angleDeg: 0 };
  return {
    cx: best.cx,
    cy: best.cy,
    width: best.width,
    height: best.height,
    angleDeg: normalizeOpenCvAngle(best.angleDeg, best.width, best.height),
  };
}

// OpenCV's minAreaRect reports the angle in (-90, 0] and pairs it with
// (width, height) such that the angle is the rotation of the rectangle's
// `width` side from the +x axis. Our caliper loop emits an angle in
// (-180, 180]; collapse to the same canonical range so consumers comparing
// against test.py output see the same number.
function normalizeOpenCvAngle(angleDeg, width, height) {
  let a = angleDeg;
  while (a <= -90) a += 90;
  while (a > 0) a -= 90;
  if (a <= -90 + 1e-9) a = 0;
  // Width corresponds to the edge whose direction we picked; if the rect
  // would be reported more naturally with width/height swapped (height
  // larger), OpenCV still reports the angle relative to whichever side it
  // labels `width`. We don't enforce a swap here because the caller picks
  // length/width by max/min anyway — but we do keep the angle in the
  // canonical OpenCV range.
  void width;
  void height;
  return a;
}

/**
 * Port of `measure_instance(polygon_xy, mask_bool, scale, cv2, np)` from
 * scripts/run_segmentation.py.
 *
 * @param {Array<{x:number,y:number}>} polygon Points in source-image pixel
 *   space (must have ≥ 3 entries to produce a non-empty result).
 * @param {object} [options]
 * @param {number} [options.maskPixelCount] If the binary mask was decoded
 *   alongside the polygon, pass its non-zero count — the script prefers
 *   this over the polygon-area approximation. Falls back to shoelace area
 *   when omitted.
 * @param {number} [options.pxPerMm] Pixels per mm. When > 0, mm/mm²
 *   versions of every length-like field are added to the result.
 * @returns {object} Empty object when the polygon has < 3 points,
 *   matching the script's early return.
 */
export function measureInstance(polygon, options = {}) {
  const { maskPixelCount, pxPerMm } = options;
  if (!polygon || polygon.length < 3) return {};

  const aabb = polygonBoundingRect(polygon);
  const rect = minAreaRect(polygon);
  const lengthPx = Math.max(rect.width, rect.height);
  const widthPx = Math.min(rect.width, rect.height);
  const angleDeg = rect.angleDeg;
  const areaPx =
    typeof maskPixelCount === "number" && maskPixelCount >= 0
      ? maskPixelCount
      : polygonArea(polygon);
  const perimeterPx = polygonPerimeter(polygon);
  const aspectRatio = lengthPx / Math.max(widthPx, 1e-6);
  const circularity = (4 * Math.PI * areaPx) / Math.max(perimeterPx * perimeterPx, 1e-6);

  const out = {
    aabb_w_px: aabb.w,
    aabb_h_px: aabb.h,
    length_px: lengthPx,
    width_px: widthPx,
    angle_deg: angleDeg,
    area_px: areaPx,
    perimeter_px: perimeterPx,
    aspect_ratio: aspectRatio,
    circularity,
  };

  if (typeof pxPerMm === "number" && pxPerMm > 0) {
    const mpp = 1 / pxPerMm;
    out.mm_per_pixel = mpp;
    out.px_per_mm = pxPerMm;
    out.aabb_w_mm = aabb.w * mpp;
    out.aabb_h_mm = aabb.h * mpp;
    out.length_mm = lengthPx * mpp;
    out.width_mm = widthPx * mpp;
    out.area_mm2 = areaPx * mpp * mpp;
    out.perimeter_mm = perimeterPx * mpp;
  }

  return out;
}

// Geometric circularity ceiling sanity check for tests/callers.
export function maxCircularity() {
  return 1.0;
}

void TWO_PI;
