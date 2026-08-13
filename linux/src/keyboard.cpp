#include "../../shared/keyboard.hpp"
#include "../include/virtual_screen.hpp"

#include <X11/Xlib.h>
#include <X11/keysym.h>
#include <X11/XF86keysym.h>
#include <X11/extensions/XTest.h>
#include <array>
#include <cstdint>

namespace {

// Same 174-entry layout/index scheme as before, now mapping each custom
// code to an X11 KeySym instead of a Linux KEY_* code. NoSymbol marks
// codes with no clean X11 equivalent (mirrors the old KEY_UNKNOWN slots).
inline constexpr std::array<KeySym, 174> kX11KeySymMap = {
    // 0-5 Hyper, Super, FnLock, Suspend, Resume, Turbo
    NoSymbol, NoSymbol, NoSymbol, NoSymbol, NoSymbol, NoSymbol,
    // 6-9 Sleep, WakeUp, Fn, DisplayToggleIntExt
    XF86XK_Sleep, XF86XK_WakeUp, NoSymbol, XF86XK_Display,
    // 10-35 KeyA-KeyZ
    XK_a, XK_b, XK_c, XK_d, XK_e, XK_f, XK_g, XK_h, XK_i, XK_j,
    XK_k, XK_l, XK_m, XK_n, XK_o, XK_p, XK_q, XK_r, XK_s, XK_t,
    XK_u, XK_v, XK_w, XK_x, XK_y, XK_z,
    // 36-45 Digit1-Digit9, Digit0
    XK_1, XK_2, XK_3, XK_4, XK_5, XK_6, XK_7, XK_8, XK_9, XK_0,
    // 46-50 Enter, Escape, Backspace, Tab, Space
    XK_Return, XK_Escape, XK_BackSpace, XK_Tab, XK_space,
    // 51-61 Minus, Equal, BracketLeft, BracketRight, Backslash, Semicolon,
    //        Quote, Backquote, Comma, Period, Slash
    XK_minus, XK_equal, XK_bracketleft, XK_bracketright, XK_backslash,
    XK_semicolon, XK_apostrophe, XK_grave, XK_comma, XK_period, XK_slash,
    // 62 CapsLock
    XK_Caps_Lock,
    // 63-74 F1-F12
    XK_F1, XK_F2, XK_F3, XK_F4, XK_F5, XK_F6, XK_F7, XK_F8, XK_F9,
    XK_F10, XK_F11, XK_F12,
    // 75-77 PrintScreen, ScrollLock, Pause
    XK_Print, XK_Scroll_Lock, XK_Pause,
    // 78-83 Insert, Home, PageUp, Delete, End, PageDown
    XK_Insert, XK_Home, XK_Page_Up, XK_Delete, XK_End, XK_Page_Down,
    // 84-87 ArrowRight, ArrowLeft, ArrowDown, ArrowUp
    XK_Right, XK_Left, XK_Down, XK_Up,
    // 88-92 NumLock, NumpadDivide, NumpadMultiply, NumpadSubtract, NumpadAdd
    XK_Num_Lock, XK_KP_Divide, XK_KP_Multiply, XK_KP_Subtract, XK_KP_Add,
    // 93 NumpadEnter
    XK_KP_Enter,
    // 94-102 Numpad1-Numpad9
    XK_KP_1, XK_KP_2, XK_KP_3, XK_KP_4, XK_KP_5, XK_KP_6, XK_KP_7, XK_KP_8, XK_KP_9,
    // 103-104 Numpad0, NumpadDecimal
    XK_KP_0, XK_KP_Decimal,
    // 105-108 IntlBackslash, ContextMenu, Power, NumpadEqual
    XK_less, XK_Menu, XF86XK_PowerOff, XK_KP_Equal,
    // 109-120 F13-F24
    XK_F13, XK_F14, XK_F15, XK_F16, XK_F17, XK_F18,
    XK_F19, XK_F20, XK_F21, XK_F22, XK_F23, XK_F24,
    // 121-129 Open, Help, Select, Again, Undo, Cut, Copy, Paste, Find
    XK_Open, XK_Help, XK_Select, XK_Redo, XK_Undo,
    XF86XK_Cut, XF86XK_Copy, XF86XK_Paste, XK_Find,
    // 130-132 AudioVolumeMute, AudioVolumeUp, AudioVolumeDown
    XF86XK_AudioMute, XF86XK_AudioRaiseVolume, XF86XK_AudioLowerVolume,
    // 133-138 NumpadComma, IntlRo, KanaMode, IntlYen, Convert, NonConvert
    //         (IntlRo/IntlYen have no standalone X11 keysym; left unmapped)
    XK_KP_Separator, NoSymbol, XK_Kana_Shift, NoSymbol, XK_Henkan, XK_Muhenkan,
    // 139-143 Lang1-Lang5 (layout-specific; left unmapped)
    NoSymbol, NoSymbol, NoSymbol, NoSymbol, NoSymbol,
    // 144-147 Abort, Props, NumpadParenLeft, NumpadParenRight
    //         (no standard X11 keysyms for these; left unmapped)
    NoSymbol, XK_3270_ExSelect, NoSymbol, NoSymbol,
    // 148-155 ControlLeft, ShiftLeft, AltLeft, MetaLeft,
    //         ControlRight, ShiftRight, AltRight, MetaRight
    XK_Control_L, XK_Shift_L, XK_Alt_L, XK_Super_L,
    XK_Control_R, XK_Shift_R, XK_Alt_R, XK_Super_R,
    // 156-160 MediaTrackNext, MediaTrackPrevious, MediaStop, MediaPlayPause, MediaSelect
    XF86XK_AudioNext, XF86XK_AudioPrev, XF86XK_AudioStop, XF86XK_AudioPlay, XF86XK_Select,
    // 161-162 MediaFastForward, MediaRewind
    XF86XK_AudioForward, XF86XK_AudioRewind,
    // 163-169 BrowserBack, BrowserForward, BrowserRefresh, BrowserStop,
    //         BrowserSearch, BrowserFavorites, BrowserHome
    XF86XK_Back, XF86XK_Forward, XF86XK_Refresh, XF86XK_Stop,
    XF86XK_Search, XF86XK_Favorites, XF86XK_HomePage,
    // 170-173 ZoomToggle, Mail, LaunchApp2, LaunchApp1
    NoSymbol, XF86XK_Mail, XF86XK_MyComputer, XF86XK_Explorer,
};

} // namespace

void SetKeyboardKey(std::uint8_t code, bool isDown) {
    if (code >= kX11KeySymMap.size()) return;
    KeySym keysym = kX11KeySymMap[code];
    if (keysym == NoSymbol) return;

    Display* display = GetX11Display();
    if (!display) return;

    KeyCode keycode = XKeysymToKeycode(display, keysym);
    if (keycode == 0) return;

    XTestFakeKeyEvent(display, keycode, isDown ? True : False, CurrentTime);
    XFlush(display);
}