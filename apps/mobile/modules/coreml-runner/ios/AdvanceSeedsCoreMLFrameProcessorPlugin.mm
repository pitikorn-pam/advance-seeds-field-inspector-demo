#import <CoreML/CoreML.h>
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <VisionCamera/Frame.h>
#import <VisionCamera/FrameProcessorPlugin.h>

// CoreML Vision Camera frame-processor plugin. Runs the installed YOLO26
// model on each camera frame entirely on the worklet thread — no JS
// bridge round-trip per frame, no SharedArrayBuffer cloning. Returns the
// largest output multiArray flattened to an NSArray of doubles + its
// shape, so the JS-side decoder helpers (`decodeYoloNms` etc.) take it
// straight.
//
// Usage from a worklet:
//   const result = __advanceSeedsRunCoreML(frame, { modelPath });
// The first call lazy-loads the .mlmodelc; subsequent calls reuse the
// cached MLModel.

namespace {

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
// `includeMaskPrototype=YES` additionally locates and serializes the
// rank-4 prototype tensor under `protoShape` + `protoValues`, used by
// the live-mode segmentation polygon path. Skipped most frames to
// protect the bridge / JS budget (~820k float copy per frame).
static NSDictionary *flattenLargestMultiArray(NSDictionary<NSString *, VNCoreMLFeatureValueObservation *> *byName,
                                              BOOL includeMaskPrototype) {
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
    } else if (shape.count == 4 && includeMaskPrototype) {
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
  NSMutableDictionary *out = [@{
    @"outputName": bestName,
    @"shape": bestArr.shape,
    @"values": values,
  } mutableCopy];
  if (protoArr != nil) {
    NSMutableArray<NSNumber *> *protoValues = [NSMutableArray arrayWithCapacity:protoArr.count];
    switch (protoArr.dataType) {
      case MLMultiArrayDataTypeFloat32: {
        Float32 *p = (Float32 *)protoArr.dataPointer;
        for (NSInteger i = 0; i < (NSInteger)protoArr.count; i++) {
          [protoValues addObject:@((double)p[i])];
        }
        break;
      }
      case MLMultiArrayDataTypeDouble: {
        double *p = (double *)protoArr.dataPointer;
        for (NSInteger i = 0; i < (NSInteger)protoArr.count; i++) {
          [protoValues addObject:@(p[i])];
        }
        break;
      }
      default: {
        for (NSInteger i = 0; i < (NSInteger)protoArr.count; i++) {
          [protoValues addObject:@(protoArr[i].doubleValue)];
        }
        break;
      }
    }
    out[@"protoShape"] = protoArr.shape;
    out[@"protoValues"] = protoValues;
  }
  return out;
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
  // Caller throttles mask prototype extraction (it's ~820k floats per
  // frame across the JS bridge). When wantMask=NO we skip the prototype
  // copy entirely; the live overlay falls back to bbox until the next
  // wantMask=YES frame lands.
  BOOL wantMask = [arguments[@"wantMask"] boolValue];
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
                             result = flattenLargestMultiArray(byName, wantMask);
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
