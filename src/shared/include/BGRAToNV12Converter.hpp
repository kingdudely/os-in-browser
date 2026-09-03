#pragma once

#include <cstdint>
#include <vector>

#include <libyuv/convert_from_argb.h>

#include "screen.hpp"

class BGRAToNV12Converter {
public:
    void convert(Frame& frame)
    {
        const size_t size =
            static_cast<size_t>(frame.width) *
            frame.height * 3 / 2;

        if (buffer_.size() != size)
            buffer_.resize(size);

        const int ySize =
            frame.width * frame.height;

        uint8_t* y = buffer_.data();
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

private:
    std::vector<uint8_t> buffer_;
};