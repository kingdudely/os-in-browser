const video = document.getElementById("video");
const peer = await connectToServerPeer();
peer.addEventListener("track", (event) => {
	video.srcObject = event.streams[0];
});

const pointBuffer = new Uint8Array(16);

function writeVarInt(value, outputBuffer, offset = 0) { 
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`Invalid/unsafe unsigned integer: ${value}`);
	}

	do {
		outputBuffer[offset++] = (value & 0x7F) | (value > 0x7F ? 0x80 : 0);
	} while ((value = Math.floor(value / 128)) > 0);  

	return offset;
}

function pointToBytes(x, y) {
    const xOffset = writeUnsignedVarInt(x, pointBuffer, 0);
    const yOffset = writeUnsignedVarInt(y, pointBuffer, xOffset);
    return pointBuffer.subarray(0, yOffset);
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
