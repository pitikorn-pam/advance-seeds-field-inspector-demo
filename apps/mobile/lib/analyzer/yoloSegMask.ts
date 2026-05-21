// Reconstruct a per-detection binary mask from YOLO segmentation outputs
// and trace the boundary polygon. The `.mjs` sibling carries the exact
// same logic so node --test can exercise the linear-algebra and contour
// code without RN deps.
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

import type { LetterboxInverse } from "./yolo";
import type { Point } from "./maskMeasurement";

export const DEFAULT_MASK_THRESHOLD = 0.5;

export interface MaskRect {
  mask: Uint8Array;
  /** Top-left in source-image pixel space (rounded inward). */
  x: number;
  y: number;
  w: number;
  h: number;
  pixelCount: number;
}

export interface DecodeMaskArgs {
  coefs: Float32Array | readonly number[];
  prototypes: Float32Array | readonly number[];
  protoShape: readonly number[];
  bbox: { x: number; y: number; width: number; height: number };
  srcW: number;
  srcH: number;
  letterbox: LetterboxInverse;
  threshold?: number;
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface ProtoLayout {
  protoH: number;
  protoW: number;
  protoC: number;
  channelLast: boolean;
}

function pickProtoLayout(shape: readonly number[], coefCount: number): ProtoLayout | null {
  if (!shape || shape.length < 3) return null;
  const dims = shape[0] === 1 && shape.length === 4 ? shape.slice(1) : shape.slice();
  if (dims.length !== 3) return null;
  const [a, b, c] = dims;
  if (c === coefCount) {
    return { protoH: a, protoW: b, protoC: c, channelLast: true };
  }
  if (a === coefCount) {
    return { protoH: b, protoW: c, protoC: a, channelLast: false };
  }
  return null;
}

export function decodeMaskForDetection(args: DecodeMaskArgs): MaskRect | null {
  const {
    coefs,
    prototypes,
    protoShape,
    bbox,
    srcW,
    srcH,
    letterbox,
    threshold = DEFAULT_MASK_THRESHOLD,
  } = args;
  const layout = pickProtoLayout(protoShape, coefs.length);
  if (!layout) return null;
  const { protoH, protoW, protoC, channelLast } = layout;

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

/**
 * Trace the boundary of the largest connected component in a binary mask
 * and return a closed polygon. Coordinates are returned in source-image
 * pixel space (mask offsets `x`, `y` are added). Uses Moore-Neighbor
 * tracing with a fixed clockwise starting direction.
 */
export function extractPolygonFromMask(maskRect: MaskRect | null): Point[] {
  if (!maskRect) return [];
  const { mask, w, h, x: x0, y: y0 } = maskRect;
  if (w === 0 || h === 0) return [];

  const labels = new Int32Array(w * h);
  const sizes: number[] = [0];
  let nextLabel = 1;
  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || labels[idx] !== 0) continue;
      const label = nextLabel++;
      let size = 0;
      stack.push(idx);
      labels[idx] = label;
      while (stack.length) {
        const cur = stack.pop()!;
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

  let start = -1;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === bestLabel) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];

  const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
  const DY = [0, -1, -1, -1, 0, 1, 1, 1];
  const isFg = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === bestLabel;

  const startX = start % w;
  const startY = (start / w) | 0;
  const polygon: Point[] = [{ x: x0 + startX + 0.5, y: y0 + startY + 0.5 }];
  let cx = startX;
  let cy = startY;
  // Initial scan direction = SE (5). South (6) is pathological for the
  // common case where the topmost-leftmost FG pixel sits at the corner
  // of a larger blob — the trace goes S → E → N → W and closes a
  // 4-pixel loop back to start without ever turning right onto the
  // actual boundary. SE represents "we entered from BG to the west;
  // scan clockwise starting at the diagonal".
  let dir = 5;
  let advanced = false;
  const safetyLimit = 4 * (w * h + 1);
  for (let safety = 0; safety < safetyLimit; safety++) {
    let found = false;
    for (let step = 0; step < 8; step++) {
      const d = (dir + step) % 8;
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (isFg(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = (d + 6) % 8;
        const vx = x0 + cx + 0.5;
        const vy = y0 + cy + 0.5;
        const last = polygon[polygon.length - 1];
        if (!last || last.x !== vx || last.y !== vy) polygon.push({ x: vx, y: vy });
        found = true;
        advanced = true;
        break;
      }
    }
    if (!found) break;
    if (advanced && cx === startX && cy === startY) break;
  }
  if (polygon.length > 1) {
    const last = polygon[polygon.length - 1];
    const first = polygon[0];
    if (last.x === first.x && last.y === first.y) polygon.pop();
  }
  return polygon;
}

export function maskPixelCount(maskRect: MaskRect | null): number {
  return maskRect ? maskRect.pixelCount : 0;
}
