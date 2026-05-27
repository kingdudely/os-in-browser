const {
	app,
	BrowserWindow,
	desktopCapturer,
	session
} = require("electron");
const { createServer } = require("node:http");
const { env: { PASSWORD = "", USERNAME = "", PORT, TUNNEL_URL } } = require("node:process");

const server = createServer((req, res) => {
	if (req.url === "/log") {
		console.log("[renderer]", req.url);
		res.writeHead(204);
		res.end();
		return;
	}

	if (req.url === "/host") {
		res.writeHead(200, {
			"Content-Type": "text/html"
		});
		res.end(`
<!DOCTYPE html>
<html>
<head>
<script src="https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js"></script>
<script defer>
const peer = new Peer("${TUNNEL_URL}");

peer.on("call", async (call) => {
	const stream = await navigator.mediaDevices.getDisplayMedia({
		video: true,
		audio: true
	});

	call.answer(stream);
});
</script>
</head>
<body>
</body>
</html>
`);
		return;
	}

	if (req.url === "/") {
		res.writeHead(200, {
			"Content-Type": "text/html"
		});
		res.end(`
<!DOCTYPE html>
<html>
<head>
<script src="https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js"></script>
<script defer>
const video = document.getElementById("video");

const peer = new Peer();

peer.on("open", () => {
  const call = peer.call("${TUNNEL_URL}", null);

  call.on("stream", (stream) => {
	video.srcObject = stream;
  });
});
</script>
</head>
<body>
<video id="video" autoplay playsinline></video>
</body>
</html>
`);
		return;
	}

	res.writeHead(404);
	res.end();
});

async function main() {
	await app.whenReady();

	console.log("b")
	const win = new BrowserWindow({
		show: false
	});
	
	session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
		const sources = await desktopCapturer.getSources({
			types: ["screen"]
		});
		const source = sources?.[0];
		if (source) {
			callback({
				video: source,
				audio: "loopback"
			});
		} else {
			callback({});
		}
	}, {
		useSystemPicker: false
	});
	
	await win.loadURL(`http://localhost:${PORT}/host`);

	server.listen(PORT, () => {
		console.log(TUNNEL_URL);
	});
}

main();
