// TODO: make this in /docs and the flow will be createOffer, paste in workflow input, then click on link to open in new tab
import ConnectToServerPeer from "./ConnectToServerPeer.js";
import nutKeys from "./nutKeys.json" with { type: "json" };
import nutButtons from "./nutButtons.json" with { type: "json" };

async function enableImmersiveMode(target) {
	if (document.fullscreenEnabled && document.fullscreenElement == null) {
		await document.body.requestFullscreen({ // Can't use target because of <video>s
			"navigationUI": "hide" 
		});
	};

	if (document.pointerLockElement == null) {
		await target.requestPointerLock({
			"unadjustedMovement": true
        });
	}
}

const screenshare = document.getElementById("screenshare");

const sharedBuffer = new ArrayBuffer(5);
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

	const isPointerLocked = document.pointerLockElement != null;
	sharedView.setUint8(0, isPointerLocked ? 1 : 0);
	sharedView.setInt16(1, isPointerLocked ? event.movementX : event.clientX, true); // clientX
	sharedView.setInt16(3, isPointerLocked ? event.movementY : event.clientY, true); // clientY
	pointerMovementChannel.send(sharedBytes.subarray(0, 5));
});

const pointerClickChannel = peer.createDataChannel("pointer-click", {
	ordered: true,
	negotiated: true,
	id: 1
});

screenshare.addEventListener("pointerdown", (event) => {
	if (pointerClickChannel.readyState !== "open") return;
	enableImmersiveMode(screenshare).catch(console.warn);

	const nutButton = nutButtons.indexOf(event.button);
	if (nutButton === -1) {
		console.warn(`${event.button} does not have a corresponding Nut.JS button`);
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, nutButton)

	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("pointerup", (event) => {
	if (pointerClickChannel.readyState !== "open") return;

	const nutButton = nutButtons.indexOf(event.button);
	if (nutButton === -1) {
		console.warn(`${event.button} does not have a corresponding Nut.JS button`);
		return;
	}

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, nutButton)

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

	const nutKey = nutKeys.indexOf(event.code);
	if (nutKey === -1) {
		console.warn(`${event.code} does not have a corresponding Nut.JS key`);
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, nutKey)

	keyboardChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("keyup", (event) => {
	if (keyboardChannel.readyState !== "open") return;

	const nutKey = nutKeys.indexOf(event.code);
	if (nutKey === -1) {
		console.warn(`${event.code} does not have a corresponding Nut.JS key`);
		return;
	}

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, nutKey)

	keyboardChannel.send(sharedBytes.subarray(0, 2));
})