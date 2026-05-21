import assert from "node:assert/strict";
import test from "node:test";
import { decodeMaskForDetection, extractPolygonFromMask, maskPixelCount } from "./yoloSegMask.mjs";

// Build a tiny prototype tensor (channels-last) that produces a known mask
// when combined with a known coefficient vector. We pick one channel that
// is exactly 1.0 inside a rectangle and 0.0 outside, then set its coef
// large so sigmoid(acc) crosses 0.5 inside the rectangle and not outside.
function buildSyntheticPrototypes({ protoH, protoW, protoC, region }) {
  // region: { x, y, w, h } in proto-pixel coordinates of the "active" channel
  const data = new Float32Array(protoH * protoW * protoC);
  for (let y = 0; y < protoH; y++) {
    for (let x = 0; x < protoW; x++) {
      const inside =
        x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h;
      data[(y * protoW + x) * protoC + 0] = inside ? 1.0 : 0.0;
    }
  }
  return { data, shape: [1, protoH, protoW, protoC] };
}

test("decodeMaskForDetection returns a binary mask aligned with the active region (NHWC)", () => {
  const protoH = 32;
  const protoW = 32;
  const protoC = 4;
  // Active region covers proto rows/cols 8..24 — i.e. middle half of the
  // 32×32 proto, which maps to roughly the middle half of the 128×128
  // source image.
  const protos = buildSyntheticPrototypes({
    protoH,
    protoW,
    protoC,
    region: { x: 8, y: 8, w: 16, h: 16 },
  });
  const coefs = new Float32Array([10, 0, 0, 0]); // strong positive on channel 0

  const srcW = 128;
  const srcH = 128;
  const target = 128;
  const letterbox = { scale: 1, padX: 0, padY: 0, target };
  const bbox = { x: 0, y: 0, width: srcW, height: srcH };
  const decoded = decodeMaskForDetection({
    coefs,
    prototypes: protos.data,
    protoShape: protos.shape,
    bbox,
    srcW,
    srcH,
    letterbox,
  });
  assert.ok(decoded, "decoded mask should be non-null");
  assert.equal(decoded.w, 128);
  assert.equal(decoded.h, 128);
  // Active proto region (8..24, of 32) maps to source (32..96, of 128).
  // Confirm a center pixel is inside, a corner is outside.
  assert.equal(decoded.mask[64 * 128 + 64], 1, "center of active region must be foreground");
  assert.equal(decoded.mask[0], 0, "top-left corner must be background");
  // Active proto region (8..24) covers half of a 32-cell proto, which
  // maps to source pixels (32..96) = 64×64 = 4096 with floor-based
  // sampling. Bilinear sampling slightly extends the boundary because
  // cells at the edge get non-zero interpolated values from their hot
  // neighbors — pixelCount grows ~10–15% over the floor baseline. The
  // bilinear behavior is the desired one (smoother mask boundaries);
  // bounds are widened accordingly.
  assert.ok(
    decoded.pixelCount >= 60 * 60 && decoded.pixelCount <= 70 * 70,
    `unexpected pixelCount ${decoded.pixelCount}`,
  );
  assert.equal(maskPixelCount(decoded), decoded.pixelCount);
});

test("decodeMaskForDetection supports NCHW prototype layout", () => {
  const protoH = 16;
  const protoW = 16;
  const protoC = 3;
  // NCHW: shape [1, C, H, W] — channel 1 hot inside a 4×4 block.
  const data = new Float32Array(protoC * protoH * protoW);
  const hotC = 1;
  for (let y = 4; y < 8; y++) {
    for (let x = 4; x < 8; x++) {
      data[hotC * protoH * protoW + y * protoW + x] = 1.0;
    }
  }
  const coefs = new Float32Array([0, 10, 0]);

  const srcW = 32;
  const srcH = 32;
  const target = 32;
  const letterbox = { scale: 1, padX: 0, padY: 0, target };
  const bbox = { x: 0, y: 0, width: srcW, height: srcH };
  const decoded = decodeMaskForDetection({
    coefs,
    prototypes: data,
    protoShape: [1, protoC, protoH, protoW],
    bbox,
    srcW,
    srcH,
    letterbox,
  });
  assert.ok(decoded);
  // Active proto region (x,y in 4..7, 4×4) maps with sx=sy=0.5 to source
  // (x,y in 8..15, 8×8). Center pixel (12,12) sits inside; (0,0) outside.
  assert.equal(decoded.mask[12 * 32 + 12], 1);
  assert.equal(decoded.mask[0], 0);
});

test("decodeMaskForDetection returns null when proto layout doesn't match coef count", () => {
  const decoded = decodeMaskForDetection({
    coefs: new Float32Array(8),
    prototypes: new Float32Array(16 * 16 * 4),
    protoShape: [1, 16, 16, 4], // C=4, coef=8 → mismatch
    bbox: { x: 0, y: 0, width: 16, height: 16 },
    srcW: 16,
    srcH: 16,
    letterbox: { scale: 1, padX: 0, padY: 0, target: 16 },
  });
  assert.equal(decoded, null);
});

test("extractPolygonFromMask traces the boundary of a rectangular mask", () => {
  // 8×6 mask with a filled 4×3 rect at offset (2, 1).
  const w = 8;
  const h = 6;
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < 4; y++) {
    for (let x = 2; x < 6; x++) {
      mask[y * w + x] = 1;
    }
  }
  const polygon = extractPolygonFromMask({ mask, w, h, x: 100, y: 200, pixelCount: 12 });
  assert.ok(polygon.length >= 4, `polygon too short: ${polygon.length}`);
  // First vertex sits on the top-left foreground pixel (2,1) → in
  // source-space (100+2.5, 200+1.5).
  assert.equal(polygon[0].x, 102.5);
  assert.equal(polygon[0].y, 201.5);
  // All vertices stay within the foreground region (source-space).
  for (const p of polygon) {
    assert.ok(p.x >= 102 && p.x <= 106, `x out of range: ${p.x}`);
    assert.ok(p.y >= 201 && p.y <= 204, `y out of range: ${p.y}`);
  }
});

test("extractPolygonFromMask picks the largest connected component", () => {
  // 5×5 mask: a tiny 1-pixel speckle plus a 3×3 main blob.
  const w = 5;
  const h = 5;
  const mask = new Uint8Array(w * h);
  mask[0 * w + 0] = 1; // speckle
  for (let y = 2; y < 5; y++) {
    for (let x = 1; x < 4; x++) {
      mask[y * w + x] = 1;
    }
  }
  const polygon = extractPolygonFromMask({ mask, w, h, x: 0, y: 0, pixelCount: 10 });
  // Polygon must come from the 3×3 blob — no vertex at (0.5, 0.5).
  for (const p of polygon) {
    assert.ok(!(p.x === 0.5 && p.y === 0.5), "polygon should not include the speckle");
  }
});

test("extractPolygonFromMask returns [] for empty masks", () => {
  const empty = new Uint8Array(16);
  const polygon = extractPolygonFromMask({ mask: empty, w: 4, h: 4, x: 0, y: 0, pixelCount: 0 });
  assert.deepEqual(polygon, []);
});
