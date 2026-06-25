// api to create new hid device
window.addEventListener("error", (event) => {
	const errorMessage = event.message || "Unknown error occurred";
    window.alert(`Error:\n${errorMessage}`);
});

window.addEventListener("unhandledrejection", (event) => {
    const asyncErrorMessage = event.reason?.message || event.reason || "Unknown async error occurred";
    window.alert(`Async error:\n${asyncErrorMessage}`);
});

import codeMap from "./code-map.json" with { type: "json" };
import constants from "./constants.json" with { type: "json" }; // type: "text"
const { password, usernameFragment, workflowFingerprint } = constants;

function triggerImmersiveMode() {
	if (document.fullscreenEnabled && !document.fullscreenElement) {
		document.body.requestFullscreen({ // target, await
			"navigationUI": "hide"
		}).catch(() => {});
	};

	if (!document.pointerLockElement) {
		document.body.requestPointerLock({ // target, await
			"unadjustedMovement": true
		}).catch(() => {});
	}
}

const screenshare = document.getElementById("screenshare");
const sharedBytes = new Uint8Array(12); 
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

const keyboardTypeChannel = peer.createDataChannel("keyboard-type", {
	ordered: true,
	negotiated: true,
	id: 2
});

const screenResizeChannel = peer.createDataChannel("screen-resize", {
    ordered: false,
    negotiated: true,
    id: 3
});

const pointerScrollChannel = peer.createDataChannel("pointer-scroll", {
    ordered: false,
    maxRetransmits: 0,
    negotiated: true,
    id: 4
});

const offer = await peer.createOffer({
	offerToReceiveAudio: true,
	offerToReceiveVideo: true
});

const offerSdp = offer.sdp
	.replace(/a=ice-ufrag:\S+/g, `a=ice-ufrag:${usernameFragment}`)
	.replace(/a=ice-pwd:\S+/g, `a=ice-pwd:${password}`);

await peer.setLocalDescription({ type: "offer", sdp: offerSdp });

const browserAddress = await new Promise((resolve, reject) => {
    function onCandidate({ candidate }) {
        if (candidate?.type === "srflx") {
            peer.removeEventListener("icecandidate", onCandidate);
            peer.removeEventListener("icegatheringstatechange", onGatheringChange);
            resolve(`${candidate.address}:${candidate.port}`);
        }
    }

    function onGatheringChange() {
        if (peer.iceGatheringState === "complete") {
            peer.removeEventListener("icegatheringstatechange", onGatheringChange);
            peer.removeEventListener("icecandidate", onCandidate);
            reject(new Error("ICE gathering complete, but no srflx candidate found."));
        }
    }

    peer.addEventListener("icecandidate", onCandidate);
    peer.addEventListener("icegatheringstatechange", onGatheringChange);
});

const [runnerAddress, runnerPort] = await new Promise((resolve, reject) => {
    const connectDialog = document.getElementById("connect-dialog");
    connectDialog.showModal();

    document.getElementById("copy-offer").addEventListener("click", () => {
		navigator.clipboard.writeText(browserAddress)
			.then(() => window.alert("Copied offer to clipboard"))
			.catch(reject);
	});

    document.getElementById("runner-submit").addEventListener("click", () => {
		const value = document.getElementById("runner-input").value.trim();
        if (value) {
            connectDialog.close();
			const url = new URL(`http://${value}`);
            resolve([url.hostname, url.port]);
        }
	});
});

const commonIceLines = [
    `c=IN IP4 ${runnerAddress}`,
    `a=ice-ufrag:${usernameFragment}`,
    `a=ice-pwd:${password}`,
    `a=fingerprint:sha-256 ${workflowFingerprint}`,
    "a=setup:active",
    `a=candidate:0 1 UDP 1686052607 ${runnerAddress} ${runnerPort} typ srflx`
];

await peer.setRemoteDescription({
	type: "answer",
	sdp: [
		"v=0",
		"o=- 0 0 IN IP4 0.0.0.0",
		"s=-",
		"t=0 0",
		"a=group:BUNDLE 0 1 2",

		"m=audio 9 UDP/TLS/RTP/SAVPF 111",
		...commonIceLines,
		"a=sendonly",
		"a=mid:0",
		"a=rtcp-mux",
		"a=rtpmap:111 opus/48000/2",

		"m=video 9 UDP/TLS/RTP/SAVPF 102",
		...commonIceLines,
		"a=sendonly",
		"a=mid:1",
		"a=rtcp-mux",
		"a=rtpmap:102 H264/90000",

		"m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
		...commonIceLines,
		"a=mid:2",
		"a=sctp-port:5000",
		"a=max-message-size:262144",
		"",
	].join("\r\n")
});

screenshare.addEventListener("pointermove", (event) => {
	event.preventDefault();
	if (pointerMovementChannel.readyState !== "open") return;

	let packetSize;
	if (document.pointerLockElement) {
		// Relative
		sharedView.setInt16(0, event.movementX, true);
		sharedView.setInt16(2, event.movementY, true);
		packetSize = 4;
	} else {
		// Absolute
		sharedView.setUint32(0, event.clientX, true);
		sharedView.setUint32(4, event.clientY, true);
		packetSize = 8;
	}
	
	pointerMovementChannel.send(sharedBytes.subarray(0, packetSize));
});

screenshare.addEventListener("pointerdown", (event) => {
	event.preventDefault();
	if (pointerClickChannel.readyState !== "open") return;
	triggerImmersiveMode();

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

screenshare.addEventListener("pointerup", (event) => {
	event.preventDefault();
	if (pointerClickChannel.readyState !== "open") return;

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, event.button);
	pointerClickChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("keydown", (event) => { // screenshare
	event.preventDefault();
	if (keyboardTypeChannel.readyState !== "open" || event.repeat || !event.code) return;
	triggerImmersiveMode();

	const codeIndex = codeMap.indexOf(event.code);
	if (codeIndex === -1) {
		console.warn(`${event.code} is not supported`);
		return;
	}

	sharedView.setUint8(0, 1); // isDown
	sharedView.setUint8(1, codeIndex);
	keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("keyup", (event) => {
	event.preventDefault();
	if (keyboardTypeChannel.readyState !== "open" || !event.code) return;

	const codeIndex = codeMap.indexOf(event.code);
	if (codeIndex === -1) {
		console.warn(`${event.code} is not supported`);
		return;
	}

	sharedView.setUint8(0, 0); // isDown
	sharedView.setUint8(1, codeIndex);
	keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("resize", () => {
    if (screenResizeChannel.readyState !== "open") return;

    sharedView.setUint32(0, window.innerWidth, true);
    sharedView.setUint32(4, window.innerHeight, true);
    screenResizeChannel.send(sharedBytes.subarray(0, 8));
});

screenshare.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (scrollChannel.readyState !== "open") return;

    const multiplier = (function() {
		switch (event.deltaMode) {
			case event.DOM_DELTA_PIXEL: return 1;
			case event.DOM_DELTA_LINE: return 20;
			case event.DOM_DELTA_PAGE: return 400; // 800

			default: throw new Error("Unsupported deltaMode");
		}
	})();

    sharedView.setFloat32(0, event.deltaX * multiplier, true);
    sharedView.setFloat32(4, event.deltaY * multiplier, true);
	sharedView.setFloat32(8, event.deltaZ * multiplier, true);
    scrollChannel.send(sharedBytes.subarray(0, 12));
});