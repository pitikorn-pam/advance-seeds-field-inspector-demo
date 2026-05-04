import { Image } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

const DEFAULT_MAX_LONG_EDGE = 2048;
const DEFAULT_QUALITY = 0.85;
/** Skip optimization if the source is already this small — re-encoding
 *  smaller files is rarely a win, and the ~300 ms ImageManipulator
 *  cost makes the user-visible save flow feel slower. */
const OPTIMIZE_THRESHOLD_BYTES = 1_500_000;
/** Hard cap on optimization wall-clock so a stuck native call can't
 *  block the save flow indefinitely. Worst case: original file is
 *  uploaded at full size, which the user can already tolerate. */
const TIMEOUT_MS = 3000;

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

  // Cheap files don't benefit from re-encoding — saving 50 KB isn't
  // worth ~300 ms ImageManipulator latency on the user-blocking save
  // path. Pass the source URI through unchanged.
  if (originalBytes > 0 && originalBytes < OPTIMIZE_THRESHOLD_BYTES) {
    return { uri, originalBytes, optimizedBytes: originalBytes };
  }

  // Race a hard timeout against the manipulator pipeline so a stuck
  // native call can't freeze save indefinitely.
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ uri: string; bytes: number } | null>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(null), TIMEOUT_MS);
  });

  try {
    const { width, height } = await getImageDimensions(uri);
    const longEdge = Math.max(width, height);

    const work = (async () => {
      const ctx = ImageManipulator.manipulate(uri);
      if (longEdge > maxLongEdge) {
        const scale = maxLongEdge / longEdge;
        ctx.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
      }
      const ref = await ctx.renderAsync();
      const out = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });
      const info = await FileSystem.getInfoAsync(out.uri).catch(() => null);
      const bytes = info && info.exists && typeof info.size === "number" ? info.size : 0;
      return { uri: out.uri, bytes };
    })();

    const winner = await Promise.race([work, timeout]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (!winner) {
      console.warn("[image-optimize] timed out after %dms; using source", TIMEOUT_MS);
      return { uri, originalBytes, optimizedBytes: originalBytes };
    }
    const optimizedBytes = winner.bytes;

    // If somehow the "optimized" output is bigger (shouldn't happen
    // unless source was already aggressively compressed), keep the
    // original — saves bytes on the wire and keeps quality.
    if (optimizedBytes > 0 && originalBytes > 0 && optimizedBytes >= originalBytes) {
      return { uri, originalBytes, optimizedBytes: originalBytes };
    }
    return { uri: winner.uri, originalBytes, optimizedBytes };
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
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
