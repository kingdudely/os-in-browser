#include "../shared/addon.hpp"

#include <windows.h>
#include <cstdint>

namespace {

// Live current resolution, queried fresh each call -- never goes stale,
// no listener/thread needed.
void GetVirtualScreenSize(std::uint32_t& outWidth, std::uint32_t& outHeight) {
    outWidth = static_cast<std::uint32_t>(GetSystemMetrics(SM_CXSCREEN));
    outHeight = static_cast<std::uint32_t>(GetSystemMetrics(SM_CYSCREEN));
}

} // namespace

void ScrollMouse(const Napi::CallbackInfo& info) {
    std::uint8_t deltaMode = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    float deltaX = info[1].As<Napi::Number>().FloatValue();
    float deltaY = info[2].As<Napi::Number>().FloatValue();

    float scaleX, scaleY;
    switch (deltaMode) {
        case 0: // pixel
            scaleX = scaleY = 1.0f;
            break;
        case 2: { // page = one full screen dimension
            std::uint32_t screenWidth = 0, screenHeight = 0;
            GetVirtualScreenSize(screenWidth, screenHeight);
            scaleX = screenWidth  ? static_cast<float>(screenWidth)  : static_cast<float>(WHEEL_DELTA) * 3.0f;
            scaleY = screenHeight ? static_cast<float>(screenHeight) : static_cast<float>(WHEEL_DELTA) * 3.0f;
            break;
        }
        case 1: // line = one wheel detent
        default:
            scaleX = scaleY = static_cast<float>(WHEEL_DELTA);
            break;
    }

    INPUT input{};
    input.type = INPUT_MOUSE;
    if (deltaY != 0.0f) {
        input.mi.dwFlags = MOUSEEVENTF_WHEEL;
        input.mi.mouseData = static_cast<DWORD>(-deltaY * scaleY);
        SendInput(1, &input, sizeof(INPUT));
    }
    if (deltaX != 0.0f) {
        input.mi.dwFlags = MOUSEEVENTF_HWHEEL;
        input.mi.mouseData = static_cast<DWORD>(deltaX * scaleX);
        SendInput(1, &input, sizeof(INPUT));
    }
}

void SetMouseButton(const Napi::CallbackInfo& info) {
    std::uint8_t button = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    INPUT input{};
    input.type = INPUT_MOUSE;

    switch (button) {
        case 0: input.mi.dwFlags = isDown ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP; break;
        case 1: input.mi.dwFlags = isDown ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP; break;
        case 2: input.mi.dwFlags = isDown ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP; break;
        case 3:
            input.mi.dwFlags = isDown ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
            input.mi.mouseData = XBUTTON1;
            break;
        case 4:
            input.mi.dwFlags = isDown ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
            input.mi.mouseData = XBUTTON2;
            break;
        default:
            return;
    }

    SendInput(1, &input, sizeof(INPUT));
}

// Absolute positioning via SendInput + MOUSEEVENTF_ABSOLUTE. Normalizes
// against the live current resolution (queried fresh, not cached) so it
// can't go stale if the resolution changes outside Create/ResizeVirtualScreen.
// Assumes the VDD is the only display -- origin is always (0,0).
void SetMousePosition(const Napi::CallbackInfo& info) {
    std::int32_t x = info[0].As<Napi::Number>().Int32Value();
    std::int32_t y = info[1].As<Napi::Number>().Int32Value();

    std::uint32_t screenWidth = 0, screenHeight = 0;
    GetVirtualScreenSize(screenWidth, screenHeight);
    if (!screenWidth || !screenHeight) return;

    LONG normX = MulDiv(x, 65536, static_cast<int>(screenWidth));
    LONG normY = MulDiv(y, 65536, static_cast<int>(screenHeight));

    INPUT input{};
    input.type = INPUT_MOUSE;
    input.mi.dx = normX;
    input.mi.dy = normY;
    input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
    SendInput(1, &input, sizeof(INPUT));
}

void MoveMousePosition(const Napi::CallbackInfo& info) {
    std::int32_t x = info[0].As<Napi::Number>().Int32Value();
    std::int32_t y = info[1].As<Napi::Number>().Int32Value();

    INPUT input{};
    input.type = INPUT_MOUSE;
    input.mi.dx = x;
    input.mi.dy = y;
    input.mi.dwFlags = MOUSEEVENTF_MOVE; // no MOUSEEVENTF_ABSOLUTE -> dx/dy are
                                          // relative deltas per MOUSEINPUT docs
    SendInput(1, &input, sizeof(INPUT));
}