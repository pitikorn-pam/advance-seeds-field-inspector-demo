#import <CoreML/CoreML.h>
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <VisionCamera/Frame.h>
#import <VisionCamera/FrameProcessorPlugin.h>

#include <cmath>
#include <cstdint>
#include <vector>

// CoreML Vision Camera frame-processor plugin. Runs the installed YOLO26
// model on each camera frame entirely on the worklet thread — no JS
// bridge round-trip per frame, no SharedArrayBuffer cloning. Returns the
// largest output multiArray flattened to an NSArray of doubles + its
// shape, so the JS-side decoder helpers (`decodeYoloNms` etc.) take it
// straight.
//
// When `wantMask=YES` and the model exposes a rank-4 mask prototype
// tensor, the plugin also runs the YOLO segmentation mask post-process
// **natively on the worklet**: for each above-threshold detection row,
// combine its mask coefficients with the prototype tensor (matmul +
// sigmoid + threshold), trace the largest connected component's
// boundary, and emit a flat polygon array. Polygons are returned
// parallel to the detection rows JS will decode (same threshold + class
// filter applied identically on both sides), so JS just zips them in.
// This eliminates the ~820k-float prototype-tensor bridge transfer per
// wantMask frame and moves the mask matmul + connected-components +
// Moore-Neighbor trace into C++ where it belongs.
//
// Usage from a worklet:
//   const result = __advanceSeedsRunCoreML(frame, { modelPath });
// The first call lazy-loads the .mlmodelc; subsequent calls reuse the
// cached MLModel.

namespace {

// --- Native YOLO mask decode + polygon trace ----------------------------
//
// Mirrors the JS implementation in apps/mobile/lib/analyzer/yoloSegMask.ts
// so polygons are byte-for-byte equivalent to the legacy JS path. Pure
// C++ for cache-friendliness; called from the Vision request completion
// handler on the worklet thread.

struct ProtoLayout {
  NSInteger protoH;
  NSInteger protoW;
  NSInteger protoC;
  bool channelLast;
};

static bool pickProtoLayout(NSArray<NSNumber *> *shape, NSInteger coefCount, ProtoLayout *out) {
  if (shape == nil || shape.count < 3) return false;
  NSArray<NSNumber *> *dims =
      (shape.count == 4 && shape[0].integerValue == 1) ? [shape subarrayWithRange:NSMakeRange(1, 3)]
                                                       : (shape.count == 3 ? shape : nil);
  if (dims == nil || dims.count != 3) return false;
  NSInteger a = dims[0].integerValue;
  NSInteger b = dims[1].integerValue;
  NSInteger c = dims[2].integerValue;
  if (c == coefCount) {
    out->protoH = a;
    out->protoW = b;
    out->protoC = c;
    out->channelLast = true;
    return true;
  }
  if (a == coefCount) {
    out->protoH = b;
    out->protoW = c;
    out->protoC = a;
    out->channelLast = false;
    return true;
  }
  return false;
}

static inline float sigmoidf(float z) {
  if (z >= 0.0f) {
    return 1.0f / (1.0f + std::exp(-z));
  }
  float e = std::exp(z);
  return e / (1.0f + e);
}

static inline int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

// Decode a per-detection binary mask cropped to its bbox in source-image
// pixel space. Output dims = bbox.w × bbox.h. Returns nullptr-style empty
// vector when w/h collapse to 0 or proto layout doesn't fit.
static std::vector<uint8_t> decodeMaskRect(
    const float *coefs,
    NSInteger coefCount,
    const float *prototypes,
    const ProtoLayout &layout,
    int x0,
    int y0,
    int w,
    int h,
    float scale,
    float padX,
    float padY,
    float target,
    float threshold,
    int *outPixelCount) {
  *outPixelCount = 0;
  if (w <= 0 || h <= 0) return {};
  const float sx = (static_cast<float>(layout.protoW) / target) * scale;
  const float sy = (static_cast<float>(layout.protoH) / target) * scale;
  const float ox = (padX * layout.protoW) / target;
  const float oy = (padY * layout.protoH) / target;
  std::vector<uint8_t> mask(static_cast<size_t>(w) * static_cast<size_t>(h), 0);
  int pixelCount = 0;
  if (layout.channelLast) {
    const NSInteger pw = layout.protoW;
    const NSInteger pc = layout.protoC;
    for (int py = 0; py < h; py++) {
      const float sy0 = static_cast<float>(y0 + py) * sy + oy;
      int ry = clampi(static_cast<int>(std::floor(sy0)), 0, static_cast<int>(layout.protoH) - 1);
      const NSInteger protoRow = ry * pw * pc;
      for (int px = 0; px < w; px++) {
        const float sx0 = static_cast<float>(x0 + px) * sx + ox;
        int rx = clampi(static_cast<int>(std::floor(sx0)), 0, static_cast<int>(pw) - 1);
        const NSInteger base = protoRow + rx * pc;
        float acc = 0.0f;
        for (NSInteger c = 0; c < coefCount; c++) acc += coefs[c] * prototypes[base + c];
        if (sigmoidf(acc) > threshold) {
          mask[py * w + px] = 1;
          pixelCount++;
        }
      }
    }
  } else {
    const NSInteger planeStride = layout.protoH * layout.protoW;
    const NSInteger pw = layout.protoW;
    for (int py = 0; py < h; py++) {
      const float sy0 = static_cast<float>(y0 + py) * sy + oy;
      int ry = clampi(static_cast<int>(std::floor(sy0)), 0, static_cast<int>(layout.protoH) - 1);
      const NSInteger rowOff = ry * pw;
      for (int px = 0; px < w; px++) {
        const float sx0 = static_cast<float>(x0 + px) * sx + ox;
        int rx = clampi(static_cast<int>(std::floor(sx0)), 0, static_cast<int>(pw) - 1);
        const NSInteger off = rowOff + rx;
        float acc = 0.0f;
        for (NSInteger c = 0; c < coefCount; c++) acc += coefs[c] * prototypes[c * planeStride + off];
        if (sigmoidf(acc) > threshold) {
          mask[py * w + px] = 1;
          pixelCount++;
        }
      }
    }
  }
  *outPixelCount = pixelCount;
  return mask;
}

// Connected-components label (4-neighborhood), pick the largest, then
// trace its boundary with Moore-Neighbor (clockwise). Returns flat
// [x0, y0, x1, y1, ...] in source-image pixel space (mask offsets x0/y0
// added). Empty when the mask is degenerate.
static std::vector<float> extractPolygon(
    const std::vector<uint8_t> &mask, int w, int h, int x0, int y0) {
  std::vector<float> out;
  if (mask.empty() || w <= 0 || h <= 0) return out;
  std::vector<int32_t> labels(static_cast<size_t>(w) * static_cast<size_t>(h), 0);
  std::vector<int32_t> sizes;
  sizes.push_back(0);
  int nextLabel = 1;
  std::vector<int> stack;
  stack.reserve(64);
  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      const int idx = y * w + x;
      if (!mask[idx] || labels[idx] != 0) continue;
      const int label = nextLabel++;
      int size = 0;
      stack.push_back(idx);
      labels[idx] = label;
      while (!stack.empty()) {
        const int cur = stack.back();
        stack.pop_back();
        size++;
        const int cy = cur / w;
        const int cx = cur - cy * w;
        if (cx > 0) {
          int n = cur - 1;
          if (mask[n] && labels[n] == 0) { labels[n] = label; stack.push_back(n); }
        }
        if (cx + 1 < w) {
          int n = cur + 1;
          if (mask[n] && labels[n] == 0) { labels[n] = label; stack.push_back(n); }
        }
        if (cy > 0) {
          int n = cur - w;
          if (mask[n] && labels[n] == 0) { labels[n] = label; stack.push_back(n); }
        }
        if (cy + 1 < h) {
          int n = cur + w;
          if (mask[n] && labels[n] == 0) { labels[n] = label; stack.push_back(n); }
        }
      }
      sizes.push_back(size);
    }
  }
  if (nextLabel == 1) return out;
  int bestLabel = 1;
  for (int l = 2; l < static_cast<int>(sizes.size()); l++) {
    if (sizes[l] > sizes[bestLabel]) bestLabel = l;
  }
  int start = -1;
  for (int i = 0; i < static_cast<int>(labels.size()); i++) {
    if (labels[i] == bestLabel) { start = i; break; }
  }
  if (start < 0) return out;
  static const int DX[8] = {-1, -1, 0, 1, 1, 1, 0, -1};
  static const int DY[8] = {0, -1, -1, -1, 0, 1, 1, 1};
  auto isFg = [&](int x, int y) {
    return x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] == bestLabel;
  };
  const int startX = start % w;
  const int startY = start / w;
  out.reserve(64);
  out.push_back(static_cast<float>(x0 + startX) + 0.5f);
  out.push_back(static_cast<float>(y0 + startY) + 0.5f);
  int cx = startX;
  int cy = startY;
  int dir = 6;
  bool advanced = false;
  const long safetyLimit = 4L * (static_cast<long>(w) * static_cast<long>(h) + 1L);
  for (long safety = 0; safety < safetyLimit; safety++) {
    bool found = false;
    for (int step = 0; step < 8; step++) {
      const int d = (dir + step) % 8;
      const int nx = cx + DX[d];
      const int ny = cy + DY[d];
      if (isFg(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = (d + 6) % 8;
        const float vx = static_cast<float>(x0 + cx) + 0.5f;
        const float vy = static_cast<float>(y0 + cy) + 0.5f;
        const size_t n = out.size();
        if (n < 2 || out[n - 2] != vx || out[n - 1] != vy) {
          out.push_back(vx);
          out.push_back(vy);
        }
        found = true;
        advanced = true;
        break;
      }
    }
    if (!found) break;
    if (advanced && cx == startX && cy == startY) break;
  }
  if (out.size() >= 4) {
    const size_t n = out.size();
    if (out[n - 2] == out[0] && out[n - 1] == out[1]) {
      out.pop_back();
      out.pop_back();
    }
  }
  return out;
}

// Decode polygons for every detection row that passes the score + class
// filter. Returns a NSArray indexed parallel to the JS-side row iteration
// in `decodeYoloSegmentationNms` — same threshold/filter applied here, so
// the i-th surviving JS detection corresponds to the i-th non-empty
// entry in this output. Rows that fail filtering or whose mask trace
// failed are represented by an empty NSArray to preserve indexing.
//
// Assumes Ultralytics NMS-fused xyxy-in-canvas-pixel-space format (the
// standard export). Non-standard formats fall back to the JS path
// (caller skips this code).
static NSArray<NSArray<NSNumber *> *> *decodeAllPolygons(
    MLMultiArray *detectionArr,
    MLMultiArray *protoArr,
    float scoreThreshold,
    NSArray<NSNumber *> *_Nullable classFilter,
    float scale,
    float padX,
    float padY,
    float target,
    int srcW,
    int srcH,
    float maskThreshold) {
  NSMutableArray<NSArray<NSNumber *> *> *out = [NSMutableArray array];
  if (detectionArr == nil || protoArr == nil) return out;
  NSArray<NSNumber *> *detShape = detectionArr.shape;
  if (detShape.count != 3) return out;
  const NSInteger maxDet = detShape[1].integerValue;
  const NSInteger fields = detShape[2].integerValue;
  if (fields < 7) return out; // no mask coefs
  const NSInteger coefCount = fields - 6;
  ProtoLayout layout = {};
  if (!pickProtoLayout(protoArr.shape, coefCount, &layout)) return out;

  // Coerce both tensors to float32 contiguous pointers. Vision/CoreML
  // outputs are nearly always float32 already; fall back to a strided
  // copy when they aren't.
  std::vector<float> detStorage;
  const float *detPtr = nullptr;
  if (detectionArr.dataType == MLMultiArrayDataTypeFloat32) {
    detPtr = (const float *)detectionArr.dataPointer;
  } else {
    detStorage.resize(detectionArr.count);
    for (NSInteger i = 0; i < (NSInteger)detectionArr.count; i++) {
      detStorage[i] = (float)detectionArr[i].doubleValue;
    }
    detPtr = detStorage.data();
  }
  std::vector<float> protoStorage;
  const float *protoPtr = nullptr;
  if (protoArr.dataType == MLMultiArrayDataTypeFloat32) {
    protoPtr = (const float *)protoArr.dataPointer;
  } else {
    protoStorage.resize(protoArr.count);
    for (NSInteger i = 0; i < (NSInteger)protoArr.count; i++) {
      protoStorage[i] = (float)protoArr[i].doubleValue;
    }
    protoPtr = protoStorage.data();
  }

  // Pre-resolve class filter into a small lookup. Empty / nil means "any".
  NSMutableSet<NSNumber *> *classSet = nil;
  if (classFilter != nil && classFilter.count > 0) {
    classSet = [NSMutableSet setWithArray:classFilter];
  }

  for (NSInteger i = 0; i < maxDet; i++) {
    const NSInteger base = i * fields;
    const float score = detPtr[base + 4];
    if (score < scoreThreshold) {
      [out addObject:@[]];
      continue;
    }
    const int classId = (int)std::lround(detPtr[base + 5]);
    if (classSet != nil && ![classSet containsObject:@(classId)]) {
      [out addObject:@[]];
      continue;
    }
    // Assume xyxy in canvas (0..target) pixel space — the Ultralytics
    // NMS-fused standard. Apply letterbox-inverse to land in source
    // pixel space. JS's per-row coord-space heuristics aren't replicated
    // here; non-standard models simply produce no native polygons and
    // the JS fallback path takes over.
    const float rawX1 = detPtr[base + 0];
    const float rawY1 = detPtr[base + 1];
    const float rawX2 = detPtr[base + 2];
    const float rawY2 = detPtr[base + 3];
    const float fx1 = (rawX1 - padX) / scale;
    const float fy1 = (rawY1 - padY) / scale;
    const float fx2 = (rawX2 - padX) / scale;
    const float fy2 = (rawY2 - padY) / scale;
    const float fw = fx2 - fx1;
    const float fh = fy2 - fy1;
    if (fw <= 1.0f || fh <= 1.0f) {
      [out addObject:@[]];
      continue;
    }
    const int x0 = std::max(0, (int)std::floor(fx1));
    const int y0 = std::max(0, (int)std::floor(fy1));
    const int x1 = std::min(srcW, (int)std::ceil(fx2));
    const int y1 = std::min(srcH, (int)std::ceil(fy2));
    const int w = std::max(0, x1 - x0);
    const int h = std::max(0, y1 - y0);
    if (w <= 0 || h <= 0) {
      [out addObject:@[]];
      continue;
    }
    int pixelCount = 0;
    std::vector<uint8_t> mask = decodeMaskRect(
        detPtr + base + 6, coefCount, protoPtr, layout,
        x0, y0, w, h, scale, padX, padY, target, maskThreshold, &pixelCount);
    if (mask.empty() || pixelCount == 0) {
      [out addObject:@[]];
      continue;
    }
    std::vector<float> poly = extractPolygon(mask, w, h, x0, y0);
    if (poly.size() < 6) {
      [out addObject:@[]];
      continue;
    }
    NSMutableArray<NSNumber *> *polyArr = [NSMutableArray arrayWithCapacity:poly.size()];
    for (float v : poly) [polyArr addObject:@(v)];
    [out addObject:polyArr];
  }
  return out;
}


static NSMutableDictionary<NSString *, MLModel *> *modelCache(void) {
  static NSMutableDictionary<NSString *, MLModel *> *cache;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    cache = [NSMutableDictionary dictionary];
  });
  return cache;
}

static NSURL *fileURLFromURI(NSString *uri) {
  if (uri == nil || uri.length == 0) return nil;
  NSURL *url = [NSURL URLWithString:uri];
  if (url != nil && url.isFileURL) return url;
  if ([uri hasPrefix:@"/"]) return [NSURL fileURLWithPath:uri];
  if ([uri hasPrefix:@"file://"]) {
    return [NSURL fileURLWithPath:[uri substringFromIndex:[@"file://" length]]];
  }
  return nil;
}

static MLModel *loadModel(NSString *assetName, NSString *modelPath) {
  NSString *cacheKey = (modelPath != nil && modelPath.length > 0) ? modelPath : assetName;
  MLModel *cached = modelCache()[cacheKey];
  if (cached != nil) {
    return cached;
  }
  NSURL *url = fileURLFromURI(modelPath);
  if (url == nil) {
    return nil;
  }
  MLModelConfiguration *config = [[MLModelConfiguration alloc] init];
  config.computeUnits = MLComputeUnitsAll;
  NSError *err = nil;
  MLModel *model = [MLModel modelWithContentsOfURL:url configuration:config error:&err];
  if (model == nil) {
    NSLog(@"[CoreML FP] failed to load %@: %@", cacheKey, err);
    return nil;
  }
  modelCache()[cacheKey] = model;
  return model;
}

// Picks the detection MultiArray output. YOLO26 NMS-baked exports
// produce `[1, 300, 6]` (bbox + score + cls) for a detector and
// `[1, 300, 38+]` (bbox + score + cls + mask coeffs) for a seg model
// — both are 3D with shape[1] == 300. A seg model also exposes a mask
// prototype output `[1, 32, 160, 160]` whose element count (~820k)
// dwarfs detections (~11k); picking by element count returns the mask
// tensor and the JS decoder reads garbage. Match by shape signature
// instead so segmentation models work.
//
// When `wantMaskProto` is YES the prototype MLMultiArray is also located
// and returned via `outProto` — kept native (NOT serialized into the
// returned dictionary). The caller pairs it with `decodeAllPolygons` to
// produce a small `polygons` field instead of crossing the ~820k float
// prototype tensor over the JSI bridge.
static NSDictionary *flattenLargestMultiArray(NSDictionary<NSString *, VNCoreMLFeatureValueObservation *> *byName,
                                              BOOL wantMaskProto,
                                              MLMultiArray *_Nullable *_Nullable outDetection,
                                              MLMultiArray *_Nullable *_Nullable outProto) {
  NSString *bestName = nil;
  MLMultiArray *bestArr = nil;
  NSInteger bestRank = -1; // 0 = none, 1 = fallback largest, 2 = 3D non-detection, 3 = detection signature
  NSInteger bestCount = -1;
  MLMultiArray *protoArr = nil;
  NSInteger protoCount = -1;
  for (NSString *name in byName) {
    VNCoreMLFeatureValueObservation *obs = byName[name];
    MLFeatureValue *fv = obs.featureValue;
    if (fv.type != MLFeatureTypeMultiArray) continue;
    MLMultiArray *arr = fv.multiArrayValue;
    if (arr == nil) continue;
    NSArray<NSNumber *> *shape = arr.shape;
    NSInteger rank = 1;
    if (shape.count == 3) {
      NSInteger d0 = shape[0].integerValue;
      NSInteger d1 = shape[1].integerValue;
      NSInteger d2 = shape[2].integerValue;
      // YOLO post-NMS: [1, 300, 6] (det) or [1, 300, 38+] (seg w/ masks).
      if (d0 == 1 && d1 == 300 && (d2 == 6 || d2 >= 38)) {
        rank = 3;
      } else {
        // Other 3D outputs (raw heads etc.) — preferred over 4D mask
        // prototypes but lose to a clear detection signature.
        rank = 2;
      }
    } else if (shape.count == 4 && wantMaskProto) {
      // Rank-4 candidate is the mask prototype tensor. Keep the largest
      // (a model with two rank-4 outputs is exotic; we just pick whichever
      // has the most elements).
      if ((NSInteger)arr.count > protoCount) {
        protoArr = arr;
        protoCount = arr.count;
      }
    }
    if (rank > bestRank || (rank == bestRank && (NSInteger)arr.count > bestCount)) {
      bestRank = rank;
      bestCount = arr.count;
      bestArr = arr;
      bestName = name;
    }
  }
  if (bestArr == nil) return nil;
  if (outDetection != nullptr) *outDetection = bestArr;
  if (outProto != nullptr) *outProto = protoArr;

  NSMutableArray<NSNumber *> *values = [NSMutableArray arrayWithCapacity:bestArr.count];
  switch (bestArr.dataType) {
    case MLMultiArrayDataTypeFloat32: {
      Float32 *p = (Float32 *)bestArr.dataPointer;
      for (NSInteger i = 0; i < (NSInteger)bestArr.count; i++) {
        [values addObject:@((double)p[i])];
      }
      break;
    }
    case MLMultiArrayDataTypeDouble: {
      double *p = (double *)bestArr.dataPointer;
      for (NSInteger i = 0; i < (NSInteger)bestArr.count; i++) {
        [values addObject:@(p[i])];
      }
      break;
    }
    case MLMultiArrayDataTypeInt32: {
      int32_t *p = (int32_t *)bestArr.dataPointer;
      for (NSInteger i = 0; i < (NSInteger)bestArr.count; i++) {
        [values addObject:@((double)p[i])];
      }
      break;
    }
    default: {
      // Fallback through the bridged subscript for less common dtypes.
      for (NSInteger i = 0; i < (NSInteger)bestArr.count; i++) {
        [values addObject:@(bestArr[i].doubleValue)];
      }
      break;
    }
  }
  return @{
    @"outputName": bestName,
    @"shape": bestArr.shape,
    @"values": values,
  };
}

} // namespace

@interface AdvanceSeedsCoreMLFrameProcessorPlugin : FrameProcessorPlugin
@end

@implementation AdvanceSeedsCoreMLFrameProcessorPlugin {
  VNCoreMLModel *_visionModel;
  NSString *_visionModelAssetName;
  // Dev diagnostic: print observed output shapes once per model load,
  // the first time wantMask=YES. Confirms whether a rank-4 prototype
  // tensor is actually emitted at runtime (vs. declared in the model
  // description). Reset when the active model changes.
  BOOL _maskOutputShapesLogged;
}

- (id _Nullable)callback:(Frame *)frame withArguments:(NSDictionary *_Nullable)arguments {
  NSString *assetName = arguments[@"assetName"];
  if (assetName == nil) {
    assetName = @"yolo26n";
  }
  NSString *modelPath = arguments[@"modelPath"];
  if (modelPath == nil || modelPath.length == 0) {
    return nil;
  }
  // Caller throttles mask polygon decode (still ~820k matmul ops per
  // wantMask frame even native). When wantMask=NO we skip the prototype
  // lookup and polygon trace entirely; the live overlay falls back to
  // bbox until the next wantMask=YES frame lands. When wantMask=YES the
  // caller MUST also supply letterbox + src dim args so this code can
  // project detection bboxes back into source-image pixel space — the
  // same projection JS performs.
  BOOL wantMask = [arguments[@"wantMask"] boolValue];
  // Mask-decode args (only consulted when wantMask=YES). Match JS-side
  // `decodeYoloSegmentationNms` filtering so the i-th JS detection and
  // the i-th non-empty `polygons` entry line up by row index.
  const float maskScoreThreshold = [arguments[@"scoreThreshold"] floatValue];
  NSArray<NSNumber *> *maskClassFilterRaw = arguments[@"classFilter"];
  NSArray<NSNumber *> *maskClassFilter =
      (maskClassFilterRaw != nil && maskClassFilterRaw.count > 0) ? maskClassFilterRaw : nil;
  NSNumber *maskThresholdNum = arguments[@"maskThreshold"];
  const float maskBinThreshold = maskThresholdNum != nil ? [maskThresholdNum floatValue] : 0.5f;
  // Derive letterbox + src dims from the frame itself. Vision rotates
  // the input buffer based on `frame.orientation` before scale-and-fit
  // into 640x640, so the source-space dims we use here are the
  // post-rotation ones. JS performs the same calculation against
  // frame.width/height; native mirrors it.
  const int rawW = (int)frame.width;
  const int rawH = (int)frame.height;
  const BOOL rotates =
      frame.orientation == UIImageOrientationLeft ||
      frame.orientation == UIImageOrientationRight ||
      frame.orientation == UIImageOrientationLeftMirrored ||
      frame.orientation == UIImageOrientationRightMirrored;
  const int maskSrcW = rotates ? rawH : rawW;
  const int maskSrcH = rotates ? rawW : rawH;
  const float maskLetterboxTarget = 640.0f;
  const float maskLetterboxScale =
      maskSrcW > 0 && maskSrcH > 0
          ? maskLetterboxTarget / (float)std::max(maskSrcW, maskSrcH)
          : 0.0f;
  const int scaledW = (int)std::lround((float)maskSrcW * maskLetterboxScale);
  const int scaledH = (int)std::lround((float)maskSrcH * maskLetterboxScale);
  const float maskLetterboxPadX = std::floor((maskLetterboxTarget - (float)scaledW) / 2.0f);
  const float maskLetterboxPadY = std::floor((maskLetterboxTarget - (float)scaledH) / 2.0f);
  NSString *modelKey = (modelPath != nil && modelPath.length > 0) ? modelPath : assetName;
  CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(frame.buffer);
  if (imageBuffer == nil) {
    return nil;
  }

  if (_visionModel == nil || ![_visionModelAssetName isEqualToString:modelKey]) {
    MLModel *model = loadModel(assetName, modelPath);
    if (model == nil) {
      NSLog(@"[CoreML FP] FAILED to load model — modelPath=%@ asset=%@", modelPath, assetName);
      return nil;
    }
    // Log output names + their declared multi-array shapes. Surfaces at
    // a glance whether this model exposes a rank-4 prototype tensor that
    // the segmentation polygon pipeline can use. Models with NMS baked
    // into the export usually strip the prototype, leaving only
    // detection rows — that's the diagnostic story behind a
    // `outputKind=segmentation hasProto=false` log line on the JS side.
    NSMutableString *outputsSummary = [NSMutableString string];
    NSDictionary<NSString *, MLFeatureDescription *> *outputDescs = model.modelDescription.outputDescriptionsByName;
    for (NSString *outName in outputDescs.allKeys) {
      MLFeatureDescription *desc = outputDescs[outName];
      NSArray<NSNumber *> *shape = desc.multiArrayConstraint.shape;
      [outputsSummary appendFormat:@"%@%@=%@", outputsSummary.length > 0 ? @"," : @"", outName, shape ?: @"<unknown>"];
    }
    NSLog(@"[CoreML FP] LOADED model — key=%@ outputs=[%@]", modelKey, outputsSummary);
    NSError *err = nil;
    _visionModel = [VNCoreMLModel modelForMLModel:model error:&err];
    if (_visionModel == nil) {
      NSLog(@"[CoreML FP] VNCoreMLModel init failed: %@", err);
      return nil;
    }
    _visionModelAssetName = modelKey;
    _maskOutputShapesLogged = NO;
  }

  // Vision handles YUV→RGB conversion + the model's image-input
  // letterbox transparently, so we don't need to touch the pixel
  // buffer ourselves.
  __block NSDictionary *result = nil;
  VNCoreMLRequest *request =
      [[VNCoreMLRequest alloc] initWithModel:_visionModel
                           completionHandler:^(VNRequest *req, NSError *requestErr) {
                             if (requestErr != nil) {
                               NSLog(@"[CoreML FP] request failed: %@", requestErr);
                               return;
                             }
                             NSMutableDictionary<NSString *, VNCoreMLFeatureValueObservation *> *byName =
                                 [NSMutableDictionary dictionary];
                             for (VNObservation *obs in req.results) {
                               if (![obs isKindOfClass:[VNCoreMLFeatureValueObservation class]]) continue;
                               VNCoreMLFeatureValueObservation *fvObs = (VNCoreMLFeatureValueObservation *)obs;
                               byName[fvObs.featureName ?: @"_"] = fvObs;
                             }
                             if (wantMask && !self->_maskOutputShapesLogged) {
                               self->_maskOutputShapesLogged = YES;
                               NSMutableString *obsSummary = [NSMutableString string];
                               for (NSString *name in byName.allKeys) {
                                 MLMultiArray *arr = byName[name].featureValue.multiArrayValue;
                                 [obsSummary appendFormat:@"%@%@=%@(rank%lu)",
                                  obsSummary.length > 0 ? @"," : @"",
                                  name,
                                  arr ? arr.shape : @"<nil>",
                                  (unsigned long)(arr ? arr.shape.count : 0)];
                               }
                               NSLog(@"[CoreML FP] wantMask=YES observed outputs=[%@]", obsSummary);
                             }
                             MLMultiArray *detArr = nil;
                             MLMultiArray *protoArr = nil;
                             NSDictionary *flat = flattenLargestMultiArray(byName, wantMask, &detArr, &protoArr);
                             if (flat == nil) return;
                             NSMutableDictionary *combined = [flat mutableCopy];
                             // Native polygon decode path. Only runs when the
                             // model exposed a prototype tensor AND the
                             // caller supplied the mask-decode args. Output
                             // is parallel to the JS row iteration in
                             // `decodeYoloSegmentationNms` (same threshold
                             // + class filter applied here too), so JS
                             // simply attaches by index.
                             const BOOL canDecode = wantMask && protoArr != nil &&
                                 detArr != nil && maskLetterboxScale > 0.0f &&
                                 maskLetterboxTarget > 0.0f && maskSrcW > 0 && maskSrcH > 0;
                             if (canDecode) {
                               NSArray *polys = decodeAllPolygons(
                                   detArr, protoArr,
                                   maskScoreThreshold, maskClassFilter,
                                   maskLetterboxScale, maskLetterboxPadX,
                                   maskLetterboxPadY, maskLetterboxTarget,
                                   maskSrcW, maskSrcH, maskBinThreshold);
                               if (polys != nil) {
                                 combined[@"polygons"] = polys;
                               }
                             }
                             result = combined;
                           }];
  request.imageCropAndScaleOption = VNImageCropAndScaleOptionScaleFit;

  // Camera buffers come from the sensor in its native (landscape-right)
  // orientation, but the user is holding the phone in portrait. Without
  // an orientation hint, Vision feeds the model a sideways image and
  // recall collapses (a banana lying flat reads like nothing the model
  // was trained on). Forward the Frame's UIImageOrientation as a CG
  // orientation so VNCoreMLRequest applies the correct rotation before
  // the model sees the pixels.
  CGImagePropertyOrientation cgOrientation = kCGImagePropertyOrientationUp;
  switch (frame.orientation) {
    case UIImageOrientationUp:            cgOrientation = kCGImagePropertyOrientationUp; break;
    case UIImageOrientationDown:          cgOrientation = kCGImagePropertyOrientationDown; break;
    case UIImageOrientationLeft:          cgOrientation = kCGImagePropertyOrientationLeft; break;
    case UIImageOrientationRight:         cgOrientation = kCGImagePropertyOrientationRight; break;
    case UIImageOrientationUpMirrored:    cgOrientation = kCGImagePropertyOrientationUpMirrored; break;
    case UIImageOrientationDownMirrored:  cgOrientation = kCGImagePropertyOrientationDownMirrored; break;
    case UIImageOrientationLeftMirrored:  cgOrientation = kCGImagePropertyOrientationLeftMirrored; break;
    case UIImageOrientationRightMirrored: cgOrientation = kCGImagePropertyOrientationRightMirrored; break;
  }
  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithCVPixelBuffer:(CVPixelBufferRef)imageBuffer
                                               orientation:cgOrientation
                                                   options:@{}];
  NSError *runErr = nil;
  [handler performRequests:@[ request ] error:&runErr];
  if (runErr != nil) {
    NSLog(@"[CoreML FP] performRequests failed: %@", runErr);
    return nil;
  }
  if (result == nil) {
    return nil;
  }
  // Pass the orientation through to JS so it can apply rotation-aware
  // letterbox-inverse + post-rotation → sensor-coords transform on the
  // bbox positions. Without this, JS uses pre-rotation frame dims for
  // both, which approximates correctly near the canvas center but
  // drifts at the edges (the "live overlay slightly off" symptom).
  NSString *orientationKey;
  switch (frame.orientation) {
    case UIImageOrientationUp:            orientationKey = @"up"; break;
    case UIImageOrientationDown:          orientationKey = @"down"; break;
    case UIImageOrientationLeft:          orientationKey = @"left"; break;
    case UIImageOrientationRight:         orientationKey = @"right"; break;
    case UIImageOrientationUpMirrored:    orientationKey = @"up-mirrored"; break;
    case UIImageOrientationDownMirrored:  orientationKey = @"down-mirrored"; break;
    case UIImageOrientationLeftMirrored:  orientationKey = @"left-mirrored"; break;
    case UIImageOrientationRightMirrored: orientationKey = @"right-mirrored"; break;
    default:                              orientationKey = @"up"; break;
  }
  NSMutableDictionary *out = [result mutableCopy];
  out[@"orientation"] = orientationKey;
  return out;
}

VISION_EXPORT_FRAME_PROCESSOR(AdvanceSeedsCoreMLFrameProcessorPlugin, advanceSeedsRunCoreML)

@end
