console.log("app/index.js loaded!");

const { USERNAME = "", PASSWORD = "" } = require("node:process").env;
const express = require('express');
const basicAuth = require('express-basic-auth');
const { spawn } = require('node:child_process');
const { mouse, keyboard, Point } = require('@nut-tree-fork/nut-js');

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

(async function createGetAnswerEndpoint() {
	const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
	const tracks = stream.getTracks();

	async function createAnswer(offer) {
		const peer = new RTCPeerConnection({
			iceServers: [
				{ urls: "stun:stun.l.google.com:19302" },
				{ urls: "stun:stun.cloudflare.com:3478" }
			]
		});
		
		tracks.forEach((track) => peer.addTrack(track, stream));

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

			await mouse.setPosition(new Point(x, y));
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

	app.post('/whip', express.text({ type: 'application/sdp' }), async (req, res) => {
		const offer = req.body;

		res.status(201)
			.set('Content-Type', 'application/sdp')
			.send(await createAnswer(offer));
	});
})();

spawn(
	'cloudflared',
	['tunnel', '--url', `http://localhost:${server.address().port}`],
	{ stdio: 'inherit' }
);
