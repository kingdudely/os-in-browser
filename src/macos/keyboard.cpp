#include "../shared/addon.hpp"

#include <Carbon/Carbon.h>
#include <array>
#include <cstdint>
#include <optional>

namespace {
// NX_KEYTYPE
inline constexpr std::array<std::optional<CGKeyCode>, 174> kMacVirtualKeyMap = {
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, kVK_Function, std::nullopt,
    kVK_ANSI_A, kVK_ANSI_B, kVK_ANSI_C, kVK_ANSI_D, kVK_ANSI_E, kVK_ANSI_F,
    kVK_ANSI_G, kVK_ANSI_H, kVK_ANSI_I, kVK_ANSI_J, kVK_ANSI_K, kVK_ANSI_L,
    kVK_ANSI_M, kVK_ANSI_N, kVK_ANSI_O, kVK_ANSI_P, kVK_ANSI_Q, kVK_ANSI_R,
    kVK_ANSI_S, kVK_ANSI_T, kVK_ANSI_U, kVK_ANSI_V, kVK_ANSI_W, kVK_ANSI_X,
    kVK_ANSI_Y, kVK_ANSI_Z, kVK_ANSI_1, kVK_ANSI_2, kVK_ANSI_3, kVK_ANSI_4,
    kVK_ANSI_5, kVK_ANSI_6, kVK_ANSI_7, kVK_ANSI_8, kVK_ANSI_9, kVK_ANSI_0,
    kVK_Return, kVK_Escape, kVK_Delete, kVK_Tab, kVK_Space, kVK_ANSI_Minus,
    kVK_ANSI_Equal, kVK_ANSI_LeftBracket, kVK_ANSI_RightBracket,
    kVK_ANSI_Backslash, kVK_ANSI_Semicolon, kVK_ANSI_Quote, kVK_ANSI_Grave,
    kVK_ANSI_Comma, kVK_ANSI_Period, kVK_ANSI_Slash, kVK_CapsLock,
    kVK_F1, kVK_F2, kVK_F3, kVK_F4, kVK_F5, kVK_F6, kVK_F7, kVK_F8, kVK_F9,
    kVK_F10, kVK_F11, kVK_F12, std::nullopt, std::nullopt, std::nullopt,
    kVK_Help, kVK_Home, kVK_PageUp, kVK_ForwardDelete, kVK_End, kVK_PageDown,
    kVK_RightArrow, kVK_LeftArrow, kVK_DownArrow, kVK_UpArrow,
    kVK_ANSI_KeypadClear, kVK_ANSI_KeypadDivide, kVK_ANSI_KeypadMultiply,
    kVK_ANSI_KeypadMinus, kVK_ANSI_KeypadPlus, kVK_ANSI_KeypadEnter,
    kVK_ANSI_Keypad1, kVK_ANSI_Keypad2, kVK_ANSI_Keypad3, kVK_ANSI_Keypad4,
    kVK_ANSI_Keypad5, kVK_ANSI_Keypad6, kVK_ANSI_Keypad7, kVK_ANSI_Keypad8,
    kVK_ANSI_Keypad9, kVK_ANSI_Keypad0, kVK_ANSI_KeypadDecimal,
    kVK_ISO_Section, std::nullopt, std::nullopt, kVK_ANSI_KeypadEquals,
    kVK_F13, kVK_F14, kVK_F15, kVK_F16, kVK_F17, kVK_F18, kVK_F19, kVK_F20,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    kVK_Help, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, kVK_Mute, kVK_VolumeUp,
    kVK_VolumeDown, std::nullopt, std::nullopt, kVK_JIS_Kana, kVK_JIS_Yen,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, kVK_Control, kVK_Shift, kVK_Option, kVK_Command,
    kVK_RightControl, kVK_RightShift, kVK_RightOption, kVK_RightCommand,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt,
};

} // namespace

void SetKeyboardKey(const Napi::CallbackInfo& info) {
    std::uint8_t codeValue = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    if (codeValue >= kMacVirtualKeyMap.size()) return;
    auto vk = kMacVirtualKeyMap[codeValue];
    if (!vk) return;

    CGEventRef event = CGEventCreateKeyboardEvent(nullptr, *vk, isDown);
    CGEventPost(kCGHIDEventTap, event);
    CFRelease(event);
}