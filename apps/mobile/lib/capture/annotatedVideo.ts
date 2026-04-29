import { Platform } from "react-native";
import type { Roi } from "@/lib/capture/roi";

interface RoiVideoExporterModule {
  exportWithRoiAsync(inputUri: string, roi: Record<string, unknown>): Promise<string>;
}

let nativeModule: RoiVideoExporterModule | null | undefined;

function getNativeModule() {
  if (Platform.OS !== "ios") return null;
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

export async function exportAnnotatedVideo(inputUri: string, roi: Roi | null): Promise<string> {
  if (!roi) return inputUri;
  const exporter = getNativeModule();
  if (!exporter) return inputUri;
  return exporter.exportWithRoiAsync(inputUri, roi as unknown as Record<string, unknown>);
}
