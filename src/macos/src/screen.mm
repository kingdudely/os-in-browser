#include "screen.hpp"

#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>

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

    if (self.callback)
        self.callback(sampleBuffer);
}

@end

static SCStream* g_stream = nil;
static CaptureOutput* g_output = nil;

void StartCapture(FrameCallback callback)
{
    [SCShareableContent
        getShareableContentExcludingDesktopWindows:NO
        onScreenWindowsOnly:YES
        completionHandler:^(SCShareableContent* content, NSError* error)
    {
        if (error) {
            NSLog(@"getShareableContent failed: %@", error);
            return;
        }

        if (content.displays.count == 0) {
            NSLog(@"No displays found");
            return;
        }

        SCDisplay* display = content.displays[0];

        SCContentFilter* filter =
            [[SCContentFilter alloc]
                initWithDisplay:display
                excludingApplications:@[]
                exceptingWindows:@[]];

        SCStreamConfiguration* config =
            [[SCStreamConfiguration alloc] init];

        config.width = display.width;
        config.height = display.height;

        config.pixelFormat = kCVPixelFormatType_32BGRA;

        config.minimumFrameInterval =
            CMTimeMake(1, 60);

        config.queueDepth = 3;
        config.showsCursor = YES;
        config.capturesAudio = NO;

        g_output = [[CaptureOutput alloc] init];

        g_output.callback =
            [callback = std::move(callback)]
            (CMSampleBufferRef sampleBuffer)
        {
            CVPixelBufferRef buffer =
                (CVPixelBufferRef)
                CMSampleBufferGetImageBuffer(sampleBuffer);

            if (!buffer)
                return;

            CVPixelBufferLockBaseAddress(
                buffer,
                kCVPixelBufferLock_ReadOnly
            );

            const uint8_t* data =
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

        g_stream =
            [[SCStream alloc]
                initWithFilter:filter
                configuration:config
                delegate:nil];

        NSError* addError = nil;

        BOOL added =
            [g_stream
                addStreamOutput:g_output
                type:SCStreamOutputTypeScreen
                sampleHandlerQueue:
                    dispatch_get_global_queue(
                        QOS_CLASS_USER_INTERACTIVE,
                        0
                    )
                error:&addError];

        if (!added) {
            NSLog(
                @"addStreamOutput failed: %@",
                addError
            );

            g_stream = nil;
            g_output = nil;

            return;
        }

        [g_stream
            startCaptureWithCompletionHandler:
                ^(NSError* startError)
        {
            if (startError) {
                NSLog(
                    @"startCapture failed: %@",
                    startError
                );
                return;
            }

            NSLog(
                @"Screen capture started: %lux%lu",
                (unsigned long)display.width,
                (unsigned long)display.height
            );
        }];
    }];
}