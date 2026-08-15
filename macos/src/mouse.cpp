#include "shared/include/mouse.hpp"

#include <Carbon/Carbon.h>
#include <cmath>
#include <cstdint>
#include <IOKit/hidsystem/IOLLEvent.h>
#include <IOKit/hidsystem/IOHIDLib.h>
#include <IOKit/hidsystem/IOHIDParameter.h>
#include "macos/include/IOHIDPostEvent.hpp"
#include "macos/include/virtual_screen.hpp"

namespace {

static io_connect_t g_hidConnect = MACH_PORT_NULL;

static io_connect_t GetHIDConnect() {
    if (g_hidConnect != MACH_PORT_NULL) {
        return g_hidConnect;
    }
    io_service_t service = IOServiceGetMatchingService(
        kIOMainPortDefault, IOServiceMatching(kIOHIDSystemClass));
    if (service == MACH_PORT_NULL) {
        return MACH_PORT_NULL;
    }
    kern_return_t kr = IOServiceOpen(service, mach_task_self(),
                                      kIOHIDParamConnectType, &g_hidConnect);
    IOObjectRelease(service);
    if (kr != KERN_SUCCESS) {
        g_hidConnect = MACH_PORT_NULL;
    }
    return g_hidConnect;
}

CGPoint CurrentMouseLocation() {
    CGEventRef event = CGEventCreate(nullptr);
    CGPoint point = CGEventGetLocation(event);
    CFRelease(event);
    return point;
}

void PostMouseEvent(CGEventType type, CGPoint location, CGMouseButton button) {
    CGEventRef event = CGEventCreateMouseEvent(nullptr, type, location, button);
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}

} // namespace

void CleanupHIDConnect() {
    if (g_hidConnect != MACH_PORT_NULL) {
        IOServiceClose(g_hidConnect);
        g_hidConnect = MACH_PORT_NULL;
    }
}

void ScrollMouse(std::uint8_t deltaMode, float deltaX, float deltaY, float deltaZ) {
    CGScrollEventUnit unit;
    float scaleX, scaleY;
    switch (deltaMode) {
        case 0: // pixel
            unit = kCGScrollEventUnitPixel;
            scaleX = scaleY = 1.0f;
            break;
        case 2: { // page = one full screen dimension, expressed as N lines
            unit = kCGScrollEventUnitLine;
            std::uint32_t screenWidth = 0, screenHeight = 0;
            GetVirtualScreenSize(screenWidth, screenHeight);
            scaleX = screenWidth  ? static_cast<float>(screenWidth)  : 3.0f;
            scaleY = screenHeight ? static_cast<float>(screenHeight) : 3.0f;
            break;
        }
        case 1: // line
        default:
            unit = kCGScrollEventUnitLine;
            scaleX = scaleY = 1.0f; // kCGScrollEventUnitLine already == one line
            break;
    }

    int32_t wheel1 = static_cast<int32_t>(std::lround(-deltaY * scaleY));
    int32_t wheel2 = static_cast<int32_t>(std::lround(-deltaX * scaleX));
    int32_t wheel3 = static_cast<int32_t>(std::lround(-deltaZ * scaleY));

    CGEventRef event = CGEventCreateScrollWheelEvent(nullptr, unit, 3, wheel1, wheel2, wheel3);
    CGEventSetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis1, -deltaY * scaleY);
    CGEventSetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis2, -deltaX * scaleX);
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}

void SetMouseButton(std::uint8_t button, bool isDown) {
    CGPoint location = CurrentMouseLocation();
    CGMouseButton cgButton;
    CGEventType type;

    switch (button) {
        case 0:
            cgButton = kCGMouseButtonLeft;
            type = isDown ? kCGEventLeftMouseDown : kCGEventLeftMouseUp;
            break;
        case 1:
            cgButton = kCGMouseButtonCenter;
            type = isDown ? kCGEventOtherMouseDown : kCGEventOtherMouseUp;
            break;
        case 2:
            cgButton = kCGMouseButtonRight;
            type = isDown ? kCGEventRightMouseDown : kCGEventRightMouseUp;
            break;
        case 3:
            cgButton = static_cast<CGMouseButton>(3);
            type = isDown ? kCGEventOtherMouseDown : kCGEventOtherMouseUp;
            break;
        case 4:
            cgButton = static_cast<CGMouseButton>(4);
            type = isDown ? kCGEventOtherMouseDown : kCGEventOtherMouseUp;
            break;
        default:
            return;
    }

    PostMouseEvent(type, location, cgButton);
}

// CGEventCreateMouseEvent takes absolute screen coordinates directly --
// no relative-delta conversion needed here.
void SetMousePosition(std::uint32_t absoluteX, std::uint32_t absoluteY) {
    CGPoint location = CGPointMake(static_cast<CGFloat>(absoluteX), static_cast<CGFloat>(absoluteY));
    PostMouseEvent(kCGEventMouseMoved, location, kCGMouseButtonLeft);
}

void MoveMousePosition(std::int32_t deltaX, std::int32_t deltaY) {
    io_connect_t conn = GetHIDConnect();
    if (conn == MACH_PORT_NULL) {
        // don't spam retries at input rate; caller/UI layer should
        // surface "Accessibility permission needed" separately
        return;
    }

    NXEventData ev = {};
    ev.mouseMove.dx = deltaX;
    ev.mouseMove.dy = deltaY;

    IOGPoint loc = {0, 0}; // ignored when kIOHIDSetRelativeCursorPosition is set

    IOHIDPostEvent(conn, NX_MOUSEMOVED, loc, &ev, kNXEventDataVersion,
                   NX_NONCOALSESCEDMASK, kIOHIDSetRelativeCursorPosition);
}