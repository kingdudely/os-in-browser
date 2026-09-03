#include "shared/include/clipboard.hpp"
#include "linux/include/GetX11Display.hpp"
#include <X11/Xatom.h>
#include <X11/extensions/Xfixes.h>
#include <thread>
#include <atomic>

namespace {
	std::atomic<bool> g_running{false};
	std::thread g_thread;
	Display* g_dpy = nullptr;
	ClipboardChangeCallback g_callback;

	void WatchThreadMain() {
		g_dpy = GetX11Display();
		if (!g_dpy) return;

		int eventBase, errorBase;
		if (!XFixesQueryExtension(g_dpy, &eventBase, &errorBase)) {
			g_dpy = nullptr;
			return;
		}

		Window root = DefaultRootWindow(g_dpy);
		Atom clipboardAtom = XInternAtom(g_dpy, "CLIPBOARD", False);
		XFixesSelectSelectionInput(g_dpy, root, clipboardAtom, XFixesSetSelectionOwnerNotifyMask);
		XFixesSelectSelectionInput(g_dpy, root, XA_PRIMARY, XFixesSetSelectionOwnerNotifyMask);

		while (g_running.load()) {
			XEvent ev;
			XNextEvent(g_dpy, &ev); // blocks until an event arrives
			if (g_running.load() && g_callback) g_callback();
		}

		g_dpy = nullptr; // don't close it, it's shared
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
	if (g_dpy) {
		XClientMessageEvent dummy = {};
		dummy.type = ClientMessage;
		dummy.window = DefaultRootWindow(g_dpy);
		dummy.format = 32;
		XSendEvent(g_dpy, dummy.window, False, NoEventMask, (XEvent*)&dummy);
		XFlush(g_dpy);
	}
}