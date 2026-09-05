#pragma once

#include <functional>

using ClipboardChangeCallback = std::function<void()>;

void StartClipboardWatch(ClipboardChangeCallback callback);
void StopClipboardWatch();