#pragma once

#include <cstdint>
#include <vector>

#include <libyuv/convert_from_argb.h>

#include "screen.hpp"

inline void BGRAToNV12(Frame& frame)
{
    static std::vector<uint8_t> nv12;

    const size_t size =
        static_cast<size_t>(frame.width) *
        frame.height * 3 / 2;

    if (nv12.size() != size)
        nv12.resize(size);

    const int ySize = frame.width * frame.height;

    uint8_t* y = nv12.data();
    uint8_t* uv = y + ySize;

    libyuv::ARGBToNV12(
        frame.data,
        frame.stride,
        y,
        frame.width,
        uv,
        frame.width,
        frame.width,
        frame.height
    );

    frame.data = y;
    frame.chroma = uv;
    frame.stride = frame.width;
    frame.chromaStride = frame.width;
}