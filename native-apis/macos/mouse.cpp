#include "../shared/addon.hpp"

#include <Carbon/Carbon.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <memory>
#include <mutex>

#include <pqrs/karabiner/driverkit/virtual_hid_device_driver.hpp>
#include <pqrs/karabiner/driverkit/virtual_hid_device_service.hpp>

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

//
// Karabiner VirtualHIDDevice — used only for relative pointer movement.
//
// Lazily initialized on first MoveMousePosition call. `pqrs::dispatcher::extra::initialize_shared_dispatcher()`
// must be called exactly once before any client is constructed, and
// `terminate_shared_dispatcher()` once at process exit if you want a clean shutdown
// (not done here since this addon has no defined process-exit hook).
//
class KarabinerPointing {
public:
    static KarabinerPointing& Instance() {
        static KarabinerPointing instance;
        return instance;
    }

    // Blocks the calling thread until the virtual pointing device is ready,
    // or until timeout_ms elapses. Returns false on timeout/failure.
    bool WaitUntilReady(int timeout_ms = 3000) {
        std::unique_lock<std::mutex> lock(mutex_);
        return cv_.wait_for(lock, std::chrono::milliseconds(timeout_ms), [this] { return ready_; });
    }

    void PostRelative(std::int32_t dx, std::int32_t dy) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!client_ || !ready_) {
            return;
        }
        // HID relative reports are single signed bytes (two's-complement in a uint8_t),
        // range -127..127, so split any larger delta into multiple reports.
        while (dx != 0 || dy != 0) {
            std::int32_t stepX = std::clamp(dx, -127, 127);
            std::int32_t stepY = std::clamp(dy, -127, 127);

            pqrs::karabiner::driverkit::virtual_hid_device_driver::hid_report::pointing_input report;
            report.x = static_cast<std::uint8_t>(static_cast<std::int8_t>(stepX));
            report.y = static_cast<std::uint8_t>(static_cast<std::int8_t>(stepY));
            client_->async_post_report(report);

            dx -= stepX;
            dy -= stepY;
        }
    }

private:
    KarabinerPointing() {
        pqrs::dispatcher::extra::initialize_shared_dispatcher();

        client_ = std::make_unique<pqrs::karabiner::driverkit::virtual_hid_device_service::client>();

        client_->connected.connect([this] {
            client_->async_virtual_hid_pointing_initialize();
        });

        client_->virtual_hid_pointing_ready.connect([this](bool ready) {
            std::lock_guard<std::mutex> lock(mutex_);
            ready_ = ready;
            if (ready) {
                cv_.notify_all();
            }
        });

        client_->async_start();
    }

    std::unique_ptr<pqrs::karabiner::driverkit::virtual_hid_device_service::client> client_;
    std::mutex mutex_;
    std::condition_variable cv_;
    bool ready_ = false;
};

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

    auto& pointing = KarabinerPointing::Instance();
    if (!pointing.WaitUntilReady()) {
        Napi::Error::New(info.Env(),
            "Karabiner VirtualHIDDevice pointing device not ready "
            "(driver not installed/activated, daemon not running, or still starting up)")
            .ThrowAsJavaScriptException();
        return;
    }

    pointing.PostRelative(dx, dy);
}