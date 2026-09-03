#include "mouse.hpp"

#include <windows.h>
#include <cstdint>

void ScrollMouse(std::uint8_t deltaMode, float deltaX, float deltaY, float deltaZ) {
	float scaleX, scaleY;
	switch (deltaMode) {
		case 0: // pixel
			scaleX = scaleY = 1.0f;
			break;
		case 2: { // page = one full screen dimension
			int screenWidth = GetSystemMetrics(SM_CXSCREEN);
			int screenHeight = GetSystemMetrics(SM_CYSCREEN);
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

void SetMouseButton(std::uint8_t button, bool isDown) {
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
void SetMousePosition(std::uint32_t absoluteX, std::uint32_t absoluteY) {
	int screenWidth = GetSystemMetrics(SM_CXSCREEN);
	int screenHeight = GetSystemMetrics(SM_CYSCREEN);
	if (!screenWidth || !screenHeight) return;

	LONG normalizedX = MulDiv(absoluteX, 65536, screenWidth);
	LONG normalizedY = MulDiv(absoluteY, 65536, screenHeight);

	INPUT input{};
	input.type = INPUT_MOUSE;
	input.mi.dx = normalizedX;
	input.mi.dy = normalizedY;
	input.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE;
	SendInput(1, &input, sizeof(INPUT));
}

void MoveMousePosition(std::int32_t deltaX, std::int32_t deltaY) {
	INPUT input{};
	input.type = INPUT_MOUSE;
	input.mi.dx = deltaX;
	input.mi.dy = deltaY;
	input.mi.dwFlags = MOUSEEVENTF_MOVE; // no MOUSEEVENTF_ABSOLUTE -> dx/dy are
										// relative deltas per MOUSEINPUT docs
	SendInput(1, &input, sizeof(INPUT));
}