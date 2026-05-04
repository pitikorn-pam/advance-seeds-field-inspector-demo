import { Image } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

const DEFAULT_MAX_LONG_EDGE = 2048;
const DEFAULT_QUALITY = 0.85;

interface OptimizationOptions {
  /** Cap the long edge in pixels. iPhone 4032×3024 → 2048×1536 by default. */
  maxLongEdge?: number;
  /** JPEG quality 0..1. 0.85 is a sweet spot — visually identical to 1.0,
   *  ~30–40% smaller bytes than the source. */
  quality?: number;
}

/**
 * Optimize a captured/extracted JPEG before upload. Resizes to fit
 * within `maxLongEdge` if larger, re-encodes as JPEG at the given
 * quality. Returns the new file URI + before/after byte sizes for
 * logging. Falls back to the original URI on any error so we never
 * block a save on optimization.
 *
 * Used by the post-capture upload pipeline for both single-shot photos
 * and video thumbnails. Saved with a deterministic ".opt.jpg" suffix
 * so the source file is preserved (recoverable if optimization went
 * sideways during a debug session).
 */
export async function optimizeImageForUpload(
  uri: string,
  options: OptimizationOptions = {},
): Promise<{ uri: string; originalBytes: number; optimizedBytes: number }> {
  const maxLongEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;

  const originalInfo = await FileSystem.getInfoAsync(uri).catch(() => null);
  const originalBytes =
    originalInfo && originalInfo.exists && typeof originalInfo.size === "number"
      ? originalInfo.size
      : 0;

  try {
    const { width, height } = await getImageDimensions(uri);
    const longEdge = Math.max(width, height);

    const ctx = ImageManipulator.manipulate(uri);
    if (longEdge > maxLongEdge) {
      const scale = maxLongEdge / longEdge;
      ctx.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
    }
    const ref = await ctx.renderAsync();
    const result = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });

    const optimizedInfo = await FileSystem.getInfoAsync(result.uri).catch(() => null);
    const optimizedBytes =
      optimizedInfo && optimizedInfo.exists && typeof optimizedInfo.size === "number"
        ? optimizedInfo.size
        : 0;

    // If somehow the "optimized" output is bigger (shouldn't happen
    // unless source was already aggressively compressed), keep the
    // original — saves bytes on the wire and keeps quality.
    if (optimizedBytes > 0 && originalBytes > 0 && optimizedBytes >= originalBytes) {
      return { uri, originalBytes, optimizedBytes: originalBytes };
    }
    return { uri: result.uri, originalBytes, optimizedBytes };
  } catch (err) {
    console.warn("[image-optimize] failed; using source", err);
    return { uri, originalBytes, optimizedBytes: originalBytes };
  }
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
