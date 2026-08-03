#include "../shared/addon.hpp"
#include "uinput.hpp"

#include <linux/input-event-codes.h>
#include <sys/ioctl.h>
#include <linux/uinput.h>
#include <array>
#include <cstdint>

namespace {

inline constexpr std::array<__u16, 174> kLinuxKeyMap = {
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_FN, KEY_UNKNOWN,
    KEY_A, KEY_B, KEY_C, KEY_D, KEY_E, KEY_F, KEY_G, KEY_H, KEY_I, KEY_J,
    KEY_K, KEY_L, KEY_M, KEY_N, KEY_O, KEY_P, KEY_Q, KEY_R, KEY_S, KEY_T,
    KEY_U, KEY_V, KEY_W, KEY_X, KEY_Y, KEY_Z,
    KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9, KEY_0,
    KEY_ENTER, KEY_ESC, KEY_BACKSPACE, KEY_TAB, KEY_SPACE, KEY_MINUS,
    KEY_EQUAL, KEY_LEFTBRACE, KEY_RIGHTBRACE, KEY_BACKSLASH, KEY_SEMICOLON,
    KEY_APOSTROPHE, KEY_GRAVE, KEY_COMMA, KEY_DOT, KEY_SLASH, KEY_CAPSLOCK,
    KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6, KEY_F7, KEY_F8, KEY_F9,
    KEY_F10, KEY_F11, KEY_F12, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_HELP, KEY_HOME, KEY_PAGEUP, KEY_DELETE, KEY_END, KEY_PAGEDOWN,
    KEY_RIGHT, KEY_LEFT, KEY_DOWN, KEY_UP, KEY_NUMLOCK, KEY_KPSLASH,
    KEY_KPASTERISK, KEY_KPMINUS, KEY_KPPLUS, KEY_KPENTER, KEY_KP1, KEY_KP2,
    KEY_KP3, KEY_KP4, KEY_KP5, KEY_KP6, KEY_KP7, KEY_KP8, KEY_KP9, KEY_KP0,
    KEY_KPDOT, KEY_102ND, KEY_UNKNOWN, KEY_UNKNOWN, KEY_KPEQUAL,
    KEY_F13, KEY_F14, KEY_F15, KEY_F16, KEY_F17, KEY_F18, KEY_F19, KEY_F20,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_HELP, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_MUTE, KEY_VOLUMEUP,
    KEY_VOLUMEDOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_KATAKANA, KEY_YEN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_LEFTCTRL, KEY_LEFTSHIFT, KEY_LEFTALT, KEY_LEFTMETA,
    KEY_RIGHTCTRL, KEY_RIGHTSHIFT, KEY_RIGHTALT, KEY_RIGHTMETA,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
};

} // namespace

// Registers a UI_SET_KEYBIT for every real code in kLinuxKeyMap. Called by
// GetUinputFd() (uinput.cpp) before UI_DEV_CREATE.
void RegisterKeyboardKeyBits(int fd) {
    for (auto code : kLinuxKeyMap) {
        if (code != KEY_UNKNOWN) ioctl(fd, UI_SET_KEYBIT, code);
    }
}

void SetKeyboardKey(const Napi::CallbackInfo& info) {
    std::uint8_t codeValue = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    if (codeValue >= kLinuxKeyMap.size()) return;
    __u16 code = kLinuxKeyMap[codeValue];
    if (code == KEY_UNKNOWN) return;

    int fd = GetUinputFd();
    if (fd < 0) return;

    EmitEvent(fd, EV_KEY, code, isDown ? 1 : 0);
    EmitSyn(fd);
}