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

			const response = await fetch("/whep/endpoint", {
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

	peer.addEventListener("connectionstatechange", () => {
		console.log(`ICE connection state: ${peer.iceConnectionState}`);
		if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
			peer.restartIce();
		}
	});

	return peer;
}