#include "screen.hpp"

#include <srtc/peer_connection.h>
#include <x264.h>

#include <atomic>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <thread>

int main() {
    std::cout << "remote-desktop test\n";

    // ========================================================
    // Test srtc
    // ========================================================

    srtc::PeerConnection peerConnection(
        srtc::Direction::Publish
    );

    std::cout << "srtc: PeerConnection OK\n";

    // ========================================================
    // x264
    // ========================================================

    x264_t* encoder = nullptr;

    std::atomic<int> framesCaptured{0};
    std::atomic<int> framesEncoded{0};

    // ========================================================
    // Screen capture
    // ========================================================

    StartCapture([&](const Frame& frame) {

        ++framesCaptured;

        // ----------------------------------------------------
        // Initialize x264 from the first frame
        // ----------------------------------------------------

        if (!encoder) {
            x264_param_t param{};

            if (x264_param_default_preset(
                    &param,
                    "ultrafast",
                    "zerolatency"
                ) < 0) {

                std::cerr
                    << "x264_param_default_preset failed\n";

                return;
            }

            param.i_width = frame.width;
            param.i_height = frame.height;

            param.i_fps_num = 60;
            param.i_fps_den = 1;

            param.i_csp = X264_CSP_NV12;

            param.i_keyint_max = 60;
            param.i_bframe = 0;

            param.rc.i_rc_method = X264_RC_CRF;
            param.rc.f_rf_constant = 23.0f;

            param.b_repeat_headers = 1;
            param.b_annexb = 1;

            encoder = x264_encoder_open(&param);

            if (!encoder) {
                std::cerr
                    << "x264_encoder_open failed\n";

                return;
            }

            std::cout
                << "x264: OK "
                << frame.width
                << "x"
                << frame.height
                << " NV12\n";
        }

        // ----------------------------------------------------
        // Encode frame
        // ----------------------------------------------------

        x264_picture_t input{};
        x264_picture_t output{};

        input.img.i_csp = X264_CSP_NV12;
        input.img.i_plane = 2;

        input.img.plane[0] =
            const_cast<uint8_t*>(frame.data);

        input.img.plane[1] =
            const_cast<uint8_t*>(frame.chroma);

        input.img.i_stride[0] =
            frame.stride;

        input.img.i_stride[1] =
            frame.chromaStride;

        input.i_pts =
            static_cast<int64_t>(framesCaptured - 1);

        x264_nal_t* nals = nullptr;
        int nalCount = 0;

        const int encoded = x264_encoder_encode(
            encoder,
            &nals,
            &nalCount,
            &input,
            &output
        );

        if (encoded < 0) {
            std::cerr
                << "x264_encoder_encode failed\n";

            return;
        }

        ++framesEncoded;

        // ----------------------------------------------------
        // Print every 60 frames
        // ----------------------------------------------------

        if (framesEncoded % 60 == 0) {
            int bytes = 0;

            for (int i = 0; i < nalCount; ++i)
                bytes += nals[i].i_payload;

            std::cout
                << "captured="
                << framesCaptured.load()
                << " encoded="
                << framesEncoded.load()
                << " nals="
                << nalCount
                << " bytes="
                << bytes
                << "\n";
        }

        // ----------------------------------------------------
        // Later:
        //
        // srtc::PeerConnection::publishVideoFrame(...)
        //
        // will receive the encoded H.264 here.
        // ----------------------------------------------------
    });

    std::cout << "screen capture: started\n";

    // ========================================================
    // Keep process alive
    // ========================================================

    for (;;) {
        std::this_thread::sleep_for(
            std::chrono::hours(24)
        );
    }

    // Never reached in this test.
    if (encoder)
        x264_encoder_close(encoder);

    return 0;
}