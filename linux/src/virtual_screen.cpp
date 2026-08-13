#include "../../shared/virtual_screen.hpp"

#include <X11/extensions/Xrandr.h>
#include <X11/Xlib.h>
#include <cstdint>

namespace {

Display* g_display = nullptr;
std::string g_displayName;

} // namespace

Display* GetX11Display() {
    std::string currentDisplayName = getenv("DISPLAY");

    if (g_display && currentDisplayName != g_displayName) {
        // DISPLAY changed since we last opened -- reconnect to the new target.
        XCloseDisplay(g_display);
        g_displayName = currentDisplayName;
        g_display = nullptr;
    }

    if (!g_display) {
        g_display = XOpenDisplay(g_displayName);
    }

    return g_display;
}

// Xvfb ships one RandR output covering the whole root window, so resizing
// the screen is just XRRSetScreenSize with new pixel/mm dims.
void ResizeVirtualScreen(std::uint32_t screenWidth, std::uint32_t screenHeight) {
    Display* display = GetX11Display();
    if (!display) return;

    Window root = DefaultRootWindow(display);

    // 96 DPI -> mm conversion, matches Xvfb's default.
    int mmWidth  = static_cast<int>(screenWidth  * 25.4 / 96.0);
    int mmHeight = static_cast<int>(screenHeight * 25.4 / 96.0);

    XRRSetScreenSize(display, root, static_cast<int>(screenWidth), static_cast<int>(screenHeight),
                      mmWidth, mmHeight);
    XFlush(display);
}

void CreateVirtualScreen() {
    // no op because xvfb-run does it for us :)))))
}