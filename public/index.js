window.addEventListener("error", (event) => {
	const errorMessage = event.message || "Unknown error occurred";
    window.alert(`Error:\n${errorMessage}`);
});

window.addEventListener("unhandledrejection", (event) => {
    const asyncErrorMessage = event.reason?.message || event.reason || "Unknown async error occurred";
    window.alert(`Async error:\n${asyncErrorMessage}`);
});

import ConnectToServerPeer from "./ConnectToServerPeer.js";
import code_keys from "./code_keys.json" with { type: "json" };

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

const sharedBytes = new Uint8Array(8);
const sharedView = new DataView(sharedBytes.buffer);

const peer = await ConnectToServerPeer();
peer.addEventListener("track", (event) => {
	console.log("Received track:", event.streams[0]);
	screenshare.srcObject = event.streams[0];
});

const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});

// pointerrawupdate
screenshare.addEventListener("pointermove", (event) => {
	event.preventDefault();
	if (pointerMovementChannel.readyState !== "open") return;

	let packetSize;
	if (document.pointerLockElement) {
		sharedView.setInt16(0, event.movementX, true);
		sharedView.setInt16(2, event.movementY, true);
		packetSize = 4;
	} else {
		sharedView.setUint32(0, event.clientX, true);
		sharedView.setUint32(4, event.clientY, true);
		packetSize = 8;
	}
	
	pointerMovementChannel.send(sharedBytes.subarray(0, packetSize));
});

const pointerClickChannel = peer.createDataChannel("pointer-click", {
	ordered: true,
	negotiated: true,
	id: 1
});

screenshare.addEventListener("pointerdown", (event) => {
	event.preventDefault();
	if (pointerClickChannel.readyState !== "open") return;
	triggerImmersiveMode();

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("pointerup", (event) => {
	event.preventDefault();
	if (pointerClickChannel.readyState !== "open") return;

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

const keyboardTypeChannel = peer.createDataChannel("keyboard-type", {
	ordered: true,
	negotiated: true,
	id: 2
});

window.addEventListener("keydown", (event) => {
	event.preventDefault();
	if (keyboardTypeChannel.readyState !== "open" || event.repeat) return;
	triggerImmersiveMode();

	const code_index = code_keys.indexOf(event.code);
	if (code_index === -1) {
		console.warn("Code is not supported");
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, code_index);

	keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("keyup", (event) => {
	event.preventDefault();
	if (keyboardTypeChannel.readyState !== "open") return;

	const code_index = code_keys.indexOf(event.code);
	if (code_index === -1) {
		console.warn("Code is not supported");
		return;
	}

	sharedView.setUint8(0, 0);
	sharedView.setUint8(1, code_index);

	keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
})

const screenResizeChannel = peer.createDataChannel("screen-resize", {
    ordered: false,
    negotiated: true,
    id: 3
});

function fitToScreen() {
	if (screenResizeChannel.readyState !== "open") return;

	const { width, height } = screenshare.getBoundingClientRect();
    sharedView.setUint32(0, width, true);
    sharedView.setUint32(4, height, true);
    screenResizeChannel.send(sharedBytes.subarray(0, 8));
}

screenResizeChannel.addEventListener("open", fitToScreen);
new ResizeObserver(fitToScreen).observe(screenshare); // window.onresize

const pointerScrollChannel = peer.createDataChannel("pointer-scroll", {
    ordered: false,
    maxRetransmits: 0,
    negotiated: true,
    id: 4
});

screenshare.addEventListener("wheel", (event) => {
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
	// sharedView.setFloat32(8, event.deltaZ, true); // unsupported in pynput
	pointerScrollChannel.send(sharedBytes.subarray(0, 8));
});