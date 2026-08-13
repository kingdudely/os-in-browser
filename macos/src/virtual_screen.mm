#include "../../shared/virtual_screen.hpp"

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

namespace {
CGVirtualDisplay* g_virtualDisplay = nil;
void ApplyVirtualDisplayMode(CGVirtualDisplay* virtualDisplay, size_t screenWidth, size_t screenHeight, double refreshRate = 60.0) {
    CGVirtualDisplayMode* mode = [[CGVirtualDisplayMode alloc] initWithWidth:screenWidth height:screenHeight refreshRate:refreshRate];
    CGVirtualDisplaySettings* settings = [[CGVirtualDisplaySettings alloc] init];
    settings.modes = @[mode];
    [virtualDisplay applySettings:settings];
}
} // namespace

void CreateVirtualScreen(const Napi::CallbackInfo& info) {
    std::uint32_t screenWidth = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t screenHeight = info[1].As<Napi::Number>().Uint32Value();

    if (g_virtualDisplay != nil) return;

    CGVirtualDisplayDescriptor *descriptor = [[CGVirtualDisplayDescriptor alloc] init];
    descriptor.name = @"Virtual Display";
    descriptor.sizeInMillimeters = CGSizeMake(screenWidth / 4, screenHeight / 4);
    descriptor.maxPixelsWide = screenWidth;
    descriptor.maxPixelsHigh = screenHeight;
    descriptor.serialNum = 1;
    descriptor.vendorID = 0x1234;
    descriptor.productID = 0x5678;

    g_virtualDisplay = [[CGVirtualDisplay alloc] initWithDescriptor:descriptor];

    ApplyVirtualDisplayMode(g_virtualDisplay, screenWidth, screenHeight);
}

void ResizeVirtualScreen(const Napi::CallbackInfo& info) {
    if (g_virtualDisplay == nil) return;

    std::uint32_t screenWidth = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t screenHeight = info[1].As<Napi::Number>().Uint32Value();

    ApplyVirtualDisplayMode(g_virtualDisplay, screenWidth, screenHeight);
}

void DestroyVirtualScreen(const Napi::CallbackInfo& info) {
    g_virtualDisplay = nil; // ARC releases; display disappears once deallocated
}

// Live current resolution of the virtual display, queried fresh -- used by
// mouse.mm for SetMousePosition/ScrollMouse so those can't go stale if the
// resolution changes outside Create/ResizeVirtualScreen (e.g. changed
// directly via System Settings > Displays).
void GetVirtualScreenSize(std::uint32_t& outWidth, std::uint32_t& outHeight) {
    outWidth = 0;
    outHeight = 0;
    if (g_virtualDisplay == nil) return;

    CGDirectDisplayID displayID = g_virtualDisplay.displayID;
    outWidth = static_cast<std::uint32_t>(CGDisplayPixelsWide(displayID));
    outHeight = static_cast<std::uint32_t>(CGDisplayPixelsHigh(displayID));
}