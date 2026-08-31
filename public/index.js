// Mobile support: tap start is absolute position, then moving is relative - add clipboard support - fix screen resize
// window.addEventListener('paste', navigator.clipboard.addEventListener("clipboardchange", import clipboardy from 'clipboardy';, const { clipboard } = require('electron');

// Pointer lock makes events added to "screenshare" element not work since document.body is the one requesting for pointer lock - a child of "window".
window.addEventListener("error", (event) => {
	const errorMessage = event.message || "Unknown error occurred";
    window.alert(`Error:\n${errorMessage}`);
});

window.addEventListener("unhandledrejection", (event) => {
    const asyncErrorMessage = event.reason?.message || event.reason || "Unknown async error occurred";
    window.alert(`Async error:\n${asyncErrorMessage}`);
});

import ClientPeer from "./ClientPeer.js";

if (typeof(navigator.wakeLock?.request) === "function") {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			navigator.wakeLock.request('screen');
		}
	});
}

if (typeof(navigator.keyboard?.lock) === "function") {
	document.addEventListener('fullscreenchange', () => {
		if (document.fullscreenElement) {
			navigator.keyboard.lock(); // await
		} else {
			navigator.keyboard.unlock();
		}
	});
}

const websocketUrl = new URL(location);
websocketUrl.protocol = "wss:";
new ClientPeer(websocketUrl);