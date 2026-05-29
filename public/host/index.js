console.log(location.hostname)
console.log(window.isSecureContext)
const peer = new Peer("host", {
	host: location.hostname,
	port: location.port || (window.isSecureContext ? 443 : 80),
	path: "/peerjs",
	secure: false
});

console.log("A");

peer.on('call', async (call) => {
	console.log("B");
	try {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: true,
			audio: false
		});
		console.log("C");
		call.answer(stream);
		console.log("D");
	} catch (err) {
		console.log(`WebRTC stream generation exception raised: ${err.message || err.toString()}`);
	}
});

console.log("E");

peer.on('connection', (conn) => {
	console.log("F");
	conn.on('data', (data) => {
		// console.log("G");
		window[data.type]?.(...data.args);
		// console.log("H");
	});
	console.log("I");
});

console.log("J");
