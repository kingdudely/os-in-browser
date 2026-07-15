import codeMap from "./code-map.json" with { type: "json" };
const workflowFingerprint = await (await fetch("fingerprint.txt")).text();
const usernameFragment = "myufraghere1234";
const password = "mypasswordthatisverylong12345";

function triggerImmersiveMode(element) {
	if (document.fullscreenEnabled && !document.fullscreenElement) {
		document.body.requestFullscreen({ // target, await
			"navigationUI": "hide"
		}).catch(() => { });
	};

	if (!document.pointerLockElement) {
		element.requestPointerLock({ // target, await
			"unadjustedMovement": true
		}).catch(() => { });
	}
}

const sharedBytes = new Uint8Array(8);
const sharedView = new DataView(sharedBytes.buffer);

const RTCPeerConnectionInit = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun.cloudflare.com:3478" }
	]
};

export default class Client extends RTCPeerConnection {
	#localAddress;

	constructor(videoElement) {
		super(RTCPeerConnectionInit);

		this.addEventListener("track", (event) => {
			videoElement.srcObject = event.streams[0];
			videoElement.play().catch(() => { });
		});

		this.addTransceiver("video", { direction: "recvonly" });

		const pointerMovementChannel = this.createDataChannel("pointer-movement", {
			ordered: false,
			maxRetransmits: 0,
			negotiated: true,
			id: 0
		});

		const pointerClickChannel = this.createDataChannel("pointer-click", {
			ordered: true,
			negotiated: true,
			id: 1
		});

		const keyboardChannel = this.createDataChannel("keyboard", {
			ordered: true,
			negotiated: true,
			id: 2
		});

		const screenResizeChannel = this.createDataChannel("screen-resize", {
			ordered: false,
			negotiated: true,
			id: 3
		});

		const scrollChannel = this.createDataChannel("scroll", {
			ordered: false,
			maxRetransmits: 0,
			negotiated: true,
			id: 4
		});

		videoElement.addEventListener("pointermove", (event) => {
			event.preventDefault();
			if (pointerMovementChannel.readyState !== "open") return;

			let packetSize = 0;
			if (document.pointerLockElement) {
				sharedView.setInt16(0, event.movementX, true);
				sharedView.setInt16(2, event.movementY, true);
				packetSize = 4;
			} else {
				sharedView.setUint32(0, event.clientX, true);
				sharedView.setUint32(4, event.clientY, true);
				packetSize = 8;
			}

			pointerMovementChannel.send(sharedBytes.subarray(0, packetSize));
		});

		videoElement.addEventListener("pointerdown", (event) => {
			event.preventDefault();
			if (pointerClickChannel.readyState !== "open") return;
			triggerImmersiveMode(event.target);

			sharedView.setUint8(0, 1); // isDown
			sharedView.setUint8(1, event.button);
			pointerClickChannel.send(sharedBytes.subarray(0, 2));
		});

		videoElement.addEventListener("pointerup", (event) => {
			event.preventDefault();
			if (pointerClickChannel.readyState !== "open") return;

			sharedView.setUint8(0, 0); // isDown
			sharedView.setUint8(1, event.button);
			pointerClickChannel.send(sharedBytes.subarray(0, 2));
		});

		videoElement.addEventListener("keydown", (event) => { // screenshare
			event.preventDefault();
			if (keyboardChannel.readyState !== "open" || event.repeat) return;
			triggerImmersiveMode(event.target);

			const codeIndex = codeMap[event.code];
			if (typeof (codeIndex) !== "number") {
				console.warn(`${event.code} is not supported`);
				return;
			}

			sharedView.setUint8(0, 1); // isDown
			sharedView.setUint8(1, codeIndex);
			keyboardChannel.send(sharedBytes.subarray(0, 2));
		});

		videoElement.addEventListener("keyup", (event) => {
			event.preventDefault();
			if (keyboardChannel.readyState !== "open") return;

			const codeIndex = codeMap[event.code];
			if (typeof (codeIndex) !== "number") {
				console.warn(`${event.code} is not supported`);
				return;
			}

			sharedView.setUint8(0, 0); // isDown
			sharedView.setUint8(1, codeIndex);
			keyboardChannel.send(sharedBytes.subarray(0, 2));
		});

		function onResize([entry]) {
			if (screenResizeChannel.readyState !== "open") return;

			const { width, height } = entry.target.getBoundingClientRect();

			sharedView.setUint32(0, Math.round(width), true);
			sharedView.setUint32(4, Math.round(height), true);
			screenResizeChannel.send(sharedBytes.subarray(0, 8));
		}

		const resizeObserver = new ResizeObserver(onResize);
		screenResizeChannel.addEventListener("open", () => resizeObserver.observe(videoElement));

		videoElement.addEventListener("wheel", (event) => {
			event.preventDefault();
			if (scrollChannel.readyState !== "open") return;

			const multiplier = (function () {
				switch (event.deltaMode) {
					case event.DOM_DELTA_PIXEL: return 1;
					case event.DOM_DELTA_LINE: return 20;
					case event.DOM_DELTA_PAGE: return 400; // 800

					default: throw new Error("Unsupported deltaMode");
				}
			})();

			sharedView.setFloat32(0, event.deltaX * multiplier, true);
			sharedView.setFloat32(4, event.deltaY * multiplier, true);
			scrollChannel.send(sharedBytes.subarray(0, 8));
		});
	}

	async connectToRemoteAddress(remoteAddress) {
		const srflxCandidate = new URL(`http://${remoteAddress}`);
	
		const commonIceLines = [
			`c=IN IP4 ${srflxCandidate.hostname}`,
			`a=ice-ufrag:${usernameFragment}`,
			`a=ice-pwd:${password}`,
			`a=fingerprint:sha-256 ${workflowFingerprint}`,
			"a=setup:active",
			`a=candidate:0 1 UDP 1686052607 ${srflxCandidate.hostname} ${srflxCandidate.port} typ srflx`
		];

		await this.setRemoteDescription({
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
	}

	async getLocalAddress() {
		if (!this.#localAddress) {
			const offer = await this.createOffer({
				offerToReceiveVideo: true
			});

			await this.setLocalDescription({
				type: offer.type,
				sdp: offer.sdp
					.replace(/a=ice-ufrag:\S+/g, `a=ice-ufrag:${usernameFragment}`)
					.replace(/a=ice-pwd:\S+/g, `a=ice-pwd:${password}`)
			}); // offer

			this.#localAddress = await new Promise((resolve, reject) => {
				const cleanup = () => {
					this.removeEventListener("icegatheringstatechange", onGatheringChange);
					this.removeEventListener("icecandidate", onCandidate);
				}

				function onCandidate({ candidate }) {
					if (candidate?.type === "srflx") {
						cleanup();
						resolve(`${candidate.address}:${candidate.port}`);
					}
				}

				function onGatheringChange(event) {
					if (event.target.iceGatheringState === "complete") {
						cleanup();
						reject("ICE gathering complete, but no srflx candidate found.");
					}
				}

				this.addEventListener("icecandidate", onCandidate);
				this.addEventListener("icegatheringstatechange", onGatheringChange);
			});
		}

		return this.#localAddress;
	}
}