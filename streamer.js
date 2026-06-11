import { mouse, keyboard, screen, Button, Key, Point } from '@nut-tree-fork/nut-js';
import { createPeer, connectToShareId, getShareId } from "./peer.js";
import { env } from "node:process";
import { setTimeout } from "node:timers/promises";
const { VIEWER_SHARE_ID } = env;

const peer = createPeer();
const viewerSdp = await connectToShareId(peer, VIEWER_SHARE_ID, "offer");
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
peerConnection.addTrack(videoTrack, screenshare);

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

await peer.setLocalDescription();

pointerMovementChannel.addEventListener("message", (event) => {
	console.log(typeof(event))
});

pointerClickChannel.addEventListener("message", (event) => {
	console.log(typeof(event))
})

keyboardChannel.addEventListener("message", (event) => {
	console.log(typeof(event))
	const screenWidth = await screen.width();
	const screenHeight = await screen.height();

	const targetX = Math.round(xPercent * screenWidth);
	const targetY = Math.round(yPercent * screenHeight);

	await mouse.setPosition(new Point(targetX, targetY));
})

console.log(await getShareId(peer));
await setTimeout(21_600_000); // 6 hours