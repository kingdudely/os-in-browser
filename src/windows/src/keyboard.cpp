#include "keyboard.hpp"

#include <windows.h>
#include <array>
#include <cstdint>
#include <optional>

namespace {

// Index corresponds to the shared "code" enum (see codes.json), where:
//   0 Hyper, 1 Super, 2 FnLock, 3 Suspend, 4 Resume, 5 Turbo, 6 Sleep,
//   7 WakeUp, 8 Fn, 9 DisplayToggleIntExt, 10-35 KeyA-KeyZ,
//   36-45 Digit1-Digit9,Digit0, 46 Enter, ... 173 LaunchApp1
inline constexpr std::array<std::optional<WORD>, 174> kWindowsVirtualKeyMap = {
	// 0 Hyper, 1 Super, 2 FnLock, 3 Suspend, 4 Resume, 5 Turbo
	std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
	// 6 Sleep, 7 WakeUp, 8 Fn, 9 DisplayToggleIntExt
	VK_SLEEP, std::nullopt, std::nullopt, std::nullopt,
	// 10-35 KeyA-KeyZ
	'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
	'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
	// 36-45 Digit1-Digit9, Digit0
	'1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
	// 46-50 Enter, Escape, Backspace, Tab, Space
	VK_RETURN, VK_ESCAPE, VK_BACK, VK_TAB, VK_SPACE,
	// 51-61 Minus, Equal, BracketLeft, BracketRight, Backslash, Semicolon,
	//        Quote, Backquote, Comma, Period, Slash
	VK_OEM_MINUS, VK_OEM_PLUS, VK_OEM_4, VK_OEM_6, VK_OEM_5,
	VK_OEM_1, VK_OEM_7, VK_OEM_3, VK_OEM_COMMA, VK_OEM_PERIOD, VK_OEM_2,
	// 62 CapsLock
	VK_CAPITAL,
	// 63-74 F1-F12
	VK_F1, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7, VK_F8,
	VK_F9, VK_F10, VK_F11, VK_F12,
	// 75-77 PrintScreen, ScrollLock, Pause
	VK_SNAPSHOT, VK_SCROLL, VK_PAUSE,
	// 78-83 Insert, Home, PageUp, Delete, End, PageDown
	VK_INSERT, VK_HOME, VK_PRIOR, VK_DELETE, VK_END, VK_NEXT,
	// 84-87 ArrowRight, ArrowLeft, ArrowDown, ArrowUp
	VK_RIGHT, VK_LEFT, VK_DOWN, VK_UP,
	// 88-92 NumLock, NumpadDivide, NumpadMultiply, NumpadSubtract, NumpadAdd
	VK_NUMLOCK, VK_DIVIDE, VK_MULTIPLY, VK_SUBTRACT, VK_ADD,
	// 93 NumpadEnter
	VK_RETURN,
	// 94-102 Numpad1-Numpad9
	VK_NUMPAD1, VK_NUMPAD2, VK_NUMPAD3, VK_NUMPAD4, VK_NUMPAD5,
	VK_NUMPAD6, VK_NUMPAD7, VK_NUMPAD8, VK_NUMPAD9,
	// 103-104 Numpad0, NumpadDecimal
	VK_NUMPAD0, VK_DECIMAL,
	// 105-108 IntlBackslash, ContextMenu, Power, NumpadEqual
	VK_OEM_102, VK_APPS, std::nullopt, std::nullopt,
	// 109-120 F13-F24
	VK_F13, VK_F14, VK_F15, VK_F16, VK_F17, VK_F18,
	VK_F19, VK_F20, VK_F21, VK_F22, VK_F23, VK_F24,
	// 121-129 Open, Help, Select, Again, Undo, Cut, Copy, Paste, Find
	std::nullopt, VK_HELP, VK_SELECT, std::nullopt, std::nullopt,
	std::nullopt, std::nullopt, std::nullopt, std::nullopt,
	// 130-132 AudioVolumeMute, AudioVolumeUp, AudioVolumeDown
	VK_VOLUME_MUTE, VK_VOLUME_UP, VK_VOLUME_DOWN,
	// 133-138 NumpadComma, IntlRo, KanaMode, IntlYen, Convert, NonConvert
	VK_SEPARATOR, std::nullopt, VK_KANA, std::nullopt, VK_CONVERT, VK_NONCONVERT,
	// 139-143 Lang1-Lang5 (layout-specific; left unmapped)
	std::nullopt, std::nullopt, std::nullopt, std::nullopt, std::nullopt,
	// 144-147 Abort, Props, NumpadParenLeft, NumpadParenRight
	std::nullopt, std::nullopt, std::nullopt, std::nullopt,
	// 148-155 ControlLeft, ShiftLeft, AltLeft, MetaLeft,
	//         ControlRight, ShiftRight, AltRight, MetaRight
	VK_LCONTROL, VK_LSHIFT, VK_LMENU, VK_LWIN,
	VK_RCONTROL, VK_RSHIFT, VK_RMENU, VK_RWIN,
	// 156-160 MediaTrackNext, MediaTrackPrevious, MediaStop, MediaPlayPause, MediaSelect
	VK_MEDIA_NEXT_TRACK, VK_MEDIA_PREV_TRACK, VK_MEDIA_STOP,
	VK_MEDIA_PLAY_PAUSE, VK_LAUNCH_MEDIA_SELECT,
	// 161-162 MediaFastForward, MediaRewind (no standard VK)
	std::nullopt, std::nullopt,
	// 163-169 BrowserBack, BrowserForward, BrowserRefresh, BrowserStop,
	//         BrowserSearch, BrowserFavorites, BrowserHome
	VK_BROWSER_BACK, VK_BROWSER_FORWARD, VK_BROWSER_REFRESH, VK_BROWSER_STOP,
	VK_BROWSER_SEARCH, VK_BROWSER_FAVORITES, VK_BROWSER_HOME,
	// 170-173 ZoomToggle, Mail, LaunchApp2, LaunchApp1
	VK_ZOOM, VK_LAUNCH_MAIL, VK_LAUNCH_APP2, VK_LAUNCH_APP1,
};

} // namespace

void SetKeyboardKey(std::uint8_t codeValue, bool isDown) {
	if (codeValue >= kWindowsVirtualKeyMap.size()) return;
	auto vk = kWindowsVirtualKeyMap[codeValue];
	if (!vk) return;

	INPUT input{};
	input.type = INPUT_KEYBOARD;
	input.ki.wVk = *vk;
	input.ki.dwFlags = isDown ? 0 : KEYEVENTF_KEYUP;
	SendInput(1, &input, sizeof(INPUT));
}