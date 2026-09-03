add_requires("screen_capture_lite")
add_requires("x264")

target("remote-desktop")
    set_kind("binary")
    add_files("src/*.cpp")
    add_packages("screen_capture_lite", "x264")