import NetworkProtocolView from "./NetworkProtocolView.js";
import ConnectToServerPeer from "./ConnectToServerPeer.js";

const screenshare = document.getElementById("screenshare");
const peer = await ConnectToServerPeer();
peer.addEventListener("track", (event) => {
	screenshare.srcObject = event.streams[0];
});

const viewBuffer = new ArrayBuffer(16);
const viewBytes = new Uint8Array(viewBuffer);
const view = new NetworkProtocolView(viewBuffer);

const pointermove = peer.createDataChannel("pointermove", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});

// I wish MacOS had touchscreen and stylus APIs
window.addEventListener("pointermove", (event) => { // pointerrawupdate - safari doesn't support unfortunately
	if (pointermove.readyState !== "open") return;
	const offset = view.setVector2(0, event.movementX, event.movementY); // movementX and movementY works on mobile and most likely stylus as well
	pointermove.send(viewBytes.subarray(0, offset));
});
