cmake_minimum_required(VERSION 3.22)

project(remote-desktop
    VERSION 0.1.0
    LANGUAGES CXX
)

# ============================================================
# Project configuration
# ============================================================

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ============================================================
# Dependencies
# ============================================================

include(FetchContent)

# ------------------------------------------------------------
# srtc
# ------------------------------------------------------------

set(SRTC_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(SRTC_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(SRTC_BUILD_TOOL_PUBLISH OFF CACHE BOOL "" FORCE)
set(SRTC_BUILD_TOOL_SUBSCRIBE OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
    srtc
    GIT_REPOSITORY https://github.com/kmansoft/srtc.git
    GIT_TAG ver-0.5.2
    GIT_SHALLOW TRUE
)

FetchContent_MakeAvailable(srtc)

# ------------------------------------------------------------
# OpenSSL
# ------------------------------------------------------------

find_package(OpenSSL REQUIRED)

# ------------------------------------------------------------
# libyuv
# ------------------------------------------------------------

find_package(libyuv CONFIG REQUIRED)

# ------------------------------------------------------------
# x264
# ------------------------------------------------------------

find_path(X264_INCLUDE_DIR
    NAMES x264.h
    REQUIRED
)

find_library(X264_LIBRARY
    NAMES x264
    REQUIRED
)

message(STATUS "x264 include: ${X264_INCLUDE_DIR}")
message(STATUS "x264 library: ${X264_LIBRARY}")

# ============================================================
# Determine platform
# ============================================================

if(WIN32)

    set(PLATFORM_NAME windows)

elseif(APPLE)

    set(PLATFORM_NAME macosx)

elseif(UNIX)

    set(PLATFORM_NAME linux)

else()

    message(FATAL_ERROR
        "Unsupported platform"
    )

endif()

message(STATUS "Building for platform: ${PLATFORM_NAME}")

# ============================================================
# Platform sources
# ============================================================

file(GLOB PLATFORM_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/src/${PLATFORM_NAME}/src/*.cpp"
)

# ============================================================
# Executable
# ============================================================

add_executable(remote-desktop
    src/main.cpp
    ${PLATFORM_SOURCES}
)

# ============================================================
# Include directories
# ============================================================

target_include_directories(remote-desktop PRIVATE

    # Shared project headers
    "${CMAKE_CURRENT_SOURCE_DIR}/src/shared/include"

    # Platform headers
    "${CMAKE_CURRENT_SOURCE_DIR}/src/${PLATFORM_NAME}/include"

    # x264
    "${X264_INCLUDE_DIR}"
)

# ============================================================
# Libraries
# ============================================================

target_link_libraries(remote-desktop PRIVATE

    # WebRTC
    srtc

    # OpenSSL
    OpenSSL::SSL
    OpenSSL::Crypto

    # libyuv
    yuv

    # x264
    "${X264_LIBRARY}"
)

# ============================================================
# Windows
# ============================================================

if(WIN32)

    target_link_libraries(remote-desktop PRIVATE

        user32
        gdi32
        advapi32
    )

    # Prevent Windows headers from defining min/max macros
    target_compile_definitions(remote-desktop PRIVATE
        NOMINMAX
    )

endif()

# ============================================================
# Linux
# ============================================================

if(UNIX AND NOT APPLE)

    find_package(X11 REQUIRED)

    target_link_libraries(remote-desktop PRIVATE

        X11::X11
        X11::Xext
        X11::Xfixes
        X11::Xinerama
        X11::Xtst
    )

endif()

# ============================================================
# macOS
# ============================================================

if(APPLE)

    target_link_libraries(remote-desktop PRIVATE

        "-framework ScreenCaptureKit"
        "-framework CoreMedia"
        "-framework CoreVideo"
        "-framework CoreGraphics"
        "-framework CoreFoundation"
        "-framework IOKit"
    )

endif()

# ============================================================
# Compiler warnings
# ============================================================

if(MSVC)

    target_compile_options(remote-desktop PRIVATE
        /W4
    )

else()

    target_compile_options(remote-desktop PRIVATE
        -Wall
        -Wextra
        -Wpedantic
    )

endif()

# ============================================================
# Output
# ============================================================

set_target_properties(remote-desktop PROPERTIES

    RUNTIME_OUTPUT_DIRECTORY
        "${CMAKE_BINARY_DIR}/bin"
)