#include "screen.hpp"
#include "GetX11Display.hpp"

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>

#include <sys/ipc.h>
#include <sys/shm.h>

#include <thread>
#include <utility>

void StartCapture(FrameCallback callback) {
    std::thread([callback = std::move(callback)] {
        Display* display = GetX11Display();

        if (!display)
            return;

        const int screen = DefaultScreen(display);
        const Window root = RootWindow(display, screen);

        XWindowAttributes attributes{};
        XGetWindowAttributes(display, root, &attributes);

        const int width = attributes.width;
        const int height = attributes.height;

        XShmSegmentInfo shm{};

        XImage* image = XShmCreateImage(
            display,
            DefaultVisual(display, screen),
            DefaultDepth(display, screen),
            ZPixmap,
            nullptr,
            &shm,
            width,
            height
        );

        if (!image)
            return;

        shm.shmid = shmget(
            IPC_PRIVATE,
            image->bytes_per_line * image->height,
            IPC_CREAT | 0600
        );

        if (shm.shmid == -1) {
            XDestroyImage(image);
            return;
        }

        shm.shmaddr = static_cast<char*>(
            shmat(shm.shmid, nullptr, 0)
        );

        if (shm.shmaddr == reinterpret_cast<char*>(-1)) {
            shmctl(shm.shmid, IPC_RMID, nullptr);
            XDestroyImage(image);
            return;
        }

        image->data = shm.shmaddr;
        shm.readOnly = False;

        if (!XShmAttach(display, &shm)) {
            shmdt(shm.shmaddr);
            shmctl(shm.shmid, IPC_RMID, nullptr);
            XDestroyImage(image);
            return;
        }

        XSync(display, False);

        while (true) {
            if (!XShmGetImage(
                    display,
                    root,
                    image,
                    0,
                    0,
                    AllPlanes)) {
                break;
            }

            callback({
                reinterpret_cast<const uint8_t*>(image->data),
                width,
                height,
                image->bytes_per_line
            });
        }

        XShmDetach(display, &shm);
        XDestroyImage(image);
        shmdt(shm.shmaddr);
        shmctl(shm.shmid, IPC_RMID, nullptr);

    }).detach();
}