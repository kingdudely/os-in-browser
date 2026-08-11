// Pointer lock makes events added to "screenshare" element not work since document.body is the one requesting for pointer lock - a child of "window".
window.addEventListener("error", (event) => {
	const errorMessage = event.message || "Unknown error occurred";
    window.alert(`Error:\n${errorMessage}`);
});

window.addEventListener("unhandledrejection", (event) => {
    const asyncErrorMessage = event.reason?.message || event.reason || "Unknown async error occurred";
    window.alert(`Async error:\n${asyncErrorMessage}`);
});

import codeMap from "./code-map.json" with { type: "json" };

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible') {
		navigator.wakeLock?.request('screen');
	}
});

const screenshare = document.getElementById("screenshare");
const sharedBytes = new Uint8Array(13);
const sharedView = new DataView(sharedBytes.buffer);

// event.preventDefault();
// mainDialog.close();

const peer = new RTCPeerConnection({
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
});

peer.addEventListener("connectionstatechange", () => {
    console.log(`ICE connection state: ${peer.connectionState}`);
    if (["disconnected", "closed"].includes(peer.connectionState)) {
        mainDialog.showModal();
    }
    // "failed" is handled by the runner calling restartIce() and
    // renegotiating — don't tear down the UI for it.
});

peer.addEventListener("track", (event) => {
    screenshare.srcObject = event.streams[0];
    screenshare.play().catch(console.warn);
});

peer.addTransceiver("video", {
    direction: "recvonly"
});

const topicName = encodeURIComponent(crypto.randomUUID());
const topicUrl = `https://ntfy.sh/${topicName}`;
const topic = new EventSource(`${topicUrl}/sse`);
peer.addEventListener("icecandidate", (event) => {
    if (!event.candidate || event.candidate.type === "host") return;

    fetch(topicUrl, {
        method: "POST",
        headers: {
            "Title": "answer-candidate",
            "Filename": "file.txt"
        },
        body: JSON.stringify(event.candidate),
    });
});

const setRemoteDescriptionCompleted = Promise.withResolvers();
topic.addEventListener("message", async (event) => {
    const { title, attachment } = JSON.parse(event.data);
    if (!attachment) return; // shouldn't happen anymore, but guard just in case

    const message = await (await fetch(attachment.url)).text();

    switch (title) {
        case "offer": {
            await peer.setRemoteDescription({ type: "offer", sdp: message });
            setRemoteDescriptionCompleted.resolve();

            await peer.setLocalDescription();
            await fetch(topicUrl, {
                method: "POST",
                headers: {
                    "Title": "answer",
                    "Filename": "file.txt"
                },
                body: peer.localDescription.sdp,
            });
            break;
        };

        case "offer-candidate": {
            await setRemoteDescriptionCompleted.promise;
            await peer.addIceCandidate(JSON.parse(message));
            break;
        };
    }
});

const pointerMovementChannel = peer.createDataChannel("pointer-movement", {
    ordered: false,
    maxRetransmits: 0,
    negotiated: true,
    id: 0
});

// pointerrawupdate, getCoalescedEvents
window.addEventListener("pointermove", (event) => {
    event.preventDefault();
    if (pointerMovementChannel.readyState !== "open") return;

    sharedView.setUint8(0, document.pointerLockElement ? 1 : 0);
    if (document.pointerLockElement) {
        sharedView.setInt32(1, event.movementX, true);
        sharedView.setInt32(5, event.movementY, true);
    } else {
        sharedView.setUint32(1, event.clientX, true);
        sharedView.setUint32(5, event.clientY, true);
    }
    
    pointerMovementChannel.send(sharedBytes.subarray(0, 9));
});

const pointerClickChannel = peer.createDataChannel("pointer-click", {
    ordered: true,
    negotiated: true,
    id: 1
});

window.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (pointerClickChannel.readyState !== "open") return;
    triggerImmersiveMode();

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

const keyboardTypeChannel = peer.createDataChannel("keyboard-type", {
    ordered: true,
    negotiated: true,
    id: 2
});

// Could do tabindex=0 but then they can just press tab again - also, this is more reliable, and screenshare is basically the whole screen anyways.
window.addEventListener("keydown", (event) => {
    event.preventDefault();
    if (keyboardTypeChannel.readyState !== "open" || event.repeat) return;
    triggerImmersiveMode();

    if (!(event.code in codeMap)) {
        console.warn(`"${event.code}" does not have a corresponding value in code-map.json`);
        return;
    }

    sharedView.setUint8(0, 1); // isDown
    sharedView.setUint8(1, codeMap[event.code]);

    keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
});

window.addEventListener("keyup", (event) => {
    event.preventDefault();
    if (keyboardTypeChannel.readyState !== "open") return;

    if (!(event.code in codeMap)) {
        console.warn(`"${event.code}" does not have a corresponding value in code-map.json`);
        return;
    }

    sharedView.setUint8(0, 0); // isDown
    sharedView.setUint8(1, codeMap[event.code]);

    keyboardTypeChannel.send(sharedBytes.subarray(0, 2));
})

// Not implemented.
const screenResizeChannel = peer.createDataChannel("screen-resize", {
    ordered: false,
    negotiated: true,
    id: 3
});

function onResize() {
    if (screenResizeChannel.readyState !== "open") return;
    console.log("Sending screen resize packet...");

    sharedView.setUint32(0, window.innerWidth, true);
    sharedView.setUint32(4, window.innerHeight, true);
    screenResizeChannel.send(sharedBytes.subarray(0, 8));
}

screenResizeChannel.addEventListener("open", onResize); // So it automatically resizes in the beginning
window.addEventListener("resize", onResize); // ResizeObserver 

const pointerScrollChannel = peer.createDataChannel("pointer-scroll", {
    ordered: false,
    maxRetransmits: 0,
    negotiated: true,
    id: 4
});

window.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (pointerScrollChannel.readyState !== "open") return;

    sharedView.setUint8(0, event.deltaMode);
    sharedView.setFloat32(1, event.deltaX, true);
    sharedView.setFloat32(5, event.deltaY, true);
    sharedView.setFloat32(9, event.deltaZ, true); // unsupported in pynput
    pointerScrollChannel.send(sharedBytes.subarray(0, 13));
});

function triggerImmersiveMode() {	
	if (document.fullscreenEnabled && !document.fullscreenElement) {
		document.body.requestFullscreen({ // target, await
			"navigationUI": "hide"
		}).then(() => navigator.keyboard?.lock()).catch(() => {});
	};

	if (!document.pointerLockElement) {
		document.body.requestPointerLock({ // target, await
			"unadjustedMovement": true
		}).catch(() => {});
	}
}