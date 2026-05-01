#import "AdvanceSeedsArucoDetector.h"

#import <UIKit/UIKit.h>
#import <opencv2/imgproc.hpp>
#import <opencv2/objdetect/aruco_detector.hpp>

namespace {

cv::Mat cvMatFromUIImage(UIImage *image) {
  CGImageRef imageRef = image.CGImage;
  const size_t width = CGImageGetWidth(imageRef);
  const size_t height = CGImageGetHeight(imageRef);
  cv::Mat rgba((int)height, (int)width, CV_8UC4);
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(
    rgba.data,
    width,
    height,
    8,
    rgba.step[0],
    colorSpace,
    kCGImageAlphaPremultipliedLast | kCGBitmapByteOrderDefault
  );
  CGContextDrawImage(context, CGRectMake(0, 0, width, height), imageRef);
  CGContextRelease(context);
  CGColorSpaceRelease(colorSpace);

  cv::Mat bgr;
  cv::cvtColor(rgba, bgr, cv::COLOR_RGBA2BGR);
  return bgr;
}

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

} // namespace

@implementation AdvanceSeedsArucoDetector

+ (nullable NSDictionary<NSString *, id> *)detectInImageAtPath:(NSString *)path
                                                  markerSizeMm:(double)markerSizeMm
                                                         error:(NSError **)error {
  UIImage *image = [UIImage imageWithContentsOfFile:path];
  if (image == nil) {
    if (error != nil) {
      *error = [NSError errorWithDomain:@"AdvanceSeedsArucoCalibrator"
                                   code:2
                               userInfo:@{NSLocalizedDescriptionKey: @"Unable to load image for ArUco detection"}];
    }
    return nil;
  }

  cv::Mat bgr = cvMatFromUIImage(image);
  cv::Mat gray;
  cv::cvtColor(bgr, gray, cv::COLOR_BGR2GRAY);

  cv::aruco::Dictionary dictionary = cv::aruco::getPredefinedDictionary(cv::aruco::DICT_4X4_50);
  cv::aruco::DetectorParameters parameters;
  cv::aruco::ArucoDetector detector(dictionary, parameters);

  std::vector<std::vector<cv::Point2f>> markerCorners;
  std::vector<int> markerIds;
  detector.detectMarkers(gray, markerCorners, markerIds);

  if (markerIds.empty()) {
    return nil;
  }

  // Phase-2 multi-marker: compute pxPerMm for every detected marker so we
  // can publish a median across multiple physical markers in the same frame
  // alongside the legacy "best marker" tuple. The largest marker still wins
  // the bestIndex slot (drives confidence scoring + markerId selection).
  std::vector<double> perMarkerPxPerMm;
  perMarkerPxPerMm.reserve(markerCorners.size());
  int bestIndex = 0;
  double bestArea = 0;
  for (int i = 0; i < (int)markerCorners.size(); i++) {
    const double area = polygonArea(markerCorners[i]);
    const double edge = edgeLength(markerCorners[i]);
    if (edge > 0 && markerSizeMm > 0) {
      perMarkerPxPerMm.push_back(edge / markerSizeMm);
    }
    if (area > bestArea) {
      bestArea = area;
      bestIndex = i;
    }
  }

  const double pixelWidth = edgeLength(markerCorners[bestIndex]);
  if (pixelWidth <= 0 || markerSizeMm <= 0) {
    return nil;
  }

  const double imageArea = (double)bgr.cols * (double)bgr.rows;
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
  // Multi-marker agreement boosts confidence: each extra marker adds 0.05
  // up to 1.0 cap.
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

@end
