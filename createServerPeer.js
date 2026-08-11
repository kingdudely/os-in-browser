const nativeApis = require("native-apis");

const RTCPeerConnectionInit = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

export default function createServerPeer() {
    const peer = new RTCPeerConnection(RTCPeerConnectionInit);

    console.log("RTCPeerConnection initialized!");

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
    /* no op for now
    const view = new DataView(event.data);
    const innerWidth = view.getUint32(0, true);
    const innerHeight = view.getUint32(4, true);

    if (!screenCreated) {
        nativeApis.createVirtualScreen(innerWidth, innerHeight);
        screenCreated = true;
    } else {
        nativeApis.resizeVirtualScreen(innerWidth, innerHeight);
    }
    */
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