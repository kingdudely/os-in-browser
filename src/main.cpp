#include <ScreenCapture.h>
#include <x264.h>

#include <cstring>
#include <iostream>
#include <vector>

int main() {
    auto monitors = SL::Screen_Capture::SCL_GetMonitors();

    if (monitors.empty()) {
        std::cerr << "No monitors found\n";
        return 1;
    }

    const auto monitor = monitors[0];

    const int width =
        SL::Screen_Capture::Width(monitor);

    const int height =
        SL::Screen_Capture::Height(monitor);

    // ---------------- x264 ----------------

    x264_param_t param{};

    x264_param_default_preset(
        &param,
        "ultrafast",
        "zerolatency"
    );

    param.i_width = width;
    param.i_height = height;

    param.i_fps_num = 60;
    param.i_fps_den = 1;

    // x264 accepts BGRA directly.
    param.i_csp = X264_CSP_BGRA;

    param.rc.i_rc_method = X264_RC_ABR;
    param.rc.i_bitrate = 8000; // kbps

    param.i_bframe = 0;
    param.b_repeat_headers = 1;
    param.b_annexb = 1;

    x264_param_apply_profile(&param, "baseline");

    x264_t* encoder = x264_encoder_open(&param);

    if (!encoder) {
        std::cerr << "Failed to open x264\n";
        return 1;
    }

    x264_picture_t picture{};

    x264_picture_alloc(
        &picture,
        X264_CSP_BGRA,
        width,
        height
    );

    // ---------------- capture ----------------

    auto capture =
        SL::Screen_Capture::CreateCaptureConfiguration(
            [monitor]() {
                return std::vector<
                    SL::Screen_Capture::Monitor
                >{monitor};
            }
        )
        ->onNewFrame(
            [&](const SL::Screen_Capture::Image& image,
                const SL::Screen_Capture::Monitor&) {

                const int w =
                    SL::Screen_Capture::Width(image);

                const int h =
                    SL::Screen_Capture::Height(image);

                if (w != width || h != height)
                    return;

                // Get BGRA from screen_capture_lite.
                const size_t bytes =
                    static_cast<size_t>(w) *
                    h *
                    4;

                std::vector<uint8_t> bgra(bytes);

                SL::Screen_Capture::
                    ExtractAndConvertToBGRA(
                        image,
                        bgra.data(),
                        bytes
                    );

                // Give BGRA directly to x264.
                std::memcpy(
                    picture.img.plane[0],
                    bgra.data(),
                    bytes
                );

                picture.i_pts++;

                x264_nal_t* nals = nullptr;
                int nal_count = 0;

                x264_picture_t output{};

                const int encoded =
                    x264_encoder_encode(
                        encoder,
                        &nals,
                        &nal_count,
                        &picture,
                        &output
                    );

                if (encoded <= 0)
                    return;

                std::cout
                    << "H264: "
                    << encoded
                    << " bytes, "
                    << nal_count
                    << " NALs\n";

                for (int i = 0; i < nal_count; ++i) {
                    const uint8_t* data =
                        nals[i].p_payload;

                    const size_t size =
                        nals[i].i_payload;

                    // NEXT:
                    // send `data + size`
                    // to libdatachannel.
                }
            }
        )
        ->start_capturing();

    std::cout << "Capturing "
              << width << "x"
              << height << "\n";

    std::cin.get();

    capture->stop_capturing();

    x264_picture_clean(&picture);
    x264_encoder_close(encoder);

    return 0;
}