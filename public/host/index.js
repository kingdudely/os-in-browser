// host/index.js
const isHttps = location.protocol === "https:";
const peer = new Peer("host", {
	host: location.hostname,
	port: location.port || (isHttps ? 443 : 80),
	path: "/peerjs",
	secure: isHttps
});

console.log("[Host] Initializing PeerJS Node...");

let sharedStream = null;

// Persistent, single-prompt stream cache engine
async function getHostStream() {
	if (sharedStream && sharedStream.getVideoTracks()[0]?.readyState === 'live') {
		return sharedStream;
	}
	console.log("[Host] Cache empty or track dead. Invoking getDisplayMedia...");
	sharedStream = await navigator.mediaDevices.getDisplayMedia({
		video: true,
		audio: false
	});
	return sharedStream;
}

// Pre-cache the stream right away so it is ready before anyone connects
getHostStream()
	.then(() => console.log("[Host] Screen capture successfully initialized and locked in memory."))
	.catch(err => console.error("[Host] Boot stream capture failed:", err));

// Passive data handler mapping inbound data wires
peer.on('connection', (conn) => {
	console.log(`[Host] Inbound data pipeline request from viewer: ${conn.peer}`);
	
	// The moment the data path stabilizes, DIAL THE VIEWER with the cached stream
	conn.on('open', async () => {
		try {
			console.log(`[Host] Data link open. Dialing viewer (${conn.peer}) with screen track...`);
			const stream = await getHostStream();
			peer.call(conn.peer, stream);
		} catch (err) {
			console.error("[Host] Outbound media call failed:", err);
		}
	});

	// Process inbound UI orchestration events sent over WebRTC data lines
	conn.on('data', (data) => {
		// Evaluates global execution instructions passed from client window
		window[data.type]?.(...data.args);
	});
	
	conn.on('close', () => {
		console.log(`[Host] Viewer ${conn.peer} disconnected.`);
	});
});

peer.on('error', (err) => console.error("[Host] Peer core error:", err));
