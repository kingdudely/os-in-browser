#pragma once

#include <cstdlib>
#include <mutex>
#include <string>
#include <X11/Xlib.h>

inline Display* GetX11Display() {
	static std::mutex mutex;
	static Display* display = nullptr;
	static std::string cachedDisplayEnv;

	std::lock_guard<std::mutex> lock(mutex);

	const char* currentEnv = std::getenv("DISPLAY");
	std::string currentDisplayStr = currentEnv ? currentEnv : "";

	// If DISPLAY changed, close the stale connection
	if (display && currentDisplayStr != cachedDisplayEnv) {
		XCloseDisplay(display);
		display = nullptr;
	}

	if (!display) {
		display = XOpenDisplay(nullptr);
		cachedDisplayEnv = currentDisplayStr;
	}

	return display;
}