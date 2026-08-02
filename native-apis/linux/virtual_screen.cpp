#include "../shared/addon.hpp"

#include <X11/extensions/Xrandr.h>
#include <X11/Xlib.h>
#include <cstdint>
#include <cstring>

namespace {

Display* g_display = nullptr;
RRCrtc g_crtc = 0;
RROutput g_output = 0;
RRMode g_mode = 0;

Display* GetX11Display() {
    if (g_display) return g_display;
    g_display = XOpenDisplay(nullptr);
    return g_display;
}

// Finds the first disconnected output driven by the dummy driver, which is
// what a pre-configured xf86-video-dummy Xorg setup exposes for us to use.
RROutput FindDummyOutput(Display* display, Window root) {
    XRRScreenResources* res = XRRGetScreenResources(display, root);
    RROutput found = 0;

    for (int i = 0; i < res->noutput; ++i) {
        XRROutputInfo* outputInfo = XRRGetOutputInfo(display, res, res->outputs[i]);
        if (outputInfo->connection == RR_Disconnected) {
            found = res->outputs[i];
            XRRFreeOutputInfo(outputInfo);
            break;
        }
        XRRFreeOutputInfo(outputInfo);
    }

    XRRFreeScreenResources(res);
    return found;
}

} // namespace

// Definitions for the globals declared extern in addon.hpp.
std::uint32_t g_screenWidth = 0;
std::uint32_t g_screenHeight = 0;

void CreateVirtualScreen(const Napi::CallbackInfo& info) {
    g_screenWidth = info[0].As<Napi::Number>().Uint32Value();
    g_screenHeight = info[1].As<Napi::Number>().Uint32Value();

    Display* display = GetX11Display();
    if (!display) return;

    Window root = DefaultRootWindow(display);
    XRRScreenResources* res = XRRGetScreenResources(display, root);

    g_output = FindDummyOutput(display, root);
    if (!g_output) { XRRFreeScreenResources(res); return; }

    XRRModeInfo modeInfo = {};
    modeInfo.width = g_screenWidth;
    modeInfo.height = g_screenHeight;
    modeInfo.hSyncStart = g_screenWidth;
    modeInfo.hSyncEnd = g_screenWidth;
    modeInfo.hTotal = g_screenWidth;
    modeInfo.vSyncStart = g_screenHeight;
    modeInfo.vSyncEnd = g_screenHeight;
    modeInfo.vTotal = g_screenHeight;
    modeInfo.dotClock = static_cast<unsigned long>(g_screenWidth) * g_screenHeight * 60;
    char modeName[32];
    snprintf(modeName, sizeof(modeName), "%ux%u_60", g_screenWidth, g_screenHeight);
    modeInfo.name = modeName;
    modeInfo.nameLength = strlen(modeName);

    g_mode = XRRCreateMode(display, root, &modeInfo);
    XRRAddOutputMode(display, g_output, g_mode);

    for (int i = 0; i < res->ncrtc; ++i) {
        XRRCrtcInfo* crtcInfo = XRRGetCrtcInfo(display, res, res->crtcs[i]);
        if (crtcInfo->noutput == 0) {
            g_crtc = res->crtcs[i];
            XRRFreeCrtcInfo(crtcInfo);
            break;
        }
        XRRFreeCrtcInfo(crtcInfo);
    }

    if (g_crtc) {
        XRRSetCrtcConfig(display, res, g_crtc, CurrentTime, 0, 0,
                          g_mode, RR_Rotate_0, &g_output, 1);
    }

    XRRFreeScreenResources(res);
    XFlush(display);
}

void ResizeVirtualScreen(const Napi::CallbackInfo& info) {
    Display* display = GetX11Display();
    if (!display || !g_output || !g_crtc) return;

    g_screenWidth = info[0].As<Napi::Number>().Uint32Value();
    g_screenHeight = info[1].As<Napi::Number>().Uint32Value();

    Window root = DefaultRootWindow(display);
    XRRScreenResources* res = XRRGetScreenResources(display, root);

    // Tear down the old mode, create a new one at the requested size.
    XRRSetCrtcConfig(display, res, g_crtc, CurrentTime, 0, 0, None, RR_Rotate_0, nullptr, 0);
    XRRDeleteOutputMode(display, g_output, g_mode);
    XRRDestroyMode(display, g_mode);

    XRRModeInfo modeInfo = {};
    modeInfo.width = g_screenWidth;
    modeInfo.height = g_screenHeight;
    modeInfo.hSyncStart = g_screenWidth;
    modeInfo.hSyncEnd = g_screenWidth;
    modeInfo.hTotal = g_screenWidth;
    modeInfo.vSyncStart = g_screenHeight;
    modeInfo.vSyncEnd = g_screenHeight;
    modeInfo.vTotal = g_screenHeight;
    modeInfo.dotClock = static_cast<unsigned long>(g_screenWidth) * g_screenHeight * 60;
    char modeName[32];
    snprintf(modeName, sizeof(modeName), "%ux%u_60", g_screenWidth, g_screenHeight);
    modeInfo.name = modeName;
    modeInfo.nameLength = strlen(modeName);

    g_mode = XRRCreateMode(display, root, &modeInfo);
    XRRAddOutputMode(display, g_output, g_mode);
    XRRSetCrtcConfig(display, res, g_crtc, CurrentTime, 0, 0,
                      g_mode, RR_Rotate_0, &g_output, 1);

    XRRFreeScreenResources(res);
    XFlush(display);
}

void DestroyVirtualScreen(const Napi::CallbackInfo& info) {
    Display* display = GetX11Display();
    if (!display || !g_output) return;

    Window root = DefaultRootWindow(display);
    XRRScreenResources* res = XRRGetScreenResources(display, root);

    if (g_crtc) {
        XRRSetCrtcConfig(display, res, g_crtc, CurrentTime, 0, 0, None, RR_Rotate_0, nullptr, 0);
    }
    if (g_mode) {
        XRRDeleteOutputMode(display, g_output, g_mode);
        XRRDestroyMode(display, g_mode);
    }

    XRRFreeScreenResources(res);
    XFlush(display);

    g_crtc = 0;
    g_output = 0;
    g_mode = 0;
}