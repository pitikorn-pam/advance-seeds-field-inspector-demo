import type { AnalyzedSeed } from "@advance-seeds/types";

function normalizeFrameOrientation(orientation: string | null | undefined): string {
  const value = (orientation ?? "up").toLowerCase().replace(/_/g, "-");
  const mirrored = value.endsWith("-mirrored") ? "-mirrored" : "";
  const base = mirrored ? value.slice(0, -"-mirrored".length) : value;
  switch (base) {
    case "portrait":
    case "portrait-up":
    case "up":
      return `up${mirrored}`;
    case "portrait-down":
    case "portrait-upside-down":
    case "upside-down":
    case "down":
      return `down${mirrored}`;
    case "landscape-left":
    case "left":
      return `left${mirrored}`;
    case "landscape-right":
    case "right":
      return `right${mirrored}`;
    default:
      return value || "up";
  }
}

export function orientLiveSeeds(
  seeds: readonly AnalyzedSeed[],
  dims: {
    frameWidth: number;
    frameHeight: number;
    imageWidth: number;
    imageHeight: number;
    orientation: string;
  },
): AnalyzedSeed[] {
  const { frameWidth, frameHeight, imageWidth, imageHeight } = dims;
  const orientation = normalizeFrameOrientation(dims.orientation);
  const rotates =
    orientation === "left" ||
    orientation === "right" ||
    orientation === "left-mirrored" ||
    orientation === "right-mirrored";
  const orientedWidth = rotates ? frameHeight : frameWidth;
  const orientedHeight = rotates ? frameWidth : frameHeight;
  const scaleX = imageWidth / orientedWidth;
  const scaleY = imageHeight / orientedHeight;
  return seeds.map((seed, index) => {
    const box = rotateLiveBox(seed.bbox, frameWidth, frameHeight, orientation);
    return {
      ...seed,
      index: index + 1,
      bbox: {
        x: Math.round(box.x * scaleX),
        y: Math.round(box.y * scaleY),
        width: Math.round(box.width * scaleX),
        height: Math.round(box.height * scaleY),
      },
      ...(seed.mask?.polygon?.length
        ? {
            mask: {
              ...seed.mask,
              polygon: seed.mask.polygon.map((point) => {
                const p = rotateLivePoint(point.x, point.y, frameWidth, frameHeight, orientation);
                return { x: p.x * scaleX, y: p.y * scaleY };
              }),
            },
          }
        : null),
    };
  });
}

export function graftLiveMasksOntoAnalysisSeeds(
  analysisSeeds: readonly AnalyzedSeed[],
  liveSeeds: readonly AnalyzedSeed[] | null | undefined,
): AnalyzedSeed[] | null {
  if (!analysisSeeds.length || !liveSeeds?.length) return null;
  const liveMasks = liveSeeds.filter((seed) => seed.mask?.polygon && seed.mask.polygon.length >= 3);
  if (!liveMasks.length) return null;
  const used = new Set<number>();
  let changed = false;
  const seeds = analysisSeeds.map((seed) => {
    if (seed.mask?.polygon && seed.mask.polygon.length >= 3) return seed;
    const match = bestLiveMaskMatch(seed, liveMasks, used);
    if (!match?.mask?.polygon || !isUsableBox(match.bbox) || !isUsableBox(seed.bbox)) return seed;
    used.add(match.index);
    changed = true;
    return {
      ...seed,
      mask: {
        ...match.mask,
        polygon: match.mask.polygon.map((point) => ({
          x: seed.bbox.x + ((point.x - match.bbox.x) / match.bbox.width) * seed.bbox.width,
          y: seed.bbox.y + ((point.y - match.bbox.y) / match.bbox.height) * seed.bbox.height,
        })),
      },
    };
  });
  return changed ? seeds : null;
}

export function rotateLiveBox(
  box: AnalyzedSeed["bbox"],
  frameWidth: number,
  frameHeight: number,
  orientation: string,
): AnalyzedSeed["bbox"] {
  orientation = normalizeFrameOrientation(orientation);
  if (orientation === "right" || orientation === "right-mirrored") {
    return {
      x: frameHeight - box.y - box.height,
      y: box.x,
      width: box.height,
      height: box.width,
    };
  }
  if (orientation === "left" || orientation === "left-mirrored") {
    return {
      x: box.y,
      y: frameWidth - box.x - box.width,
      width: box.height,
      height: box.width,
    };
  }
  if (orientation === "down" || orientation === "down-mirrored") {
    return {
      x: frameWidth - box.x - box.width,
      y: frameHeight - box.y - box.height,
      width: box.width,
      height: box.height,
    };
  }
  return box;
}

export function rotateLivePoint(
  x: number,
  y: number,
  frameWidth: number,
  frameHeight: number,
  orientation: string,
): { x: number; y: number } {
  orientation = normalizeFrameOrientation(orientation);
  if (orientation === "right" || orientation === "right-mirrored") {
    return { x: frameHeight - y, y: x };
  }
  if (orientation === "left" || orientation === "left-mirrored") {
    return { x: y, y: frameWidth - x };
  }
  if (orientation === "down" || orientation === "down-mirrored") {
    return { x: frameWidth - x, y: frameHeight - y };
  }
  return { x, y };
}

function bestLiveMaskMatch(
  seed: AnalyzedSeed,
  liveMasks: AnalyzedSeed[],
  used: Set<number>,
): AnalyzedSeed | null {
  let best: AnalyzedSeed | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const live of liveMasks) {
    if (used.has(live.index)) continue;
    if (
      typeof seed.class_id === "number" &&
      typeof live.class_id === "number" &&
      seed.class_id !== live.class_id
    ) {
      continue;
    }
    const overlap = bboxIou(seed.bbox, live.bbox);
    const centerDistance = normalizedCenterDistance(seed.bbox, live.bbox);
    const sizeDelta =
      Math.abs(seed.bbox.width - live.bbox.width) / Math.max(1, live.bbox.width) +
      Math.abs(seed.bbox.height - live.bbox.height) / Math.max(1, live.bbox.height);
    const measurementDelta =
      (Math.abs((seed.length_mm || 0) - (live.length_mm || 0)) +
        Math.abs((seed.width_mm || 0) - (live.width_mm || 0))) /
      Math.max(1, (live.length_mm || 0) + (live.width_mm || 0));
    const score = centerDistance * 3 + sizeDelta + measurementDelta - overlap * 2;
    if (score < bestScore) {
      best = live;
      bestScore = score;
    }
  }
  return best;
}

function isUsableBox(box: AnalyzedSeed["bbox"]): boolean {
  return box.width > 1 && box.height > 1;
}

function bboxIou(a: AnalyzedSeed["bbox"], b: AnalyzedSeed["bbox"]): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function normalizedCenterDistance(a: AnalyzedSeed["bbox"], b: AnalyzedSeed["bbox"]): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  const normalizer = Math.max(
    1,
    Math.hypot(Math.max(a.width, b.width), Math.max(a.height, b.height)),
  );
  return Math.hypot(ax - bx, ay - by) / normalizer;
}
