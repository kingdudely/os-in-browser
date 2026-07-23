import codeMap from "./code-map.json" with { type: "json" };
const workflowFingerprint = (await (await fetch("fingerprint.txt")).text()).trim();
const usernameFragment = "myufraghere1234";
const password = "mypasswordthatisverylong12345";
const sharedBytes = new Uint8Array(18);
const sharedView = new DataView(sharedBytes.buffer);

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

function IPv6toHex(address) {
	address = address.replace(/[\[\]]/g, "");
	const [prefixHextets, suffixHextets] = address.split("::", 2);
	const previousHextets = prefixHextets?.split(":") ?? [];
	const nextHextets = suffixHextets?.split(":") ?? [];
	const missingHextets = new Array( // "0".repeat(...)
		8 - (previousHextets.length + nextHextets.length) // the difference of the max hextet count and the current hextet count
	).fill("0000");

	return [...previousHextets, ...missingHextets, ...nextHextets].map((hextet) => hextet.padStart(4, "0")).join("");
}

function bytesToIPAddress(bytes) {
	switch (bytes.byteLength) {
		case 16: { // is IPv6
			return bytes.toHex().match(/.{1,4}/g).join(":");
		}

		case 4: { // is IPv4
			return bytes.join(".");
		}

		default: {
			throw new Error("Invalid address byte length")
		}
	}
}

const RTCPeerConnectionInit = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun.cloudflare.com:3478" }
	]
};

export default class Client extends RTCPeerConnection {
	#shareId;

	constructor(videoElement) {
		super(RTCPeerConnectionInit);

		videoElement.muted = true; // Add system audio... one day. :(

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

					default: throw new Error("Unsupported delta mode");
				}
			})();

			sharedView.setFloat32(0, event.deltaX * multiplier, true);
			sharedView.setFloat32(4, event.deltaY * multiplier, true);
			scrollChannel.send(sharedBytes.subarray(0, 8));
		});
	}

	async connectToShareId(shareId) {
		const { read, written } = sharedBytes.setFromBase64(shareId);
		if (read !== shareId.length) {
			throw new Error("Invalid connection token, does not meet bound requirements!");
		}

		const addressByteLength = written - 2;
		const address = bytesToIPAddress(sharedBytes.subarray(0, addressByteLength));
		const port = sharedView.getUint16(addressByteLength, true);
		const isIPv6 = address.includes(":");

		const commonIceLines = [
			`c=IN ${isIPv6 ? "IP6" : "IP4"} ${address}`,
			`a=ice-ufrag:${usernameFragment}`,
			`a=ice-pwd:${password}`,
			`a=fingerprint:sha-256 ${workflowFingerprint}`,
			"a=setup:active",
			`a=candidate:0 1 UDP 1686052607 ${address} ${port} typ srflx`
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

	async getShareId() {
		if (!this.#shareId) {
			const offer = await this.createOffer({
				offerToReceiveVideo: true
			});

			await this.setLocalDescription({
				type: offer.type,
				sdp: offer.sdp
					.replace(/a=ice-ufrag:\S+/g, `a=ice-ufrag:${usernameFragment}`)
					.replace(/a=ice-pwd:\S+/g, `a=ice-pwd:${password}`)
			}); // offer

			this.#shareId = await new Promise((resolve, reject) => {
				const cleanup = () => {
					this.removeEventListener("icegatheringstatechange", onGatheringChange);
					this.removeEventListener("icecandidate", onCandidate);
				}

				function onCandidate({ candidate }) {
					if (candidate?.type === "srflx") {
						cleanup();
						let ip = candidate.address.split("%", 1)[0];
						const isIPv6 = ip.includes(":");

						let addressByteLength = 0;
						// srlfx candidate.address if ipv6 is wrapped in square brackets
						if (URL.canParse(`http://${ip}`)) { // is IPv6
							if (isIPv6) {
								addressByteLength = sharedBytes.setFromHex(IPv6toHex(ip)).written;
							} else {
								const octets = ip.split(".").map((octet, index) => {
									octet = parseInt(octet, 10);

									if (index > 4 || !Number.isSafeInteger(octet) || octet < 0 || octet > 255) {
										throw new Error("Invalid IPv4 candidate address octet!");
									}

									return octet;
								}); // , 4

								if (octets.length !== 4) {
									throw new Error("Expected 4 octets in IPv4 candidate address!")
								}

								sharedBytes.set(octets);
								addressByteLength = octets.length;
							}
						} else {
							throw new Error("Invalid candidate address")
						}

						sharedView.setUint16(addressByteLength, candidate.port, true);
						resolve(sharedBytes.subarray(0, addressByteLength + 2).toBase64());
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

		return this.#shareId;
	}
}