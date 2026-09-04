set_project("remote-desktop")
set_version("0.1.0")

set_languages("c++17")

add_rules("mode.debug", "mode.release")

add_repositories("local-repo packages", {
    rootdir = os.scriptdir()
})

add_requires(
    "srtc 0.5.2",
    "x264"
)

if is_plat("linux", "windows") then
    add_requires("libyuv")
end


target("remote-desktop")
    set_kind("binary")

    local platform_src = "src/" .. get_config("plat")

    add_files(
        "src/main.cpp",
        platform_src .. "/src/*.cpp"
    )

    add_includedirs(
        "src/shared/include",
        platform_src .. "/include"
    )

    add_packages(
        "srtc",
        "x264"
    )

    if is_plat("linux", "windows") then
        add_packages("libyuv")
    end

    if is_plat("linux") then

        add_syslinks(
            "X11",
            "Xext",
            "Xfixes",
            "Xinerama",
            "Xtst"
        )

    elseif is_plat("macosx") then

        add_frameworks(
            "ScreenCaptureKit",
            "CoreMedia",
            "CoreVideo",
            "CoreGraphics",
            "CoreFoundation",
            "IOKit"
        )

    elseif is_plat("windows") then

        add_syslinks(
            "user32",
            "gdi32",
            "advapi32"
        )

    end