import { Image } from "react-native";
import type { AnalysisFrameResult, AnalysisResult } from "@advance-seeds/types";
import { graftLiveMasksOntoAnalysisSeeds, orientLiveSeeds } from "./liveFrameGeometry";

export async function liveFrameFallbackResult(
  frameResult: AnalysisFrameResult | null,
  imageUri: string,
): Promise<AnalysisResult | null> {
  if (!frameResult || frameResult.seeds.length === 0) return null;
  const frameWidth = frameResult.frameWidth ?? 0;
  const frameHeight = frameResult.frameHeight ?? 0;
  if (frameWidth <= 0 || frameHeight <= 0) return null;
  const image = await getImageDimensions(imageUri);
  const oriented = orientLiveSeeds(frameResult.seeds, {
    frameWidth,
    frameHeight,
    imageWidth: image.width,
    imageHeight: image.height,
    orientation: frameResult.frameOrientation ?? "up",
  });
  return {
    analyzerId: `${frameResult.analyzerId}+shutter-fallback`,
    durationMs: 0,
    seeds: oriented,
    summary: {
      total_seeds: oriented.length,
      mean_length_mm: frameResult.summary.mean_length_mm,
      mean_width_mm: frameResult.summary.mean_width_mm,
      mean_area_mm2: frameResult.summary.mean_area_mm2,
    },
  };
}

export function graftLiveMasksOntoAnalysis(
  analysis: AnalysisResult,
  liveFrame: AnalysisFrameResult | null,
  image: { width: number | null; height: number | null },
): AnalysisResult | null {
  const frameWidth = liveFrame?.frameWidth ?? 0;
  const frameHeight = liveFrame?.frameHeight ?? 0;
  if (!liveFrame || frameWidth <= 0 || frameHeight <= 0 || !image.width || !image.height) {
    return null;
  }
  const orientedLiveSeeds = orientLiveSeeds(liveFrame.seeds, {
    frameWidth,
    frameHeight,
    imageWidth: image.width,
    imageHeight: image.height,
    orientation: liveFrame.frameOrientation ?? "up",
  });
  const seeds = graftLiveMasksOntoAnalysisSeeds(analysis.seeds, orientedLiveSeeds);
  if (!seeds) return null;
  return {
    ...analysis,
    analyzerId: `${analysis.analyzerId}+live-mask-graft`,
    seeds,
  };
}

function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });
}
