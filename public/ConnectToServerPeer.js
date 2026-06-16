const waitForIceGathering = async (peer) =>
	new Promise((resolve) => {
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

export default async function ConnectToServerPeer(configuration = {}) {
	const peer = new RTCPeerConnection({
		iceServers: [
			{ urls: "stun:stun.l.google.com:19302" },
			{ urls: "stun:stun.cloudflare.com:3478" }
		],
		...configuration
	});

	/*
	peer.addTransceiver("audio", {
		direction: "recvonly"
	});
	*/

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