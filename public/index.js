const remoteVideo = document.getElementById('remote-video');

const peer = new Peer({
	host: location.hostname,
	port: location.port || (window.isSecureContext ? 443 : 80),
	path: '/peerjs',
	secure: window.isSecureContext
});

peer.on("error", console.error);

let dataConnection;

peer.on("open", (id) => {
	dataConnection = peer.connect('host');

	dataConnection.on('open', () => {
		console.log("Data connection established. Starting video stream call...");

		const call = peer.call('host', new MediaStream());
		
		call.on('stream', (remoteStream) => {
			console.log("Received remote stream!");
			remoteVideo.srcObject = remoteStream;
			remoteVideo.play().catch(console.error);
		});

		call.on('error', console.error);
	});
});

function sendEventData(type, args) {
	if (dataConnection && dataConnection.open) {
		dataConnection.send({ type, args });
	}
}

// FIX #3: Map mouse movements as bounded percentages (0 to 1)
remoteVideo.addEventListener('mousemove', (event) => {
	const rect = remoteVideo.getBoundingClientRect();
	
	const xPercent = (event.clientX - rect.left) / rect.width;
	const yPercent = (event.clientY - rect.top) / rect.height;
	
	// Bound between 0 and 1 in case the mouse cursor skews out of bounds slightly
	const boundedX = Math.max(0, Math.min(1, xPercent));
	const boundedY = Math.max(0, Math.min(1, yPercent));

	sendEventData(event.type, [boundedX, boundedY]);
});

remoteVideo.addEventListener('mousedown', (event) => {
	sendEventData(event.type, [event.button]);
});

remoteVideo.addEventListener('mouseup', (event) => {
	sendEventData(event.type, [event.button]);
});

remoteVideo.addEventListener('keydown', (event) => {
	event.preventDefault();
	sendEventData(event.type, [event.key]);
});

// Added pairing keyup tracker to stop keys from getting stuck down
remoteVideo.addEventListener('keyup', (event) => {
	event.preventDefault();
	sendEventData(event.type, [event.key]);
});
