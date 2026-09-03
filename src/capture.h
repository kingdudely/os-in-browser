#pragma once

#include <cstdint>
#include <functional>

struct Frame {
    const uint8_t* data;
    int width;
    int height;
    int stride;
};

using FrameCallback = std::function<void(const Frame&)>;

bool start_capture(FrameCallback callback);
void stop_capture();