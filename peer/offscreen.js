import Peer from "../docs/peer.js";

const host = await chrome.runtime.connectNative("host");

function sendToHost(msg) {
    return new Promise((resolve, reject) => {
        function onMessage(response) {
            host.onMessage.removeListener(onMessage);
            host.onDisconnect.removeListener(onDisconnect);
            resolve(response);
        }
        function onDisconnect() {
            host.onMessage.removeListener(onMessage);
            host.onDisconnect.removeListener(onDisconnect);
            reject("Native host disconnected");
        }
        host.onMessage.addListener(onMessage);
        host.onDisconnect.addListener(onDisconnect);
        host.postMessage(msg);
    });
}

const VIEWER_SHARE_ID = await sendToHost({ type: "get_viewer_share_id" });

const peer = new Peer();
peer.addTransceiver("audio", { direction: "sendonly" });
peer.addTransceiver("video", { direction: "sendonly" });

await peer.connectToShareId(VIEWER_SHARE_ID);

const screenshare = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: "always", displaySurface: "monitor" },
    audio: { systemAudio: "include" }
});

const videoTrack = screenshare.getVideoTracks()[0];
peer.addTrack(videoTrack, screenshare);

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

const pointerScrollChannel = peer.createDataChannel("pointer-scroll", {
    ordered: false,
    maxRetransmits: 0,
    negotiated: true,
    id: 4
});

pointerMovementChannel.addEventListener("message", async (event) => {
    const view = new DataView(event.data);

    if (event.data.byteLength === 4) {
        // relative movement (pointer lock)
        const dx = view.getInt16(0, true);
        const dy = view.getInt16(2, true);
        await sendToHost({ type: "move_mouse", dx, dy });
    } else {
        // absolute position
        const x = view.getUint32(0, true);
        const y = view.getUint32(4, true);
        await sendToHost({ type: "set_mouse_position", x, y });
    }
});

pointerClickChannel.addEventListener("message", async (event) => {
    const view = new DataView(event.data);
    const is_down = view.getUint8(0) === 1;
    const button = view.getUint8(1);
    await sendToHost({ type: "click_mouse_button", is_down, button });
});

keyboardTypeChannel.addEventListener("message", async (event) => {
    const view = new DataView(event.data);
    const is_down = view.getUint8(0) === 1;
    const code_index = view.getUint8(1);
    const key_or_code = code_keys[code_index];
    await sendToHost({ type: "type_keyboard_key", is_down, key_or_code });
});

pointerScrollChannel.addEventListener("message", async (event) => {
    const view = new DataView(event.data);
    const dx = view.getFloat32(0, true);
    const dy = view.getFloat32(4, true);
    // pynput scroll uses lines not pixels, so scale down
    await sendToHost({ type: "scroll_mouse", dx: dx / 20, dy: dy / 20 });
});

console.log(await peer.getShareId());
await new Promise(resolve => setTimeout(resolve, 21_600_000)); // 6 hours