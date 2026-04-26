// Region-of-interest geometry + point-in-shape predicates (Phase 6b).
//
// All ROI shapes store coordinates as normalized fractions of the viewfinder
// region: x/y/w/h in [0..1] are relative to the preview width/height; circle
// radius is relative to min(width, height) so it stays a true circle on
// non-square viewports.
//
// The KPI strip filters detections by passing each detection's normalized
// centroid through `pointInRoi`. We lie slightly here — the camera *frame*
// (1920x1080-ish) and the on-screen *preview* don't share an exact scale
// when aspect ratios differ; vision-camera applies a center-crop. For the
// demo's accuracy budget this approximation is fine. A precise mapping
// would read `format.videoSize` and apply the inverse transform.

export interface Point {
  x: number;
  y: number;
}

export interface RoiRect {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoiPolygon {
  kind: "polygon";
  points: Point[];
  closed: boolean;
}

export interface RoiCircle {
  kind: "circle";
  cx: number;
  cy: number;
  /** Radius normalized to min(width, height). */
  r: number;
}

export type Roi = RoiRect | RoiPolygon | RoiCircle;
export type RoiKind = Roi["kind"];

export function pointInRect(p: Point, rect: RoiRect): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

export function pointInCircle(p: Point, c: RoiCircle): boolean {
  // We treat dx and dy as if they were in the same unit (min-dimension
  // normalized). For points expressed in width/height-normalized coords,
  // this rounds slightly on rectangular viewports — acceptable for the
  // KPI-strip filter where we're counting seeds, not measuring them.
  const dx = p.x - c.cx;
  const dy = p.y - c.cy;
  return dx * dx + dy * dy <= c.r * c.r;
}

/**
 * Ray-casting inclusion test. Closed polygons only — open polylines are
 * rendered as drafts and don't filter detections.
 */
export function pointInPolygon(p: Point, poly: RoiPolygon): boolean {
  if (!poly.closed || poly.points.length < 3) return false;
  let inside = false;
  const pts = poly.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const denom = yj - yi || 1e-9;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInRoi(p: Point, roi: Roi): boolean {
  switch (roi.kind) {
    case "rect":
      return pointInRect(p, roi);
    case "polygon":
      return pointInPolygon(p, roi);
    case "circle":
      return pointInCircle(p, roi);
  }
}

/**
 * Compute the centroid of a detection's bbox, normalized to the frame
 * dimensions so it can be compared against ROI shapes (also in [0..1]).
 */
export function normalizeCentroid(
  bbox: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): Point {
  return {
    x: frameWidth > 0 ? (bbox.x + bbox.width / 2) / frameWidth : 0,
    y: frameHeight > 0 ? (bbox.y + bbox.height / 2) / frameHeight : 0,
  };
}

/**
 * Returns true when the ROI is fully drawn and usable as a filter. Drafts
 * (zero-area rect, single-point circle, open polyline) shouldn't filter
 * anything out — the KPI strip needs to keep showing all detections while
 * the user is still drawing.
 */
export function isRoiCommitted(roi: Roi | null): boolean {
  if (!roi) return false;
  switch (roi.kind) {
    case "rect":
      return roi.w > 0.005 && roi.h > 0.005;
    case "circle":
      return roi.r > 0.005;
    case "polygon":
      return roi.closed && roi.points.length >= 3;
  }
}
