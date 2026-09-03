#include "screen.hpp"
#include "BGRAToNV12.hpp"

#include <windows.h>

#include <thread>
#include <utility>

void StartCapture(FrameCallback callback) {
    std::thread([callback = std::move(callback)] {
        HDC screen = GetDC(nullptr);

        if (!screen)
            return;

        const int width =
            GetSystemMetrics(SM_CXSCREEN);

        const int height =
            GetSystemMetrics(SM_CYSCREEN);

        BITMAPINFO bmi{};

        bmi.bmiHeader.biSize =
            sizeof(BITMAPINFOHEADER);

        bmi.bmiHeader.biWidth = width;

        // Negative = top-down bitmap.
        bmi.bmiHeader.biHeight = -height;

        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        void* pixels = nullptr;

        HBITMAP bitmap = CreateDIBSection(
            screen,
            &bmi,
            DIB_RGB_COLORS,
            &pixels,
            nullptr,
            0
        );

        if (!bitmap) {
            ReleaseDC(nullptr, screen);
            return;
        }

        HDC memory = CreateCompatibleDC(screen);

        if (!memory) {
            DeleteObject(bitmap);
            ReleaseDC(nullptr, screen);
            return;
        }

        HGDIOBJ old =
            SelectObject(memory, bitmap);

        BGRAToNV12Converter converter;

        Frame frame{};

        while (true) {
            if (!BitBlt(
                    memory,
                    0,
                    0,
                    width,
                    height,
                    screen,
                    0,
                    0,
                    SRCCOPY | CAPTUREBLT)) {
                break;
            }

            frame.data =
                static_cast<const uint8_t*>(pixels);

            frame.chroma = nullptr;

            frame.width = width;
            frame.height = height;

            frame.stride = width * 4;
            frame.chromaStride = 0;

            converter.convert(frame);

            callback(frame);
        }

        SelectObject(memory, old);

        DeleteDC(memory);
        DeleteObject(bitmap);
        ReleaseDC(nullptr, screen);

    }).detach();
}