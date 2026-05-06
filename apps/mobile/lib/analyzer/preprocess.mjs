import { letterbox, YOLO_INPUT_SIZE } from "./yolo.mjs";

export const PREPROCESS_PROFILE_RAW_RGB = "raw_rgb";
export const PREPROCESS_PROFILE_MORPH_FUSED_V1 = "morph_fused_v1";
export const PREPROCESS_PROFILE_MODEL = "model";

export function prepareYoloInput(pixels, options) {
  const target = options.target ?? YOLO_INPUT_SIZE;
  if (options.profile === PREPROCESS_PROFILE_RAW_RGB) return letterbox(pixels, target);
  return morphFusedLetterbox(pixels, target);
}

export function resolvePreprocessProfile(preference, metadata) {
  if (preference !== PREPROCESS_PROFILE_MODEL) return preference;
  const profile = metadata?.preprocess?.profile;
  return profile === PREPROCESS_PROFILE_MORPH_FUSED_V1
    ? PREPROCESS_PROFILE_MORPH_FUSED_V1
    : PREPROCESS_PROFILE_RAW_RGB;
}

function morphFusedLetterbox(pixels, target) {
  const srcW = pixels.width;
  const srcH = pixels.height;
  const scale = Math.min(target / srcW, target / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((target - newW) / 2);
  const padY = Math.floor((target - newH) / 2);
  const tensor = new Float32Array(target * target * 3);
  for (let i = 0; i < tensor.length; i++) tensor[i] = 114 / 255;

  const luma = luminancePlane(pixels);
  const gradient = morphologyGradient(luma, srcW, srcH, 1);
  const opened = dilate(erode(luma, srcW, srcH, 3), srcW, srcH, 3);

  for (let y = 0; y < newH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y / scale));
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x / scale));
      const srcIndex = sy * srcW + sx;
      const src = srcIndex * 4;
      const dst = ((y + padY) * target + (x + padX)) * 3;
      const grad = gradient[srcIndex] / 255;
      const topHat = Math.max(0, luma[srcIndex] - opened[srcIndex]) / 255;
      const local = localContrast(luma, srcW, srcH, sx, sy, 3);
      tensor[dst] = fuseChannel(pixels.data[src] / 255, grad, topHat, local);
      tensor[dst + 1] = fuseChannel(pixels.data[src + 1] / 255, grad, topHat, local);
      tensor[dst + 2] = fuseChannel(pixels.data[src + 2] / 255, grad, topHat, local);
    }
  }

  return { tensor, scale, padX, padY, target };
}

function luminancePlane(pixels) {
  const out = new Uint8Array(pixels.width * pixels.height);
  for (let i = 0; i < out.length; i++) {
    const src = i * 4;
    out[i] = clampByte(
      Math.round(
        0.299 * pixels.data[src] + 0.587 * pixels.data[src + 1] + 0.114 * pixels.data[src + 2],
      ),
    );
  }
  return out;
}

function morphologyGradient(src, width, height, radius) {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let min = 255;
      let max = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = clampInt(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = clampInt(x + dx, 0, width - 1);
          const v = src[yy * width + xx];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      out[y * width + x] = max - min;
    }
  }
  return out;
}

function erode(src, width, height, radius) {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let min = 255;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = clampInt(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = clampInt(x + dx, 0, width - 1);
          const v = src[yy * width + xx];
          if (v < min) min = v;
        }
      }
      out[y * width + x] = min;
    }
  }
  return out;
}

function dilate(src, width, height, radius) {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let max = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = clampInt(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = clampInt(x + dx, 0, width - 1);
          const v = src[yy * width + xx];
          if (v > max) max = v;
        }
      }
      out[y * width + x] = max;
    }
  }
  return out;
}

function localContrast(src, width, height, x, y, radius) {
  let min = 255;
  let max = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    const yy = clampInt(y + dy, 0, height - 1);
    for (let dx = -radius; dx <= radius; dx++) {
      const xx = clampInt(x + dx, 0, width - 1);
      const v = src[yy * width + xx];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min;
  if (range <= 0) return 0.5;
  return (src[y * width + x] - min) / range;
}

function fuseChannel(rgb, gradient, topHat, localContrastValue) {
  return clampUnit(0.7 * rgb + 0.15 * gradient + 0.1 * topHat + 0.05 * localContrastValue);
}

function clampUnit(v) {
  return Math.max(0, Math.min(1, v));
}

function clampByte(v) {
  return clampInt(v, 0, 255);
}

function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
