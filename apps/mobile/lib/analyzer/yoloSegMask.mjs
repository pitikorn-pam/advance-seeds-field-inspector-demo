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

  // Inline the proto offset math by layout to avoid a per-pixel branch.
  if (channelLast) {
    for (let py = 0; py < h; py++) {
      const sy0 = (y0 + py) * sy + oy;
      const ry = clamp(Math.floor(sy0), 0, protoH - 1);
      const protoRow = ry * protoW * protoC;
      for (let px = 0; px < w; px++) {
        const sx0 = (x0 + px) * sx + ox;
        const rx = clamp(Math.floor(sx0), 0, protoW - 1);
        const base = protoRow + rx * protoC;
        let acc = 0;
        for (let c = 0; c < protoC; c++) acc += coefs[c] * prototypes[base + c];
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
      const ry = clamp(Math.floor(sy0), 0, protoH - 1);
      const rowOff = ry * protoW;
      for (let px = 0; px < w; px++) {
        const sx0 = (x0 + px) * sx + ox;
        const rx = clamp(Math.floor(sx0), 0, protoW - 1);
        const off = rowOff + rx;
        let acc = 0;
        for (let c = 0; c < protoC; c++) acc += coefs[c] * prototypes[c * planeStride + off];
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
  let dir = 6; // came from "south" → start scanning at south-west neighbour.
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
  return polygon;
}

/** Total mask pixel count from a decoded mask. Convenience helper. */
export function maskPixelCount(maskRect) {
  return maskRect ? maskRect.pixelCount : 0;
}
