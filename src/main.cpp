#include "screen.hpp"

#include <rtc/rtc.hpp>
#include <x264.h>

#include <atomic>
#include <chrono>
#include <cstring>
#include <iostream>
#include <memory>
#include <thread>

int main() {
    std::cout << "remote-desktop test\n";

    // --------------------------------------------------------
    // Test libdatachannel
    // --------------------------------------------------------

    rtc::Configuration config;

    auto peerConnection =
        std::make_shared<rtc::PeerConnection>(config);

    std::cout << "libdatachannel: OK\n";

    // --------------------------------------------------------
    // x264
    // --------------------------------------------------------

    x264_t* encoder = nullptr;

    std::atomic<int> framesCaptured{0};
    std::atomic<int> framesEncoded{0};

    auto start = std::chrono::steady_clock::now();

    // --------------------------------------------------------
    // Screen capture
    // --------------------------------------------------------

    StartCapture([&](const Frame& frame) {
        if (!encoder) {
            x264_param_t param{};

            if (x264_param_default_preset(
                    &param,
                    "ultrafast",
                    "zerolatency"
                ) < 0) {
                std::cerr << "x264_param_default_preset failed\n";
                return;
            }

            param.i_width = frame.width;
            param.i_height = frame.height;

            param.i_fps_num = 60;
            param.i_fps_den = 1;

            param.i_csp = X264_CSP_BGRA;

            param.i_keyint_max = 60;
            param.i_bframe = 0;

            param.rc.i_rc_method = X264_RC_CRF;
            param.rc.f_rf_constant = 23.0f;

            param.b_repeat_headers = 1;
            param.b_annexb = 1;

            if (x264_param_apply_profile(
                    &param,
                    "baseline"
                ) < 0) {
                std::cerr << "x264_param_apply_profile failed\n";
                return;
            }

            encoder = x264_encoder_open(&param);

            if (!encoder) {
                std::cerr << "x264_encoder_open failed\n";
                return;
            }

            std::cout
                << "x264: OK "
                << frame.width
                << "x"
                << frame.height
                << "\n";
        }

        x264_picture_t input{};
        x264_picture_t output{};

        if (x264_picture_alloc(
                &input,
                X264_CSP_BGRA,
                frame.width,
                frame.height
            ) < 0) {
            std::cerr << "x264_picture_alloc failed\n";
            return;
        }

        // Copy BGRA frame into x264.
        for (int y = 0; y < frame.height; ++y) {
            std::memcpy(
                input.img.plane[0] +
                    y * input.img.i_stride[0],

                frame.data +
                    y * frame.stride,

                frame.width * 4
            );
        }

        input.i_pts = framesCaptured.load();

        x264_nal_t* nals = nullptr;
        int nalCount = 0;

        int encoded = x264_encoder_encode(
            encoder,
            &nals,
            &nalCount,
            &input,
            &output
        );

        if (encoded >= 0) {
            ++framesEncoded;

            if (framesEncoded % 60 == 0) {
                int bytes = 0;

                for (int i = 0; i < nalCount; ++i)
                    bytes += nals[i].i_payload;

                std::cout
                    << "encoded="
                    << framesEncoded.load()
                    << " nals="
                    << nalCount
                    << " bytes="
                    << bytes
                    << "\n";
            }
        }

        x264_picture_clean(&input);

        ++framesCaptured;
    });

    // --------------------------------------------------------
    // Run for 5 seconds
    // --------------------------------------------------------

    while (
        std::chrono::steady_clock::now() - start <
        std::chrono::seconds(5)
    ) {
        std::this_thread::sleep_for(
            std::chrono::milliseconds(100)
        );
    }

    std::cout
        << "captured="
        << framesCaptured.load()
        << "\n";

    std::cout
        << "encoded="
        << framesEncoded.load()
        << "\n";

    // --------------------------------------------------------
    // Cleanup
    // --------------------------------------------------------

    if (encoder)
        x264_encoder_close(encoder);

    return 0;
}