const video = document.getElementById("video");

const peer = new Peer({
	host: location.hostname,
	port: location.port,
	path: "/peerjs",
	secure: window.isSecureContext
});

peer.on("open", (id) => console.log("VIEWER_READY", id));

const call = peer.call("main", new MediaStream());

call.on("stream", (stream) => {
	console.log("STREAM_RECEIVED");
	video.srcObject = stream;
	video.play().catch(console.error);
});

peer.on("error", console.error);
