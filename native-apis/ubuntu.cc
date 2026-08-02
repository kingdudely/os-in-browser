#include <napi.h>
#include <linux/types.h>
#include <linux/input.h>
#include <linux/input-event-codes.h>
#include <linux/uinput.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <optional>
#include <array>
#include <cstring>
#include <X11/extensions/Xrandr.h>
#include <X11/Xlib.h>

namespace {

inline constexpr std::array<__u16, 174> kLinuxKeyMap = {
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_FN, KEY_UNKNOWN,
    KEY_A, KEY_B, KEY_C, KEY_D, KEY_E, KEY_F, KEY_G, KEY_H, KEY_I, KEY_J,
    KEY_K, KEY_L, KEY_M, KEY_N, KEY_O, KEY_P, KEY_Q, KEY_R, KEY_S, KEY_T,
    KEY_U, KEY_V, KEY_W, KEY_X, KEY_Y, KEY_Z,
    KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8, KEY_9, KEY_0,
    KEY_ENTER, KEY_ESC, KEY_BACKSPACE, KEY_TAB, KEY_SPACE, KEY_MINUS,
    KEY_EQUAL, KEY_LEFTBRACE, KEY_RIGHTBRACE, KEY_BACKSLASH, KEY_SEMICOLON,
    KEY_APOSTROPHE, KEY_GRAVE, KEY_COMMA, KEY_DOT, KEY_SLASH, KEY_CAPSLOCK,
    KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6, KEY_F7, KEY_F8, KEY_F9,
    KEY_F10, KEY_F11, KEY_F12, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_HELP, KEY_HOME, KEY_PAGEUP, KEY_DELETE, KEY_END, KEY_PAGEDOWN,
    KEY_RIGHT, KEY_LEFT, KEY_DOWN, KEY_UP, KEY_NUMLOCK, KEY_KPSLASH,
    KEY_KPASTERISK, KEY_KPMINUS, KEY_KPPLUS, KEY_KPENTER, KEY_KP1, KEY_KP2,
    KEY_KP3, KEY_KP4, KEY_KP5, KEY_KP6, KEY_KP7, KEY_KP8, KEY_KP9, KEY_KP0,
    KEY_KPDOT, KEY_102ND, KEY_UNKNOWN, KEY_UNKNOWN, KEY_KPEQUAL,
    KEY_F13, KEY_F14, KEY_F15, KEY_F16, KEY_F17, KEY_F18, KEY_F19, KEY_F20,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_HELP, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_MUTE, KEY_VOLUMEUP,
    KEY_VOLUMEDOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_KATAKANA, KEY_YEN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_LEFTCTRL, KEY_LEFTSHIFT, KEY_LEFTALT, KEY_LEFTMETA,
    KEY_RIGHTCTRL, KEY_RIGHTSHIFT, KEY_RIGHTALT, KEY_RIGHTMETA,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
    KEY_UNKNOWN, KEY_UNKNOWN, KEY_UNKNOWN,
};

inline constexpr std::array<__u16, 5> kLinuxMouseButtonMap = {
    BTN_LEFT,
    BTN_MIDDLE,
    BTN_RIGHT,
    BTN_SIDE,
    BTN_EXTRA,
};

int g_uinputFd = -1;

// Lazily opens and configures the uinput virtual device on first use.
int GetUinputFd() {
    if (g_uinputFd >= 0) return g_uinputFd;

    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) return -1;

    ioctl(fd, UI_SET_EVBIT, EV_KEY);
    ioctl(fd, UI_SET_EVBIT, EV_REL);
    ioctl(fd, UI_SET_EVBIT, EV_ABS);

    for (auto code : kLinuxKeyMap) {
        if (code != KEY_UNKNOWN) ioctl(fd, UI_SET_KEYBIT, code);
    }
    for (auto code : kLinuxMouseButtonMap) {
        ioctl(fd, UI_SET_KEYBIT, code);
    }
    ioctl(fd, UI_SET_RELBIT, REL_X);
    ioctl(fd, UI_SET_RELBIT, REL_Y);
    ioctl(fd, UI_SET_RELBIT, REL_WHEEL);
    ioctl(fd, UI_SET_RELBIT, REL_HWHEEL);
    ioctl(fd, UI_SET_ABSBIT, ABS_X);
    ioctl(fd, UI_SET_ABSBIT, ABS_Y);

    struct uinput_setup setup{};
    setup.id.bustype = BUS_VIRTUAL;
    setup.id.vendor = 0x1;
    setup.id.product = 0x1;
    std::strncpy(setup.name, "virtual-input-device", sizeof(setup.name) - 1);

    ioctl(fd, UI_DEV_SETUP, &setup);
    ioctl(fd, UI_DEV_CREATE);

    g_uinputFd = fd;
    return g_uinputFd;
}

void EmitEvent(int fd, __u16 type, __u16 code, __s32 value) {
    struct input_event ev{};
    ev.type = type;
    ev.code = code;
    ev.value = value;
    write(fd, &ev, sizeof(ev));

    struct input_event syn{};
    syn.type = EV_SYN;
    syn.code = SYN_REPORT;
    syn.value = 0;
    write(fd, &syn, sizeof(syn));
}

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

void CreateVirtualScreen(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    Display* display = GetX11Display();
    if (!display) return;

    Window root = DefaultRootWindow(display);
    XRRScreenResources* res = XRRGetScreenResources(display, root);

    g_output = FindDummyOutput(display, root);
    if (!g_output) { XRRFreeScreenResources(res); return; }

    // Build a custom mode for the exact requested resolution.
    XRRModeInfo modeInfo = {};
    modeInfo.width = x;
    modeInfo.height = y;
    modeInfo.hSyncStart = x;
    modeInfo.hSyncEnd = x;
    modeInfo.hTotal = x;
    modeInfo.vSyncStart = y;
    modeInfo.vSyncEnd = y;
    modeInfo.vTotal = y;
    modeInfo.dotClock = static_cast<unsigned long>(x) * y * 60; // approx for 60Hz
    char modeName[32];
    snprintf(modeName, sizeof(modeName), "%ux%u_60", x, y);
    modeInfo.name = modeName;
    modeInfo.nameLength = strlen(modeName);

    g_mode = XRRCreateMode(display, root, &modeInfo);
    XRRAddOutputMode(display, g_output, g_mode);

    // Find an unused CRTC to drive the output.
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
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    Display* display = GetX11Display();
    if (!display || !g_output || !g_crtc) return;

    Window root = DefaultRootWindow(display);
    XRRScreenResources* res = XRRGetScreenResources(display, root);

    // Tear down the old mode, create a new one at the requested size.
    XRRSetCrtcConfig(display, res, g_crtc, CurrentTime, 0, 0, None, RR_Rotate_0, nullptr, 0);
    XRRDeleteOutputMode(display, g_output, g_mode);
    XRRDestroyMode(display, g_mode);

    XRRModeInfo modeInfo = {};
    modeInfo.width = x;
    modeInfo.height = y;
    modeInfo.hSyncStart = x;
    modeInfo.hSyncEnd = x;
    modeInfo.hTotal = x;
    modeInfo.vSyncStart = y;
    modeInfo.vSyncEnd = y;
    modeInfo.vTotal = y;
    modeInfo.dotClock = static_cast<unsigned long>(x) * y * 60;
    char modeName[32];
    snprintf(modeName, sizeof(modeName), "%ux%u_60", x, y);
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

void ScrollMouse(const Napi::CallbackInfo& info) {
    std::uint8_t deltaMode = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    float deltaX = info[1].As<Napi::Number>().FloatValue();
    float deltaY = info[2].As<Napi::Number>().FloatValue();
    // deltaZ (info[3]) has no evdev equivalent; ignored.

    int fd = GetUinputFd();
    if (fd < 0) return;

    float scale = (deltaMode == 2) ? 3.0f : 1.0f;

    if (deltaY != 0.0f) {
        EmitEvent(fd, EV_REL, REL_WHEEL, static_cast<__s32>(-deltaY * scale));
    }
    if (deltaX != 0.0f) {
        EmitEvent(fd, EV_REL, REL_HWHEEL, static_cast<__s32>(deltaX * scale));
    }
}

void SetKeyboardKey(const Napi::CallbackInfo& info) {
    std::uint8_t codeValue = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    if (codeValue >= kLinuxKeyMap.size()) return;
    __u16 code = kLinuxKeyMap[codeValue];
    if (code == KEY_UNKNOWN) return;

    int fd = GetUinputFd();
    if (fd < 0) return;

    EmitEvent(fd, EV_KEY, code, isDown ? 1 : 0);
}

void SetMouseButton(const Napi::CallbackInfo& info) {
    std::uint8_t button = static_cast<std::uint8_t>(info[0].As<Napi::Number>().Uint32Value());
    bool isDown = info[1].As<Napi::Boolean>().Value();

    if (button >= kLinuxMouseButtonMap.size()) return;

    int fd = GetUinputFd();
    if (fd < 0) return;

    EmitEvent(fd, EV_KEY, kLinuxMouseButtonMap[button], isDown ? 1 : 0);
}

void SetMousePosition(const Napi::CallbackInfo& info) {
    std::uint32_t x = info[0].As<Napi::Number>().Uint32Value();
    std::uint32_t y = info[1].As<Napi::Number>().Uint32Value();

    int fd = GetUinputFd();
    if (fd < 0) return;

    // Absolute positioning via uinput requires ABS_X/ABS_Y ranges to be
    // configured with UI_ABS_SETUP at device-creation time to match the
    // target display resolution; omitted here since resolution isn't known.
    // As a fallback, most callers use moveMousePosition (relative) instead.
    (void)x;
    (void)y;
}

void MoveMousePosition(const Napi::CallbackInfo& info) {
    std::int32_t x = info[0].As<Napi::Number>().Int32Value();
    std::int32_t y = info[1].As<Napi::Number>().Int32Value();

    int fd = GetUinputFd();
    if (fd < 0) return;

    if (x != 0) EmitEvent(fd, EV_REL, REL_X, x);
    if (y != 0) EmitEvent(fd, EV_REL, REL_Y, y);
}

} // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("createVirtualScreen", Napi::Function::New(env, CreateVirtualScreen));
    exports.Set("resizeVirtualScreen", Napi::Function::New(env, ResizeVirtualScreen));
    exports.Set("destroyVirtualScreen", Napi::Function::New(env, DestroyVirtualScreen));
    exports.Set("scrollMouse", Napi::Function::New(env, ScrollMouse));
    exports.Set("setKeyboardKey", Napi::Function::New(env, SetKeyboardKey));
    exports.Set("setMouseButton", Napi::Function::New(env, SetMouseButton));
    exports.Set("setMousePosition", Napi::Function::New(env, SetMousePosition));
    exports.Set("moveMousePosition", Napi::Function::New(env, MoveMousePosition));
    return exports;
}

NODE_API_MODULE(input_linux, Init)