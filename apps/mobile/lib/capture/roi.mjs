// Pure JS mirror of roi.ts for `node --test` (matches the
// ClassicalSeedAnalyzerCore.{ts,mjs} dual-file pattern). Keep
// in lockstep with roi.ts.

export function pointInRect(p, rect) {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

export function pointInCircle(p, c) {
  const dx = p.x - c.cx;
  const dy = p.y - c.cy;
  return dx * dx + dy * dy <= c.r * c.r;
}

export function pointInPolygon(p, poly) {
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

export function pointInRoi(p, roi) {
  switch (roi.kind) {
    case "rect":
      return pointInRect(p, roi);
    case "polygon":
      return pointInPolygon(p, roi);
    case "circle":
      return pointInCircle(p, roi);
  }
  return false;
}

export function normalizeCentroid(bbox, frameWidth, frameHeight) {
  return {
    x: frameWidth > 0 ? (bbox.x + bbox.width / 2) / frameWidth : 0,
    y: frameHeight > 0 ? (bbox.y + bbox.height / 2) / frameHeight : 0,
  };
}

export function isRoiCommitted(roi) {
  if (!roi) return false;
  switch (roi.kind) {
    case "rect":
      return roi.w > 0.005 && roi.h > 0.005;
    case "circle":
      return roi.r > 0.005;
    case "polygon":
      return roi.closed && roi.points.length >= 3;
  }
  return false;
}
