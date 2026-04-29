#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AdvanceSeedsArucoDetector : NSObject

+ (nullable NSDictionary<NSString *, id> *)detectInImageAtPath:(NSString *)path
                                                  markerSizeMm:(double)markerSizeMm
                                                         error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
