cmake_minimum_required(VERSION 3.20)

project(remote-desktop LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

FetchContent_Declare(
    screen_capture_lite
    GIT_REPOSITORY https://github.com/smasherprog/screen_capture_lite.git
    GIT_TAG master
)

FetchContent_MakeAvailable(screen_capture_lite)

find_package(PkgConfig REQUIRED)
pkg_check_modules(X264 REQUIRED x264)

add_executable(remote-desktop
    src/main.cpp
)

target_include_directories(remote-desktop PRIVATE
    ${X264_INCLUDE_DIRS}
)

target_link_directories(remote-desktop PRIVATE
    ${X264_LIBRARY_DIRS}
)

target_link_libraries(remote-desktop PRIVATE
    screen_capture_lite
    ${X264_LIBRARIES}
)