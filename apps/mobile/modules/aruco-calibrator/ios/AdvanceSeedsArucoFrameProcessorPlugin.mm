#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <opencv2/imgproc.hpp>
#import <opencv2/objdetect/aruco_detector.hpp>
#import <VisionCamera/Frame.h>
#import <VisionCamera/FrameProcessorPlugin.h>

namespace {

double edgeLength(const std::vector<cv::Point2f> &corners) {
  if (corners.size() != 4) {
    return 0;
  }
  double total = 0;
  for (int i = 0; i < 4; i++) {
    cv::Point2f a = corners[i];
    cv::Point2f b = corners[(i + 1) % 4];
    total += cv::norm(a - b);
  }
  return total / 4.0;
}

double polygonArea(const std::vector<cv::Point2f> &corners) {
  if (corners.size() != 4) {
    return 0;
  }
  double area = 0;
  for (int i = 0; i < 4; i++) {
    const cv::Point2f a = corners[i];
    const cv::Point2f b = corners[(i + 1) % 4];
    area += (a.x * b.y) - (b.x * a.y);
  }
  return std::abs(area) / 2.0;
}

NSDictionary<NSString *, id> *detectInGrayMat(const cv::Mat &gray, double markerSizeMm) {
  if (gray.empty() || markerSizeMm <= 0) {
    return nil;
  }

  cv::aruco::Dictionary dictionary = cv::aruco::getPredefinedDictionary(cv::aruco::DICT_4X4_50);
  cv::aruco::DetectorParameters parameters;
  parameters.cornerRefinementMethod = cv::aruco::CORNER_REFINE_SUBPIX;
  cv::aruco::ArucoDetector detector(dictionary, parameters);

  std::vector<std::vector<cv::Point2f>> markerCorners;
  std::vector<int> markerIds;
  detector.detectMarkers(gray, markerCorners, markerIds);

  if (markerIds.empty()) {
    return nil;
  }

  // Phase-2 multi-marker: median across all detected markers + count, in
  // addition to the legacy "best marker" tuple. See AdvanceSeedsArucoDetector.mm
  // for the same logic; this is the live-frame variant.
  std::vector<double> perMarkerPxPerMm;
  perMarkerPxPerMm.reserve(markerCorners.size());
  int bestIndex = 0;
  double bestArea = 0;
  for (int i = 0; i < (int)markerCorners.size(); i++) {
    const double area = polygonArea(markerCorners[i]);
    const double edge = edgeLength(markerCorners[i]);
    if (edge > 0 && markerSizeMm > 0) perMarkerPxPerMm.push_back(edge / markerSizeMm);
    if (area > bestArea) {
      bestArea = area;
      bestIndex = i;
    }
  }

  const double pixelWidth = edgeLength(markerCorners[bestIndex]);
  if (pixelWidth <= 0) {
    return nil;
  }

  const double imageArea = (double)gray.cols * (double)gray.rows;
  const double areaRatio = imageArea > 0 ? std::min(1.0, bestArea / imageArea / 0.08) : 0.0;
  const double singleConfidence = std::max(0.6, std::min(1.0, 0.65 + areaRatio * 0.35));
  const int markerCount = (int)perMarkerPxPerMm.size();
  double multiMedianPxPerMm = pixelWidth / markerSizeMm;
  if (markerCount > 1) {
    std::vector<double> sorted = perMarkerPxPerMm;
    std::sort(sorted.begin(), sorted.end());
    const int mid = markerCount / 2;
    multiMedianPxPerMm = (markerCount % 2 == 0)
      ? (sorted[mid - 1] + sorted[mid]) / 2.0
      : sorted[mid];
  }
  const double confidence = markerCount > 1
    ? std::min(1.0, singleConfidence + 0.05 * (double)(markerCount - 1))
    : singleConfidence;

  return @{
    @"pxPerMm": @(pixelWidth / markerSizeMm),
    @"markerId": @(markerIds[bestIndex]),
    @"confidence": @(confidence),
    @"observedAtMs": @([[NSDate date] timeIntervalSince1970] * 1000.0),
    @"markerSizeMm": @(markerSizeMm),
    @"pixelWidth": @(pixelWidth),
    @"markerCount": @(markerCount),
    @"multiMedianPxPerMm": @(multiMedianPxPerMm)
  };
}

NSDictionary<NSString *, id> *detectInPixelBuffer(CVPixelBufferRef pixelBuffer, double markerSizeMm) {
  OSType format = CVPixelBufferGetPixelFormatType(pixelBuffer);
  CVReturn lockResult = CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
  if (lockResult != kCVReturnSuccess) {
    NSLog(@"[aruco] unable to lock frame pixel buffer: %d", lockResult);
    return nil;
  }

  NSDictionary<NSString *, id> *result = nil;

  if (format == kCVPixelFormatType_32BGRA) {
    const size_t width = CVPixelBufferGetWidth(pixelBuffer);
    const size_t height = CVPixelBufferGetHeight(pixelBuffer);
    const size_t bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer);
    void *baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer);
    if (baseAddress == nullptr) {
      CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
      return nil;
    }
    cv::Mat bgra((int)height, (int)width, CV_8UC4, baseAddress, bytesPerRow);
    cv::Mat gray;
    cv::cvtColor(bgra, gray, cv::COLOR_BGRA2GRAY);
    result = detectInGrayMat(gray, markerSizeMm);
  } else if (CVPixelBufferGetPlaneCount(pixelBuffer) > 0) {
    const size_t width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0);
    const size_t height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0);
    const size_t bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0);
    void *baseAddress = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0);
    if (baseAddress == nullptr) {
      CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
      return nil;
    }
    cv::Mat gray((int)height, (int)width, CV_8UC1, baseAddress, bytesPerRow);
    result = detectInGrayMat(gray, markerSizeMm);
  } else {
    NSLog(@"[aruco] unsupported frame pixel format: %u", format);
  }

  CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
  return result;
}

} // namespace

@interface AdvanceSeedsArucoFrameProcessorPlugin : FrameProcessorPlugin
@end

@implementation AdvanceSeedsArucoFrameProcessorPlugin

- (id _Nullable)callback:(Frame *)frame withArguments:(NSDictionary *_Nullable)arguments {
  NSNumber *markerSizeArg = arguments[@"markerSizeMm"];
  const double markerSizeMm = markerSizeArg != nil ? markerSizeArg.doubleValue : 50.0;
  CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(frame.buffer);
  if (imageBuffer == nil) {
    return nil;
  }
  try {
    return detectInPixelBuffer((CVPixelBufferRef)imageBuffer, markerSizeMm);
  } catch (const cv::Exception &e) {
    NSLog(@"[aruco] OpenCV frame processor error: %s", e.what());
    return nil;
  } catch (const std::exception &e) {
    NSLog(@"[aruco] frame processor error: %s", e.what());
    return nil;
  } catch (...) {
    NSLog(@"[aruco] unknown frame processor error");
    return nil;
  }
}

VISION_EXPORT_FRAME_PROCESSOR(AdvanceSeedsArucoFrameProcessorPlugin, detectArucoCalibration)

@end
