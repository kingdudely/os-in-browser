#pragma once

#include <cstdint>
#include <functional>

struct Frame {
    const uint8_t* data;
    const uint8_t* chroma;

    int width;
    int height;

    int stride;
    int chromaStride;
};

using FrameCallback = std::function<void(const Frame&)>;
void StartCapture(FrameCallback callback);