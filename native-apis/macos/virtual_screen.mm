#include "../shared/addon.hpp"

#include <Carbon/Carbon.h>
#import <Foundation/Foundation.h>

@interface CGVirtualDisplayDescriptor : NSObject
@property(copy) NSString *name;
@property CGSize sizeInMillimeters;
@property uint32_t maxPixelsWide;
@property uint32_t maxPixelsHigh;
@property uint32_t productID;
@property uint32_t vendorID;
@property uint32_t serialNum;
@end

@interface CGVirtualDisplayMode : NSObject
- (instancetype)initWithWidth:(uint32_t)width height:(uint32_t)height refreshRate:(double)refreshRate;
@end

@interface CGVirtualDisplaySettings : NSObject
@property(copy) NSArray<CGVirtualDisplayMode *> *modes;
@end

@interface CGVirtualDisplay : NSObject
- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor *)descriptor;
- (BOOL)applySettings:(CGVirtualDisplaySettings *)settings;
@property(readonly) CGDirectDisplayID displayID;
@end

// Definitions for the globals declared extern in addon.h.
std::uint32_t g_screenWidth = 0;
std::uint32_t g_screenHeight = 0;

namespace {
CGVirtualDisplay* g_virtualDisplay = nil;
} // namespace

void CreateVirtualScreen(const Napi::CallbackInfo& info) {
    g_screenWidth = info[0].As<Napi::Number>().Uint32Value();
    g_screenHeight = info[1].As<Napi::Number>().Uint32Value();

    if (g_virtualDisplay != nil) return;

    CGVirtualDisplayDescriptor *descriptor = [[CGVirtualDisplayDescriptor alloc] init];
    descriptor.name = @"Virtual Display";
    descriptor.sizeInMillimeters = CGSizeMake(g_screenWidth / 4, g_screenHeight / 4);
    descriptor.maxPixelsWide = g_screenWidth;
    descriptor.maxPixelsHigh = g_screenHeight;
    descriptor.serialNum = 1;
    descriptor.vendorID = 0x1234;
    descriptor.productID = 0x5678;

    g_virtualDisplay = [[CGVirtualDisplay alloc] initWithDescriptor:descriptor];

    CGVirtualDisplayMode *mode = [[CGVirtualDisplayMode alloc] initWithWidth:g_screenWidth height:g_screenHeight refreshRate:60.0];
    CGVirtualDisplaySettings *settings = [[CGVirtualDisplaySettings alloc] init];
    settings.modes = @[mode];
    [g_virtualDisplay applySettings:settings];
}

void ResizeVirtualScreen(const Napi::CallbackInfo& info) {
    if (g_virtualDisplay == nil) return;

    g_screenWidth = info[0].As<Napi::Number>().Uint32Value();
    g_screenHeight = info[1].As<Napi::Number>().Uint32Value();

    CGVirtualDisplayMode *mode = [[CGVirtualDisplayMode alloc] initWithWidth:g_screenWidth height:g_screenHeight refreshRate:60.0];
    CGVirtualDisplaySettings *settings = [[CGVirtualDisplaySettings alloc] init];
    settings.modes = @[mode];
    [g_virtualDisplay applySettings:settings];
}

void DestroyVirtualScreen(const Napi::CallbackInfo& info) {
    g_virtualDisplay = nil; // ARC releases; display disappears once deallocated
}