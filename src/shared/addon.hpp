#pragma once

#include <napi.h>
#include <cstdint>

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