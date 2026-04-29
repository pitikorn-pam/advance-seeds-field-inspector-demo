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
  if (pixelWidth <= 0 || markerSizeMm <= 0) {
    return nil;
  }

  const double imageArea = (double)bgr.cols * (double)bgr.rows;
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

@end
