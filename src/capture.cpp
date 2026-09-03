#include "capture.h"

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>

#include <sys/ipc.h>
#include <sys/shm.h>

#include <atomic>
#include <chrono>
#include <cstring>
#include <thread>

static std::atomic<bool> running = false;
static std::thread capture_thread;

void capture_loop(FrameCallback callback) {
    Display* display = XOpenDisplay(nullptr);

    if (!display) {
        return;
    }

    Window root = DefaultRootWindow(display);

    XWindowAttributes attributes;
    XGetWindowAttributes(display, root, &attributes);

    const int width = attributes.width;
    const int height = attributes.height;

    XShmSegmentInfo shm_info{};

    XImage* image = XShmCreateImage(
        display,
        DefaultVisual(display, DefaultScreen(display)),
        DefaultDepth(display, DefaultScreen(display)),
        ZPixmap,
        nullptr,
        &shm_info,
        width,
        height
    );

    if (!image) {
        XCloseDisplay(display);
        return;
    }

    shm_info.shmid = shmget(
        IPC_PRIVATE,
        image->bytes_per_line * image->height,
        IPC_CREAT | 0600
    );

    if (shm_info.shmid == -1) {
        XDestroyImage(image);
        XCloseDisplay(display);
        return;
    }

    shm_info.shmaddr =
        static_cast<char*>(shmat(shm_info.shmid, nullptr, 0));

    image->data = shm_info.shmaddr;
    shm_info.readOnly = False;

    if (!XShmAttach(display, &shm_info)) {
        shmdt(shm_info.shmaddr);
        shmctl(shm_info.shmid, IPC_RMID, nullptr);
        XDestroyImage(image);
        XCloseDisplay(display);
        return;
    }

    XSync(display, False);

    while (running) {
        if (!XShmGetImage(
                display,
                root,
                image,
                0,
                0,
                AllPlanes
            )) {
            break;
        }

        Frame frame{
            reinterpret_cast<const uint8_t*>(image->data),
            width,
            height,
            image->bytes_per_line
        };

        callback(frame);

        std::this_thread::sleep_for(
            std::chrono::milliseconds(16)
        );
    }

    XShmDetach(display, &shm_info);
    XDestroyImage(image);

    shmdt(shm_info.shmaddr);
    shmctl(shm_info.shmid, IPC_RMID, nullptr);

    XCloseDisplay(display);
}

bool start_capture(FrameCallback callback) {
    if (running)
        return false;

    running = true;

    capture_thread = std::thread(
        capture_loop,
        std::move(callback)
    );

    return true;
}

void stop_capture() {
    running = false;

    if (capture_thread.joinable())
        capture_thread.join();
}