#include "../../shared/virtual_screen.hpp"

#include <Carbon/Carbon.h>
#import <Foundation/Foundation.h>
#import "../include/CGVirtualDisplay.mm"

namespace {
CGVirtualDisplay* g_virtualDisplay = nil;

// Fallback size used when the display is first created, before any
// explicit ResizeVirtualScreen() call.
constexpr std::uint32_t kDefaultWidth = 1920;
constexpr std::uint32_t kDefaultHeight = 1080;

void ApplyVirtualDisplayMode(CGVirtualDisplay* virtualDisplay, size_t screenWidth, size_t screenHeight, double refreshRate = 60.0) {
    CGVirtualDisplayMode* mode = [[CGVirtualDisplayMode alloc] initWithWidth:screenWidth height:screenHeight refreshRate:refreshRate];
    CGVirtualDisplaySettings* settings = [[CGVirtualDisplaySettings alloc] init];
    settings.modes = @[mode];
    [virtualDisplay applySettings:settings];
}
} // namespace

void CreateVirtualScreen() {
    if (g_virtualDisplay != nil) return;

    CGVirtualDisplayDescriptor *descriptor = [[CGVirtualDisplayDescriptor alloc] init];
    descriptor.name = @"Virtual Display";
    descriptor.sizeInMillimeters = CGSizeMake(kDefaultWidth / 4, kDefaultHeight / 4);
    descriptor.maxPixelsWide = kDefaultWidth;
    descriptor.maxPixelsHigh = kDefaultHeight;
    descriptor.serialNum = 1;
    descriptor.vendorID = 0x1234;
    descriptor.productID = 0x5678;

    g_virtualDisplay = [[CGVirtualDisplay alloc] initWithDescriptor:descriptor];

    ApplyVirtualDisplayMode(g_virtualDisplay, kDefaultWidth, kDefaultHeight);
}

void ResizeVirtualScreen(std::uint32_t width, std::uint32_t height) {
    if (g_virtualDisplay == nil) return;

    ApplyVirtualDisplayMode(g_virtualDisplay, width, height);
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