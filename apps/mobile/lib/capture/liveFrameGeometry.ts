import type { AnalyzedSeed } from "@advance-seeds/types";

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
  const { frameWidth, frameHeight, imageWidth, imageHeight, orientation } = dims;
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

export function rotateLiveBox(
  box: AnalyzedSeed["bbox"],
  frameWidth: number,
  frameHeight: number,
  orientation: string,
): AnalyzedSeed["bbox"] {
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
