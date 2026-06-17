import { mouse, keyboard, Point } from '@nut-tree-fork/nut-js';

window.createAnswer = (offer) => {
	const peer = new RTCPeerConnection({
		iceServers: [
			{ urls: "stun:stun.l.google.com:19302" },
			{ urls: "stun:stun.cloudflare.com:3478" }
		]
	});

	peer.addTransceiver("audio", {
		direction: "sendonly"
	});

	peer.addTransceiver("video", {
		direction: "sendonly"
	});

	const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
		ordered: false,
		maxRetransmits: 0,
		negotiated: true,
		id: 0
	});

	pointerMovementChannel.addEventListener("message", (event) => {
		console.log(typeof(event));
		const view = new DataView(event.data);
		const isAbsolute = view.getUint8(0) === 1;
		const x = view.getInt16(0, true);
		const y = view.getInt16(2, true);

		if (isAbsolute) {
			await setMousePosition(x, y);
		} else {
			await moveMouseDelta(x, y);
		};
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
			await pressMouseButton(button);
		} else {
			await releaseMouseButton(button);
		}
	});

	const keyboardChannel = peer.createDataChannel("keyboard", {
		ordered: true,
		negotiated: true,
		id: 2
	});

	keyboardChannel.addEventListener("message", async (event) => {
		const view = new DataView(event.data);
		const isDown = view.getUint8(0) === 1;
		const key = view.getUint8(1);

		if (isDown) {
			await pressKeyboardKey(key);
		} else {
			await releaseKeyboardKey(key);
		}
	});

	await peer.setRemoteDescription({
		type: "offer",
		sdp: offer
	});

	return peer.localDescription.sdp;
}