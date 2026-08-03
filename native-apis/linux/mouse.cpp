#include "../shared/addon.hpp"
#include "uinput.hpp"

#include <linux/input-event-codes.h>
#include <sys/ioctl.h>
#include <linux/uinput.h>
#include <array>
#include <cmath>
#include <cstdint>

namespace {

inline constexpr std::array<__u16, 5> kLinuxMouseButtonMap = {
    BTN_LEFT,
    BTN_MIDDLE,
    BTN_RIGHT,
    BTN_SIDE,
    BTN_EXTRA,
};

// One logical wheel detent in REL_WHEEL_HI_RES units — mirrors Windows'
// WHEEL_DELTA convention, which the kernel's hi-res axis was modelled on.
inline constexpr float kWheelDelta = 120.0f;

constexpr __s32 MulDiv32(std::uint32_t a, __s32 b, std::uint32_t c) {
    return static_cast<__s32>((static_cast<std::uint64_t>(a) * b) / c);
}

} // namespace

// Registers a UI_SET_KEYBIT for every code in kLinuxMouseButtonMap. Called
// by GetUinputFd() (uinput.cpp) before UI_DEV_CREATE.
void RegisterMouseButtonBits(int fd) {
    for (auto code : kLinuxMouseButtonMap) {
        ioctl(fd, UI_SET_KEYBIT, code);
    }
}

void ScrollMouse(const Napi::CallbackInfo& info) {
    std::uint8_t deltaMode = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    float deltaX = info[1].As<Napi::Number>().FloatValue();
    float deltaY = info[2].As<Napi::Number>().FloatValue();

    int fd = GetUinputFd();
    if (fd < 0) return;

    if (deltaMode == 0) {
        if (deltaY != 0.0f) EmitEvent(fd, EV_REL, REL_WHEEL_HI_RES, static_cast<__s32>(-deltaY));
        if (deltaX != 0.0f) EmitEvent(fd, EV_REL, REL_HWHEEL_HI_RES, static_cast<__s32>(deltaX));
        EmitSyn(fd);
        return;
    }

    float scaleX, scaleY;
    switch (deltaMode) {
        case 2: // page = one full screen dimension, in hi-res units
            scaleX = g_screenWidth  ? static_cast<float>(g_screenWidth)  : kWheelDelta * 3.0f;
            scaleY = g_screenHeight ? static_cast<float>(g_screenHeight) : kWheelDelta * 3.0f;
            break;
        case 1: // line
        default:
            scaleX = scaleY = kWheelDelta;
            break;
    }

    if (deltaY != 0.0f) {
        EmitEvent(fd, EV_REL, REL_WHEEL_HI_RES, static_cast<__s32>(-deltaY * scaleY));
        EmitEvent(fd, EV_REL, REL_WHEEL, static_cast<__s32>(std::lround(-deltaY * scaleY / kWheelDelta)));
    }
    if (deltaX != 0.0f) {
        EmitEvent(fd, EV_REL, REL_HWHEEL_HI_RES, static_cast<__s32>(deltaX * scaleX));
        EmitEvent(fd, EV_REL, REL_HWHEEL, static_cast<__s32>(std::lround(deltaX * scaleX / kWheelDelta)));
    }
    EmitSyn(fd); // one frame for the whole gesture, not two
}

void SetMouseButton(const Napi::CallbackInfo& info) {
    std::uint8_t button = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    if (button >= kLinuxMouseButtonMap.size()) return;

    int fd = GetUinputFd();
    if (fd < 0) return;

    EmitEvent(fd, EV_KEY, kLinuxMouseButtonMap[button], isDown ? 1 : 0);
    EmitSyn(fd);
}

void SetMousePosition(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    int fd = GetUinputFd();
    if (fd < 0 || g_screenWidth == 0 || g_screenHeight == 0) return;

    __s32 normX = MulDiv32(x, kAbsMax, std::max<std::uint32_t>(g_screenWidth - 1, 1));
    __s32 normY = MulDiv32(y, kAbsMax, std::max<std::uint32_t>(g_screenHeight - 1, 1));

    EmitEvent(fd, EV_ABS, ABS_X, normX);
    EmitEvent(fd, EV_ABS, ABS_Y, normY);
    EmitSyn(fd);
}

void MoveMousePosition(const Napi::CallbackInfo& info) {
    std::int32_t x = info[0].As<Napi::Number>().Int32Value();
    std::int32_t y = info[1].As<Napi::Number>().Int32Value();

    int fd = GetUinputFd();
    if (fd < 0) return;

    if (x != 0) EmitEvent(fd, EV_REL, REL_X, x);
    if (y != 0) EmitEvent(fd, EV_REL, REL_Y, y);
    EmitSyn(fd);
}