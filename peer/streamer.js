import { mouse, keyboard, screen, Button, Key, Point } from '@nut-tree-fork/nut-js';
import Peer from "./peer.js";
import { env } from "node:process";
import { setTimeout } from "node:timers/promises";
const { VIEWER_SHARE_ID } = env;

const peer = new Peer();
const viewerSdp = await peer.connectToShareId(VIEWER_SHARE_ID, "offer");
peer.addTransceiver("audio", { direction: "sendonly" });
peer.addTransceiver("video", { direction: "sendonly" });

nw.Screen.Init();
const sourceId = await new Promise((resolve) => nw.Screen.DesktopCapture.chooseDesktopMedia(["screen"], resolve));
const screenshare = await navigator.mediaDevices.getUserMedia({
	audio: {
		mandatory: {
			chromeMediaSource: "desktop"
		}
	},
	video: {
		mandatory: {
			chromeMediaSource: "desktop",
			chromeMediaSourceId: sourceId
		}
	}
});
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