import Peer from "./peer.js";
import nutKeyMap from './nutKeyMap.json' with { type: 'json' };
/*
IOHIDUserDevice or HIDVirtualDevice for macos (whatever doesn't require payment or something complicated, just sudo)
/dev/uinput or /dev/uhid for linux
HidP_TranslateUsagesToI8042ScanCodes for windows (or maybe Interception or vjoy or vigembus, or a different signed kernel driver)
*/
async function enableImmersiveMode(target) {
	if (document.fullscreenEnabled && !document.fullscreenElement) {
		await target.requestFullscreen({ 
			"navigationUI": "hide" 
		});
	};

	if (!document.pointerLockElement) {
		await target.requestPointerLock({
			"unadjustedMovement": true
        });
	}
}

const screenshare = document.getElementById("screenshare");
const sharedBuffer = new ArrayBuffer(4);
const sharedBytes = new Uint8Array(sharedBuffer);
const sharedView = new DataView(sharedBuffer);

const peer = new Peer();
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

await navigator.clipboard.writeText(await peer.getShareId());
window.alert("Copied the share ID into your clipboard");
const streamerShareId = window.prompt("Share ID response:");
await peer.connectToShareId(streamerShareId, "answer")

peer.addEventListener("track", (event) => {
	screenshare.srcObject = event.streams[0];
});

screenshare.addEventListener("pointermove", (event) => { // pointerrawupdate - safari doesn't support unfortunately (I wish MacOS had touchscreen and stylus APIs)
	if (pointerMovementChannel.readyState !== "open") return;
	sharedView.setInt16(0, event.movementX, true);
	sharedView.setInt16(2, event.movementY, true);
	pointerMovementChannel.send(sharedBytes.subarray(0, 4));
});

screenshare.addEventListener("pointerdown", (event) => {
	if (pointerClickChannel.readyState !== "open") return;
	enableImmersiveMode(screenshare).catch(console.warn);

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("pointerup", (event) => {
	if (pointerClickChannel.readyState !== "open") return;
	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("keydown", (event) => {
	if (keyboardChannel.readyState !== "open" || event.repeat || !event.code) return;
	enableImmersiveMode(screenshare).catch(console.warn);

	const nutKey = nutKeyMap.indexOf(event.code);
	if (nutKey == null) {
		throw new Error("Could not find Nut.JS Key equivalent");
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, codeIndex);
	keyboardChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("keyup", (event) => {
	if (keyboardChannel.readyState !== "open" || !event.code) return;

	const nutKey = nutKeyMap.indexOf(event.code);
	if (nutKey == null) {
		throw new Error("Could not find Nut.JS Key equivalent");
	}

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, nutKey);
	keyboardChannel.send(sharedBytes.subarray(0, 2));
})