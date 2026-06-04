const screenshare = document.getElementById("screenshare");
const peer = await connectToServerPeer();
peer.addEventListener("track", (event) => {
	screenshare.srcObject = event.streams[0];
});

const vector2Buffer = new Uint8Array(16);

const pointermove = peer.createDataChannel("pointermove", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});
window.addEventListener("pointermove", (event) => {
	if (pointermove.readyState !== "open") return;
	const offset = writeVector2(event.movementX, event.movementY, vector2Buffer, 0);
	pointermove.send(vector2Buffer.subarray(0, offset));
});

const encodeZigZag = (x) => Math.abs(x) * 2 - (x < 0);

function writeUnsignedVarInt(value, outputBuffer, offset) { 
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`Invalid/unsafe unsigned integer: ${value}`);
	}

	do {
		outputBuffer[offset++] = (value & 0x7F) | (value > 0x7F ? 0x80 : 0);
	} while ((value = Math.floor(value / 128)) > 0);  

	return offset;
};

function writeSignedVarInt(value, outputBuffer, offset) {
	if (!Number.isSafeInteger(value)) {
		throw new RangeError(`Unsafe signed integer: ${value}`);
	}

	return writeUnsignedVarInt(encodeZigZag(value), outputBuffer, offset);
}

function writeVector2(x, y, outputBuffer, offset) {
    const xOffset = writeSignedVarInt(x, outputBuffer, offset);
    const yOffset = writeSignedVarInt(y, outputBuffer, xOffset);
    return yOffset;
}

async function connectToServerPeer() {
	const peer = new RTCPeerConnection({
		iceServers: [{
				urls: "stun:stun.l.google.com:19302"
			},
			{
				urls: "stun:stun.cloudflare.com:3478"
			}
		]
	});

	peer.addTransceiver("audio", {
		direction: "recvonly"
	});

	peer.addTransceiver("video", {
		direction: "recvonly"
	});

	let isNegotiating = false;
	peer.addEventListener("negotiationneeded", async () => {
		if (isNegotiating) return;

		try {
			isNegotiating = true;

			await peer.setLocalDescription();
			await waitForIceGathering(peer);

			const response = await fetch("/whip", {
				method: "POST",
				headers: {
					"Content-Type": "application/sdp"
				},
				body: peer.localDescription.sdp
			});

			if (!response.ok) {
				throw new Error(`WHIP server responded with status ${response.status}`);
			}

			const answerSdp = await response.text();
			await peer.setRemoteDescription({
				type: "answer",
				sdp: answerSdp
			});

			console.log("WebRTC negotiation successful.");
		} catch (error) {
			console.error("Negotiation failed:", error);
		} finally {
			isNegotiating = false;
		}
	});

	peer.addEventListener("iceconnectionstatechange", () => {
		console.log(`ICE connection state: ${peer.iceConnectionState}`);
		if (peer.iceConnectionState === "failed") {
			peer.restartIce();
		}
	});

	return peer;
}

function waitForIceGathering(peer) {
	if (peer.iceGatheringState === "complete") {
		return true;
	} else {
		return new Promise((resolve) => {
			peer.addEventListener("icegatheringstatechange", function onStateChange() {
				if (peer.iceGatheringState === "complete") {
					peer.removeEventListener("icegatheringstatechange", onStateChange);
					resolve(true);
				}
			});
		});
	}
}
