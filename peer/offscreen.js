import Peer from "../docs/peer.js";
const { VIEWER_SHARE_ID } = env;

const bash = await chrome.runtime.connectNative("bash");

const peer = new Peer();
const viewerSdp = await peer.connectToShareId(VIEWER_SHARE_ID);
peer.addTransceiver("audio", { direction: "sendonly" });
peer.addTransceiver("video", { direction: "sendonly" });

const screenshare = navigator.mediaDevices.getDisplayMedia({
    video: {
        cursor: "always",
        displaySurface: "monitor",
    },
    audio: {
        systemAudio: 'include'
    }
})
const videoTrack = screenshare.getVideoTracks()[0];
peer.addTrack(videoTrack, screenshare);

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

pointerMovementChannel.addEventListener("message", async (event) => {
	console.log(typeof(event))
	const view = new DataView(event);

	const movementX = view.getInt16(0, true);
	const movementY = view.getInt16(2, true);

	const currentPosition = await mouse.getPosition();

	const clientX = currentPosition.x + movementX;
	const clientY = currentPosition.y + movementY;

	await mouse.setPosition(new Point(clientX, clientY));
});

pointerClickChannel.addEventListener("message", async (event) => {
	console.log(typeof(event))
	const view = new DataView(event);

	const isDown = view.getUint8(0);
	const button = view.getUint8(1);

	if (isDown) {
		await mouse.pressButton(button);
	} else {
		await mouse.releaseButton(button);
	}
})

keyboardChannel.addEventListener("message", async (event) => {
	console.log(typeof(event))
	const view = new DataView(event);

	const isDown = view.getUint8(0);
	const key = view.getUint8(1);

	if (isDown) {
		await keyboard.pressKey(key);
	} else {
		await keyboard.releaseKey(key);
	}
})

console.log(await peer.getShareId());
await setTimeout(21_600_000); // 6 hours