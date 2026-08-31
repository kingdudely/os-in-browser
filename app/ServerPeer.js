import nativeApis from "native-apis";

const clipboard = nw.Clipboard.get();

const stream = await getPrimaryDisplayMedia();
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
		this.signalingWs.addEventListener("close", () => clearInterval(pingInterval));
		this.signalingWs.addEventListener("message", this.#onTrickleICEMessage.bind(this));

		this.addEventListener("icecandidate", this.#onIceCandidate.bind(this));
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
		}, ({ data }) => clipboard.set(data, "text"));

		nativeApis.startClipboardWatch(() => {
			if (clipboardSyncChannel.readyState === "open") {
				clipboardSyncChannel.send(clipboard.get("text"));
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
					// Client does this: this.restartIce();
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

	async #onTrickleICEMessage({ data }) {
		let message, type;
		try {
			({ message, type } = JSON.parse(data.toString()));
		} catch {
			return;
		}

		switch (type) {
			case "offer": {
				try {
					await this.setRemoteDescription(message);
					this.#remoteDescriptionReady.resolve();

					await this.setLocalDescription();
					this.#sendWSMessage("answer", this.localDescription);
				} catch (error) {
					this.#remoteDescriptionReady.reject(error);
					console.error("Failed to process offer:", error);
				}

				break;
			}


			case "ice-candidate": {
				try {
					await this.#remoteDescriptionReady.promise;
					await this.addIceCandidate(message);
				} catch (error) {
					console.error("Failed to add ICE candidate:", error);
				};

				break;
			}

			case "ping": break;

			default: {
				console.warn(`Unknown packet type: ${type}`);
				break;
			}
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

async function getPrimaryDisplayMedia() {
	nw.Screen.Init();

	const monitor = nw.Screen.DesktopCaptureMonitor;

	return new Promise((resolve, reject) => {
		monitor.on("added", function onAdded(id, name, order, type, primary) {
			if (type !== "screen"/* || !primary*/) return;

			monitor.removeListener("added", onAdded);

			const streamId = monitor.registerStream(id);
			monitor.stop();

			navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					mandatory: {
						chromeMediaSource: "desktop",
						chromeMediaSourceId: streamId
					}
				}
			}).then(resolve, reject);
		});

		monitor.start(true, false);
	});
}

/*
const DOM_DELTA_PIXEL = 0x00;
const DOM_DELTA_LINE = 0x01;
const DOM_DELTA_PAGE = 0x02;
*/