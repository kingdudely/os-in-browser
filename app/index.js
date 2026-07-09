console.log("app/index.js loaded!");

const { USERNAME = "", PASSWORD = "" } = require("node:process").env;
const express = require('express');
const basicAuth = require('express-basic-auth');
const { spawn } = require('node:child_process');
const { mouse, keyboard, Point, Key } = require('@nut-tree-fork/nut-js');
// console.log(JSON.stringify(Key, null, 2))
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

const app = express();
const server = app.listen(0);

const middleware = [express.static("public")];
if (USERNAME && PASSWORD) {
	middleware.unshift(
		basicAuth({
			users: { [USERNAME]: PASSWORD },
			challenge: true,
		})
	);
} else {
	console.warn("You did not provide both username and password - this is unsecure/insecure. Consider adding both next time.")
}

app.use(...middleware);

app.post('/whip', express.text({ type: 'application/sdp' }), async (req, res) => {
	const offer = req.body;

	res.status(201)
		.set('Content-Type', 'application/sdp')
		.send(await createAnswer(offer));
});

async function createAnswer(offer) {
	const peer = new RTCPeerConnection({
		iceServers: [
			{ urls: "stun:stun.l.google.com:19302" },
			{ urls: "stun:stun.cloudflare.com:3478" }
		]
	});

	/*
	async function createAnswer(offer) {
		const peer = new RTCPeerConnection({
			iceServers: [
				{ urls: "stun:stun.l.google.com:19302" },
				{ urls: "stun:stun.cloudflare.com:3478" }
			]
		});

		const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
		const videoTrack = stream.getVideoTracks()[0];
		const audioTrack = stream.getAudioTracks()[0]; // may be undefined, see note below

		videoTrack.contentHint = "motion";

		const videoSender = peer.addTrack(videoTrack, stream);
		if (audioTrack) peer.addTrack(audioTrack, stream);

		// codec preference — only applies to video
		const transceiver = peer.getTransceivers().find(t => t.sender === videoSender);
		const caps = RTCRtpSender.getCapabilities("video");
		const h264 = caps.codecs.filter(c => c.mimeType === "video/H264");
		if (h264.length) transceiver.setCodecPreferences(h264);

		// encoding params — only applies to video
		const params = videoSender.getParameters();
		if (!params.encodings) params.encodings = [{}];
		params.encodings[0].maxBitrate = 8_000_000;
		params.encodings[0].maxFramerate = 60;
		params.degradationPreference = "maintain-framerate";
		await videoSender.setParameters(params);

		// ... data channels, setRemoteDescription, etc. unchanged
	}
	*/

	const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

	// NEW: tell the encoder to prioritize motion smoothness over per-frame detail
	const videoTrack = stream.getVideoTracks()[0];
	videoTrack.contentHint = "motion";

	stream.getTracks().forEach((track) => {
		const sender = peer.addTrack(track, stream);

		if (track.kind === "video") {
			// NEW: force H.264 as the preferred codec (lower encode latency than VP9/AV1)
			const transceiver = peer.getTransceivers().find(t => t.sender === sender);
			const caps = RTCRtpSender.getCapabilities("video");
			const h264 = caps.codecs.filter(c => c.mimeType === "video/H264");
			if (h264.length) transceiver.setCodecPreferences(h264);
		}
	});

	// NEW: after tracks are added, set encoding parameters on the video sender
	const videoSender = peer.getSenders().find(s => s.track && s.track.kind === "video");
	if (videoSender) {
		const params = videoSender.getParameters();
		if (!params.encodings) params.encodings = [{}];
		params.encodings[0].maxBitrate = 8_000_000;   // tune down if your link can't sustain this
		params.encodings[0].maxFramerate = 60;
		params.degradationPreference = "maintain-framerate"; // don't sacrifice fps for resolution
		await videoSender.setParameters(params);
	}

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

	await peer.setRemoteDescription({ type: "offer", sdp: offer });
	await peer.setLocalDescription();

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

	return peer.localDescription.sdp;
}

spawn(
	'cloudflared',
	['tunnel', '--url', `http://localhost:${server.address().port}`],
	{ stdio: 'inherit' }
);
