set_project("remote-desktop")
set_version("0.1.0")

set_languages("c++17")

add_rules("mode.debug", "mode.release")


-- ============================================================
-- srtc
-- ============================================================

package("srtc")

    set_homepage("https://github.com/kmansoft/srtc")
    set_description("A simple WebRTC implementation in C++")
    set_license("MPL-2.0")

    add_urls(
        "https://github.com/kmansoft/srtc/archive/refs/tags/ver-$(version).tar.gz"
    )

    add_versions(
        "0.5.2",
        "090c6c306259fa9a2f750068d68b7f006a24063223a46729c0b8946020dac4ad"
    )

    add_deps("cmake")
    add_deps("openssl")

    on_load(function(package)
        package:add("links", "srtc", "srtc_stun")
    end)

    on_install(function(package)

        import("package.tools.cmake")

        local configs = {
            "-DSRTC_BUILD_TESTS=OFF",
            "-DSRTC_BUILD_TOOLS=OFF",
            "-DSRTC_BUILD_TOOL_PUBLISH=OFF",
            "-DSRTC_BUILD_TOOL_SUBSCRIBE=OFF",
            "-DBUILD_SHARED_LIBS=OFF"
        }

        if package:is_debug() then
            table.insert(configs, "-DCMAKE_BUILD_TYPE=Debug")
        else
            table.insert(configs, "-DCMAKE_BUILD_TYPE=Release")
        end

        cmake.install(package, configs)

    end)

    on_test(function(package)
        assert(package:has_cxxincludes("srtc/peer_connection.h"))
    end)

package_end()


-- ============================================================
-- Dependencies
-- ============================================================

add_requires(
    "srtc 0.5.2",
    "x264"
)

if is_plat("linux", "windows") then
    add_requires("libyuv")
end


-- ============================================================
-- Windows toolchain
-- ============================================================

if is_plat("windows") then
    add_requires("llvm-mingw")
end


-- ============================================================
-- Target
-- ============================================================

target("remote-desktop")

    set_kind("binary")

    -- LLVM-MinGW on Windows
    if is_plat("windows") then
        set_toolchains("mingw[clang]@llvm-mingw")
    end

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


    -- ========================================================
    -- Platform libraries
    -- ========================================================

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