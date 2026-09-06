#include "clipboard.hpp"
#include <windows.h>
#include <thread>
#include <atomic>

namespace {
	std::atomic<bool> g_running{false};
	HWND g_hwnd = nullptr;
	std::thread g_thread;
	ClipboardChangeCallback g_callback;

	LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
		if (msg == WM_CLIPBOARDUPDATE) {
			if (g_callback) g_callback();
			return 0;
		}
		if (msg == WM_DESTROY) {
			PostQuitMessage(0);
			return 0;
		}
		return DefWindowProc(hwnd, msg, wp, lp);
	}

	void WatchThreadMain() {
		WNDCLASSEXW wc = {};
		wc.cbSize = sizeof(WNDCLASSEXW);
		wc.lpfnWndProc = WndProc;
		wc.hInstance = GetModuleHandleW(nullptr);
		wc.lpszClassName = L"NativeApisClipboardWatcher";
		RegisterClassExW(&wc);

		g_hwnd = CreateWindowExW(0, wc.lpszClassName, L"", 0,
			0, 0, 0, 0, HWND_MESSAGE, nullptr, wc.hInstance, nullptr);

		if (!g_hwnd) return;

		AddClipboardFormatListener(g_hwnd);

		MSG msg;
		while (g_running.load() && GetMessage(&msg, nullptr, 0, 0) > 0) {
			TranslateMessage(&msg);
			DispatchMessage(&msg);
		}

		RemoveClipboardFormatListener(g_hwnd);
		DestroyWindow(g_hwnd);
		UnregisterClassW(wc.lpszClassName, wc.hInstance);
		g_hwnd = nullptr;
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
	if (!g_running.exchange(false)) return;
	if (g_hwnd) PostMessage(g_hwnd, WM_CLOSE, 0, 0);
}