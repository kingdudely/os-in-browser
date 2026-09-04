set_project("remote-desktop")
set_version("1.0.0")

set_languages("cxx17")

add_rules("mode.debug", "mode.release")

-- ============================================================
-- Dependencies
-- ============================================================

-- libyuv — Linux + Windows only
if not is_plat("macosx") then
    add_requires("libyuv")
end

-- libdatachannel
add_requires("libdatachannel")

-- x264
add_requires("x264")

-- ============================================================
-- Executable
-- ============================================================

target("remote-desktop")
    set_kind("binary")

    add_files("src/main.cpp")

    add_includedirs("src/shared/include")

    -- Dependencies
    add_packages("libdatachannel", "x264")

    if not is_plat("macosx") then
        add_packages("libyuv")
    end

    -- ========================================================
    -- Linux
    -- ========================================================

    if is_plat("linux") then
        add_files(
            "src/linux/src/clipboard.cpp",
            "src/linux/src/keyboard.cpp",
            "src/linux/src/mouse.cpp",
            "src/linux/src/screen.cpp"
        )

        add_includedirs("src/linux/include")

        add_links(
            "X11",
            "Xext",
            "Xfixes",
            "Xtst"
        )
    end

    -- ========================================================
    -- Windows
    -- ========================================================

    if is_plat("windows") then
        add_files(
            "src/windows/src/clipboard.cpp",
            "src/windows/src/keyboard.cpp",
            "src/windows/src/mouse.cpp",
            "src/windows/src/screen.cpp"
        )

        add_links(
            "user32",
            "gdi32"
        )
    end

    -- ========================================================
    -- macOS
    -- ========================================================

    if is_plat("macosx") then
        add_files(
            "src/macos/src/clipboard.mm",
            "src/macos/src/keyboard.cpp",
            "src/macos/src/mouse.cpp",
            "src/macos/src/screen.mm"
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