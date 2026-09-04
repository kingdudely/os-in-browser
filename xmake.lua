set_project("remote-desktop")
set_version("0.1.0")

set_languages("c++17")

add_repositories("local-repo packages")

add_requires("srtc 0.5.2")
add_requires("libyuv")
add_requires("x264")

if is_plat("linux") then
    add_requires("libx11")
    add_requires("libxext")
    add_requires("libxfixes")
    add_requires("libxinerama")
    add_requires("libxtst")
end

target("remote-desktop")
    set_kind("binary")

    add_files("src/main.cpp")

    if is_plat("linux") then
        add_files(
            "src/linux/src/*.cpp"
        )

        add_includedirs(
            "src/linux/include",
            "src/shared/include"
        )

        add_packages(
            "srtc",
            "libyuv",
            "x264",
            "libx11",
            "libxext",
            "libxfixes",
            "libxinerama",
            "libxtst"
        )

    elseif is_plat("macosx") then
        add_files(
            "src/macos/src/*.cpp",
            "src/macos/src/*.mm"
        )

        add_includedirs(
            "src/macos/include",
            "src/shared/include"
        )

        add_packages(
            "srtc",
            "x264"
        )

        add_frameworks(
            "ScreenCaptureKit",
            "CoreMedia",
            "CoreVideo",
            "CoreGraphics",
            "CoreFoundation",
            "IOKit"
        )

    elseif is_plat("windows") then
        add_files(
            "src/windows/src/*.cpp"
        )

        add_includedirs(
            "src/shared/include"
        )

        add_packages(
            "srtc",
            "libyuv",
            "x264"
        )

        add_syslinks(
            "user32",
            "gdi32",
            "advapi32"
        )
    end