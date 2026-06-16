// TODO: make this in /docs and the flow will be createOffer, paste in workflow input, then click on link to open in new tab
import ConnectToServerPeer from "./ConnectToServerPeer.js";
import code_keys from "../code_keys.json";

async function enableImmersiveMode(target) {
	if (document.fullscreenEnabled && !document.fullscreenElement) {
		await document.body.requestFullscreen({ // Can't use 'target' because of <video>s
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

const peer = await ConnectToServerPeer();
peer.addEventListener("track", (event) => {
	screenshare.srcObject = event.streams[0];
});

const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});

screenshare.addEventListener("pointermove", (event) => { // pointerrawupdate - safari doesn't support unfortunately (I wish MacOS had touchscreen and stylus APIs)
	if (pointerMovementChannel.readyState !== "open") return;
	sharedView.setInt16(0, event.movementX, true);
	sharedView.setInt16(2, event.movementY, true);
	pointerMovementChannel.send(sharedBytes.subarray(0, 4));
});

const pointerClickChannel = peer.createDataChannel("pointer-click", {
	ordered: true,
	negotiated: true,
	id: 1
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

const keyboardChannel = peer.createDataChannel("keyboard", {
	ordered: true,
	negotiated: true,
	id: 2
});

screenshare.addEventListener("keydown", (event) => {
	if (keyboardChannel.readyState !== "open" || event.repeat) return;
	enableImmersiveMode(screenshare).catch(console.warn);

	const code_index = code_keys.indexOf(event.code);
	if (code_index === -1) {
		console.warn("Code is not supported");
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, code_index);

	keyboardChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("keyup", (event) => {
	if (keyboardChannel.readyState !== "open") return;
	const code_index = code_keys.indexOf(event.code);
	if (code_index === -1) {
		console.warn("Code is not supported");
		return;
	}

	sharedView.setUint8(0, 0);
	sharedView.setUint8(1, code_index);

	keyboardChannel.send(sharedBytes.subarray(0, 2));
})