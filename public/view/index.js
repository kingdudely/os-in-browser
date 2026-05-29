// view/index.js
const remoteVideo = document.getElementById('remote-video');
const isHttps = location.protocol === "https:";

const peer = new Peer({
	host: location.hostname,
	port: location.port || (isHttps ? 443 : 80),
	path: '/peerjs',
	secure: isHttps
});

let dataConnection;

peer.on("open", (id) => {
	console.log(`[Viewer] Assigned local ID: ${id}. Initializing handshake wire...`);
	
	// Step 1: Open communication line to the host listener
	dataConnection = peer.connect('host');

	dataConnection.on('open', () => {
		console.log("[Viewer] Control bridge established. Monitoring global windows for VM commands...");
	});
});

// Step 2: Catch the host's call when it dials back out to us
peer.on('call', (call) => {
	console.log("[Viewer] Handshake response call received from host. Confirming connection...");
	
	// Answer without sending a local stream track back
	call.answer();

	call.on('stream', (remoteStream) => {
		console.log("[Viewer] Processing incoming screen rendering data matrix...");
		remoteVideo.srcObject = remoteStream;
		
		// Force media matrix viewport display
		remoteVideo.play().catch(err => console.error("[Viewer] Playback block encountered:", err));
	});
});

peer.on('error', console.error);

// Encapsulation wrapper piping events down the WebRTC data tunnel
function sendEventData(type, args) {
	if (dataConnection && dataConnection.open) {
		dataConnection.send({ type, args });
	}
}

// --- Absolute Window UI Tracking Core ---

window.addEventListener('mousemove', (event) => {
	const rect = remoteVideo.getBoundingClientRect();
	
	// Track mouse movements relative to the video frame bounding box
	const xPercent = (event.clientX - rect.left) / rect.width;
	const yPercent = (event.clientY - rect.top) / rect.height;
	
	// Lock bounds between 0 and 1 so sweep overshoots do not break the VM tracking core
	const boundedX = Math.max(0, Math.min(1, xPercent));
	const boundedY = Math.max(0, Math.min(1, yPercent));

	sendEventData(event.type, [boundedX, boundedY]);
});

window.addEventListener('mousedown', (event) => {
	sendEventData(event.type, [event.button]);
});

window.addEventListener('mouseup', (event) => {
	sendEventData(event.type, [event.button]);
});

window.addEventListener('mouseleave', (event) => {
	// event.buttons is a bitmask of all currently pressed mouse buttons:
	// 1 = Left, 2 = Right, 4 = Center/Middle
	if (event.buttons & 1) sendEventData('mouseup', [0]); // Release Left Click
	if (event.buttons & 2) sendEventData('mouseup', [2]); // Release Right Click
	if (event.buttons & 4) sendEventData('mouseup', [1]); // Release Center/Middle Click
	
	console.log("Cursor escaped viewport. All active mouse flags safely cleared in VM.");
});

window.addEventListener('keydown', (event) => {
	event.preventDefault();
	sendEventData(event.type, [event.key]);
});

window.addEventListener('keyup', (event) => {
	event.preventDefault();
	sendEventData(event.type, [event.key]);
});
