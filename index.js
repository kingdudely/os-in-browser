import {
	app,
	BrowserWindow,
	session,
	desktopCapturer
} from "electron";
import { fileURLToPath } from "node:url";
import express from "express";
import { ExpressPeerServer } from "peer";
import { env } from "node:process";
import basicAuth from "express-basic-auth";
const relativeToAbsoluteURL = (url) => fileURLToPath(import.meta.resolve(url));

const { PORT, PUBLIC_URL, USERNAME = "", PASSWORD = "" } = env;

const app = express();
const server = app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
app.use(express.static(relativeToAbsoluteURL('./public')));

app.use(basicAuth({
    users: {
		[USERNAME]: PASSWORD
	}
}));

app.use("/peerjs", ExpressPeerServer(server));

const HTML = `
<!DOCTYPE html>
<html>
<head>
<script src="/peerjs.min.js"></script>
<script defer>
	console.log(location.hostname);
	const peer = new Peer("main", {
		host: "localhost",
		port: ${PORT},
		path: "/peerjs",
		secure: window.isSecureContext
	});

	peer.on("open", (id) => console.log(id));

	peer.on("call", async (call) => {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: true,
			audio: true
		});

		call.answer(stream);
	});

	peer.on("error", console.error);
</script>
</head>
<body>
</body>
</html>
`;

async function createWindow() {
	console.log("A")
	session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
		const sources = await desktopCapturer.getSources({
			types: ["screen"]
		}, { useSystemPicker: false });

		callback({
			video: sources[0],
			audio: "loopback"
		});
	});
	console.log("B")

	const win = new BrowserWindow({
		show: false
	});

	await win.loadURL(
		"data:text/html;charset=utf-8," +
		encodeURIComponent(HTML)
	);
}

await app.whenReady();
await createWindow();
console.log(PUBLIC_URL);
