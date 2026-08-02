#include "../shared/addon.hpp"

#include <Carbon/Carbon.h>
#include <cmath>
#include <cstdint>

namespace {

CGPoint CurrentMouseLocation() {
    CGEventRef event = CGEventCreate(nullptr);
    CGPoint point = CGEventGetLocation(event);
    CFRelease(event);
    return point;
}

void PostMouseEvent(CGEventType type, CGPoint location, CGMouseButton button, std::int32_t dx = 0, std::int32_t dy = 0) {
    CGEventRef event = CGEventCreateMouseEvent(nullptr, type, location, button);
    if (dx != 0 || dy != 0) {
        CGEventSetIntegerValueField(event, kCGMouseEventDeltaX, dx);
        CGEventSetIntegerValueField(event, kCGMouseEventDeltaY, dy);
    }
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}

} // namespace

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
        case 2: // page = one full screen dimension, expressed as N lines
            unit = kCGScrollEventUnitLine;
            scaleX = g_screenWidth  ? static_cast<float>(g_screenWidth)  : 3.0f;
            scaleY = g_screenHeight ? static_cast<float>(g_screenHeight) : 3.0f;
            break;
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

void SetMousePosition(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    CGPoint location = CGPointMake(static_cast<CGFloat>(x), static_cast<CGFloat>(y));
    PostMouseEvent(kCGEventMouseMoved, location, kCGMouseButtonLeft);
}

void MoveMousePosition(const Napi::CallbackInfo& info) {
    std::int32_t dx = info[0].As<Napi::Number>().Int32Value();
    std::int32_t dy = info[1].As<Napi::Number>().Int32Value();

    CGPoint current = CurrentMouseLocation();
    CGPoint newPos = CGPointMake(current.x + dx, current.y + dy);
    PostMouseEvent(kCGEventMouseMoved, newPos, kCGMouseButtonLeft, dx, dy);
}