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

	peer.addTransceiver("video", {
		direction: "recvonly"
	});

	let resourceUrl = null;

	const endSession = () => {
		if (!resourceUrl) return;
		const url = resourceUrl;
		resourceUrl = null;
		fetch(url, { method: "DELETE", keepalive: true }).catch(() => {});
	};

	let isNegotiating = false;
	peer.addEventListener("negotiationneeded", async () => {
		if (isNegotiating) return;

		try {
			isNegotiating = true;

			await peer.setLocalDescription();
			await waitForIceGathering(peer);

			const response = await fetch("/whep/endpoint", {
				method: "POST",
				headers: {
					"Content-Type": "application/sdp"
				},
				body: peer.localDescription.sdp
			});

			if (!response.ok) {
				throw new Error(`WHEP server responded with status ${response.status}`);
			}

			const location = response.headers.get("Location");
			if (location) {
				resourceUrl = new URL(location, response.url).href;
			}

			const answerSdp = await response.text();
			await peer.setRemoteDescription({
				type: "answer",
				sdp: answerSdp
			});

			console.log("WHEP negotiation successful.");
		} catch (error) {
			console.error("Negotiation failed:", error);
		} finally {
			isNegotiating = false;
		}
	});

	peer.addEventListener("connectionstatechange", () => {
		console.log(`Connection state: ${peer.connectionState}`);
		if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
			endSession();
		}
	});

	window.addEventListener("pagehide", endSession);

	return peer;
}