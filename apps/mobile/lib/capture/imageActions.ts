import { Alert, Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import type { AnalyzedSeed } from "@advance-seeds/types";
import type { Roi } from "@/lib/capture/roi";

export interface ImageAnnotationOverlay {
  roi: Roi | null;
  seeds?: readonly AnalyzedSeed[] | null;
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

function seedSvg(seeds: readonly AnalyzedSeed[] | null | undefined) {
  if (!seeds?.length) return "";
  return seeds
    .map((seed) => {
      const x = Math.max(0, seed.bbox.x);
      const y = Math.max(0, seed.bbox.y);
      const width = Math.max(1, seed.bbox.width);
      const height = Math.max(1, seed.bbox.height);
      const label = svgEscape(`#${seed.index} ${seed.grade}`);
      return `<g>
  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="rgba(34, 197, 94, 0.10)" stroke="#22C55E" stroke-width="4" rx="4" />
  <rect x="${x}" y="${Math.max(0, y - 28)}" width="${Math.max(58, label.length * 10)}" height="24" fill="rgba(12, 18, 14, 0.82)" rx="4" />
  <text x="${x + 6}" y="${Math.max(17, y - 11)}" fill="#F8FAFC" font-family="Arial, sans-serif" font-size="14" font-weight="700">${label}</text>
</g>`;
    })
    .join("\n");
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
  const { width, height } = await imageSize(uri);
  const href = svgEscape(await imageDataUri(uri));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#1a1816" />
  <image href="${href}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />
  ${roiSvg(overlay.roi, width, height)}
  ${seedSvg(overlay.seeds)}
</svg>`;
  const path = cachePath(`capture-roi-${Date.now()}.svg`);
  await FileSystem.writeAsStringAsync(path, svg, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: "image/svg+xml",
      dialogTitle: title,
    });
  } else {
    Alert.alert(title, path);
  }
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
  await MediaLibrary.saveToLibraryAsync(localUri);
  Alert.alert(labels.title);
}
