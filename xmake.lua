set_project("remote-desktop")
set_version("1.0.0")

set_languages("cxx17")

add_rules("mode.debug", "mode.release")


-- ============================================================
-- srtc
-- ============================================================

package("srtc")
    set_homepage("https://github.com/kmansoft/srtc")
    set_description("A simple WebRTC implementation in C++")
    set_license("MPL-2.0")

    add_urls("https://github.com/kmansoft/srtc/archive/refs/tags/ver-0.5.2.tar.gz")
    add_versions(
        "0.5.2",
        "090c6c306259fa9a2f750068d68b7f006a24063223a46729c0b8946020dac4ad"
    )

    add_deps("cmake", "openssl")

    on_install(function(package)
        import("package.tools.cmake")

        cmake.install(package, {
            "-DSRTC_BUILD_TESTS=OFF",
            "-DSRTC_BUILD_TOOLS=OFF"
        })
    end)
package_end()


-- ============================================================
-- Dependencies
-- ============================================================

add_requires("srtc 0.5.2")
add_requires("libyuv")
add_requires("x264")


-- ============================================================
-- Target
-- ============================================================

target("remote-desktop")
    set_kind("binary")

    add_files("src/main.cpp")

    add_includedirs("src/shared/include")

    add_packages("srtc", "libyuv", "x264")

    if is_plat("linux") then

        add_files("src/linux/src/*.cpp")

        add_includedirs("src/linux/include")

        add_links(
            "X11",
            "Xext",
            "Xfixes",
            "Xtst"
        )

    elseif is_plat("windows") then

        add_files("src/windows/src/*.cpp")

        add_links(
            "user32",
            "gdi32"
        )

    elseif is_plat("macosx") then

        add_files(
            "src/macos/src/*.cpp",
            "src/macos/src/*.mm"
        )

        add_includedirs("src/macos/include")

        add_mxflags("-fobjc-arc")

        add_frameworks(
            "Foundation",
            "ScreenCaptureKit",
            "CoreMedia",
            "CoreVideo",
            "AppKit",
            "IOKit"
        )
    end