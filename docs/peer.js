const certificate = await RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" });
const fingerprint = certificate.getFingerprints().find(f => f.algorithm === "sha-256").value;
const fingerprintBytes = Uint8Array.fromHex(fingerprint.replace(/:/g, ''));
const RTCPeerConnectionInit = {
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
	certificates: [certificate]
};

const usernameFragment = "myufraghere1234";
const password = "mypasswordthatisverylong12345";

// shared buffer: 16 (max ip) + 2 (port) + 32 (fingerprint) = 50
const sharedBytes = new Uint8Array(50);
const sharedView = new DataView(sharedBytes.buffer);

// only accepts audio, video, data channel respectively for now
class Peer extends RTCPeerConnection {
	#shareId;

	constructor() {
		super(RTCPeerConnectionInit);
	}

	async getShareId() {
		if (!this.#shareId) {
			const shareIdIsOffer = this.signalingState !== "have-remote-offer";

			const description = shareIdIsOffer // !isAnswerer
				? await this.createOffer({
					offerToReceiveAudio: true,
					offerToReceiveVideo: true
				})
				: await this.createAnswer();

			description.sdp = description.sdp
				.replace(/a=ice-ufrag:\S+/g, `a=ice-ufrag:${usernameFragment}`)
				.replace(/a=ice-pwd:\S+/g, `a=ice-pwd:${password}`);

			await this.setLocalDescription(description);

			const { address, port } = await new Promise(resolve => {
				this.addEventListener("icecandidate", function onCandidate({ candidate }) {
					if (candidate?.type === "srflx") {
						this.removeEventListener("icecandidate", onCandidate);
						resolve(candidate);
					}
				});
			});

			// shared buffer: 16 (max ip) + 2 (port) + 32 (fingerprint) = 50
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
			sharedBytes.set(fingerprintBytes, offset);
			offset += 32;

			this.#shareId = sharedBytes.subarray(0, offset).toBase64({ alphabet: "base64url" });
		};

		return this.#shareId;
	}

	async connectToShareId(shareId) {
		let offset = 0;
		const bytes = Uint8Array.fromBase64(shareId, { alphabet: "base64url" });
		const view = new DataView(bytes.buffer);
		const isIPv6 = bytes.length === 50;
		const address = isIPv6
			? bytes.subarray(0, 16).toHex().match(/.{1,4}/g).join(':')
			: bytes.subarray(0, 4).join(".");

		offset += isIPv6 ? 16 : 4;

		/*
			const parts = [];
			for (let i = 0; i < 8; i++) {
				parts.push(view.getUint16(i * 2).toString(16));
			}
			address = parts.join(':');
		*/

		const port = view.getUint16(offset, true);
		offset += 2;
		const fingerprint = bytes.subarray(offset).toHex().match(/../g).join(':');
		offset += 32;

		if (offset !== bytes.length) {
			throw new Error("Couldn't connect to share ID");
		}

		const shareIdIsAnswer = this.signalingState === "have-local-offer";
		const [setupRole, mediaRole] = shareIdIsAnswer ? ["active", "sendonly"] : ["actpass", "recvonly"];

		const commonIceLines = [
			`c=IN IP4 0.0.0.0`,
			`a=ice-ufrag:${usernameFragment}`,
			`a=ice-pwd:${password}`,
			`a=fingerprint:sha-256 ${fingerprint}`,
			`a=setup:${setupRole}`,
			`a=candidate:1 1 udp 1686052607 ${address} ${port} typ srflx`,
		];

		const sdp = [
			"v=0",
			"o=- 0 0 IN IP4 127.0.0.1",
			"s=-",
			"t=0 0",
			"a=group:BUNDLE 0 1 2",

			"m=audio 9 UDP/TLS/RTP/SAVPF 111",
			...commonIceLines,
			`a=${mediaRole}`, "a=mid:0", "a=rtcp-mux", "a=rtpmap:111 opus/48000/2",

			"m=video 9 UDP/TLS/RTP/SAVPF 96",
			...commonIceLines,
			`a=${mediaRole}`, "a=mid:1", "a=rtcp-mux", "a=rtpmap:96 AV1/90000",

			"m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
			...commonIceLines,
			"a=mid:2", "a=sctp-port:5000", "a=max-message-size:262144",
			"",
		].join("\r\n");

		await this.setRemoteDescription({ type: shareIdIsAnswer ? "answer" : "offer", sdp });
	}
}