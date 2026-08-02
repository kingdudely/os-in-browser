#include "uinput.hpp"

#include <linux/uinput.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <cstring>

namespace {
int g_uinputFd = -1;
} // namespace

// Lazily opens and configures the uinput virtual device on first use.
int GetUinputFd() {
    if (g_uinputFd >= 0) return g_uinputFd;

    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) return -1;

    ioctl(fd, UI_SET_EVBIT, EV_KEY);
    ioctl(fd, UI_SET_EVBIT, EV_REL);
    ioctl(fd, UI_SET_EVBIT, EV_ABS);

    RegisterKeyboardKeyBits(fd);
    RegisterMouseButtonBits(fd);

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