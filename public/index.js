window.addEventListener("error", (event) => {
	const errorMessage = event.message || "Unknown error occurred";
    window.alert(`Error:\n${errorMessage}`);
});

window.addEventListener("unhandledrejection", (event) => {
    const asyncErrorMessage = event.reason?.message || event.reason || "Unknown async error occurred";
    window.alert(`Async error:\n${asyncErrorMessage}`);
});

import codeMap from "./code-map.json" with { type: "json" };

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

const peer = new RTCPeerConnection({
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun.cloudflare.com:3478" }
	]
});

peer.addEventListener("track", (event) => {
	screenshare.srcObject = event.streams[0];
});

peer.addTransceiver("audio", { direction: "recvonly" });
peer.addTransceiver("video", { direction: "recvonly" });

const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});

const pointerClickChannel = peer.createDataChannel("pointer-click", {
	ordered: true,
	negotiated: true,
	id: 1
});

const keyboardChannel = peer.createDataChannel("keyboard", {
	ordered: true,
	negotiated: true,
	id: 2
});

const screenResizeChannel = peer.createDataChannel("screen-resize", {
    ordered: false,
    negotiated: true,
    id: 3
});

const scrollChannel = peer.createDataChannel("scroll", {
    ordered: false,
    maxRetransmits: 0,
    negotiated: true,
    id: 4
});

await peer.setLocalDescription();

await new Promise((resolve) => {
	function checkState() {
		if (peer.iceGatheringState === "complete") {
			peer.removeEventListener('icegatheringstatechange', checkState);
			resolve();
		}
	}

	checkState();
	peer.addEventListener('icegatheringstatechange', checkState);
});

await peer.setRemoteDescription({
	type: "answer",
	sdp: answer
});

window.addEventListener("pointermove", (event) => {
	event.preventDefault();
	if (pointerMovementChannel.readyState !== "open") return;

	let packetSize = 0;
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

window.addEventListener("pointerdown", (event) => {
	event.preventDefault();
	if (pointerClickChannel.readyState !== "open") return;
	triggerImmersiveMode();

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("pointerup", (event) => {
	event.preventDefault();
	if (pointerClickChannel.readyState !== "open") return;

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("keydown", (event) => { // screenshare
	event.preventDefault();
	if (keyboardChannel.readyState !== "open" || event.repeat || !event.code) return;
	triggerImmersiveMode();

	const codeIndex = codeMap.indexOf(event.code);
	if (codeIndex === -1) {
		console.warn(`${event.code} is not supported`);
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, codeIndex);
	keyboardChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("keyup", (event) => {
	event.preventDefault();
	if (keyboardChannel.readyState !== "open" || !event.code) return;

	const codeIndex = codeMap.indexOf(event.code);
	if (codeIndex === -1) {
		console.warn(`${event.code} is not supported`);
		return;
	}

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, codeIndex);
	keyboardChannel.send(sharedBytes.subarray(0, 2));
});

function onResize() {
	if (screenResizeChannel.readyState !== "open") return;

    sharedView.setUint32(0, window.innerWidth, true);
    sharedView.setUint32(4, window.innerHeight, true);
    screenResizeChannel.send(sharedBytes.subarray(0, 4));
}

screenResizeChannel.addEventListener("open", onResize);
window.addEventListener("resize", onResize);

window.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (scrollChannel.readyState !== "open") return;

    const multiplier = (function() {
		switch (event.deltaMode) {
			case event.DOM_DELTA_PIXEL: return 1;
			case event.DOM_DELTA_LINE: return 20;
			case event.DOM_DELTA_PAGE: return 400; // 800

			default: throw new Error("Unsupported deltaMode");
		}
	})();

    sharedView.setFloat32(0, event.deltaX * multiplier, true);
    sharedView.setFloat32(4, event.deltaY * multiplier, true);
    scrollChannel.send(sharedBytes.subarray(0, 8));
});
