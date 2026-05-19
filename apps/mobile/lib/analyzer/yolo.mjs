// Pure helpers for YOLOv8/11 anchor-free TFLite output.
// Mirrors yolo.ts so node --test can exercise the decode/NMS/mapping logic
// without pulling in react-native-fast-tflite or expo-file-system.

import { measureInstance } from "./maskMeasurement.mjs";
import { decodeMaskForDetection, extractPolygonFromMask } from "./yoloSegMask.mjs";

export const YOLO_INPUT_SIZE = 640;

// Letterbox a packed RGBA pixel buffer into a square `target` Float32 NHWC
// tensor (values 0..1). Returns the tensor and the inverse-mapping params
// needed to project detections back to original pixel coordinates.
export function letterbox(pixels, target = YOLO_INPUT_SIZE) {
  const srcW = pixels.width;
  const srcH = pixels.height;
  const scale = Math.min(target / srcW, target / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((target - newW) / 2);
  const padY = Math.floor((target - newH) / 2);

  // Grey 114/255 padding matches Ultralytics' default letterbox color.
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

// Decode raw Ultralytics YOLOv8/11 output Float32Array.
// Expects layout `[1, channels, anchors]` where channels = 4 + numClasses
// (cx, cy, w, h, score_class0, score_class1, ...). Coordinates are in the
// model's input pixel space (e.g. 0..640).
//
// Returns boxes in original-image pixel space using the letterbox inverse.
export function decodeYolo(output, shape, options) {
  const [, channels, anchors] = shape;
  const numClasses = channels - 4;
  const scoreThreshold = options.scoreThreshold ?? 0.25;
  const classFilter = options.classFilter ?? null; // null = accept any class
  const { scale, padX, padY } = options.letterbox;

  const detections = [];
  // Output is channel-major: index for channel c, anchor a is c*anchors + a.
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

    // Invert letterbox: subtract padding, then divide by scale.
    const x = (cx - w / 2 - padX) / scale;
    const y = (cy - h / 2 - padY) / scale;
    const width = w / scale;
    const height = h / scale;
    if (width <= 1 || height <= 1) continue;

    detections.push({ x, y, width, height, score: bestScore, classId: bestClass });
  }
  return detections;
}

// Decode the post-NMS Ultralytics output (YOLO26 export format).
// Shape `[1, maxDet, 6]` where each row is `[x1, y1, x2, y2, score, classId]`
// in the model's input pixel space. NMS is already applied by the graph,
// so callers should NOT run NMS again on the result.
export function decodeYoloNms(output, shape, options) {
  const [, maxDet, fields] = shape;
  if (fields !== 6) {
    throw new Error(`decodeYoloNms expected 6 fields per row, got ${fields}`);
  }
  const scoreThreshold = options.scoreThreshold ?? 0.25;
  const classFilter = options.classFilter ?? null;
  const { scale, padX, padY, target } = options.letterbox;

  const detections = [];
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

export function decodeYoloSegmentationNms(output, shape, options) {
  const [, maxDet, fields] = shape;
  if (fields < 6) {
    throw new Error(`decodeYoloSegmentationNms expected at least 6 fields per row, got ${fields}`);
  }
  const scoreThreshold = options.scoreThreshold ?? 0.25;
  const classFilter = options.classFilter ?? null;
  const { scale, padX, padY, target } = options.letterbox;

  const detections = [];
  for (let i = 0; i < maxDet; i++) {
    const base = i * fields;
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
    // Capture trailing mask coefficients (typically 32) so the post-decode
    // mask pipeline can reconstruct a per-instance binary mask.
    const coefCount = fields - 6;
    let maskCoefs;
    if (coefCount > 0) {
      maskCoefs = new Float32Array(coefCount);
      for (let c = 0; c < coefCount; c++) maskCoefs[c] = output[base + 6 + c];
    }
    detections.push({ x: x1, y: y1, width, height, score, classId, maskCoefs });
  }
  return detections;
}

// Mirror of attachSegmentationPolygons in yolo.ts. Mutates each detection
// by adding `polygon` and `maskPixelCount` when the mask decode succeeds.
export function attachSegmentationPolygons(detections, options) {
  const { prototypes, protoShape, letterbox, srcWidth, srcHeight, maskThreshold } = options;
  for (const d of detections) {
    if (!d.maskCoefs) continue;
    const maskRect = decodeMaskForDetection({
      coefs: d.maskCoefs,
      prototypes,
      protoShape,
      bbox: { x: d.x, y: d.y, width: d.width, height: d.height },
      srcW: srcWidth,
      srcH: srcHeight,
      letterbox,
      threshold: maskThreshold,
    });
    if (!maskRect) continue;
    const polygon = extractPolygonFromMask(maskRect);
    if (polygon.length >= 3) {
      d.polygon = polygon;
      d.maskPixelCount = maskRect.pixelCount;
    }
  }
}

export function nonMaxSuppression(detections, iouThreshold = 0.45) {
  const sorted = detections.slice().sort((a, b) => b.score - a.score);
  const kept = [];
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

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return inter / union;
}

// Convert raw detections (in original-image pixel space) into AnalyzedSeed
// rows. Filters by ROI on the centroid (normalized 0..1 coords) and converts
// pixel dimensions to mm using the supplied pxPerMm.
export function mapDetectionsToSeeds(detections, options) {
  const { frameWidth, frameHeight, pxPerMm, roi } = options;
  const seeds = [];
  for (const d of detections) {
    const centroid = {
      x: frameWidth > 0 ? (d.x + d.width / 2) / frameWidth : 0,
      y: frameHeight > 0 ? (d.y + d.height / 2) / frameHeight : 0,
    };
    if (roi && !pointInRoi(centroid, roi)) continue;
    // Segment-based measurement when the decoder reconstructed a mask
    // polygon. Mirrors `measure_instance` from run_segmentation.py: the
    // min-area rotated rect supplies length/width, the mask pixel count
    // supplies area. Falls back to bbox-rect math for detection-only
    // outputs.
    let length_mm;
    let width_mm;
    let area_mm2;
    let mask;
    if (d.polygon && d.polygon.length >= 3 && pxPerMm > 0) {
      const measured = measureInstance(d.polygon, {
        maskPixelCount: d.maskPixelCount,
        pxPerMm,
      });
      length_mm = round(measured.length_mm ?? 0, 2);
      width_mm = round(measured.width_mm ?? 0, 2);
      area_mm2 = round(measured.area_mm2 ?? 0, 2);
      mask = {
        polygon: d.polygon.map((p) => ({ x: p.x, y: p.y })),
        area_px: measured.area_px ?? 0,
        length_px: measured.length_px ?? 0,
        width_px: measured.width_px ?? 0,
        perimeter_px: measured.perimeter_px ?? 0,
        aspect_ratio: measured.aspect_ratio ?? 0,
        circularity: measured.circularity ?? 0,
        angle_deg: measured.angle_deg ?? 0,
      };
    } else {
      const longPx = Math.max(d.width, d.height);
      const shortPx = Math.min(d.width, d.height);
      length_mm = round(longPx / pxPerMm, 2);
      width_mm = round(shortPx / pxPerMm, 2);
      area_mm2 = round((d.width * d.height) / (pxPerMm * pxPerMm), 2);
    }
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
      ...(mask ? { mask } : null),
    });
  }
  return seeds;
}

export function summarizeSeeds(seeds) {
  if (seeds.length === 0) {
    return { total_seeds: 0, mean_length_mm: 0, mean_width_mm: 0, mean_area_mm2: 0 };
  }
  const sum = (key) => seeds.reduce((t, s) => t + s[key], 0);
  return {
    total_seeds: seeds.length,
    mean_length_mm: round(sum("length_mm") / seeds.length, 3),
    mean_width_mm: round(sum("width_mm") / seeds.length, 3),
    mean_area_mm2: round(sum("area_mm2") / seeds.length, 3),
  };
}

function pointInRoi(p, roi) {
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
  return true;
}

function pointInPolygon(p, points) {
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

function gradeSeed(lengthMm, widthMm) {
  const aspect = lengthMm / Math.max(widthMm, 0.001);
  if (lengthMm < 1 || widthMm < 0.6) return "reject";
  if (aspect > 4.5 || aspect < 1.2) return "B";
  return "A";
}

function round(value, digits) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}
