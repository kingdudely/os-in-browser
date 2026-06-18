const certificate = await RTCPeerConnection.generateCertificate({
    name: "ECDSA",
    namedCurve: "P-256"
});
const fingerprint = certificate.getFingerprints().find(fingerprint => fingerprint.algorithm === "sha-256").value;
const b64Fingerprint = Uint8Array.fromHex(fingerprint.replace(/:/g, '')).toBase64();
const RTCPeerConnectionInit = {
	iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
	certificates: [certificate]
}

// Only supports this in exact order: audio, video, data channel
export default class Peer extends RTCPeerConnection {
	#srflxCandidate;

	constructor() {
		super(RTCPeerConnectionInit);
	};

	async getShareId() {
		await this.setLocalDescription();

		this.#srflxCandidate ??= await new Promise((resolve) => {
			this.addEventListener("icecandidate", function onCandidate(event) {
				const candidate = event.candidate;
				if (candidate && candidate.type === "srflx") {
					this.removeEventListener("icecandidate", onCandidate);
					resolve(candidate);
				}
			});
		});

		const { usernameFragment, address, port } = this.#srflxCandidate;
		const password = this.localDescription.sdp.match(/a=ice-pwd:(.+)/)[1].trim();

		return encodeURIComponent([
			usernameFragment,
			password,
			b64Fingerprint,
			address,
			port
		].join(","));
	}

	async connectToShareId(shareId, type) {
		const [usernameFragment, password, b64Fingerprint, address, port] = decodeURIComponent(shareId).trim().split(",");
		const addressType = address.includes(":") ? "IP6" : "IP4";
		const fingerprint = Uint8Array.fromBase64(b64Fingerprint).toHex().toUpperCase().match(/.{1,2}/g).join(':');

		const [setupRole, mediaRole] = ({
			"offer": ["actpass", "recvonly"],
			"answer": ["passive", "sendonly"]
		})[type];

		const commonIceAndSecurity = [
			`c=IN ${addressType} ${address}`,
			`a=ice-ufrag:${usernameFragment}`,
			`a=ice-pwd:${password}`,
			`a=fingerprint:sha-256 ${fingerprint}`,
			`a=candidate:0 1 udp 2130706431 ${address} ${port} typ srflx`,
			`a=setup:${setupRole}`
		];

		const sdp = [
			"v=0",
			"o=- 0 0 IN IP4 0.0.0.0",
			"s=-",
			"t=0 0",
			"a=msid-semantic: WMS",
			
			// Audio Track
			"m=audio 9 UDP/TLS/RTP/SAVPF 111",
			...commonIceAndSecurity, 
			`a=${mediaRole}`, "a=mid:0", "a=rtcp-mux", "a=rtpmap:111 opus/48000/2",
			
			// Video Track
			"m=video 9 UDP/TLS/RTP/SAVPF 96",
			...commonIceAndSecurity, 
			`a=${mediaRole}`, "a=mid:1", "a=rtcp-mux", "a=rtpmap:96 VP8/90000",
			
			// Data Channel
			"m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
			...commonIceAndSecurity, 
			"a=mid:2", "a=sctp-port:5000",
			""
		].join("\r\n");

		await this.setRemoteDescription({ sdp, type });
	}
}