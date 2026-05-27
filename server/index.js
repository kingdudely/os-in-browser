import {
	app,
	BrowserWindow,
	desktopCapturer,
	session
} from "electron";
import http from "node:http";
import {
	env
} from "node:process";

const {
	PASSWORD = "", USERNAME = "", PORT, TUNNEL_URL
} = env;

const server = http.createServer((req, res) => {
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
<body>
<script src="https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js"></script>
<script>
(async () => {
  const peer = new Peer("${TUNNEL_URL}");

  const stream = await navigator.mediaDevices.getDisplayMedia({
	video: true,
	audio: true
  });

  peer.on("call", (call) => {
	call.answer(stream);
  });

})();
</script>
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
<body>
<video id="video" autoplay playsinline></video>
<script src="https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js"></script>
<script>
const video = document.getElementById("video");

const peer = new Peer();

peer.on("open", () => {
  const call = peer.call("${TUNNEL_URL}", null);

  call.on("stream", (stream) => {
	video.srcObject = stream;
  });
});
</script>
</body>
</html>
`);
		return;
	}

	res.writeHead(404);
	res.end();
});

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
