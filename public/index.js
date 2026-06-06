import ConnectToServerPeer from "./ConnectToServerPeer.js";

const screenshare = document.getElementById("screenshare");
const peer = await ConnectToServerPeer();
peer.addEventListener("track", (event) => {
	screenshare.srcObject = event.streams[0];
});

const pointermove = peer.createDataChannel("pointermove", {
	ordered: false,
	maxRetransmits: 0,
	negotiated: true,
	id: 0
});

const pointerMovement = new DataView(new ArrayBuffer(2));
// I wish MacOS had touchscreen and stylus APIs
window.addEventListener("pointermove", (event) => { // pointerrawupdate - safari doesn't support unfortunately
	if (pointermove.readyState !== "open") return;
	pointerMovement.setInt16(0, event.movementX, true);
	pointerMovement.setInt16(2, event.movementY, true);
	pointermove.send(pointerMovement);
});

const pointerdown = peer.createDataChannel("pointerdown", {
	ordered: true,
	negotiated: true,
	id: 1
});
const pointerButton = new Uint8Array(1);
window.addEventListener("pointerdown", (event) => {
	pointerButton[0] = event.button;
	pointerdown.send(pointerButton);
})

