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

    on_install(function(package)

        import("package.tools.cmake")

        cmake.configure(package, {
            "-DSRTC_BUILD_TESTS=OFF",
            "-DSRTC_BUILD_TOOLS=OFF",
            "-DBUILD_SHARED_LIBS=OFF"
        })

        cmake.build(package)

        -- Headers
        os.cp(
            "include/srtc/*.h",
            package:includedir("srtc")
        )

        os.cp(
            "include/sctp/*.h",
            package:includedir("sctp")
        )

        -- Main library
        os.cp(
            "libsrtc.a",
            package:libdir()
        )

        -- STUN library
        os.cp(
            "stun/libsrtc_stun.a",
            package:libdir()
        )
    end)

    on_test(function(package)

        assert(package:has_cxxincludes("srtc/srtc.h"))

    end)

package_end()