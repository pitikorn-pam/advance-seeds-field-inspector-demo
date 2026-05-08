import type { AnalysisResult, AnalysisRoi, AnalyzedSeed } from "@advance-seeds/types";
import type { SeedGradingConfig } from "@advance-seeds/types";
import { gradeSeedByConfig } from "./grading";

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8Array;
}

interface CoreOptions {
  pxPerMm: number;
  roi?: AnalysisRoi | null;
  gradingConfig?: SeedGradingConfig | null;
}

const MIN_COMPONENT_PIXELS = 24;
const MAX_COMPONENT_FRAME_RATIO = 0.45;
const FOREGROUND_DELTA = 42;

export function downsamplePixels(
  pixels: PixelImage,
  options: { maxWidth: number; pxPerMm: number },
): { pixels: PixelImage; pxPerMm: number; scale: number } {
  const maxWidth = options.maxWidth;
  if (!maxWidth || pixels.width <= maxWidth) {
    return { pixels, pxPerMm: options.pxPerMm, scale: 1 };
  }
  const scale = maxWidth / pixels.width;
  const width = Math.max(1, Math.round(pixels.width * scale));
  const height = Math.max(1, Math.round(pixels.height * scale));
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(pixels.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(pixels.width - 1, Math.floor(x / scale));
      const source = (sourceY * pixels.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      data[target] = pixels.data[source];
      data[target + 1] = pixels.data[source + 1];
      data[target + 2] = pixels.data[source + 2];
      data[target + 3] = pixels.data[source + 3];
    }
  }

  return {
    pixels: { width, height, data },
    pxPerMm: options.pxPerMm * scale,
    scale,
  };
}

export function analyzePixels(pixels: PixelImage, options: CoreOptions): AnalysisResult {
  const startedAt = Date.now();
  const { width, height, data } = pixels;
  const pxPerMm = Math.max(options.pxPerMm || 1, 0.001);
  const background = estimateBackgroundLuma(pixels);
  const visited = new Uint8Array(width * height);
  const seeds: AnalyzedSeed[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * width + x;
      if (visited[offset] || !isForeground(data, offset, background)) continue;
      const component = floodFill(pixels, visited, x, y, background);
      if (!component) continue;
      const bbox = {
        x: component.minX,
        y: component.minY,
        width: component.maxX - component.minX + 1,
        height: component.maxY - component.minY + 1,
      };
      if (options.roi && !pointInRoi(normalizeCentroid(bbox, width, height), options.roi)) {
        continue;
      }
      const longPx = Math.max(bbox.width, bbox.height);
      const shortPx = Math.min(bbox.width, bbox.height);
      const length_mm = round(longPx / pxPerMm, 2);
      const width_mm = round(shortPx / pxPerMm, 2);
      const area_mm2 = round(component.count / (pxPerMm * pxPerMm), 2);
      seeds.push({
        index: seeds.length + 1,
        length_mm,
        width_mm,
        area_mm2,
        grade: gradeSeedByConfig(length_mm, width_mm, options.gradingConfig),
        defects: {},
        bbox,
      });
    }
  }

  return {
    analyzerId: "classical-cv-v1",
    durationMs: Date.now() - startedAt,
    seeds,
    summary: summarize(seeds),
  };
}

function floodFill(
  pixels: PixelImage,
  visited: Uint8Array,
  startX: number,
  startY: number,
  background: number,
) {
  const { width, height, data } = pixels;
  const stack: Array<[number, number]> = [[startX, startY]];
  let count = 0;
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const offset = y * width + x;
    if (visited[offset]) continue;
    visited[offset] = 1;
    if (!isForeground(data, offset, background)) continue;
    count++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const framePixels = width * height;
  if (count < MIN_COMPONENT_PIXELS || count > framePixels * MAX_COMPONENT_FRAME_RATIO) return null;
  return { count, minX, maxX, minY, maxY };
}

function estimateBackgroundLuma({ width, height, data }: PixelImage) {
  const samples: number[] = [];
  const push = (x: number, y: number) => samples.push(luma(data, y * width + x));
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 24))) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 24))) {
    push(0, y);
    push(width - 1, y);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

function isForeground(data: Uint8Array, pixelOffset: number, background: number) {
  const lum = luma(data, pixelOffset);
  const color = chroma(data, pixelOffset);
  return Math.abs(lum - background) >= FOREGROUND_DELTA && lum > 35 && color > 16;
}

function luma(data: Uint8Array, pixelOffset: number) {
  const i = pixelOffset * 4;
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}

function chroma(data: Uint8Array, pixelOffset: number) {
  const i = pixelOffset * 4;
  const max = Math.max(data[i], data[i + 1], data[i + 2]);
  const min = Math.min(data[i], data[i + 1], data[i + 2]);
  return max - min;
}

function normalizeCentroid(
  bbox: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
) {
  return {
    x: frameWidth > 0 ? (bbox.x + bbox.width / 2) / frameWidth : 0,
    y: frameHeight > 0 ? (bbox.y + bbox.height / 2) / frameHeight : 0,
  };
}

function pointInRoi(p: { x: number; y: number }, roi: AnalysisRoi) {
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

function summarize(seeds: AnalyzedSeed[]): AnalysisResult["summary"] {
  if (seeds.length === 0) {
    return { total_seeds: 0, mean_length_mm: 0, mean_width_mm: 0, mean_area_mm2: 0 };
  }
  const sum = (key: "length_mm" | "width_mm" | "area_mm2") =>
    seeds.reduce((total, seed) => total + seed[key], 0);
  return {
    total_seeds: seeds.length,
    mean_length_mm: round(sum("length_mm") / seeds.length, 3),
    mean_width_mm: round(sum("width_mm") / seeds.length, 3),
    mean_area_mm2: round(sum("area_mm2") / seeds.length, 3),
  };
}

function round(value: number, digits: number) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}
