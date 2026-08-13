#include "../shared/addon.hpp"

#include <Carbon/Carbon.h>
#include <cmath>
#include <cstdint>
#include <IOKit/hidsystem/IOLLEvent.h>
#include <IOKit/hidsystem/IOHIDLib.h>
#include <IOKit/hidsystem/IOHIDParameter.h>

extern "C" {
    kern_return_t IOHIDPostEvent(io_connect_t connect, UInt32 eventType,
                                  IOGPoint location, const NXEventData *eventData,
                                  UInt32 eventDataVersion, IOOptionBits eventFlags,
                                  IOOptionBits options);
}

// Declared/defined in virtual_screen.mm.
void GetVirtualScreenSize(std::uint32_t& outWidth, std::uint32_t& outHeight);

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

void ScrollMouse(const Napi::CallbackInfo& info) {
    std::uint8_t deltaMode = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    float deltaX = info[1].As<Napi::Number>().FloatValue();
    float deltaY = info[2].As<Napi::Number>().FloatValue();
    float deltaZ = info[3].As<Napi::Number>().FloatValue();

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

void SetMouseButton(const Napi::CallbackInfo& info) {
    std::uint8_t button = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

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
void SetMousePosition(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    CGPoint location = CGPointMake(static_cast<CGFloat>(x), static_cast<CGFloat>(y));
    PostMouseEvent(kCGEventMouseMoved, location, kCGMouseButtonLeft);
}

void MoveMousePosition(const Napi::CallbackInfo& info) {
    std::int32_t dx = info[0].As<Napi::Number>().Int32Value();
    std::int32_t dy = info[1].As<Napi::Number>().Int32Value();

    io_connect_t conn = GetHIDConnect();
    if (conn == MACH_PORT_NULL) {
        // don't spam retries at input rate; caller/UI layer should
        // surface "Accessibility permission needed" separately
        return;
    }

    NXEventData ev = {};
    ev.mouseMove.dx = dx;
    ev.mouseMove.dy = dy;

    IOGPoint loc = {0, 0}; // ignored when kIOHIDSetRelativeCursorPosition is set

    IOHIDPostEvent(conn, NX_MOUSEMOVED, loc, &ev, kNXEventDataVersion,
                   NX_NONCOALSESCEDMASK, kIOHIDSetRelativeCursorPosition);
}