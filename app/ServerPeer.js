const nativeApis = require("native-apis");
nativeApis.createVirtualScreen();

const stream = await navigator.mediaDevices.getDisplayMedia();
const tracks = stream.getTracks();

export default class ServerPeer extends RTCPeerConnection {
    static #Init = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
        ]
    }
    
    signalingWs;

    constructor (signalingWs) {
        super(ServerPeer.#Init);
        this.signalingWs = signalingWs;

        this.#initializeDataChannels();

        this.addEventListener("icecandidate", this.#onIceCandidate.bind(this));
        this.addEventListener("negotiationneeded", this.#onNegotiationNeeded.bind(this));
        this.addEventListener("connectionstatechange", this.#onConnectionStateChange.bind(this));
        this.signalingWs.on("message", this.#onTrickleICEMessage.bind(this));

        const pingInterval = setInterval(() => this.#sendWSMessage("ping"), 1337);
        this.signalingWs.once("close", () => clearInterval(pingInterval));

        tracks.forEach((track) => this.addTrack(track, stream));
    }

    #initializeDataChannels() {
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

        const keyboardTypeChannel = this.createDataChannel("keyboard-type", {
            ordered: true,
            negotiated: true,
            id: 2
        });

        const screenResizeChannel = this.createDataChannel("screen-resize", {
            ordered: false,
            negotiated: true,
            id: 3
        });

        const pointerScrollChannel = this.createDataChannel("pointer-scroll", {
            ordered: false,
            maxRetransmits: 0,
            negotiated: true,
            id: 4
        });

        pointerMovementChannel.addEventListener("message", ServerPeer.#onPointerMove);
        pointerClickChannel.addEventListener("message", ServerPeer.#onPointerClick);
        keyboardTypeChannel.addEventListener("message", ServerPeer.#onKeyboardType);
        screenResizeChannel.addEventListener("message", ServerPeer.#onScreenResize);
        pointerScrollChannel.addEventListener("message", ServerPeer.#onPointerScroll);
    }

    #onConnectionStateChange() {
        switch (this.connectionState) {
            case "closed": {
                this.signalingWs.close();
                break;
            }

            case "failed": {
                this.restartIce();
                break;
            }

            case "disconnected": break;
            case "connected": break;

            default: {
                console.warn(`Unknown connection state: ${this.connectionState}`);
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
                } catch (err) {
                    console.error("Failed to set remote description:", err);
                };

                break;
            }

            case "ice-candidate": {
                try {
                    await this.addIceCandidate(data.message);
                } catch (err) {
                    console.error("Failed to add ICE candidate:", err);
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
        try {
            const offer = await this.createOffer();
            await this.setLocalDescription(offer);
            this.#sendWSMessage("offer", this.localDescription);
        } catch (error) {
            console.error("Failed to create/send offer:", error);
        }
    }

    async #onIceCandidate(event) {
        if (event.candidate) {
            this.#sendWSMessage("ice-candidate", event.candidate);
        }
    }

    #sendWSMessage(type, message) {
        if (this.signalingWs.readyState === WebSocket.OPEN) {
            this.signalingWs.send(JSON.stringify({ type, message }));
        }
    }

    static async #onPointerMove(event) {
        const view = new DataView(event.data);
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

    static async #onPointerClick(event) {
        const view = new DataView(event.data);
        const isDown = view.getUint8(0) === 1;
        const button = view.getUint8(1);

        nativeApis.setMouseButton(button, isDown);
    }

    static async #onKeyboardType(event) {
        const view = new DataView(event.data);
        const isDown = view.getUint8(0) === 1;
        const key = view.getUint8(1);

        nativeApis.setKeyboardKey(key, isDown);
    }

    static async #onScreenResize(event) {
        const view = new DataView(event.data);
        const innerWidth = view.getUint32(0, true);
        const innerHeight = view.getUint32(4, true);

        nativeApis.resizeVirtualScreen(innerWidth, innerHeight);
    }

    static async #onPointerScroll(event) {
        const view = new DataView(event.data);
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