// Pure measurement math for segmented seed instances.
// Mirrors the `measure_instance` function from scripts/run_segmentation.py
// in the ML repo so the demo produces the same length/width/area/perimeter
// numbers without depending on OpenCV. The `.mjs` sibling carries the
// exact same logic so node --test can exercise it without RN/Expo
// transitive deps.
//
// All inputs are in source-image pixel space. `pxPerMm` (pixels per mm) is
// the inverse of the script's `mm_per_pixel`; both metric paths are derived
// from it so the live UI can stay on the existing pxPerMm field.

export interface Point {
  x: number;
  y: number;
}

export interface MinAreaRect {
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** OpenCV-compatible angle in (-90, 0] degrees. */
  angleDeg: number;
}

export interface MeasureOptions {
  /**
   * Non-zero pixel count of the decoded binary mask. When supplied, this
   * replaces the polygon shoelace area — matching the script's preference
   * for the rasterized mask count over the contour-area approximation.
   */
  maskPixelCount?: number;
  /** Pixels per millimeter. > 0 enables the mm-scaled output fields. */
  pxPerMm?: number;
}

export interface MeasureResult {
  aabb_w_px: number;
  aabb_h_px: number;
  length_px: number;
  width_px: number;
  angle_deg: number;
  area_px: number;
  perimeter_px: number;
  aspect_ratio: number;
  circularity: number;
  mm_per_pixel?: number;
  px_per_mm?: number;
  aabb_w_mm?: number;
  aabb_h_mm?: number;
  length_mm?: number;
  width_mm?: number;
  area_mm2?: number;
  volume_ml?: number;
  perimeter_mm?: number;
}

export function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(sum) * 0.5;
}

export function polygonPerimeter(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const dx = points[i].x - points[j].x;
    const dy = points[i].y - points[j].y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum;
}

export function polygonBoundingRect(points: readonly Point[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
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

// Andrew's monotone chain. Returns the hull in CCW order without duplicating
// the closing point.
export function convexHull(points: readonly Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const sorted = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
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

// Rotating calipers — minimum-area enclosing rectangle. The angle is
// emitted in OpenCV's canonical (-90, 0] degree range to match the script.
export function minAreaRect(points: readonly Point[]): MinAreaRect {
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
      angleDeg: normalizeOpenCvAngle(angleDeg),
    };
  }
  const hull = convexHull(points);
  if (hull.length < 3) {
    return minAreaRect(hull);
  }

  let best: {
    cx: number;
    cy: number;
    width: number;
    height: number;
    angleDeg: number;
    area: number;
  } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const edgeDx = b.x - a.x;
    const edgeDy = b.y - a.y;
    const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
    if (edgeLen <= 0) continue;
    const ux = edgeDx / edgeLen;
    const uy = edgeDy / edgeLen;
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
    angleDeg: normalizeOpenCvAngle(best.angleDeg),
  };
}

function normalizeOpenCvAngle(angleDeg: number): number {
  let a = angleDeg;
  while (a <= -90) a += 90;
  while (a > 0) a -= 90;
  if (a <= -90 + 1e-9) a = 0;
  return a;
}

/**
 * Port of `measure_instance(polygon_xy, mask_bool, scale, cv2, np)` from
 * scripts/run_segmentation.py.
 *
 * Returns an empty object when the polygon has fewer than 3 vertices, the
 * same early-return the script uses.
 */
export function measureInstance(
  polygon: readonly Point[],
  options: MeasureOptions = {},
): MeasureResult | Record<string, never> {
  const { maskPixelCount, pxPerMm } = options;
  if (!polygon || polygon.length < 3) return {};

  const aabb = polygonBoundingRect(polygon);
  const rect = minAreaRect(polygon);
  const lengthPx = Math.max(rect.width, rect.height);
  const widthPx = Math.min(rect.width, rect.height);
  const areaPx =
    typeof maskPixelCount === "number" && maskPixelCount >= 0
      ? maskPixelCount
      : polygonArea(polygon);
  const perimeterPx = polygonPerimeter(polygon);
  const aspectRatio = lengthPx / Math.max(widthPx, 1e-6);
  const circularity = (4 * Math.PI * areaPx) / Math.max(perimeterPx * perimeterPx, 1e-6);

  const out: MeasureResult = {
    aabb_w_px: aabb.w,
    aabb_h_px: aabb.h,
    length_px: lengthPx,
    width_px: widthPx,
    angle_deg: rect.angleDeg,
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
    out.volume_ml = estimateOblongVolumeMl(out.length_mm, out.area_mm2);
    out.perimeter_mm = perimeterPx * mpp;
  }

  return out;
}

export function estimateOblongVolumeMl(lengthMm: number, areaMm2: number): number {
  if (!(lengthMm > 0) || !(areaMm2 > 0)) return 0;
  const equivalentWidthMm = areaMm2 / lengthMm;
  const radiusMm = equivalentWidthMm / 2;
  return (Math.PI * radiusMm * radiusMm * lengthMm) / 1000;
}
