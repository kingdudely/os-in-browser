import codeMap from "./code-map.json" with { type: "json" };
import workflowFingerprint from "./workflowFingerprint.txt" with { type: "text" };
import usernameFragment from "./usernameFragment.txt" with { type: "text" };
import password from "./password.txt" with { type: "text" };

async function enableImmersiveMode(target) {
	if (document.fullscreenEnabled && !document.fullscreenElement) {
		await document.body.requestFullscreen({ // target
			"navigationUI": "hide"
		});
	};

	if (!document.pointerLockElement) {
		await target.requestPointerLock({
			"unadjustedMovement": true
		});
	}
}

const screenshare = document.getElementById("screenshare");

const sharedBytes = new Uint8Array(18); // 16 (max ip) + 2 (port)
const sharedView = new DataView(sharedBytes.buffer);

const peer = new RTCPeerConnection({
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
});

peer.addEventListener("track", (event) => {
	screenshare.srcObject = event.streams[0];
});

peer.addTransceiver("audio", { direction: "recvonly" });
peer.addTransceiver("video", { direction: "recvonly" });

const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});

const pointerClickChannel = peer.createDataChannel("pointer-click", {
	ordered: true,
	negotiated: true,
	id: 1
});

const keyboardChannel = peer.createDataChannel("keyboard", {
	ordered: true,
	negotiated: true,
	id: 2
});

const offer = await (async function () {
	const offer = await peer.createOffer({
		offerToReceiveAudio: true,
		offerToReceiveVideo: true
	})

	const sdp = offer.sdp // offer.sdp = offer.sdp...
		.replace(/a=ice-ufrag:\S+/g, `a=ice-ufrag:${usernameFragment}`)
		.replace(/a=ice-pwd:\S+/g, `a=ice-pwd:${password}`);

	await peer.setLocalDescription({ type: "offer", sdp }); // setLocalDescription(offer)

	const { address, port } = await new Promise((resolve) => {
		peer.addEventListener("icecandidate", function onCandidate({ candidate }) {
			if (candidate?.type === "srflx") {
				peer.removeEventListener("icecandidate", onCandidate);
				resolve(candidate);
			}
		});
	});

	let offset = 0;
	const isIPv6 = address.includes(':');

	if (isIPv6) {
		address.split(':').forEach((hextet, index) => sharedView.setUint16(index * 2, parseInt(hextet, 16), true));
		offset += 16;
	} else {
		address.split('.').forEach((octet, index) => sharedView.setUint8(index, parseInt(octet, 10)));
		offset += 4;
	}

	sharedView.setUint16(offset, port, true);
	offset += 2;

	return sharedBytes.subarray(0, offset).toBase64({ alphabet: "base64url" });
})();

await navigator.clipboard.writeText(offer);
window.alert("Copied the offer into your clipboard");
const answer = window.prompt("Workflow response:");

await (async function connectToAnswer() {
	let offset = 0;
	const answerSize = sharedBytes.setFromBase64(answer, { alphabet: "base64url" }).written;
	const isIPv6 = answerSize === 18;
	const addressType = isIPv6 ? "IP6" : "IP4";
	const address = isIPv6
		? (offset += 16, sharedBytes.subarray(0, 16).toHex().match(/.{1,4}/g).join(':'))
		: (offset += 4, sharedBytes.subarray(0, 4).join("."));

	const port = sharedView.getUint16(offset, true);
	offset += 2;

	if (offset !== answerSize) {
		throw new Error("Couldn't connect to share ID");
	}

	const commonIceLines = [
		`c=IN ${addressType} ${address}`, // `c=IN IP4 0.0.0.0`,
		`a=ice-ufrag:${usernameFragment}`,
		`a=ice-pwd:${password}`,
		`a=fingerprint:sha-256 ${workflowFingerprint}`,
		`a=setup:active`,
		`a=candidate:1 1 udp 1686052607 ${address} ${port} typ srflx`,
	];

	const streamerSdp = [
		"v=0",
		"o=- 0 0 IN IP4 127.0.0.1",
		"s=-",
		"t=0 0",
		"a=group:BUNDLE 0 1 2",

		"m=audio 9 UDP/TLS/RTP/SAVPF 111",
		...commonIceLines,
		`a=sendonly`, "a=mid:0", "a=rtcp-mux", "a=rtpmap:111 opus/48000/2",

		"m=video 9 UDP/TLS/RTP/SAVPF 96",
		...commonIceLines,
		`a=sendonly`, "a=mid:1", "a=rtcp-mux", "a=rtpmap:96 AV1/90000",

		"m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
		...commonIceLines,
		"a=mid:2", "a=sctp-port:5000", "a=max-message-size:262144",
		"",
	].join("\r\n");

	await peer.setRemoteDescription({ type: "answer", sdp: streamerSdp });
})()

screenshare.addEventListener("pointermove", (event) => { // pointerrawupdate - safari doesn't support unfortunately (I wish MacOS had touchscreen and stylus APIs)
	if (pointerMovementChannel.readyState !== "open") return;
	// make flag to say if it is clientX or movementX with document.pointerLockElement
	sharedView.setInt16(0, event.movementX, true);
	sharedView.setInt16(2, event.movementY, true);
	pointerMovementChannel.send(sharedBytes.subarray(0, 4));
});

screenshare.addEventListener("pointerdown", (event) => {
	if (pointerClickChannel.readyState !== "open") return;
	enableImmersiveMode(screenshare).catch(console.warn);

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("pointerup", (event) => {
	if (pointerClickChannel.readyState !== "open") return;
	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("keydown", (event) => {
	if (keyboardChannel.readyState !== "open" || event.repeat || !event.code) return;
	enableImmersiveMode(screenshare).catch(console.warn);

	const codeIndex = codeMap.indexOf(event.code);
	if (codeIndex === -1) {
		console.warn(`${event.code} is not supported`);
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, codeIndex);
	keyboardChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("keyup", (event) => {
	if (keyboardChannel.readyState !== "open" || !event.code) return;

	const codeIndex = codeMap.indexOf(event.code);
	if (codeIndex === -1) {
		console.warn(`${event.code} is not supported`);
		return;
	}

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, codeIndex);
	keyboardChannel.send(sharedBytes.subarray(0, 2));
})