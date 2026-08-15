#include "shared/include/virtual_screen.hpp"

#include <X11/extensions/Xrandr.h>
#include <X11/Xlib.h>
#include <cstdint>
#include <string>

namespace {

Display* g_display = nullptr;
std::string g_displayName;

} // namespace

Display* GetX11Display() {
    const char* displayEnv = getenv("DISPLAY");
    std::string currentDisplayName = displayEnv ? displayEnv : "";

    if (g_display && currentDisplayName != g_displayName) {
        XCloseDisplay(g_display);
        g_display = nullptr;
    }

    g_displayName = currentDisplayName;

    if (!g_display) {
        g_display = XOpenDisplay(nullptr);
    }

    return g_display;
}

// Xvfb ships one RandR output covering the whole root window, so resizing
// the screen is just XRRSetScreenSize with new pixel/mm dims.
void ResizeVirtualScreen(std::uint32_t width, std::uint32_t height) {
    Display* display = GetX11Display();
    if (!display) return;

    Window root = DefaultRootWindow(display);

    // 96 DPI -> mm conversion, matches Xvfb's default.
    int mmWidth  = static_cast<int>(width  * 25.4 / 96.0);
    int mmHeight = static_cast<int>(height * 25.4 / 96.0);

    XRRSetScreenSize(display, root, static_cast<int>(width), static_cast<int>(height),
                      mmWidth, mmHeight);
    XFlush(display);
}

void CreateVirtualScreen() {
    // no op because xvfb-run does it for us :)))))
}