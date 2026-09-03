#include "capture.h"

#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

int main() {
    std::atomic<int> frames = 0;

    if (!start_capture([&](const Frame& frame) {
        ++frames;

        if (frames % 60 == 0) {
            std::cout
                << "frames=" << frames
                << " "
                << frame.width << "x" << frame.height
                << " stride=" << frame.stride
                << '\n';
        }
    })) {
        std::cerr << "Failed to start capture\n";
        return 1;
    }

    std::this_thread::sleep_for(
        std::chrono::seconds(10)
    );

    stop_capture();

    std::cout << "Captured " << frames << " frames\n";

    return 0;
}