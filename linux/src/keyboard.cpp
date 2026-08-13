#include "../../shared/keyboard.hpp"

#include "uinput.hpp"

#include <linux/input-event-codes.h>
#include <sys/ioctl.h>
#include <linux/uinput.h>
#include <array>
#include <cstdint>

namespace {
inline constexpr std::array<__u16, 174> kLinuxKeyMap = {
    // 0-5 Hyper, Super, FnLock, Suspend, Resume, Turbo
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    // 6-9 Sleep, WakeUp, Fn, DisplayToggleIntExt
    KEY_SLEEP, KEY_WAKEUP, KEY_FN, KEY_SWITCHVIDEOMODE,
    // 10-35 KeyA-KeyZ
    KEY_A, KEY_B, KEY_C, KEY_D, KEY_E, KEY_F, KEY_G, KEY_H, KEY_I, KEY_J,
    KEY_K, KEY_L, KEY_M, KEY_N, KEY_O, KEY_P, KEY_Q, KEY_R, KEY_S, KEY_T,
    KEY_U, KEY_V, KEY_W, KEY_X, KEY_Y, KEY_Z,
    // 36-45 Digit1-Digit9, Digit0
    KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9, KEY_0,
    // 46-50 Enter, Escape, Backspace, Tab, Space
    KEY_ENTER, KEY_ESC, KEY_BACKSPACE, KEY_TAB, KEY_SPACE,
    // 51-61 Minus, Equal, BracketLeft, BracketRight, Backslash, Semicolon,
    //        Quote, Backquote, Comma, Period, Slash
    KEY_MINUS, KEY_EQUAL, KEY_LEFTBRACE, KEY_RIGHTBRACE, KEY_BACKSLASH,
    KEY_SEMICOLON, KEY_APOSTROPHE, KEY_GRAVE, KEY_COMMA, KEY_DOT, KEY_SLASH,
    // 62 CapsLock
    KEY_CAPSLOCK,
    // 63-74 F1-F12
    KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6, KEY_F7, KEY_F8, KEY_F9,
    KEY_F10, KEY_F11, KEY_F12,
    // 75-77 PrintScreen, ScrollLock, Pause
    KEY_SYSRQ, KEY_SCROLLLOCK, KEY_PAUSE,
    // 78-83 Insert, Home, PageUp, Delete, End, PageDown
    KEY_INSERT, KEY_HOME, KEY_PAGEUP, KEY_DELETE, KEY_END, KEY_PAGEDOWN,
    // 84-87 ArrowRight, ArrowLeft, ArrowDown, ArrowUp
    KEY_RIGHT, KEY_LEFT, KEY_DOWN, KEY_UP,
    // 88-92 NumLock, NumpadDivide, NumpadMultiply, NumpadSubtract, NumpadAdd
    KEY_NUMLOCK, KEY_KPSLASH, KEY_KPASTERISK, KEY_KPMINUS, KEY_KPPLUS,
    // 93 NumpadEnter
    KEY_KPENTER,
    // 94-102 Numpad1-Numpad9
    KEY_KP1, KEY_KP2, KEY_KP3, KEY_KP4, KEY_KP5, KEY_KP6, KEY_KP7, KEY_KP8, KEY_KP9,
    // 103-104 Numpad0, NumpadDecimal
    KEY_KP0, KEY_KPDOT,
    // 105-108 IntlBackslash, ContextMenu, Power, NumpadEqual
    KEY_102ND, KEY_COMPOSE, KEY_POWER, KEY_KPEQUAL,
    // 109-120 F13-F24
    KEY_F13, KEY_F14, KEY_F15, KEY_F16, KEY_F17, KEY_F18,
    KEY_F19, KEY_F20, KEY_F21, KEY_F22, KEY_F23, KEY_F24,
    // 121-129 Open, Help, Select, Again, Undo, Cut, Copy, Paste, Find
    KEY_OPEN, KEY_HELP, KEY_SELECT, KEY_AGAIN, KEY_UNDO,
    KEY_CUT, KEY_COPY, KEY_PASTE, KEY_FIND,
    // 130-132 AudioVolumeMute, AudioVolumeUp, AudioVolumeDown
    KEY_MUTE, KEY_VOLUMEUP, KEY_VOLUMEDOWN,
    // 133-138 NumpadComma, IntlRo, KanaMode, IntlYen, Convert, NonConvert
    KEY_KPCOMMA, KEY_RO, KEY_KATAKANA, KEY_YEN, KEY_HENKAN, KEY_MUHENKAN,
    // 139-143 Lang1-Lang5 (layout-specific; left unmapped)
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    // 144-147 Abort, Props, NumpadParenLeft, NumpadParenRight
    KEY_UNKNOWN, KEY_PROPS, KEY_KPLEFTPAREN, KEY_KPRIGHTPAREN,
    // 148-155 ControlLeft, ShiftLeft, AltLeft, MetaLeft,
    //         ControlRight, ShiftRight, AltRight, MetaRight
    KEY_LEFTCTRL, KEY_LEFTSHIFT, KEY_LEFTALT, KEY_LEFTMETA,
    KEY_RIGHTCTRL, KEY_RIGHTSHIFT, KEY_RIGHTALT, KEY_RIGHTMETA,
    // 156-160 MediaTrackNext, MediaTrackPrevious, MediaStop, MediaPlayPause, MediaSelect
    KEY_NEXTSONG, KEY_PREVIOUSSONG, KEY_STOPCD, KEY_PLAYPAUSE, KEY_MEDIA,
    // 161-162 MediaFastForward, MediaRewind
    KEY_FASTFORWARD, KEY_REWIND,
    // 163-169 BrowserBack, BrowserForward, BrowserRefresh, BrowserStop,
    //         BrowserSearch, BrowserFavorites, BrowserHome
    KEY_BACK, KEY_FORWARD, KEY_REFRESH, KEY_STOP,
    KEY_SEARCH, KEY_BOOKMARKS, KEY_HOMEPAGE,
    // 170-173 ZoomToggle, Mail, LaunchApp2, LaunchApp1
    KEY_UNKNOWN, KEY_MAIL, KEY_PROG2, KEY_PROG1,
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