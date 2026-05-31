const video = document.getElementById("video");
const peer = new RTCPeerConnection({
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" }
    ]
});

peer.addTransceiver("video", {
	direction: "recvonly"
});

const offer = await peer.createOffer();
await peer.setLocalDescription(offer);

// Wait for ICE gathering
if (peer.iceGatheringState !== "complete") {
	await new Promise((resolve) => {
		peer.onicegatheringstatechange = () => {
			if (peer.iceGatheringState === "complete") resolve();
		};
	});
}

const answerSdp = await (await fetch("/whip", {
	method: "POST",
	headers: {
		"Content-Type": "application/sdp"
	},
	body: peer.localDescription.sdp,
})).text();

await peer.setRemoteDescription({
	type: "answer",
	sdp: answerSdp
});

peer.ontrack = (e) => {
	video.srcObject = e.streams[0];
};
