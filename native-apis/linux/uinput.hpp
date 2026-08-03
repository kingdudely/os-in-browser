#pragma once

#include <cstdint>
#include <linux/input.h>

// Lazily opens and configures the shared /dev/uinput virtual device on
// first use. Defined in uinput.cpp. Both keyboard.cpp and mouse.cpp emit
// through this same fd -- uinput only lets you create one device, so key
// and button/motion events have to share it.
int GetUinputFd();

// Normalized range for the ABS_X/ABS_Y axes, independent of actual screen
// resolution (see SetMousePosition in mouse.cpp). Kept one below INT32_MAX
// so that `maximum - minimum + 1` -- a common pattern in downstream
// consumers of absinfo, e.g. libinput/evdev calibration code -- doesn't
// overflow int32_t.
inline constexpr __s32 kAbsMax = INT32_MAX - 1;

// Writes one input_event. Does NOT sync -- call EmitSync() after one or
// more EmitEvent() calls to commit them as a single atomic frame.
void EmitEvent(int fd, __u16 type, __u16 code, __s32 value);

// Writes a SYN_REPORT, committing all EmitEvent() calls since the last
// sync as one input frame.
void EmitSync(int fd);

// Called by GetUinputFd() during device setup, before UI_DEV_CREATE, so
// every code each map might emit has its bit registered. Defined next to
// the map they correspond to, so the ioctl list stays next to the data
// that drives it.
void RegisterKeyboardKeyBits(int fd);
void RegisterMouseButtonBits(int fd);