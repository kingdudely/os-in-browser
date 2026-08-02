#pragma once

#include <linux/input.h>

// Lazily opens and configures the shared /dev/uinput virtual device on
// first use. Defined in uinput.cpp. Both keyboard.cpp and mouse.cpp emit
// through this same fd -- uinput only lets you create one device, so key
// and button/motion events have to share it.
int GetUinputFd();

// Writes one input_event plus its SYN_REPORT.
void EmitEvent(int fd, __u16 type, __u16 code, __s32 value);

// Called by GetUinputFd() during device setup, before UI_DEV_CREATE, so
// every code each map might emit has its bit registered. Defined next to
// the map they correspond to, so the ioctl list stays next to the data
// that drives it.
void RegisterKeyboardKeyBits(int fd);
void RegisterMouseButtonBits(int fd);