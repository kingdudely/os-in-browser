import code_keys from "./code_keys.json" with { type: "json" };

const host = chrome.runtime.connectNative("host.py");
const stream = await navigator.mediaDevices.getDisplayMedia({
	video: true,
	audio: false
});

/*
let layoutMap = await navigator.keyboard.getLayoutMap();
navigator.keyboard.addEventListener("layoutchange", async () => {
    layoutMap = await navigator.keyboard.getLayoutMap();
});
*/

host.onMessage.addListener(async (msg) => {
    switch (msg.type) {
        case "offer":
            host.postMessage({ type: "answer", sdp: await getAnswer(msg.sdp) });
            break;
    }
});

const waitForIceGathering = async (peer) =>
	new Promise((resolve) => {
		if (peer.iceGatheringState === "complete") {
			resolve();
		} else {
			peer.addEventListener("icegatheringstatechange", function onStateChange() {
				if (peer.iceGatheringState === "complete") {
					peer.removeEventListener("icegatheringstatechange", onStateChange);
					resolve();
				}
			});
		}
	});

async function getAnswer(offerSdp) {
    const peer = new RTCPeerConnection();
    peer.addEventListener("connectionstatechange", () => {
        if (["disconnected", "failed", "closed"].includes(peer.connectionState)) {
			peer.close();
		}
    });

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const pointerMovementChannel = peer.createDataChannel("pointer-movement", { ordered: false, maxRetransmits: 0, negotiated: true, id: 0 });
    pointerMovementChannel.addEventListener("message", (event) => {
		const view = new DataView(event.data);

        if (view.byteLength === 4) {
            host.postMessage({
				type: "move_mouse",
				dx: view.getInt16(0, true),
				dy: view.getInt16(2, true)
			});
        } else {
            host.postMessage({
				type: "set_mouse_position",
				x: view.getUint32(0, true),
				y: view.getUint32(4, true)
			});
        }
    });

    const pointerClickChannel = peer.createDataChannel("pointer-click", { ordered: true, negotiated: true, id: 1 });
    pointerClickChannel.addEventListener("message", (event) => {
        const view = new DataView(event.data);

        host.postMessage({
			type: "click_mouse_button",
			is_down: view.getUint8(0) === 1,
			button: view.getUint8(1)
		});
    });

    const keyboardChannel = peer.createDataChannel("keyboard-type", { ordered: true, negotiated: true, id: 2 });
    keyboardChannel.addEventListener("message", async (event) => {
        const view = new DataView(event.data);

		const code_index = view.getUint8(1);
		const code = code_keys[code_index];

		const layoutMap = await navigator.keyboard.getLayoutMap();
		const key = layoutMap.get(code);

        host.postMessage({
			type: "type_keyboard_key",
			is_down: view.getUint8(0) === 1,
			key_or_code: key || code
		});
    });

    const screenResizeChannel = peer.createDataChannel("screen-resize", { ordered: false, negotiated: true, id: 3 });

    const pointerScrollChannel = peer.createDataChannel("pointer-scroll", { ordered: false, maxRetransmits: 0, negotiated: true, id: 4 });
    pointerScrollChannel.addEventListener("message", (event) => {
        const view = new DataView(event.data);
        host.postMessage({
			type: "scroll_mouse",
			dx: view.getFloat32(0, true),
			dy: view.getFloat32(4, true)
		});
    });

    await peer.setRemoteDescription({ type: "offer", sdp: offerSdp });
    await peer.setLocalDescription();
    await waitForIceGathering(peer);

    return peer.localDescription.sdp;
}