cmake_minimum_required(VERSION 3.20)

project(remote-desktop LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(X11 REQUIRED)

add_executable(remote-desktop
    src/main.cpp
    src/capture.cpp
)

target_link_libraries(remote-desktop PRIVATE
    X11::X11
    X11::Xext
)

target_compile_options(remote-desktop PRIVATE
    -Wall
    -Wextra
)