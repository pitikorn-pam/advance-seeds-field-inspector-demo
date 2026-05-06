import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareYoloInput,
  resolvePreprocessProfile,
  PREPROCESS_PROFILE_MORPH_FUSED_V1,
  PREPROCESS_PROFILE_RAW_RGB,
} from "./preprocess.mjs";
import { letterbox } from "./yolo.mjs";

function makeSolid(width, height, rgb) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function makeLineImage(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const value = x === Math.floor(width / 2) ? 220 : 30;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function tensorValue(tensor, target, x, y, channel = 0) {
  return tensor[(y * target + x) * 3 + channel];
}

test("raw preprocessing matches existing letterbox tensor and inverse params", () => {
  const pixels = makeSolid(4, 2, [200, 100, 50]);
  const expected = letterbox(pixels, 8);
  const actual = prepareYoloInput(pixels, {
    target: 8,
    profile: PREPROCESS_PROFILE_RAW_RGB,
  });

  assert.equal(actual.scale, expected.scale);
  assert.equal(actual.padX, expected.padX);
  assert.equal(actual.padY, expected.padY);
  assert.equal(actual.target, expected.target);
  assert.deepEqual(Array.from(actual.tensor), Array.from(expected.tensor));
});

test("morph fused preprocessing preserves tensor size and letterbox inverse params", () => {
  const pixels = makeLineImage(9, 5);
  const raw = prepareYoloInput(pixels, { target: 9, profile: PREPROCESS_PROFILE_RAW_RGB });
  const morph = prepareYoloInput(pixels, {
    target: 9,
    profile: PREPROCESS_PROFILE_MORPH_FUSED_V1,
  });

  assert.equal(morph.tensor.length, 9 * 9 * 3);
  assert.equal(morph.scale, raw.scale);
  assert.equal(morph.padX, raw.padX);
  assert.equal(morph.padY, raw.padY);
  assert.equal(morph.target, raw.target);
});

test("morph fused preprocessing strengthens high contrast crack-like structure", () => {
  const pixels = makeLineImage(9, 9);
  const raw = prepareYoloInput(pixels, { target: 9, profile: PREPROCESS_PROFILE_RAW_RGB });
  const morph = prepareYoloInput(pixels, {
    target: 9,
    profile: PREPROCESS_PROFILE_MORPH_FUSED_V1,
  });

  const lineX = 4;
  const backgroundX = 1;
  const y = 4;
  const rawContrast =
    tensorValue(raw.tensor, 9, lineX, y) - tensorValue(raw.tensor, 9, backgroundX, y);
  const morphContrast =
    tensorValue(morph.tensor, 9, lineX, y) - tensorValue(morph.tensor, 9, backgroundX, y);

  assert.ok(morphContrast > rawContrast, `${morphContrast} should exceed ${rawContrast}`);
});

test("preprocess profile resolver honors overrides and defaults raw", () => {
  const morphMetadata = { preprocess: { profile: PREPROCESS_PROFILE_MORPH_FUSED_V1 } };

  assert.equal(resolvePreprocessProfile("model", morphMetadata), PREPROCESS_PROFILE_MORPH_FUSED_V1);
  assert.equal(resolvePreprocessProfile("model", null), PREPROCESS_PROFILE_RAW_RGB);
  assert.equal(
    resolvePreprocessProfile(PREPROCESS_PROFILE_RAW_RGB, morphMetadata),
    PREPROCESS_PROFILE_RAW_RGB,
  );
  assert.equal(
    resolvePreprocessProfile(PREPROCESS_PROFILE_MORPH_FUSED_V1, null),
    PREPROCESS_PROFILE_MORPH_FUSED_V1,
  );
});
