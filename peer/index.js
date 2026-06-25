window.createAnswer = async (offer) => {
	const peer = new RTCPeerConnection({
		iceServers: [
			{ urls: "stun:stun.l.google.com:19302" },
			{ urls: "stun:stun.cloudflare.com:3478" }
		]
	});

    const stream = await navigator.mediaDevices.getDisplayMedia({
		video: true,
		audio: true
	});

	for (const track of stream.getTracks()) {
		peer.addTrack(track, stream);
	};

	const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
		ordered: false,
		maxRetransmits: 0,
		negotiated: true,
		id: 0
	});

	pointerMovementChannel.addEventListener("message", async (event) => {
		const view = new DataView(event.data);
		const isRelative = view.byteLength === 4;

		if (isRelative) {
			const movementX = view.getInt16(0, true);
			const movementY = view.getInt16(2, true);
			await moveMouseDelta(movementX, movementY);
		} else {
			const x = view.getUint32(0, true);
			const y = view.getUint32(4, true);
			await setMousePosition(x, y);
		}
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
			await pressMouseButton(button);
		} else {
			await releaseMouseButton(button);
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
			await pressKeyboardKey(key);
		} else {
			await releaseKeyboardKey(key);
		}
	});

	await peer.setRemoteDescription({ type: "offer", sdp: offer });
	await peer.setLocalDescription();

	await new Promise((resolve) => {
		if (peer.iceGatheringState === "complete") {
			resolve();
		} else {
			peer.addEventListener("icegatheringstatechange", function handler() {
				if (peer.iceGatheringState === "complete") {
					peer.removeEventListener("icegatheringstatechange", handler);
					resolve();
				}
			});
		}
	});

	return peer.localDescription.sdp;
};