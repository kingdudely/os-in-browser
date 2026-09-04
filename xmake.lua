set_project("remote-desktop")
set_version("1.0.0")

set_languages("cxx17")

add_rules("mode.debug", "mode.release")

package("srtc")
    set_kind("library")

    add_urls("https://github.com/kmansoft/srtc.git")

    add_deps("cmake")
    add_deps("openssl")

    on_install(function (package)
        local configs = {
            "-DCMAKE_BUILD_TYPE=" .. (package:debug() and "Debug" or "Release"),
            "-DBUILD_TESTING=OFF"
        }

        import("package.tools.cmake").install(package, configs)
    end)
package_end()

add_requires("srtc")
add_requires("libyuv")

-- x264
add_requires("x264")

target("remote-desktop")
    set_kind("binary")

    add_files("src/main.cpp")

    add_includedirs("src/shared/include")

    add_packages("srtc", "libyuv", "x264")

    if is_plat("linux") then
        add_files(
            "src/linux/src/*.cpp"
        )

        add_includedirs("src/linux/include")

        add_links("X11", "Xext", "Xfixes", "Xtst")
    elseif is_plat("windows") then
        add_files(
            "src/windows/src/*.cpp"
        )

        add_links("user32", "gdi32")
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