#pragma once

// Shared across macos/, windows/, and linux/ builds. Each platform folder
// must define these 8 functions with exactly this signature, and define
// the 2 globals below (in virtual_screen.*). Include this header from
// every platform source file so mismatches are caught at compile time
// rather than at link time.
#include <napi.h>
#include <cstdint>

// Current virtual screen dimensions, defined in virtual_screen.*.
// Read by mouse.cpp (ScrollMouse's "page" unit uses the screen size to
// convert a page scroll into a line count).
extern std::uint32_t g_screenWidth;
extern std::uint32_t g_screenHeight;

// ---- virtual screen ----
void CreateVirtualScreen(const Napi::CallbackInfo& info);
void ResizeVirtualScreen(const Napi::CallbackInfo& info);
void DestroyVirtualScreen(const Napi::CallbackInfo& info);

// ---- mouse ----
void ScrollMouse(const Napi::CallbackInfo& info);
void SetMouseButton(const Napi::CallbackInfo& info);
void SetMousePosition(const Napi::CallbackInfo& info);
void MoveMousePosition(const Napi::CallbackInfo& info);

// ---- keyboard ----
void SetKeyboardKey(const Napi::CallbackInfo& info);