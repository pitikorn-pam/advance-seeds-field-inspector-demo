import { Platform } from "react-native";
import type { AnalyzedSeed } from "@advance-seeds/types";
import type { Roi } from "@/lib/capture/roi";

interface RoiVideoExporterModule {
  exportWithRoiAsync(inputUri: string, roi: Record<string, unknown>): Promise<string>;
}

export interface VideoAnnotationOverlay {
  roi: Roi | null;
  seeds?: readonly AnalyzedSeed[] | null;
  frameWidth?: number | null;
  frameHeight?: number | null;
  frameOrientation?: string | null;
}

let nativeModule: RoiVideoExporterModule | null | undefined;

function getNativeModule() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  if (nativeModule !== undefined) return nativeModule;
  try {
    // Loaded lazily so the JS bundle still works before the rebuilt dev
    // client is installed; video burn-in simply falls back to original URI.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require("@advance-seeds/roi-video-exporter") as RoiVideoExporterModule;
  } catch (err) {
    console.warn("[video-roi] native exporter unavailable", err);
    nativeModule = null;
  }
  return nativeModule;
}

function buildOverlayPayload(overlay: VideoAnnotationOverlay): Record<string, unknown> | null {
  const seeds = overlay.seeds?.length
    ? overlay.seeds.map((seed) => ({
        index: seed.index,
        grade: seed.grade,
        bbox: seed.bbox,
      }))
    : null;
  if (!overlay.roi && !seeds) return null;
  return {
    roi: overlay.roi,
    seeds,
    frameWidth: overlay.frameWidth ?? null,
    frameHeight: overlay.frameHeight ?? null,
    frameOrientation: overlay.frameOrientation ?? null,
  };
}

export async function exportAnnotatedVideo(
  inputUri: string,
  overlay: Roi | VideoAnnotationOverlay | null,
): Promise<string> {
  const payload =
    overlay && "kind" in overlay
      ? buildOverlayPayload({ roi: overlay })
      : buildOverlayPayload(overlay ?? { roi: null });
  if (!payload) return inputUri;
  const exporter = getNativeModule();
  if (!exporter) return inputUri;
  return exporter.exportWithRoiAsync(inputUri, payload);
}
