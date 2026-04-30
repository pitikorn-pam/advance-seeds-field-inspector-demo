import * as FileSystem from "expo-file-system/legacy";
import { toByteArray } from "base64-js";
import jpeg from "jpeg-js";
import type {
  AnalysisFrameResult,
  AnalysisResult,
  AnalyzeOptions,
  Frame,
  ImageRef,
  SeedAnalyzer,
} from "@advance-seeds/types";
import { analyzePixels, downsamplePixels } from "./ClassicalSeedAnalyzerCore";
import type { PixelImage } from "./ClassicalSeedAnalyzerCore";
import { MockSeedAnalyzer } from "./MockSeedAnalyzer";

const MAX_ANALYSIS_WIDTH = 960;

export class ClassicalSeedAnalyzer implements SeedAnalyzer {
  readonly id = "classical-cv-v1";

  private readonly fallback = new MockSeedAnalyzer();

  async analyze(image: ImageRef, options: AnalyzeOptions): Promise<AnalysisResult> {
    const startedAt = Date.now();
    try {
      const decodeStartedAt = Date.now();
      const pixels = await decodeImage(image);
      const decodeMs = Date.now() - decodeStartedAt;
      const resized = downsamplePixels(pixels, {
        maxWidth: MAX_ANALYSIS_WIDTH,
        pxPerMm: options.pxPerMm,
      });
      const analyzeStartedAt = Date.now();
      const result = analyzePixels(resized.pixels, { ...options, pxPerMm: resized.pxPerMm });
      const analyzeMs = Date.now() - analyzeStartedAt;
      if (result.summary.total_seeds === 0) {
        throw new Error("No seed-like blobs detected");
      }
      console.info(
        `[analyzer] ${this.id} decode=${decodeMs}ms analyze=${analyzeMs}ms total=${Date.now() - startedAt}ms seeds=${result.summary.total_seeds} frame=${pixels.width}x${pixels.height} analysis=${resized.pixels.width}x${resized.pixels.height}`,
      );
      return result;
    } catch (err) {
      console.warn("[analyzer] classical analysis unavailable; using demo fallback", err);
      const result = await this.fallback.analyze(image, options);
      return {
        ...result,
        analyzerId: `${this.id}+fallback:${result.analyzerId}`,
      };
    }
  }

  analyzeFrame(frame: Frame, options: AnalyzeOptions): AnalysisFrameResult | null {
    return this.fallback.analyzeFrame?.(frame, options) ?? null;
  }
}

async function decodeImage(image: ImageRef): Promise<PixelImage> {
  if (image.kind === "base64") {
    return decodeJpegBase64(image.data);
  }
  if (image.kind !== "uri") {
    throw new Error(`Unsupported image ref: ${image.kind}`);
  }
  const base64 = await FileSystem.readAsStringAsync(image.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeJpegBase64(base64);
}

function decodeJpegBase64(base64: string): PixelImage {
  const bytes = toByteArray(base64);
  const decoded = jpeg.decode(bytes, { useTArray: true });
  if (!decoded.width || !decoded.height || !decoded.data) {
    throw new Error("Unable to decode JPEG pixels");
  }
  return {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data,
  };
}
