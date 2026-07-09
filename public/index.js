// Pointer lock makes events added to "screenshare" element not work since document.body is the one requesting for pointer lock - a child of "window".
window.addEventListener("error", (event) => {
	const errorMessage = event.message || "Unknown error occurred";
    window.alert(`Error:\n${errorMessage}`);
});

window.addEventListener("unhandledrejection", (event) => {
    const asyncErrorMessage = event.reason?.message || event.reason || "Unknown async error occurred";
    window.alert(`Async error:\n${asyncErrorMessage}`);
});

import ConnectToServerPeer from "./ConnectToServerPeer.js";
import nutKeys from "./nutKeys.json" with { type: "json" };
import nutButtons from "./nutButtons.json" with { type: "json" };

function triggerImmersiveMode() {
	if (document.fullscreenEnabled && !document.fullscreenElement) {
		document.body.requestFullscreen({ // target, await
			"navigationUI": "hide"
		}).catch(() => {});
	};

	if (!document.pointerLockElement) {
		document.body.requestPointerLock({ // target, await
			"unadjustedMovement": true
		}).catch(() => {});
	}
}

const screenshare = document.getElementById("screenshare");

const sharedBytes = new Uint8Array(12);
const sharedView = new DataView(sharedBytes.buffer);

const peer = await ConnectToServerPeer();
peer.addEventListener("track", (event) => {
	screenshare.srcObject = event.streams[0];
	screenshare.play().catch(console.warn);
});

const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});

// pointerrawupdate
window.addEventListener("pointermove", (event) => {
	event.preventDefault();
	if (pointerMovementChannel.readyState !== "open") return;

	let packetSize;
	if (document.pointerLockElement) {
		sharedView.setInt16(0, event.movementX, true);
		sharedView.setInt16(2, event.movementY, true);
		packetSize = 4;
		console.log("relative", event.movementX, event.movementY)
	} else {
		sharedView.setUint32(0, event.clientX, true);
		sharedView.setUint32(4, event.clientY, true);
		packetSize = 8;
		console.log("absolute", event.clientX, event.clientY)
	}
	
	pointerMovementChannel.send(sharedBytes.subarray(0, packetSize));
});

const pointerClickChannel = peer.createDataChannel("pointer-click", {
	ordered: true,
	negotiated: true,
	id: 1
});

window.addEventListener("pointerdown", (event) => {
	event.preventDefault();
	if (pointerClickChannel.readyState !== "open") return;
	triggerImmersiveMode();

	if (!(event.button in nutButtons)) {
		console.warn(`${event.button} does not have a corresponding Nut.JS button`);
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, nutButtons[event.button]);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("pointerup", (event) => {
	event.preventDefault();
	if (pointerClickChannel.readyState !== "open") return;
	
	if (!(event.button in nutButtons)) {
		console.warn(`${event.button} does not have a corresponding Nut.JS button`);
		return;
	}

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, nutButtons[event.button]);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

const keyboardTypeChannel = peer.createDataChannel("keyboard-type", {
	ordered: true,
	negotiated: true,
	id: 2
});

// Could do tabindex=0 but then they can just press tab again - also, this is more reliable, and screenshare is basically the whole screen anyways.
window.addEventListener("keydown", (event) => {
	event.preventDefault();
	if (keyboardTypeChannel.readyState !== "open" || event.repeat) return;
	triggerImmersiveMode();

	if (!(event.code in nutKeys)) {
		console.warn(`${event.code} does not have a corresponding Nut.JS key`);
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, nutKeys[event.code]);

	keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("keyup", (event) => {
	event.preventDefault();
	if (keyboardTypeChannel.readyState !== "open") return;

	if (!(event.code in nutKeys)) {
		console.warn(`${event.code} does not have a corresponding Nut.JS key`);
		return;
	}

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, nutKeys[event.code]);

	keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
})

// Not implemented.
const screenResizeChannel = peer.createDataChannel("screen-resize", {
    ordered: false,
    negotiated: true,
    id: 3
});

function fitToScreen() {
	if (screenResizeChannel.readyState !== "open") return;
	console.log("Sending screen resize packet...");

    sharedView.setUint32(0, window.innerWidth, true);
    sharedView.setUint32(4, window.innerHeight, true);
    screenResizeChannel.send(sharedBytes.subarray(0, 8));
}

screenResizeChannel.addEventListener("open", fitToScreen); // So it automatically resizes in the beginning
window.addEventListener("resize", fitToScreen); // ResizeObserver 

// Not implemented.
const pointerScrollChannel = peer.createDataChannel("pointer-scroll", {
    ordered: false,
    maxRetransmits: 0,
    negotiated: true,
    id: 4
});

window.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (pointerScrollChannel.readyState !== "open") return;

	const multiplier = (function() {
		switch (event.deltaMode) {
			default: console.warn("Unsupported deltaMode, will use DOM_DELTA_PIXEL");
			case event.DOM_DELTA_PIXEL: return 1;
			case event.DOM_DELTA_LINE: return 20; // accurate enough
			case event.DOM_DELTA_PAGE: return window.innerHeight;
		}
	})();

	sharedView.setFloat32(0, event.deltaX * multiplier, true);
	sharedView.setFloat32(4, event.deltaY * multiplier, true);
	sharedView.setFloat32(8, event.deltaZ * multiplier, true); // unsupported in pynput
	pointerScrollChannel.send(sharedBytes.subarray(0, 12));
});
