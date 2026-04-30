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
  const { scale, padX, padY } = options.letterbox;

  const detections: RawDetection[] = [];
  for (let i = 0; i < maxDet; i++) {
    const base = i * 6;
    const score = output[base + 4];
    if (score < scoreThreshold) continue;
    const classId = Math.round(output[base + 5]);
    if (classFilter && !classFilter.includes(classId)) continue;
    const x1 = (output[base + 0] - padX) / scale;
    const y1 = (output[base + 1] - padY) / scale;
    const x2 = (output[base + 2] - padX) / scale;
    const y2 = (output[base + 3] - padY) / scale;
    const width = x2 - x1;
    const height = y2 - y1;
    if (width <= 1 || height <= 1) continue;
    detections.push({ x: x1, y: y1, width, height, score, classId });
  }
  return detections;
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
  for (const d of detections) {
    const centroid = {
      x: frameWidth > 0 ? (d.x + d.width / 2) / frameWidth : 0,
      y: frameHeight > 0 ? (d.y + d.height / 2) / frameHeight : 0,
    };
    if (roi && !pointInRoi(centroid, roi)) continue;
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
