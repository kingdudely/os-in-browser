const nativeApis = require("native-apis");
const { clipboard } = require("electron");

const stream = await navigator.mediaDevices.getDisplayMedia();
const tracks = stream.getTracks();

export default class ServerPeer extends RTCPeerConnection {
	static #Init = {
		iceServers: [
			{ urls: "stun:stun.l.google.com:19302" }
		]
	}

	static #CurrentConnection = null;
	signalingWs = null;
	#remoteDescriptionReady = Promise.withResolvers();

	constructor (signalingWs) {
		super(ServerPeer.#Init);
		ServerPeer.#CurrentConnection?.close();
		ServerPeer.#CurrentConnection = this;

		this.signalingWs = signalingWs;

		const pingInterval = setInterval(() => this.#sendWSMessage("ping"), 1337);
		this.signalingWs.once("close", () => clearInterval(pingInterval));
		this.signalingWs.on("message", this.#onTrickleICEMessage.bind(this));

		this.addEventListener("icecandidate", this.#onIceCandidate.bind(this));
		this.addEventListener("negotiationneeded", this.#onNegotiationNeeded.bind(this));
		this.addEventListener("connectionstatechange", this.#onConnectionStateChange.bind(this));
		this.#initializeDataChannels();

		tracks.forEach((track) => this.addTrack(track, stream));
	}

	#initializeDataChannels() {
		this.#newDataChannel("pointer-movement", {
			ordered: false,
			maxRetransmits: 0,
			negotiated: true,
			id: 0
		}, ServerPeer.#OnPointerMove.bind(ServerPeer));

		this.#newDataChannel("pointer-click", {
			ordered: true,
			negotiated: true,
			id: 1
		}, ServerPeer.#OnPointerClick.bind(ServerPeer));

		this.#newDataChannel("pointer-scroll", {
			ordered: false,
			maxRetransmits: 0,
			negotiated: true,
			id: 2
		}, ServerPeer.#OnPointerScroll.bind(ServerPeer));

		this.#newDataChannel("keyboard-type", {
			ordered: true,
			negotiated: true,
			id: 3
		}, ServerPeer.#OnKeyboardType.bind(ServerPeer));

		const clipboardSyncChannel = this.#newDataChannel("clipboard-sync", {
			ordered: true,
			negotiated: true,
			id: 4
		}, ({ data }) => clipboard.writeText(data));

		nativeApis.startClipboardWatch(() => {
			if (clipboardSyncChannel.readyState === "open") {
				clipboardSyncChannel.send(clipboard.readText());
			}
		});
	}

	#newDataChannel(name, options, onMessage) {
		const channel = this.createDataChannel(name, options);
		channel.binaryType = "arraybuffer";
		channel.addEventListener("message", onMessage);
		return channel;
	}

	#onConnectionStateChange() {
		const { connectionState, signalingWs } = this;

		switch (connectionState) {
			case "closed": {
				// this.close();
				signalingWs.close();

				if (ServerPeer.#CurrentConnection === this) {
					nativeApis.stopClipboardWatch();
					ServerPeer.#CurrentConnection = null;
				}

				break;
			}

			case "failed": {
				if (signalingWs.readyState === signalingWs.OPEN) {
					this.restartIce();
				} else {
					this.close();
				}

				break;
			}

			case "connected": // ServerPeer.#CurrentConnection = this;
			case "disconnected":
			case "connecting":
			case "new": break;

			default: {
				console.warn(`Unknown connection state: ${connectionState}`);
				break;
			}
		}
	}

	async #onTrickleICEMessage(rawData) {
		let data;
		try {
			data = JSON.parse(rawData.toString());
		} catch {
			return;
		}

		switch (data.type) {
			case "answer": {
				try {
					await this.setRemoteDescription(data.message);
					this.#remoteDescriptionReady.resolve();
				} catch (error) {
					this.#remoteDescriptionReady.reject(error);
					console.error("Failed to set remote description:", error);
				};

				break;
			}

			case "ice-candidate": {
				try {
					await this.#remoteDescriptionReady.promise;
					await this.addIceCandidate(data.message);
				} catch (error) {
					console.error("Failed to add ICE candidate:", error);
				};

				break;
			}

			case "ping": break;

			default: {
				console.warn(`Unknown packet type: ${data.type}`);
				break;
			}
		}
	}

	async #onNegotiationNeeded() {
		if (this.signalingState !== "stable") {
			return;
		}

		const remoteDescriptionReady = Promise.withResolvers();
		this.#remoteDescriptionReady = remoteDescriptionReady;

		try {
			await this.setLocalDescription();
			this.#sendWSMessage("offer", this.localDescription);
		} catch (error) {
			remoteDescriptionReady.reject(error);
			console.error("Failed to create/send offer:", error);
		}
	}

	async #onIceCandidate({ candidate }) {
		if (candidate) this.#sendWSMessage("ice-candidate", candidate);
	}

	#sendWSMessage(type, message) {
		const { signalingWs } = this;
		if (signalingWs.readyState === signalingWs.OPEN) {
			signalingWs.send(JSON.stringify({ type, message }));
		}
	}

	static #OnPointerMove({ data }) {
		const view = new DataView(data);
		const isRelative = view.getUint8(0) === 1;

		if (isRelative) {
			const movementX = view.getInt32(1, true);
			const movementY = view.getInt32(5, true);
			nativeApis.moveMousePosition(movementX, movementY);
		} else {
			const absoluteX = view.getUint32(1, true);
			const absoluteY = view.getUint32(5, true);
			nativeApis.setMousePosition(absoluteX, absoluteY);
		}
	}

	static #OnPointerClick({ data }) {
		const view = new DataView(data);
		const isDown = view.getUint8(0) === 1;
		const button = view.getUint8(1);

		nativeApis.setMouseButton(button, isDown);
	}

	static #OnKeyboardType({ data }) {
		const view = new DataView(data);
		const isDown = view.getUint8(0) === 1;
		const key = view.getUint8(1);

		nativeApis.setKeyboardKey(key, isDown);
	}

	static #OnPointerScroll({ data }) {
		const view = new DataView(data);
		const deltaMode = view.getUint8(0);
		const deltaX = view.getFloat32(1, true);
		const deltaY = view.getFloat32(5, true);
		const deltaZ = view.getFloat32(9, true);

		nativeApis.scrollMouse(deltaMode, deltaX, deltaY, deltaZ);
	}
}

/*
const DOM_DELTA_PIXEL = 0x00;
const DOM_DELTA_LINE = 0x01;
const DOM_DELTA_PAGE = 0x02;
*/