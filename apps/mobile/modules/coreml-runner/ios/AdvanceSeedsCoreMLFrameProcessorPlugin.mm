#import <CoreML/CoreML.h>
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <VisionCamera/Frame.h>
#import <VisionCamera/FrameProcessorPlugin.h>

// CoreML Vision Camera frame-processor plugin. Runs the bundled YOLO26
// model on each camera frame entirely on the worklet thread — no JS
// bridge round-trip per frame, no SharedArrayBuffer cloning. Returns the
// largest output multiArray flattened to an NSArray of doubles + its
// shape, so the JS-side decoder helpers (`decodeYoloNms` etc.) take it
// straight.
//
// Usage from a worklet:
//   const result = __advanceSeedsRunCoreML(frame, { assetName: "yolo26n" });
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

static MLModel *loadModel(NSString *assetName) {
  MLModel *cached = modelCache()[assetName];
  if (cached != nil) {
    return cached;
  }
  NSURL *url = [[NSBundle mainBundle] URLForResource:assetName withExtension:@"mlmodelc"];
  if (url == nil) {
    return nil;
  }
  MLModelConfiguration *config = [[MLModelConfiguration alloc] init];
  config.computeUnits = MLComputeUnitsAll;
  NSError *err = nil;
  MLModel *model = [MLModel modelWithContentsOfURL:url configuration:config error:&err];
  if (model == nil) {
    NSLog(@"[CoreML FP] failed to load %@: %@", assetName, err);
    return nil;
  }
  modelCache()[assetName] = model;
  return model;
}

// Picks the largest MultiArray-typed output. YOLO26 NMS-baked exports
// produce a single output `[1, 300, 6]`; raw heads have a single big
// output `[1, channels, anchors]`. Either way, "largest" is the one we
// want for JS-side decoding.
static NSDictionary *flattenLargestMultiArray(NSDictionary<NSString *, VNCoreMLFeatureValueObservation *> *byName) {
  NSString *bestName = nil;
  MLMultiArray *bestArr = nil;
  NSInteger bestCount = -1;
  for (NSString *name in byName) {
    VNCoreMLFeatureValueObservation *obs = byName[name];
    MLFeatureValue *fv = obs.featureValue;
    if (fv.type != MLFeatureTypeMultiArray) continue;
    MLMultiArray *arr = fv.multiArrayValue;
    if (arr == nil) continue;
    if ((NSInteger)arr.count > bestCount) {
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
}

- (id _Nullable)callback:(Frame *)frame withArguments:(NSDictionary *_Nullable)arguments {
  NSString *assetName = arguments[@"assetName"];
  if (assetName == nil) {
    assetName = @"yolo26n";
  }
  CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(frame.buffer);
  if (imageBuffer == nil) {
    return nil;
  }

  if (_visionModel == nil || ![_visionModelAssetName isEqualToString:assetName]) {
    MLModel *model = loadModel(assetName);
    if (model == nil) {
      return nil;
    }
    NSError *err = nil;
    _visionModel = [VNCoreMLModel modelForMLModel:model error:&err];
    if (_visionModel == nil) {
      NSLog(@"[CoreML FP] VNCoreMLModel init failed: %@", err);
      return nil;
    }
    _visionModelAssetName = assetName;
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
                             result = flattenLargestMultiArray(byName);
                           }];
  request.imageCropAndScaleOption = VNImageCropAndScaleOptionScaleFit;

  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithCVPixelBuffer:(CVPixelBufferRef)imageBuffer
                                                   options:@{}];
  NSError *runErr = nil;
  [handler performRequests:@[ request ] error:&runErr];
  if (runErr != nil) {
    NSLog(@"[CoreML FP] performRequests failed: %@", runErr);
    return nil;
  }
  return result;
}

VISION_EXPORT_FRAME_PROCESSOR(AdvanceSeedsCoreMLFrameProcessorPlugin, advanceSeedsRunCoreML)

@end
