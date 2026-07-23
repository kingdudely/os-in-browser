console.log("app/index.js loaded!");

const { mouse, keyboard, Point, Key } = require('@nut-tree-fork/nut-js');
const { writeFile } = require('node:fs/promises');
import { env } from "node:process";
console.log(env.OFFER)
const offer = decodeURIComponent(env.OFFER);
// console.log(JSON.stringify(Key, null, 2))

const peer = new RTCPeerConnection({
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" }
	]
});

console.log("B")
async function main(){
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
stream.getTracks().forEach((track) => peer.addTrack(track, stream));
console.log("c")

const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});

pointerMovementChannel.addEventListener("message", async (event) => {
	const view = new DataView(event.data);
	const isRelative = view.byteLength === 4;
	let absoluteX = 0;
	let absoluteY = 0;

	if (isRelative) {
		const movementX = view.getInt16(0, true);
		const movementY = view.getInt16(2, true);
		const currentPosition = await mouse.getPosition();
		absoluteX = currentPosition.x + movementX;
		absoluteY = currentPosition.y + movementY;
	} else {
		absoluteX = view.getUint32(0, true);
		absoluteY = view.getUint32(4, true);
	}

	await mouse.setPosition(new Point(absoluteX, absoluteY));
});

const pointerClickChannel = peer.createDataChannel("pointer-click", {
	ordered: true,
	negotiated: true,
	id: 1
});

pointerClickChannel.addEventListener("message", async (event) => {
	const view = new DataView(event.data);
	const isDown = view.getUint8(0) === 1;
	const button = view.getUint8(1);

	if (isDown) {
		await mouse.pressButton(button);
	} else {
		await mouse.releaseButton(button);
	}
});

const keyboardTypeChannel = peer.createDataChannel("keyboard-type", {
	ordered: true,
	negotiated: true,
	id: 2
});

keyboardTypeChannel.addEventListener("message", async (event) => {
	const view = new DataView(event.data);
	const isDown = view.getUint8(0) === 1;
	const key = view.getUint8(1);

	if (isDown) {
		await keyboard.pressKey(key);
	} else {
		await keyboard.releaseKey(key);
	}
});

console.log("A")
await peer.setRemoteDescription({ type: "offer", sdp: OFFER });
console.log("A")

await peer.setLocalDescription();
console.log("A")


await new Promise((resolve) => {
	if (peer.iceGatheringState === "complete") {
		resolve();
	} else {
		peer.addEventListener("icegatheringstatechange", function onStateChange() {
			if (peer.iceGatheringState === "complete") {
				peer.removeEventListener("icegatheringstatechange", onStateChange);
				resolve();
			}
		});
	}
});
console.log("A")


await writeFile('answer.txt', peer.localDescription.sdp);
console.log("A")

}

main();