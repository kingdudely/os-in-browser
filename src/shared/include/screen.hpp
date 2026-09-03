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

void StartCapture(FrameCallback callback);