// Reconstruct a per-detection binary mask from YOLO segmentation outputs
// and trace the boundary polygon. Mirrors yoloSegMask.ts so node --test
// can exercise the linear-algebra and contour code without RN deps.
//
// The Python reference (Ultralytics) provides masks.xy ready-made; their
// internal path is: combined = coefs · prototypes, sigmoid, threshold,
// upsample to input resolution, crop with the inverse letterbox and the
// detection bbox, then trace a contour. We do the same here.
//
// Prototype tensor layouts seen in practice:
//   - TFLite (NHWC):  [1, protoH, protoW, protoC]      — channel-last
//   - PyTorch (NCHW): [1, protoC, protoH, protoW]      — channel-first
// We detect by matching the coefficient count against the shape; both
// orderings produce the same result.

/** Default mask binarization threshold; matches Ultralytics. */
export const DEFAULT_MASK_THRESHOLD = 0.5;

function sigmoid(z) {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Decode a binary mask for one detection.
 *
 * @param {object} args
 * @param {Float32Array | number[]} args.coefs Per-detection mask coefficients
 *   (length = protoChannels, typically 32).
 * @param {Float32Array | number[]} args.prototypes Flat prototype tensor.
 * @param {readonly number[]} args.protoShape Shape of the prototype tensor,
 *   either `[1, H, W, C]` (NHWC) or `[1, C, H, W]` (NCHW).
 * @param {{ x: number; y: number; width: number; height: number }} args.bbox
 *   Detection bbox in **source-image pixel space** (already inverse-letterboxed).
 * @param {number} args.srcW Source-image width in pixels.
 * @param {number} args.srcH Source-image height in pixels.
 * @param {{ scale: number; padX: number; padY: number; target: number }} args.letterbox
 *   Letterbox params used to feed the model.
 * @param {number} [args.threshold=DEFAULT_MASK_THRESHOLD]
 * @returns {{
 *   mask: Uint8Array,     // 1 inside, 0 outside; row-major; size = w * h
 *   x: number, y: number, // top-left in source-image pixel space (rounded)
 *   w: number, h: number, // bbox-aligned crop dims in source pixels
 *   pixelCount: number,
 * } | null}
 */
export function decodeMaskForDetection({
  coefs,
  prototypes,
  protoShape,
  bbox,
  srcW,
  srcH,
  letterbox,
  threshold = DEFAULT_MASK_THRESHOLD,
}) {
  const layout = pickProtoLayout(protoShape, coefs.length);
  if (!layout) return null;
  const { protoH, protoW, protoC, channelLast } = layout;

  // Crop in source-image pixel space: clamp the detection bbox to the
  // visible source rect; outside-bounds pixels are 0 by construction.
  const x0 = Math.max(0, Math.floor(bbox.x));
  const y0 = Math.max(0, Math.floor(bbox.y));
  const x1 = Math.min(srcW, Math.ceil(bbox.x + bbox.width));
  const y1 = Math.min(srcH, Math.ceil(bbox.y + bbox.height));
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  if (w === 0 || h === 0) return null;

  const { scale, padX, padY, target } = letterbox;
  const sx = (protoW / target) * scale;
  const sy = (protoH / target) * scale;
  const ox = (padX * protoW) / target;
  const oy = (padY * protoH) / target;

  const mask = new Uint8Array(w * h);
  let pixelCount = 0;

  // Bilinear sampling — read 4 adjacent proto cells weighted by the
  // pixel's fractional position instead of snapping to a single cell
  // via floor(). Sub-cell accuracy at the mask boundary; otherwise the
  // mask snaps to cell edges and the trace walks a chunky staircase.
  if (channelLast) {
    for (let py = 0; py < h; py++) {
      const sy0 = (y0 + py) * sy + oy;
      const sy0c = clamp(sy0, 0, protoH - 1);
      const ry0 = clamp(Math.floor(sy0c), 0, protoH - 1);
      const ry1 = clamp(ry0 + 1, 0, protoH - 1);
      const fy = sy0c - ry0;
      for (let px = 0; px < w; px++) {
        const sx0 = (x0 + px) * sx + ox;
        const sx0c = clamp(sx0, 0, protoW - 1);
        const rx0 = clamp(Math.floor(sx0c), 0, protoW - 1);
        const rx1 = clamp(rx0 + 1, 0, protoW - 1);
        const fx = sx0c - rx0;
        const base00 = (ry0 * protoW + rx0) * protoC;
        const base01 = (ry0 * protoW + rx1) * protoC;
        const base10 = (ry1 * protoW + rx0) * protoC;
        const base11 = (ry1 * protoW + rx1) * protoC;
        const w00 = (1 - fx) * (1 - fy);
        const w01 = fx * (1 - fy);
        const w10 = (1 - fx) * fy;
        const w11 = fx * fy;
        let acc = 0;
        for (let c = 0; c < protoC; c++) {
          const v =
            w00 * prototypes[base00 + c] +
            w01 * prototypes[base01 + c] +
            w10 * prototypes[base10 + c] +
            w11 * prototypes[base11 + c];
          acc += coefs[c] * v;
        }
        if (sigmoid(acc) > threshold) {
          mask[py * w + px] = 1;
          pixelCount++;
        }
      }
    }
  } else {
    const planeStride = protoH * protoW;
    for (let py = 0; py < h; py++) {
      const sy0 = (y0 + py) * sy + oy;
      const sy0c = clamp(sy0, 0, protoH - 1);
      const ry0 = clamp(Math.floor(sy0c), 0, protoH - 1);
      const ry1 = clamp(ry0 + 1, 0, protoH - 1);
      const fy = sy0c - ry0;
      for (let px = 0; px < w; px++) {
        const sx0 = (x0 + px) * sx + ox;
        const sx0c = clamp(sx0, 0, protoW - 1);
        const rx0 = clamp(Math.floor(sx0c), 0, protoW - 1);
        const rx1 = clamp(rx0 + 1, 0, protoW - 1);
        const fx = sx0c - rx0;
        const off00 = ry0 * protoW + rx0;
        const off01 = ry0 * protoW + rx1;
        const off10 = ry1 * protoW + rx0;
        const off11 = ry1 * protoW + rx1;
        const w00 = (1 - fx) * (1 - fy);
        const w01 = fx * (1 - fy);
        const w10 = (1 - fx) * fy;
        const w11 = fx * fy;
        let acc = 0;
        for (let c = 0; c < protoC; c++) {
          const channelBase = c * planeStride;
          const v =
            w00 * prototypes[channelBase + off00] +
            w01 * prototypes[channelBase + off01] +
            w10 * prototypes[channelBase + off10] +
            w11 * prototypes[channelBase + off11];
          acc += coefs[c] * v;
        }
        if (sigmoid(acc) > threshold) {
          mask[py * w + px] = 1;
          pixelCount++;
        }
      }
    }
  }

  return { mask, x: x0, y: y0, w, h, pixelCount };
}

function pickProtoLayout(shape, coefCount) {
  if (!shape || shape.length < 3) return null;
  // Accept rank-3 or rank-4. Strip the leading batch dim if present.
  const dims = shape[0] === 1 && shape.length === 4 ? shape.slice(1) : shape.slice();
  if (dims.length !== 3) return null;
  const [a, b, c] = dims;
  // NHWC: last dim matches coefCount.
  if (c === coefCount) {
    return { protoH: a, protoW: b, protoC: c, channelLast: true };
  }
  // NCHW: first dim matches coefCount.
  if (a === coefCount) {
    return { protoH: b, protoW: c, protoC: a, channelLast: false };
  }
  return null;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Trace the boundary of the largest connected component in a binary mask
 * and return a closed polygon. Coordinates are returned in source-image
 * pixel space (mask offsets `x0`, `y0` are added). Uses Moore-Neighbor
 * tracing with a fixed clockwise starting direction.
 *
 * For YOLO masks the largest component is typically the only one; tiny
 * speckles outside the main blob get ignored.
 */
export function extractPolygonFromMask(maskRect) {
  if (!maskRect) return [];
  const { mask, w, h, x: x0, y: y0 } = maskRect;
  if (w === 0 || h === 0) return [];

  // Connected-components labelling (4-connectivity) — keep only the
  // largest blob, so a few stray pixels can't derail the contour walk.
  const labels = new Int32Array(w * h);
  const sizes = [0]; // 1-indexed
  let nextLabel = 1;
  const stack = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || labels[idx] !== 0) continue;
      const label = nextLabel++;
      let size = 0;
      stack.push(idx);
      labels[idx] = label;
      while (stack.length) {
        const cur = stack.pop();
        size++;
        const cy = (cur / w) | 0;
        const cx = cur - cy * w;
        if (cx > 0) {
          const n = cur - 1;
          if (mask[n] && labels[n] === 0) {
            labels[n] = label;
            stack.push(n);
          }
        }
        if (cx + 1 < w) {
          const n = cur + 1;
          if (mask[n] && labels[n] === 0) {
            labels[n] = label;
            stack.push(n);
          }
        }
        if (cy > 0) {
          const n = cur - w;
          if (mask[n] && labels[n] === 0) {
            labels[n] = label;
            stack.push(n);
          }
        }
        if (cy + 1 < h) {
          const n = cur + w;
          if (mask[n] && labels[n] === 0) {
            labels[n] = label;
            stack.push(n);
          }
        }
      }
      sizes.push(size);
    }
  }
  if (nextLabel === 1) return [];
  let bestLabel = 1;
  for (let l = 2; l < sizes.length; l++) {
    if (sizes[l] > sizes[bestLabel]) bestLabel = l;
  }

  // Find a starting pixel of the chosen blob (top-left scan).
  let start = -1;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === bestLabel) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];

  // Moore-Neighbor tracing. 8-direction lookup, starting "west" of the
  // first foreground pixel and rotating clockwise.
  const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
  const DY = [0, -1, -1, -1, 0, 1, 1, 1];
  const isFg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === bestLabel;

  const startX = start % w;
  const startY = (start / w) | 0;
  const polygon = [{ x: x0 + startX + 0.5, y: y0 + startY + 0.5 }];
  let cx = startX;
  let cy = startY;
  // Initial scan = SE (5). South (6) is pathological for L-shape corners
  // where the topmost-leftmost FG pixel sits at a 2×2 corner of a larger
  // blob: the trace closes S → E → N → W back to start without escaping.
  let dir = 5;
  // Single-pixel blob: bail out with one vertex (caller will treat as < 3).
  let advanced = false;
  for (let safety = 0; safety < 4 * (w * h + 1); safety++) {
    let found = false;
    for (let step = 0; step < 8; step++) {
      const d = (dir + step) % 8;
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (isFg(nx, ny)) {
        cx = nx;
        cy = ny;
        // Next scan starts "to the right" of where we came from, in the
        // standard Moore convention.
        dir = (d + 6) % 8;
        const vx = x0 + cx + 0.5;
        const vy = y0 + cy + 0.5;
        if (
          polygon.length === 0 ||
          polygon[polygon.length - 1].x !== vx ||
          polygon[polygon.length - 1].y !== vy
        ) {
          polygon.push({ x: vx, y: vy });
        }
        found = true;
        advanced = true;
        break;
      }
    }
    if (!found) break;
    if (advanced && cx === startX && cy === startY) break;
  }
  // Drop the duplicate closing vertex (we already returned to start).
  if (polygon.length > 1) {
    const last = polygon[polygon.length - 1];
    const first = polygon[0];
    if (last.x === first.x && last.y === first.y) polygon.pop();
  }
  if (polygon.length >= 4) {
    const simplified = simplifyPolygonDP(polygon, 1.5);
    if (simplified.length >= 3) return simplified;
  }
  return polygon;
}

// Iterative Douglas-Peucker — collapses cell-resolution staircase
// artifacts into clean diagonals; preserves real corners.
function simplifyPolygonDP(poly, epsilon) {
  const n = poly.length;
  if (n < 4) return poly;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const eps2 = epsilon * epsilon;
  const stack = [[0, n - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop();
    if (hi <= lo + 1) continue;
    const a = poly[lo];
    const b = poly[hi];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let bestDist2 = -1;
    let bestIdx = lo;
    for (let i = lo + 1; i < hi; i++) {
      const p = poly[i];
      let dist2;
      if (len2 <= 1e-9) {
        const ex = p.x - a.x;
        const ey = p.y - a.y;
        dist2 = ex * ex + ey * ey;
      } else {
        const cross = (p.x - a.x) * dy - (p.y - a.y) * dx;
        dist2 = (cross * cross) / len2;
      }
      if (dist2 > bestDist2) {
        bestDist2 = dist2;
        bestIdx = i;
      }
    }
    if (bestDist2 > eps2) {
      keep[bestIdx] = 1;
      stack.push([lo, bestIdx]);
      stack.push([bestIdx, hi]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(poly[i]);
  return out;
}

/** Total mask pixel count from a decoded mask. Convenience helper. */
export function maskPixelCount(maskRect) {
  return maskRect ? maskRect.pixelCount : 0;
}
