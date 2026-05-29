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

remoteVideo.addEventListener('mousemove', (event) => {
	const rect = remoteVideo.getBoundingClientRect();
	const x = Math.round(((event.clientX - rect.left) / rect.width) * remoteVideo.videoWidth);
	const y = Math.round(((event.clientY - rect.top) / rect.height) * remoteVideo.videoHeight);
	sendEventData(event.type, [x, y]);
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
