#include "../shared/addon.hpp"

#include <windows.h>
#include <array>
#include <cstdint>
#include <optional>

namespace {

inline constexpr std::array<std::optional<WORD>, 174> kWindowsVirtualKeyMap = {
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    VK_RETURN, VK_ESCAPE, VK_BACK, VK_TAB, VK_SPACE,
    VK_OEM_MINUS, VK_OEM_PLUS, VK_OEM_4, VK_OEM_6, VK_OEM_5,
    VK_OEM_1, VK_OEM_7, VK_OEM_3, VK_OEM_COMMA, VK_OEM_PERIOD, VK_OEM_2,
    VK_CAPITAL, VK_F1, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8,
    VK_F9, VK_F10, VK_F11, VK_F12, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, VK_HOME, VK_PRIOR, VK_DELETE, VK_END, VK_NEXT,
    VK_RIGHT, VK_LEFT, VK_DOWN, VK_UP, VK_CLEAR, VK_DIVIDE, VK_MULTIPLY,
    VK_SUBTRACT, VK_ADD, VK_RETURN, VK_NUMPAD1, VK_NUMPAD2, VK_NUMPAD3,
    VK_NUMPAD4, VK_NUMPAD5, VK_NUMPAD6, VK_NUMPAD7, VK_NUMPAD8, VK_NUMPAD9,
    VK_NUMPAD0, VK_DECIMAL, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, VK_F13, VK_F14, VK_F15, VK_F16, VK_F17, VK_F18, VK_F19,
    VK_F20, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, VK_HELP, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, VK_VOLUME_MUTE,
    VK_VOLUME_UP, VK_VOLUME_DOWN, std::nullopt, std::nullopt, VK_KANA,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, VK_CONTROL, VK_SHIFT, VK_MENU, VK_LWIN,
    VK_RCONTROL, VK_RSHIFT, VK_MENU, VK_RWIN, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
    std::nullopt, std::nullopt,
};

} // namespace

void SetKeyboardKey(const Napi::CallbackInfo& info) {
    std::uint8_t codeValue = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    if (codeValue >= kWindowsVirtualKeyMap.size()) return;
    auto vk = kWindowsVirtualKeyMap[codeValue];
    if (!vk) return;

    INPUT input{};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = *vk;
    input.ki.dwFlags = isDown ? 0 : KEYEVENTF_KEYUP;
    SendInput(1, &input, sizeof(INPUT));
}