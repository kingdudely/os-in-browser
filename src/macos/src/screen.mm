#include "screen.hpp"

#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>

#include <dispatch/dispatch.h>

@interface CaptureOutput : NSObject <SCStreamOutput>

@property(nonatomic, copy) void (^callback)(CMSampleBufferRef);

@end

@implementation CaptureOutput

- (void)stream:(SCStream*)stream
didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
       ofType:(SCStreamOutputType)type
{
    if (type != SCStreamOutputTypeScreen)
        return;

    if (!CMSampleBufferIsValid(sampleBuffer))
        return;

    if (!self.callback)
        return;

    self.callback(sampleBuffer);
}

@end

void StartCapture(FrameCallback callback) {
    dispatch_async(
        dispatch_get_global_queue(
            QOS_CLASS_USER_INTERACTIVE,
            0
        ),
        ^{
            @autoreleasepool {
                dispatch_semaphore_t semaphore =
                    dispatch_semaphore_create(0);

                __block SCStream* stream = nil;

                [SCShareableContent
                    getShareableContentExcludingDesktopWindows:NO
                    onScreenWindowsOnly:YES
                    completionHandler:
                    ^(SCShareableContent* content, NSError* error) {

                        if (error) {
                            NSLog(
                                @"Failed to get shareable content: %@",
                                error
                            );

                            dispatch_semaphore_signal(semaphore);
                            return;
                        }

                        if (content.displays.count == 0) {
                            NSLog(@"No displays found");

                            dispatch_semaphore_signal(semaphore);
                            return;
                        }

                        SCDisplay* display =
                            content.displays[0];

                        SCContentFilter* filter =
                            [[SCContentFilter alloc]
                                initWithDisplay:display
                                excludingApplications:@[]
                                exceptingWindows:@[]];

                        SCStreamConfiguration* configuration =
                            [[SCStreamConfiguration alloc] init];

                        configuration.width = display.width;
                        configuration.height = display.height;

                        // Directly request BGRA.
                        configuration.pixelFormat =
                            kCVPixelFormatType_32BGRA;

                        configuration.minimumFrameInterval =
                            CMTimeMake(1, 60);

                        configuration.queueDepth = 3;
                        configuration.showsCursor = YES;

                        CaptureOutput* output =
                            [[CaptureOutput alloc] init];

                        output.callback =
                            [callback](CMSampleBufferRef sampleBuffer) {

                            CVPixelBufferRef buffer =
                                CMSampleBufferGetImageBuffer(
                                    sampleBuffer
                                );

                            if (!buffer)
                                return;

                            CVPixelBufferLockBaseAddress(
                                buffer,
                                kCVPixelBufferLock_ReadOnly
                            );

                            const auto* data =
                                static_cast<const uint8_t*>(
                                    CVPixelBufferGetBaseAddress(buffer)
                                );

                            if (data) {
                                Frame frame{
                                    data,
                                    static_cast<int>(
                                        CVPixelBufferGetWidth(buffer)
                                    ),
                                    static_cast<int>(
                                        CVPixelBufferGetHeight(buffer)
                                    ),
                                    static_cast<int>(
                                        CVPixelBufferGetBytesPerRow(buffer)
                                    )
                                };

                                callback(frame);
                            }

                            CVPixelBufferUnlockBaseAddress(
                                buffer,
                                kCVPixelBufferLock_ReadOnly
                            );
                        };

                        stream =
                            [[SCStream alloc]
                                initWithFilter:filter
                                configuration:configuration
                                delegate:nil];

                        NSError* error = nil;

                        BOOL added =
                            [stream
                                addStreamOutput:output
                                type:SCStreamOutputTypeScreen
                                sampleHandlerQueue:
                                    dispatch_get_global_queue(
                                        QOS_CLASS_USER_INTERACTIVE,
                                        0
                                    )
                                error:&error];

                        if (!added) {
                            NSLog(
                                @"Failed to add stream output: %@",
                                error
                            );

                            dispatch_semaphore_signal(semaphore);
                            return;
                        }

                        [stream
                            startCaptureWithCompletionHandler:
                            ^(NSError* error) {

                            if (error) {
                                NSLog(
                                    @"Failed to start capture: %@",
                                    error
                                );
                            } else {
                                NSLog(
                                    @"Started capture: %lux%lu",
                                    (unsigned long)display.width,
                                    (unsigned long)display.height
                                );
                            }

                            dispatch_semaphore_signal(semaphore);
                        }];
                    }];

                // Wait until startCapture has completed.
                dispatch_semaphore_wait(
                    semaphore,
                    DISPATCH_TIME_FOREVER
                );

                // Keep the stream alive.
                dispatch_main();
            }
        }
    );
}