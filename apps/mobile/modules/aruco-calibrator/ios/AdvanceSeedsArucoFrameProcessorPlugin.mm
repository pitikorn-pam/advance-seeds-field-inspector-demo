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

  int bestIndex = 0;
  double bestArea = 0;
  for (int i = 0; i < (int)markerCorners.size(); i++) {
    const double area = polygonArea(markerCorners[i]);
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
  const double confidence = std::max(0.6, std::min(1.0, 0.65 + areaRatio * 0.35));

  return @{
    @"pxPerMm": @(pixelWidth / markerSizeMm),
    @"markerId": @(markerIds[bestIndex]),
    @"confidence": @(confidence),
    @"observedAtMs": @([[NSDate date] timeIntervalSince1970] * 1000.0),
    @"markerSizeMm": @(markerSizeMm),
    @"pixelWidth": @(pixelWidth)
  };
}

NSDictionary<NSString *, id> *detectInPixelBuffer(CVPixelBufferRef pixelBuffer, double markerSizeMm) {
  OSType format = CVPixelBufferGetPixelFormatType(pixelBuffer);
  CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);

  NSDictionary<NSString *, id> *result = nil;

  if (format == kCVPixelFormatType_32BGRA) {
    const size_t width = CVPixelBufferGetWidth(pixelBuffer);
    const size_t height = CVPixelBufferGetHeight(pixelBuffer);
    const size_t bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer);
    void *baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer);
    cv::Mat bgra((int)height, (int)width, CV_8UC4, baseAddress, bytesPerRow);
    cv::Mat gray;
    cv::cvtColor(bgra, gray, cv::COLOR_BGRA2GRAY);
    result = detectInGrayMat(gray, markerSizeMm);
  } else if (CVPixelBufferGetPlaneCount(pixelBuffer) > 0) {
    const size_t width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0);
    const size_t height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0);
    const size_t bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0);
    void *baseAddress = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0);
    cv::Mat gray((int)height, (int)width, CV_8UC1, baseAddress, bytesPerRow);
    result = detectInGrayMat(gray, markerSizeMm);
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
  return detectInPixelBuffer((CVPixelBufferRef)imageBuffer, markerSizeMm);
}

VISION_EXPORT_FRAME_PROCESSOR(AdvanceSeedsArucoFrameProcessorPlugin, detectArucoCalibration)

@end
