set_project("remote-desktop")
set_version("0.1.0")

set_languages("c++17")

add_rules("mode.debug", "mode.release")

add_repositories("local-repo packages")

add_requires(
    "srtc 0.5.2",
    "x264"
)

if is_plat("linux", "windows") then
    add_requires("libyuv")
end


target("remote-desktop")
    set_kind("binary")

    add_files("src/main.cpp")

    add_includedirs(
        "src/shared/include"
    )

    add_packages(
        "srtc",
        "x264"
    )


    if is_plat("linux") then

        add_files("src/linux/src/*.cpp")

        add_includedirs(
            "src/linux/include"
        )

        add_packages("libyuv")

        add_syslinks(
            "X11",
            "Xext",
            "Xfixes",
            "Xinerama",
            "Xtst"
        )


    elseif is_plat("macosx") then

        add_files("src/macos/src/*.cpp")

        add_includedirs(
            "src/macos/include"
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

        add_files("src/windows/src/*.cpp")

        add_packages("libyuv")

        add_syslinks(
            "user32",
            "gdi32",
            "advapi32"
        )

    end