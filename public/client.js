import codeMap from "./code-map.json" with { type: "json" };

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
	constructor(videoElement) {
		super(RTCPeerConnectionInit);

		this.addEventListener("track", (event) => {
			videoElement.srcObject = event.streams[0];
			videoElement.play().catch(() => {});
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

		window.addEventListener("pointerup", (event) => {
			event.preventDefault();
			if (pointerClickChannel.readyState !== "open") return;

			sharedView.setUint8(0, 0); // isDown
			sharedView.setUint8(1, event.button);
			pointerClickChannel.send(sharedBytes.subarray(0, 2));
		});

		videoElement.addEventListener("keydown", (event) => { // screenshare
			event.preventDefault();
			if (keyboardChannel.readyState !== "open" || event.repeat || !event.code) return;
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
			if (keyboardChannel.readyState !== "open" || !event.code) return;

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

	get async iceGatheringCompleted() {
		return new Promise((resolve) => {
			function checkState() {
				if (client.iceGatheringState === "complete") {
					client.removeEventListener('icegatheringstatechange', checkState);
					resolve(true);
				}
			}

			checkState();
			client.addEventListener('icegatheringstatechange', checkState);
		});
	}
}