import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import type { Roi } from "@/lib/capture/roi";

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

function roiSvg(roi: Roi | null, width: number, height: number) {
  if (!roi) return "";
  const stroke = "#5DCAA5";
  const fill = "rgba(93, 202, 165, 0.18)";
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
  if (!roi) {
    await shareImage(uri, title);
    return;
  }
  const width = 1200;
  const height = 900;
  const href = svgEscape(await imageDataUri(uri));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#1a1816" />
  <image href="${href}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
  ${roiSvg(roi, width, height)}
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
