#include "shared/include/clipboard.hpp"
#import <Cocoa/Cocoa.h>
#include <thread>
#include <atomic>
#include <chrono>

namespace {
	std::atomic<bool> g_running{false};
	std::thread g_thread;
	ClipboardChangeCallback g_callback;

	void WatchThreadMain() {
		@autoreleasepool {
			NSPasteboard* pb = [NSPasteboard generalPasteboard];
			NSInteger lastCount = pb.changeCount;

			while (g_running.load()) {
				std::this_thread::sleep_for(std::chrono::milliseconds(67));
				NSInteger current = pb.changeCount;
				if (current != lastCount) {
					lastCount = current;
					if (g_callback) g_callback();
				}
			}
		}
	}
}

void StartClipboardWatch(ClipboardChangeCallback callback) {
	if (g_running.load()) return;
	g_callback = callback;
	g_running.store(true);
	g_thread = std::thread(WatchThreadMain);
	g_thread.detach();
}

void StopClipboardWatch() {
	g_running.store(false);
}