import { Alert, Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import type { SeedGrade } from "@advance-seeds/types";
import type { Roi } from "@/lib/capture/roi";
import { normalizeFrameOrientation } from "@/lib/capture/frameOrientation";

interface RoiVideoExporterModule {
  exportImageWithOverlayAsync?: (
    inputUri: string,
    overlay: Record<string, unknown>,
  ) => Promise<string>;
}

let nativeOverlayModule: RoiVideoExporterModule | null | undefined;

function getNativeOverlayModule() {
  if (nativeOverlayModule !== undefined) return nativeOverlayModule;
  try {
    // Loaded lazily so existing dev clients do not crash before native rebuild.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeOverlayModule = require("@advance-seeds/roi-video-exporter") as RoiVideoExporterModule;
  } catch (err) {
    console.warn("[imageActions] native overlay exporter unavailable", err);
    nativeOverlayModule = null;
  }
  return nativeOverlayModule;
}

export interface SeedAnnotationItem {
  index: number;
  grade?: SeedGrade | string | null;
  label?: string | null;
  length_mm?: number | null;
  area_mm2?: number | null;
  volume_ml?: number | null;
  bbox: { x: number; y: number; width: number; height: number };
  mask?: {
    polygon: ReadonlyArray<{ x: number; y: number }>;
  } | null;
}

export interface ImageAnnotationOverlay {
  roi: Roi | null;
  seeds?: readonly SeedAnnotationItem[] | null;
  seedFrameWidth?: number | null;
  seedFrameHeight?: number | null;
  seedFrameOrientation?: string | null;
}

function cachePath(name: string) {
  return `${FileSystem.cacheDirectory}${name}`;
}

async function localMediaUri(uri: string, extension: "jpg" | "mp4") {
  if (uri.startsWith("file://")) return uri;
  const target = cachePath(`capture-${Date.now()}.${extension}`);
  const result = await FileSystem.downloadAsync(uri, target);
  return result.uri;
}

function svgEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function imageDataUri(uri: string) {
  const localUri = await localMediaUri(uri, "jpg");
  const data = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `data:image/jpeg;base64,${data}`;
}

async function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 1200, height: 900 }),
    );
  });
}

function roiSvg(roi: Roi | null, width: number, height: number) {
  if (!roi) return "";
  const stroke = "#7DD3C7";
  const fill = "rgba(125, 211, 199, 0.18)";
  if (roi.kind === "rect") {
    return `<rect x="${roi.x * width}" y="${roi.y * height}" width="${roi.w * width}" height="${roi.h * height}" fill="${fill}" stroke="${stroke}" stroke-width="6" />`;
  }
  if (roi.kind === "circle") {
    return `<circle cx="${roi.cx * width}" cy="${roi.cy * height}" r="${roi.r * Math.min(width, height)}" fill="${fill}" stroke="${stroke}" stroke-width="6" />`;
  }
  const points = roi.points.map((p) => `${p.x * width},${p.y * height}`).join(" ");
  if (roi.closed) {
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="6" />`;
  }
  const vertices = roi.points
    .map((p) => `<circle cx="${p.x * width}" cy="${p.y * height}" r="10" fill="${stroke}" />`)
    .join("");
  return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="6" />${vertices}`;
}

function seedSvg(
  seeds: readonly SeedAnnotationItem[] | null | undefined,
  width: number,
  height: number,
  frameWidth?: number | null,
  frameHeight?: number | null,
) {
  if (!seeds?.length) return "";
  const sx = frameWidth && frameWidth > 0 ? width / frameWidth : 1;
  const sy = frameHeight && frameHeight > 0 ? height / frameHeight : 1;
  return seeds
    .map((seed) => {
      const polygonPoints = seed.mask?.polygon?.length
        ? seed.mask.polygon.map((p) => ({
            x: clamp(p.x, 0, frameWidth ?? width) * sx,
            y: clamp(p.y, 0, frameHeight ?? height) * sy,
          }))
        : null;
      const bounds = polygonPoints ? polygonBounds(polygonPoints) : null;
      const x = Math.max(0, bounds?.x ?? seed.bbox.x * sx);
      const y = Math.max(0, bounds?.y ?? seed.bbox.y * sy);
      const boxWidth = Math.max(1, bounds?.width ?? seed.bbox.width * sx);
      const boxHeight = Math.max(1, bounds?.height ?? seed.bbox.height * sy);
      const label = svgEscape(annotationLabel(seed));
      const labelWidth = Math.min(width - 8, Math.max(58, label.length * 7.2 + 12));
      const labelX = clamp(x, 4, Math.max(4, width - labelWidth - 4));
      const labelY = y >= 36 ? y - 34 : Math.min(height - 28, y + boxHeight + 8);
      const polygon = seed.mask?.polygon?.length
        ? polygonPoints?.map((p) => `${p.x},${p.y}`).join(" ")
        : null;
      const shape = polygon
        ? `<polygon points="${polygon}" fill="rgba(34, 197, 94, 0.08)" stroke="#22C55E" stroke-width="4" />`
        : `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" fill="rgba(34, 197, 94, 0.06)" stroke="#22C55E" stroke-width="4" rx="4" />`;
      return `<g>
  ${shape}
  <rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="24" fill="rgba(12, 18, 14, 0.82)" rx="4" />
  <text x="${labelX + 6}" y="${labelY + 17}" fill="#F8FAFC" font-family="Arial, sans-serif" font-size="13" font-weight="700">${label}</text>
</g>`;
    })
    .join("\n");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function polygonBounds(points: ReadonlyArray<{ x: number; y: number }>) {
  if (points.length === 0) return null;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function annotationLabel(seed: SeedAnnotationItem): string {
  const name = seed.label?.trim() || "Seed";
  const parts = [name];
  if (typeof seed.length_mm === "number" && Number.isFinite(seed.length_mm)) {
    parts.push(`${Math.round(seed.length_mm)} mm`);
  }
  if (typeof seed.area_mm2 === "number" && Number.isFinite(seed.area_mm2) && seed.area_mm2 > 0) {
    parts.push(`${Math.round(seed.area_mm2)} mm²`);
  }
  if (typeof seed.volume_ml === "number" && Number.isFinite(seed.volume_ml) && seed.volume_ml > 0) {
    parts.push(`${seed.volume_ml.toFixed(1)} ml`);
  }
  return parts.join(" · ");
}

async function writeAnnotatedSvg(uri: string, overlay: ImageAnnotationOverlay) {
  const { width, height } = await imageSize(uri);
  const href = svgEscape(await imageDataUri(uri));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#1a1816" />
  <image href="${href}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />
  ${roiSvg(overlay.roi, width, height)}
  ${seedSvg(overlay.seeds, width, height, overlay.seedFrameWidth, overlay.seedFrameHeight)}
</svg>`;
  const path = cachePath(`capture-annotated-${Date.now()}.svg`);
  await FileSystem.writeAsStringAsync(path, svg, { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}

export async function shareImage(uri: string, title: string) {
  const localUri = await localMediaUri(uri, "jpg");
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, {
      mimeType: "image/jpeg",
      dialogTitle: title,
    });
  } else {
    Alert.alert(title, localUri);
  }
}

export async function shareVideo(uri: string, title: string) {
  const localUri = await localMediaUri(uri, "mp4");
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, {
      mimeType: "video/mp4",
      dialogTitle: title,
    });
  } else {
    Alert.alert(title, localUri);
  }
}

export async function shareImageWithRoi(uri: string, roi: Roi | null, title: string) {
  await shareAnnotatedImage(uri, { roi }, title);
}

export async function shareAnnotatedImage(
  uri: string,
  overlay: ImageAnnotationOverlay,
  title: string,
) {
  const hasSeeds = Boolean(overlay.seeds?.length);
  if (!overlay.roi && !hasSeeds) {
    await shareImage(uri, title);
    return;
  }
  const nativePath = await exportNativeAnnotatedImage(uri, overlay);
  if (await Sharing.isAvailableAsync()) {
    if (nativePath) {
      await Sharing.shareAsync(nativePath, {
        mimeType: "image/jpeg",
        dialogTitle: title,
      });
      return;
    }
    try {
      const path = await writeAnnotatedSvg(uri, overlay);
      await Sharing.shareAsync(path, {
        mimeType: "image/svg+xml",
        dialogTitle: title,
      });
    } catch (err) {
      console.warn("[imageActions] annotated SVG share failed; sharing source image", err);
      await shareImage(uri, title);
    }
  } else {
    Alert.alert(title, nativePath ?? uri);
  }
}

export async function saveAnnotatedImageToLibrary(
  uri: string,
  overlay: ImageAnnotationOverlay,
  labels: {
    title: string;
    permissionDeniedTitle: string;
    permissionDeniedBody: string;
  },
) {
  const hasSeeds = Boolean(overlay.seeds?.length);
  if (!overlay.roi && !hasSeeds) {
    await saveImageToLibrary(uri, labels);
    return;
  }
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(labels.permissionDeniedTitle, labels.permissionDeniedBody);
    return;
  }
  const annotated = await exportNativeAnnotatedImage(uri, overlay);
  if (!annotated) {
    console.warn("[imageActions] native annotated image export unavailable; saving source image");
    await saveLocalImageUriToLibrary(uri);
    Alert.alert(labels.title);
    return;
  }
  try {
    await MediaLibrary.saveToLibraryAsync(annotated);
  } catch (err) {
    console.warn("[imageActions] annotated JPEG save failed; saving source image", err);
    await saveLocalImageUriToLibrary(uri);
  }
  Alert.alert(labels.title);
}

export async function saveImageToLibrary(
  uri: string,
  labels: {
    title: string;
    permissionDeniedTitle: string;
    permissionDeniedBody: string;
  },
) {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(labels.permissionDeniedTitle, labels.permissionDeniedBody);
    return;
  }
  const localUri = await localMediaUri(uri, uri.includes(".mp4") ? "mp4" : "jpg");
  await saveLocalImageUriToLibrary(localUri);
  Alert.alert(labels.title);
}

async function saveLocalImageUriToLibrary(uri: string) {
  const localUri = await localMediaUri(uri, uri.includes(".mp4") ? "mp4" : "jpg");
  await MediaLibrary.saveToLibraryAsync(localUri);
}

async function exportNativeAnnotatedImage(uri: string, overlay: ImageAnnotationOverlay) {
  const exporter = getNativeOverlayModule();
  if (!exporter?.exportImageWithOverlayAsync) return null;
  return exporter.exportImageWithOverlayAsync(uri, buildNativeImageOverlay(overlay));
}

function buildNativeImageOverlay(overlay: ImageAnnotationOverlay): Record<string, unknown> {
  const seeds = overlay.seeds?.map((seed) => ({
    index: seed.index,
    grade: seed.grade ?? null,
    label: seed.label ?? null,
    length_mm: seed.length_mm ?? null,
    area_mm2: seed.area_mm2 ?? null,
    volume_ml: seed.volume_ml ?? null,
    bbox: seed.bbox,
    mask: seed.mask ?? null,
  }));
  return {
    roi: overlay.roi,
    seeds: seeds ?? null,
    frameWidth: overlay.seedFrameWidth ?? null,
    frameHeight: overlay.seedFrameHeight ?? null,
    frameOrientation: normalizeFrameOrientation(overlay.seedFrameOrientation),
  };
}
