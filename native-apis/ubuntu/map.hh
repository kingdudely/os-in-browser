#include <array>
#include <cstdint>
#include <optional>

#include <linux/input-event-codes.h>

inline constexpr std::array<std::optional<uint32_t>, 174> codeValueToUinputKey = {
    std::nullopt,          // Hyper_L (no evdev equivalent)
    KEY_LEFTMETA,           // Super_L
    std::nullopt,
    std::nullopt,
    std::nullopt,
    std::nullopt,
    KEY_SLEEP,               // Sleep
    KEY_WAKEUP,               // WakeUp
    std::nullopt,
    KEY_SWITCHVIDEOMODE,       // Display
    KEY_A,
    KEY_B,
    KEY_C,
    KEY_D,
    KEY_E,
    KEY_F,
    KEY_G,
    KEY_H,
    KEY_I,
    KEY_J,
    KEY_K,
    KEY_L,
    KEY_M,
    KEY_N,
    KEY_O,
    KEY_P,
    KEY_Q,
    KEY_R,
    KEY_S,
    KEY_T,
    KEY_U,
    KEY_V,
    KEY_W,
    KEY_X,
    KEY_Y,
    KEY_Z,
    KEY_1,
    KEY_2,
    KEY_3,
    KEY_4,
    KEY_5,
    KEY_6,
    KEY_7,
    KEY_8,
    KEY_9,
    KEY_0,
    KEY_ENTER,
    KEY_ESC,
    KEY_BACKSPACE,
    KEY_TAB,
    KEY_SPACE,
    KEY_MINUS,
    KEY_EQUAL,
    KEY_LEFTBRACE,
    KEY_RIGHTBRACE,
    KEY_BACKSLASH,
    KEY_SEMICOLON,
    KEY_APOSTROPHE,
    KEY_GRAVE,
    KEY_COMMA,
    KEY_DOT,
    KEY_SLASH,
    KEY_CAPSLOCK,
    KEY_F1,
    KEY_F2,
    KEY_F3,
    KEY_F4,
    KEY_F5,
    KEY_F6,
    KEY_F7,
    KEY_F8,
    KEY_F9,
    KEY_F10,
    KEY_F11,
    KEY_F12,
    KEY_SYSRQ,               // Print / PrintScreen
    KEY_SCROLLLOCK,
    KEY_PAUSE,
    KEY_INSERT,
    KEY_HOME,
    KEY_PAGEUP,
    KEY_DELETE,
    KEY_END,
    KEY_PAGEDOWN,
    KEY_RIGHT,
    KEY_LEFT,
    KEY_DOWN,
    KEY_UP,
    KEY_NUMLOCK,
    KEY_KPSLASH,
    KEY_KPASTERISK,
    KEY_KPMINUS,
    KEY_KPPLUS,
    KEY_KPENTER,
    KEY_KP1,
    KEY_KP2,
    KEY_KP3,
    KEY_KP4,
    KEY_KP5,
    KEY_KP6,
    KEY_KP7,
    KEY_KP8,
    KEY_KP9,
    KEY_KP0,
    KEY_KPDOT,
    KEY_102ND,                // less (ISO extra key)
    KEY_COMPOSE,               // Menu
    std::nullopt,
    KEY_KPEQUAL,
    KEY_F13,
    KEY_F14,
    KEY_F15,
    KEY_F16,
    KEY_F17,
    KEY_F18,
    KEY_F19,
    KEY_F20,
    KEY_F21,
    KEY_F22,
    KEY_F23,
    KEY_F24,
    KEY_OPEN,
    KEY_HELP,
    std::nullopt,             // Select (no evdev equivalent)
    KEY_REDO,
    KEY_UNDO,
    std::nullopt,
    std::nullopt,
    std::nullopt,
    KEY_FIND,
    KEY_MUTE,                  // AudioMute
    KEY_VOLUMEUP,               // AudioRaiseVolume
    KEY_VOLUMEDOWN,             // AudioLowerVolume
    KEY_KPCOMMA,                // KP_Separator
    std::nullopt,
    std::nullopt,             // Kana_Shift (no clean evdev equivalent)
    std::nullopt,
    KEY_HENKAN,
    KEY_MUHENKAN,
    KEY_HANGEUL,                // Hangul
    KEY_HANJA,                   // Hangul_Hanja
    KEY_KATAKANA,
    KEY_HIRAGANA,
    KEY_ZENKAKUHANKAKU,
    std::nullopt,
    std::nullopt,
    std::nullopt,
    std::nullopt,
    KEY_LEFTCTRL,
    KEY_LEFTSHIFT,
    KEY_LEFTALT,
    KEY_LEFTMETA,               // Super_L (right-side block)
    KEY_RIGHTCTRL,
    KEY_RIGHTSHIFT,
    KEY_RIGHTALT,
    KEY_RIGHTMETA,               // Super_R
    KEY_NEXTSONG,                 // AudioNext
    KEY_PREVIOUSSONG,             // AudioPrev
    KEY_STOPCD,                    // AudioStop
    KEY_PLAYPAUSE,                 // AudioPlay
    std::nullopt,                // XF86 Select (no evdev equivalent)
    KEY_FASTFORWARD,               // AudioForward
    KEY_REWIND,                     // AudioRewind
    KEY_BACK,
    KEY_FORWARD,
    KEY_REFRESH,
    KEY_STOP,
    KEY_SEARCH,
    KEY_BOOKMARKS,                  // Favorites
    KEY_HOMEPAGE,
    std::nullopt,
    KEY_MAIL,
    KEY_CALC,                        // Calculator
    KEY_COMPUTER,                     // MyComputer
};