cmake_minimum_required(VERSION 3.20)

project(remote-desktop LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

# ============================================================
# Dependencies
# ============================================================

# libyuv — Linux + Windows only
if(NOT APPLE)
    set(CMAKE_POLICY_VERSION_MINIMUM 3.5 CACHE STRING "" FORCE)

    FetchContent_Declare(
        libyuv
        GIT_REPOSITORY https://chromium.googlesource.com/libyuv/libyuv
        GIT_TAG stable
        GIT_SHALLOW TRUE
    )

    FetchContent_MakeAvailable(libyuv)
endif()

# libdatachannel
set(NO_TESTS ON CACHE BOOL "" FORCE)
set(NO_EXAMPLES ON CACHE BOOL "" FORCE)

FetchContent_Declare(
    libdatachannel
    GIT_REPOSITORY https://github.com/paullouisageneau/libdatachannel.git
    GIT_TAG master
    GIT_SHALLOW TRUE
    GIT_SUBMODULES_RECURSE TRUE
)

FetchContent_MakeAvailable(libdatachannel)

# x264
find_package(PkgConfig REQUIRED)

pkg_check_modules(
    X264
    REQUIRED
    IMPORTED_TARGET
    x264
)

# ============================================================
# Executable
# ============================================================

add_executable(remote-desktop
    src/main.cpp
)

target_include_directories(remote-desktop PRIVATE
    src/shared/include
)

# Shared libraries
target_link_libraries(remote-desktop PRIVATE
    PkgConfig::X264
    LibDataChannel::LibDataChannel
)

# libyuv
if(NOT APPLE)
    target_include_directories(remote-desktop PRIVATE
        ${libyuv_SOURCE_DIR}/include
    )

    target_link_libraries(remote-desktop PRIVATE
        yuv
    )
endif()

# ============================================================
# Linux
# ============================================================

if(LINUX)

    find_package(X11 REQUIRED)

    target_sources(remote-desktop PRIVATE
        src/linux/src/clipboard.cpp
        src/linux/src/keyboard.cpp
        src/linux/src/mouse.cpp
        src/linux/src/screen.cpp
    )

    target_include_directories(remote-desktop PRIVATE
        src/linux/include
    )

    target_link_libraries(remote-desktop PRIVATE
        X11::X11
        X11::Xext
        X11::Xfixes
        X11::Xtst
    )

endif()

# ============================================================
# Windows
# ============================================================

if(WIN32)

    target_sources(remote-desktop PRIVATE
        src/windows/src/clipboard.cpp
        src/windows/src/keyboard.cpp
        src/windows/src/mouse.cpp
        src/windows/src/screen.cpp
    )

    target_link_libraries(remote-desktop PRIVATE
        user32
        gdi32
    )

endif()

# ============================================================
# macOS
# ============================================================

if(APPLE)

    enable_language(OBJCXX)

    target_sources(remote-desktop PRIVATE
        src/macos/src/clipboard.mm
        src/macos/src/keyboard.cpp
        src/macos/src/mouse.cpp
        src/macos/src/screen.mm
    )

    target_include_directories(remote-desktop PRIVATE
        src/macos/include
    )

    set_source_files_properties(
        src/macos/src/clipboard.mm
        src/macos/src/screen.mm
        PROPERTIES
        COMPILE_OPTIONS "-fobjc-arc"
    )

    target_link_libraries(remote-desktop PRIVATE
        "-framework Foundation"
        "-framework ScreenCaptureKit"
        "-framework CoreMedia"
        "-framework CoreVideo"
        "-framework AppKit"
        "-framework IOKit"
    )

endif()