import type { AnalysisRoi, AnalysisSummary, AnalyzedSeed } from "@advance-seeds/types";
import type { PixelImage } from "./ClassicalSeedAnalyzerCore";

export const YOLO_INPUT_SIZE = 640;

export interface LetterboxResult {
  tensor: Float32Array;
  scale: number;
  padX: number;
  padY: number;
  target: number;
}

export interface RawDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  classId: number;
}

export function letterbox(pixels: PixelImage, target = YOLO_INPUT_SIZE): LetterboxResult {
  const srcW = pixels.width;
  const srcH = pixels.height;
  const scale = Math.min(target / srcW, target / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((target - newW) / 2);
  const padY = Math.floor((target - newH) / 2);

  const tensor = new Float32Array(target * target * 3);
  for (let i = 0; i < tensor.length; i++) tensor[i] = 114 / 255;

  for (let y = 0; y < newH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y / scale));
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x / scale));
      const src = (sy * srcW + sx) * 4;
      const dst = ((y + padY) * target + (x + padX)) * 3;
      tensor[dst] = pixels.data[src] / 255;
      tensor[dst + 1] = pixels.data[src + 1] / 255;
      tensor[dst + 2] = pixels.data[src + 2] / 255;
    }
  }
  return { tensor, scale, padX, padY, target };
}

/** Just the inverse-mapping params needed to project boxes back. */
export type LetterboxInverse = Pick<LetterboxResult, "scale" | "padX" | "padY" | "target">;

export interface DecodeOptions {
  letterbox: LetterboxInverse;
  scoreThreshold?: number;
  classFilter?: number[] | null;
}

export function decodeYolo(
  output: Float32Array,
  shape: readonly [number, number, number],
  options: DecodeOptions,
): RawDetection[] {
  const [, channels, anchors] = shape;
  const numClasses = channels - 4;
  const scoreThreshold = options.scoreThreshold ?? 0.25;
  const classFilter = options.classFilter ?? null;
  const { scale, padX, padY } = options.letterbox;

  const detections: RawDetection[] = [];
  for (let a = 0; a < anchors; a++) {
    let bestScore = 0;
    let bestClass = -1;
    for (let c = 0; c < numClasses; c++) {
      const v = output[(4 + c) * anchors + a];
      if (v > bestScore) {
        bestScore = v;
        bestClass = c;
      }
    }
    if (bestScore < scoreThreshold) continue;
    if (classFilter && !classFilter.includes(bestClass)) continue;

    const cx = output[0 * anchors + a];
    const cy = output[1 * anchors + a];
    const w = output[2 * anchors + a];
    const h = output[3 * anchors + a];
    const x = (cx - w / 2 - padX) / scale;
    const y = (cy - h / 2 - padY) / scale;
    const width = w / scale;
    const height = h / scale;
    if (width <= 1 || height <= 1) continue;
    detections.push({ x, y, width, height, score: bestScore, classId: bestClass });
  }
  return detections;
}

export function decodeYoloNms(
  output: Float32Array,
  shape: readonly [number, number, number],
  options: DecodeOptions,
): RawDetection[] {
  const [, maxDet, fields] = shape;
  if (fields !== 6) {
    throw new Error(`decodeYoloNms expected 6 fields per row, got ${fields}`);
  }
  const scoreThreshold = options.scoreThreshold ?? 0.25;
  const classFilter = options.classFilter ?? null;
  const { scale, padX, padY, target } = options.letterbox;

  const detections: RawDetection[] = [];
  for (let i = 0; i < maxDet; i++) {
    const base = i * 6;
    const score = output[base + 4];
    if (score < scoreThreshold) continue;
    const classId = Math.round(output[base + 5]);
    if (classFilter && !classFilter.includes(classId)) continue;
    const rawX1 = output[base + 0];
    const rawY1 = output[base + 1];
    const rawX2 = output[base + 2];
    const rawY2 = output[base + 3];
    const normalized =
      Math.max(Math.abs(rawX1), Math.abs(rawY1), Math.abs(rawX2), Math.abs(rawY2)) <= 1.5;
    const factor = normalized ? target : 1;
    const x1 = (rawX1 * factor - padX) / scale;
    const y1 = (rawY1 * factor - padY) / scale;
    const x2 = (rawX2 * factor - padX) / scale;
    const y2 = (rawY2 * factor - padY) / scale;
    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 1 || height <= 1) continue;
    detections.push({ x: x1, y: y1, width, height, score, classId });
  }
  return detections;
}

// Cached so we only log once per format change, not per inference.
let lastLoggedFormat: boolean | null = null;

export function decodeYoloSegmentationNms(
  output: Float32Array,
  shape: readonly [number, number, number],
  options: DecodeOptions,
): RawDetection[] {
  const [, maxDet, fields] = shape;
  if (fields < 6) {
    throw new Error(`decodeYoloSegmentationNms expected at least 6 fields per row, got ${fields}`);
  }
  const scoreThreshold = options.scoreThreshold ?? 0.25;
  const classFilter = options.classFilter ?? null;
  const { scale, padX, padY, target } = options.letterbox;

  // Detect bbox format. Ultralytics' standard NMS-fused export emits
  // `[x1, y1, x2, y2, conf, cls, ...masks]`, but some training/export
  // configurations emit `[cx, cy, w, h, conf, cls, ...masks]` instead.
  // Reading the wrong format gives `width = x2 - x1 ≈ 0` for real
  // detections (because cx ≈ x1+w/2 lies within w/2 of x2=w), so every
  // detection collapses to a 1–3 px nub at the top edge and gets graded
  // reject downstream. Heuristic: scan up to 64 above-threshold rows,
  // count which interpretation produces more sensible (positive,
  // non-trivial) bboxes, and use whichever wins.
  const useXyxy = pickBoxFormat(output, maxDet, fields, scoreThreshold);
  // Detect coordinate space. Standard YOLO export emits bboxes in the
  // model's input space (0..target=640). But Ultralytics' CoreML export
  // with `dynamic=True` (or some custom export configs) bake the inverse-
  // letterbox into the model graph, producing bboxes already in **source-
  // image pixel space**. Our pipeline mustn't apply letterbox-inverse a
  // second time in that case — doing so produces giant out-of-bounds
  // bboxes (e.g., values like 765 in 640-space land at -246 to +1880).
  // Heuristic: if any above-threshold row's |a|, |b|, |c|, or |d| exceeds
  // the model input size by > 10%, the model is emitting source-space
  // values and we should pass them through unchanged.
  // Source-image dims, derived from the letterbox params. Used by
  // per-row coord-space detection below.
  const srcW = scale > 0 ? Math.max(1, Math.round((target - 2 * padX) / scale)) : target;
  const srcH = scale > 0 ? Math.max(1, Math.round((target - 2 * padY) / scale)) : target;
  if (__DEV__) {
    if (lastLoggedFormat !== useXyxy) {
      lastLoggedFormat = useXyxy;
      const samples: string[] = [];
      for (let i = 0; i < maxDet && samples.length < 3; i++) {
        const base = i * fields;
        const score = output[base + 4];
        if (score < scoreThreshold) continue;
        const a = output[base + 0].toFixed(3);
        const b = output[base + 1].toFixed(3);
        const c = output[base + 2].toFixed(3);
        const d = output[base + 3].toFixed(3);
        const cls = Math.round(output[base + 5]);
        samples.push(`[${a},${b},${c},${d}] s=${score.toFixed(2)} c=${cls}`);
      }
      console.info(
        `[yolo] seg decoder format=${useXyxy ? "xyxy" : "cxywh"} ` +
          `space=per-row ` +
          `letterbox=scale${scale.toFixed(3)}/padX${padX}/padY${padY} ` +
          `srcWxH=${srcW}x${srcH} ` +
          `samples=${samples.join("|") || "<no rows above threshold>"}`,
      );
    }
  }

  const detections: RawDetection[] = [];
  for (let i = 0; i < maxDet; i++) {
    const base = i * fields;
    const score = output[base + 4];
    if (score < scoreThreshold) continue;
    const classId = Math.round(output[base + 5]);
    if (classFilter && !classFilter.includes(classId)) continue;
    const rawA = output[base + 0];
    const rawB = output[base + 1];
    const rawC = output[base + 2];
    const rawD = output[base + 3];
    // Classify the row by its **original input fields** (pre-cxywh→xyxy
    // conversion). For normalized cxywh data, post-conversion rawX2 =
    // cx + w/2 can exceed 1.5 even when all input fields are ≤ 1.0 — so
    // checking the converted values misclassifies normalized rows as
    // pixel-space, which sends them down the wrong decoding branch.
    const rowMaxAbs = Math.max(Math.abs(rawA), Math.abs(rawB), Math.abs(rawC), Math.abs(rawD));
    let rawX1: number;
    let rawY1: number;
    let rawX2: number;
    let rawY2: number;
    if (useXyxy) {
      rawX1 = rawA;
      rawY1 = rawB;
      rawX2 = rawC;
      rawY2 = rawD;
    } else {
      // [cx, cy, w, h] → [x1, y1, x2, y2] in raw (pre-letterbox-inverse) space.
      rawX1 = rawA - rawC / 2;
      rawY1 = rawB - rawD / 2;
      rawX2 = rawA + rawC / 2;
      rawY2 = rawB + rawD / 2;
    }
    // Per-row coord-space detection. Each row independently picks the
    // interpretation that fits its own value magnitudes — globalizing
    // the choice was unreliable when a few noise rows looked normalized
    // while the real detections were in pixel space (or vice versa).
    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;
    if (rowMaxAbs > target * 1.1) {
      // Source-image pixel coords (model graph already inverted letterbox).
      x1 = rawX1;
      y1 = rawY1;
      x2 = rawX2;
      y2 = rawY2;
    } else if (rowMaxAbs <= 1.5) {
      // Normalized [0,1]. Try canvas+letterbox first; if it lands the
      // bbox out of source bounds, retry as normalized-to-source.
      const ax1 = (rawX1 * target - padX) / scale;
      const ay1 = (rawY1 * target - padY) / scale;
      const ax2 = (rawX2 * target - padX) / scale;
      const ay2 = (rawY2 * target - padY) / scale;
      const aFits =
        ax1 >= -4 && ay1 >= -4 && ax2 <= srcW + 4 && ay2 <= srcH + 4 && ax2 > ax1 && ay2 > ay1;
      if (aFits) {
        x1 = ax1;
        y1 = ay1;
        x2 = ax2;
        y2 = ay2;
      } else {
        x1 = rawX1 * srcW;
        y1 = rawY1 * srcH;
        x2 = rawX2 * srcW;
        y2 = rawY2 * srcH;
      }
    } else {
      // Standard 640-canvas pixel space; apply letterbox-inverse.
      x1 = (rawX1 - padX) / scale;
      y1 = (rawY1 - padY) / scale;
      x2 = (rawX2 - padX) / scale;
      y2 = (rawY2 - padY) / scale;
    }
    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 1 || height <= 1) continue;
    detections.push({ x: x1, y: y1, width, height, score, classId });
  }
  return detections;
}

function pickBoxFormat(
  output: Float32Array,
  maxDet: number,
  fields: number,
  scoreThreshold: number,
): boolean {
  // Returns true if [x1, y1, x2, y2] interpretation is the better fit.
  //
  // NMS-fused YOLO outputs are sorted by descending score, so the **top
  // K** above-threshold rows are the real high-confidence detections.
  // Trailing rows are zeros / noise that shouldn't tilt the format
  // decision. Earlier this scanned all rows, which let occasional
  // negative-value noise rows flip live decoding from xyxy → cxywh
  // between consecutive frames — bboxes alternated between correct and
  // 3× oversized, producing the "messy live overlay" symptom.
  //
  // Sampling only the top 5 above-threshold rows is enough: by the time
  // a model emits 5 real detections at score ≥ 0.25, the format is
  // unambiguous. Negative or zero-degenerate rows after that are
  // ignored.
  const TOP_K = 5;
  let xyxyHits = 0;
  let cxywhHits = 0;
  let inspected = 0;
  for (let i = 0; i < maxDet && inspected < TOP_K; i++) {
    const base = i * fields;
    const score = output[base + 4];
    if (score < scoreThreshold) continue;
    inspected++;
    const a = output[base + 0];
    const b = output[base + 1];
    const c = output[base + 2];
    const d = output[base + 3];
    if (c > a + 1 && d > b + 1) xyxyHits++;
    const cxywhPx = c > 5 && d > 5;
    const cxywhNorm = c > 0.01 && c <= 1.5 && d > 0.01 && d <= 1.5;
    if (cxywhPx || cxywhNorm) cxywhHits++;
  }
  // Default to xyxy: it's the Ultralytics NMS-fused YOLO standard. Only
  // flip to cxywh when xyxy hits zero among the top rows — that's the
  // only signal strong enough to justify overriding the default.
  if (inspected === 0) return true;
  if (xyxyHits === 0 && cxywhHits > 0) return false;
  return true;
}

/**
 * Map a bbox from post-rotation image space (where the model produced it,
 * after Vision's orientation-aware preprocess) back to sensor-frame space
 * (the pre-rotation coordinate system DetectionOverlay projects from).
 *
 * `postW` × `postH` are the dims of the rotated image the model saw.
 * The returned bbox is in `(postH × postW)` sensor-frame space.
 *
 * Only "left" / "right" orientations are common — `up` (no rotation) and
 * `down` (180°) don't swap dims and are handled by the caller before
 * calling this helper.
 */
export function unrotateBbox(
  d: RawDetection,
  postW: number,
  postH: number,
  orientation: string,
): RawDetection {
  // `right` corresponds to the camera buffer needing a 90° clockwise
  // rotation before display. The post-image is the *rotated* result.
  // To map back: post (x, y) → sensor (y, postW - x - w).
  if (orientation === "right" || orientation === "right-mirrored") {
    return {
      ...d,
      x: d.y,
      y: postW - d.x - d.width,
      width: d.height,
      height: d.width,
    };
  }
  // `left` is 90° counter-clockwise: post (x, y) → sensor (postH - y - h, x).
  if (orientation === "left" || orientation === "left-mirrored") {
    return {
      ...d,
      x: postH - d.y - d.height,
      y: d.x,
      width: d.height,
      height: d.width,
    };
  }
  return d;
}

export function nonMaxSuppression(detections: RawDetection[], iouThreshold = 0.45): RawDetection[] {
  const sorted = detections.slice().sort((a, b) => b.score - a.score);
  const kept: RawDetection[] = [];
  const suppressed = new Uint8Array(sorted.length);
  for (let i = 0; i < sorted.length; i++) {
    if (suppressed[i]) continue;
    const a = sorted[i];
    kept.push(a);
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed[j]) continue;
      if (iou(a, sorted[j]) > iouThreshold) suppressed[j] = 1;
    }
  }
  return kept;
}

function iou(a: RawDetection, b: RawDetection) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return inter / union;
}

export interface MapOptions {
  frameWidth: number;
  frameHeight: number;
  pxPerMm: number;
  roi?: AnalysisRoi | null;
}

export function mapDetectionsToSeeds(
  detections: RawDetection[],
  options: MapOptions,
): AnalyzedSeed[] {
  const { frameWidth, frameHeight, pxPerMm, roi } = options;
  const seeds: AnalyzedSeed[] = [];
  let droppedOutOfBounds = 0;
  let droppedOutOfRoi = 0;
  let droppedTooLarge = 0;
  for (let raw of detections) {
    if (frameWidth > 0 && frameHeight > 0) {
      const originalArea = raw.width * raw.height;
      if (originalArea <= 0) {
        droppedOutOfBounds++;
        continue;
      }
      // Sanity filter: drop detections whose clipped bbox area covers
      // > 85% of the frame. Only catches the egregious "the whole image
      // is a banana" false positives that pass class filtering. Real
      // close-up banana photos legitimately fill 40-70% of the frame, so
      // the threshold has to be permissive — anything tighter would drop
      // legitimate inspections.
      const frameArea = frameWidth * frameHeight;
      const clippedX = Math.max(0, raw.x);
      const clippedY = Math.max(0, raw.y);
      const clippedRight = Math.min(frameWidth, raw.x + raw.width);
      const clippedBottom = Math.min(frameHeight, raw.y + raw.height);
      const clippedW = Math.max(0, clippedRight - clippedX);
      const clippedH = Math.max(0, clippedBottom - clippedY);
      const overlap = clippedW * clippedH;
      const visibleFraction = overlap / originalArea;
      if (visibleFraction < 0.25) {
        droppedOutOfBounds++;
        continue;
      }
      if (overlap / frameArea > 0.85) {
        droppedTooLarge++;
        continue;
      }
      raw = {
        ...raw,
        x: clippedX,
        y: clippedY,
        width: clippedW,
        height: clippedH,
      };
    }
    const d = raw;
    const centroid = {
      x: frameWidth > 0 ? (d.x + d.width / 2) / frameWidth : 0,
      y: frameHeight > 0 ? (d.y + d.height / 2) / frameHeight : 0,
    };
    if (roi && !pointInRoi(centroid, roi)) {
      droppedOutOfRoi++;
      continue;
    }
    const longPx = Math.max(d.width, d.height);
    const shortPx = Math.min(d.width, d.height);
    const length_mm = round(longPx / pxPerMm, 2);
    const width_mm = round(shortPx / pxPerMm, 2);
    const area_mm2 = round((d.width * d.height) / (pxPerMm * pxPerMm), 2);
    seeds.push({
      index: seeds.length + 1,
      length_mm,
      width_mm,
      area_mm2,
      grade: gradeSeed(length_mm, width_mm),
      defects: {},
      class_id: d.classId,
      bbox: {
        x: Math.round(d.x),
        y: Math.round(d.y),
        width: Math.round(d.width),
        height: Math.round(d.height),
      },
    });
  }
  // Diagnostic for the "no seeds saved" failure mode: tells us at a glance
  // whether the decoder produced detections at all and how many got
  // dropped by the bounds / ROI / size filters.
  if (__DEV__ && (detections.length > 0 || droppedOutOfBounds > 0 || droppedTooLarge > 0)) {
    let sample = "";
    if (detections.length > 0) {
      const d0 = detections[0];
      sample = ` first=[x${d0.x.toFixed(1)},y${d0.y.toFixed(1)},w${d0.width.toFixed(1)},h${d0.height.toFixed(1)}]`;
    }
    console.info(
      `[yolo] mapDetectionsToSeeds: in=${detections.length} kept=${seeds.length} ` +
        `dropped(oob)=${droppedOutOfBounds} dropped(roi)=${droppedOutOfRoi} ` +
        `dropped(big)=${droppedTooLarge} frame=${frameWidth}x${frameHeight}${sample}`,
    );
  }
  return seeds;
}

export function summarizeSeeds(seeds: AnalyzedSeed[]): AnalysisSummary {
  if (seeds.length === 0) {
    return { total_seeds: 0, mean_length_mm: 0, mean_width_mm: 0, mean_area_mm2: 0 };
  }
  const sum = (key: "length_mm" | "width_mm" | "area_mm2") => seeds.reduce((t, s) => t + s[key], 0);
  return {
    total_seeds: seeds.length,
    mean_length_mm: round(sum("length_mm") / seeds.length, 3),
    mean_width_mm: round(sum("width_mm") / seeds.length, 3),
    mean_area_mm2: round(sum("area_mm2") / seeds.length, 3),
  };
}

function pointInRoi(p: { x: number; y: number }, roi: AnalysisRoi): boolean {
  switch (roi.kind) {
    case "rect":
      return p.x >= roi.x && p.x <= roi.x + roi.w && p.y >= roi.y && p.y <= roi.y + roi.h;
    case "circle": {
      const dx = p.x - roi.cx;
      const dy = p.y - roi.cy;
      return dx * dx + dy * dy <= roi.r * roi.r;
    }
    case "polygon":
      if (!roi.closed || roi.points.length < 3) return true;
      return pointInPolygon(p, roi.points);
  }
}

function pointInPolygon(p: { x: number; y: number }, points: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i];
    const pj = points[j];
    const denom = pj.y - pi.y || 1e-9;
    const intersect =
      pi.y > p.y !== pj.y > p.y && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / denom + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function gradeSeed(lengthMm: number, widthMm: number): AnalyzedSeed["grade"] {
  const aspect = lengthMm / Math.max(widthMm, 0.001);
  if (lengthMm < 1 || widthMm < 0.6) return "reject";
  if (aspect > 4.5 || aspect < 1.2) return "B";
  return "A";
}

function round(value: number, digits: number) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}
