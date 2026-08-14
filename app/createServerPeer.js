const nativeApis = require("native-apis");
nativeApis.createVirtualScreen();

const RTCPeerConnectionInit = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

export default function createServerPeer(ws) {
    const peer = new RTCPeerConnection(RTCPeerConnectionInit);

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

    pointerMovementChannel.addEventListener("message", onPointerMove.bind(pointerMovementChannel));
    pointerClickChannel.addEventListener("message", onPointerClick.bind(pointerClickChannel));
    keyboardTypeChannel.addEventListener("message", onKeyboardType.bind(keyboardTypeChannel));
    screenResizeChannel.addEventListener("message", onScreenResize.bind(screenResizeChannel));
    pointerScrollChannel.addEventListener("message", onPointerScroll.bind(pointerScrollChannel));

    // --- signaling over ws ---

    function send(type, message) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type, message }));
        }
    }

    peer.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
            send("ice-candidate", event.candidate);
        }
    });

    peer.addEventListener("negotiationneeded", async () => {
        try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            send("offer", peer.localDescription);
        } catch (err) {
            console.error("Failed to create/send offer:", err);
        }
    });

    ws.on("message", async (raw) => {
        let data;
        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        switch (data.type) {
            case "answer":
                try {
                    await peer.setRemoteDescription(data.message);
                } catch (err) {
                    console.error("Failed to set remote description:", err);
                }
                break;
            case "ice-candidate":
                try {
                    await peer.addIceCandidate(data.message);
                } catch (err) {
                    console.error("Failed to add ICE candidate:", err);
                }
                break;
        }
    });

    // ws.once("close", () => peer.close());

    return peer;
}

async function onPointerMove(event) {
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

async function onPointerClick(event) {
    const view = new DataView(event.data);
    const isDown = view.getUint8(0) === 1;
    const button = view.getUint8(1);

    nativeApis.setMouseButton(button, isDown);
}

async function onKeyboardType(event) {
    const view = new DataView(event.data);
    const isDown = view.getUint8(0) === 1;
    const key = view.getUint8(1);

    nativeApis.setKeyboardKey(key, isDown);
}

async function onScreenResize(event) {
    const view = new DataView(event.data);
    const innerWidth = view.getUint32(0, true);
    const innerHeight = view.getUint32(4, true);

    nativeApis.resizeVirtualScreen(innerWidth, innerHeight);
}

/*
const DOM_DELTA_PIXEL = 0x00;
const DOM_DELTA_LINE = 0x01;
const DOM_DELTA_PAGE = 0x02;
*/

async function onPointerScroll(event) {
    const view = new DataView(event.data);
    const deltaMode = view.getUint8(0);
    const deltaX = view.getFloat32(1, true);
    const deltaY = view.getFloat32(5, true);
    const deltaZ = view.getFloat32(9, true);

    nativeApis.scrollMouse(deltaMode, deltaX, deltaY, deltaZ);
}