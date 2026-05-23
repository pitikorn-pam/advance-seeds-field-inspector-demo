import type { AnalysisFrameResult, AnalyzedSeed } from "@advance-seeds/types";
import { summarizeSeeds } from "@/lib/analyzer/yolo";
import { normalizeFrameOrientation } from "@/lib/capture/frameOrientation";
import type { Roi } from "@/lib/capture/roi";

export function filterFrameResultToStageRoi(
  frameResult: AnalysisFrameResult | null,
  roi: Roi | null,
  stage: { width: number; height: number } | null,
): AnalysisFrameResult | null {
  if (!frameResult || !roi || !stage || stage.width <= 0 || stage.height <= 0) {
    return frameResult;
  }
  const frameWidth = frameResult.frameWidth ?? 0;
  const frameHeight = frameResult.frameHeight ?? 0;
  if (frameWidth <= 0 || frameHeight <= 0) return frameResult;
  const seeds = frameResult.seeds.filter((seed) =>
    seedWithinStageRoi(seed, {
      frameWidth,
      frameHeight,
      stageWidth: stage.width,
      stageHeight: stage.height,
      orientation: normalizeFrameOrientation(frameResult.frameOrientation),
      roi,
    }),
  );
  return {
    ...frameResult,
    seeds,
    summary: summarizeSeeds(seeds),
  };
}

function seedWithinStageRoi(
  seed: AnalyzedSeed,
  options: {
    frameWidth: number;
    frameHeight: number;
    stageWidth: number;
    stageHeight: number;
    orientation: ReturnType<typeof normalizeFrameOrientation>;
    roi: Roi;
  },
): boolean {
  const { frameWidth, frameHeight, stageWidth, stageHeight, orientation, roi } = options;
  const isRotated =
    orientation === "left" ||
    orientation === "right" ||
    orientation === "left-mirrored" ||
    orientation === "right-mirrored";
  const dispW = isRotated ? frameHeight : frameWidth;
  const dispH = isRotated ? frameWidth : frameHeight;
  const scale = Math.max(stageWidth / dispW, stageHeight / dispH);
  const dx = (dispW * scale - stageWidth) / 2;
  const dy = (dispH * scale - stageHeight) / 2;
  const toStageNorm = (sensorPoint: { x: number; y: number }) => {
    const display = rotatePoint(sensorPoint.x, sensorPoint.y, dispW, dispH, orientation);
    return {
      x: (display.x * scale - dx) / stageWidth,
      y: (display.y * scale - dy) / stageHeight,
    };
  };

  const center = toStageNorm({
    x: seed.bbox.x + seed.bbox.width / 2,
    y: seed.bbox.y + seed.bbox.height / 2,
  });
  if (pointInRoi(center, roi, stageWidth, stageHeight)) return true;

  const polygon = seed.mask?.polygon;
  if (polygon && polygon.length >= 3) {
    const samples = polygon.map(toStageNorm);
    const centroid = pointsCentroid(samples);
    if (pointInRoi(centroid, roi, stageWidth, stageHeight)) return true;
    return sampleOverlap(samples, roi, stageWidth, stageHeight) >= 0.55;
  }

  return sampleOverlap(bboxSamples(seed).map(toStageNorm), roi, stageWidth, stageHeight) >= 0.55;
}

function rotatePoint(
  sx: number,
  sy: number,
  dispW: number,
  dispH: number,
  orientation: ReturnType<typeof normalizeFrameOrientation>,
): { x: number; y: number } {
  if (orientation === "left" || orientation === "left-mirrored") {
    return { x: dispW - sy, y: sx };
  }
  if (orientation === "right" || orientation === "right-mirrored") {
    return { x: sy, y: dispH - sx };
  }
  if (orientation === "down" || orientation === "down-mirrored") {
    return { x: dispW - sx, y: dispH - sy };
  }
  return { x: sx, y: sy };
}

function bboxSamples(seed: AnalyzedSeed): Array<{ x: number; y: number }> {
  const xs = [seed.bbox.x, seed.bbox.x + seed.bbox.width / 2, seed.bbox.x + seed.bbox.width];
  const ys = [seed.bbox.y, seed.bbox.y + seed.bbox.height / 2, seed.bbox.y + seed.bbox.height];
  const samples: Array<{ x: number; y: number }> = [];
  for (const y of ys) {
    for (const x of xs) {
      samples.push({ x, y });
    }
  }
  return samples;
}

function pointsCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function sampleOverlap(
  points: Array<{ x: number; y: number }>,
  roi: Roi,
  stageWidth: number,
  stageHeight: number,
): number {
  if (points.length === 0) return 0;
  const inside = points.reduce(
    (count, point) => count + (pointInRoi(point, roi, stageWidth, stageHeight) ? 1 : 0),
    0,
  );
  return inside / points.length;
}

function pointInRoi(
  point: { x: number; y: number },
  roi: Roi,
  stageWidth: number,
  stageHeight: number,
): boolean {
  switch (roi.kind) {
    case "rect":
      return (
        point.x >= roi.x && point.x <= roi.x + roi.w && point.y >= roi.y && point.y <= roi.y + roi.h
      );
    case "circle": {
      const dx = (point.x - roi.cx) * stageWidth;
      const dy = (point.y - roi.cy) * stageHeight;
      const radius = roi.r * Math.min(stageWidth, stageHeight);
      return dx * dx + dy * dy <= radius * radius;
    }
    case "polygon":
      if (!roi.closed || roi.points.length < 3) return true;
      return pointInPolygon(point, roi.points);
  }
}

function pointInPolygon(point: { x: number; y: number }, points: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i];
    const pj = points[j];
    const denom = pj.y - pi.y || 1e-9;
    const intersect =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / denom + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}
