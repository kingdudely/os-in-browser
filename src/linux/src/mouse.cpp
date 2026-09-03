#include "mouse.hpp"
#include "GetX11Display.hpp"

#include <X11/Xlib.h>
#include <X11/extensions/XTest.h>
#include <cmath>
#include <cstdint>

// maybe uinput?

namespace {

// XTest button numbers: 1=left, 2=middle, 3=right, 4/5=vertical wheel,
// 6/7=horizontal wheel. Our external button index (0-4) maps to left/
// middle/right/side/extra -- side/extra have no XTest button equivalent
// on a stock Xvfb, so they're best-effort no-ops beyond 1-3.
constexpr unsigned int kXButtonMap[5] = {1, 2, 3, 8, 9};

// One logical wheel "detent" -- how many XTest button clicks we emit per
// unit of scroll delta, roughly matching typical OS wheel granularity.
constexpr float kWheelDelta = 120.0f;

void ClickWheel(Display* display, unsigned int button, int times) {
	for (int i = 0; i < times; ++i) {
		XTestFakeButtonEvent(display, button, True, CurrentTime);
		XTestFakeButtonEvent(display, button, False, CurrentTime);
	}
}

} // namespace

void ScrollMouse(std::uint8_t deltaMode, float deltaX, float deltaY, float deltaZ) {
	Display* display = GetX11Display();
	if (!display) return;

	// deltaMode: 0 = pixel, 1 = line, 2 = page. For pixel mode we treat one
	// wheel click as kWheelDelta pixels (matches typical OS wheel step).
	// For page mode a click is scaled to a fraction of the live screen
	// dimension so a full "page" scroll takes a handful of clicks rather
	// than one enormous jump.
	float scaleX, scaleY;
	switch (deltaMode) {
		case 2: { // page
			int screen = DefaultScreen(display);
			int screenWidth = DisplayWidth(display, screen);
			int screenHeight = DisplayHeight(display, screen);
			// One click = roughly one wheel-delta's worth of the screen,
			// so a full-page delta (1.0) works out to a handful of clicks.
			scaleX = static_cast<float>(screenWidth)  / (kWheelDelta / 8.0f);
			scaleY = static_cast<float>(screenHeight) / (kWheelDelta / 8.0f);
			break;
		}
		case 1: // line
			scaleX = scaleY = kWheelDelta;
			break;
		case 0: // pixel
		default:
			scaleX = scaleY = 1.0f;
			break;
	}

	int vClicks = static_cast<int>(std::lround(std::fabs(deltaY) / scaleY));
	if (vClicks > 0) {
		ClickWheel(display, deltaY < 0 ? 4 : 5, vClicks);
	}

	int hClicks = static_cast<int>(std::lround(std::fabs(deltaX) / scaleX));
	if (hClicks > 0) {
		ClickWheel(display, deltaX < 0 ? 6 : 7, hClicks);
	}

	XFlush(display);
}

void SetMouseButton(std::uint8_t button, bool isDown) {
	Display* display = GetX11Display();
	if (!display) return;
	if (button >= 5) return;

	XTestFakeButtonEvent(display, kXButtonMap[button], isDown ? True : False, CurrentTime);
	XFlush(display);
}

void SetMousePosition(std::uint32_t x, std::uint32_t y) {
	Display* display = GetX11Display();
	if (!display) return;

	// Absolute move -- XTest clamps to the current screen bounds itself,
	// so no screen-size lookup/normalization is needed here.
	XTestFakeMotionEvent(display, -1, static_cast<int>(x), static_cast<int>(y), CurrentTime);
	XFlush(display);
}

void MoveMousePosition(std::int32_t x, std::int32_t y) {
	Display* display = GetX11Display();
	if (!display) return;

	XTestFakeRelativeMotionEvent(display, x, y, CurrentTime);
	XFlush(display);
}