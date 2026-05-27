import process from "node:process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { app, BrowserWindow, desktopCapturer, session } from "electron";
import { ExpressPeerServer } from "peer";

const { PORT, TUNNEL_URL, PASSWORD = "" } = process.env;
const peerServerPublicPath = "/peer-server";
const peerClientLibraryPath = fileURLToPath(import.meta.resolve("peerjs/dist/peerjs.min.js"));
console.log(peerClientLibraryPath);

const web = express();
const server = http.createServer(web);

// ----------------------
// PeerJS signaling server
// ----------------------
const peerServer = ExpressPeerServer(server, {
  path: "/",
});
web.use(peerServerPublicPath, peerServer);

web.get("/peerjs.min.js", (req, res) => {
	res.sendFile(peerClientLibraryPath);
})

web.get("/log", (req, res) => {
	console.log(req.query.log);
})

// ----------------------
// Viewer (remote client)
// ----------------------
web.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Viewer</title>
  <style>
    body { margin:0; background:black; overflow:hidden; }
    #video { width:100vw; height:100vh; object-fit:contain; }
  </style>
</head>
<body>
  <video id="video" autoplay playsinline></video>

  <script src="/peerjs.min.js"></script>
  <script>
  	const password = prompt("Password? (leave blank if you did not set one)");
  	const video = document.getElementById("video");
    const peer = new Peer(undefined, {
	    host: location.hostname,
	    port: location.port,
	    path: "${peerServerPublicPath}",
	    secure: window.isSecureContext
	  });

    peer.on("open", () => {
      const call = peer.call(password, null); // new MediaStream()

      call.on("stream", (stream) => {
        video.srcObject = stream;
      });
    });
  </script>
</body>
</html>
  `);
});

// ----------------------
// Host (Electron hidden renderer)
// ----------------------
async function createHostWindow() {
  const win = new BrowserWindow({ show: false });

  // Modern Electron screen capture handler (NO desktopCapturer in renderer)
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
	  desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
	    callback({
	      video: sources[0],
	      audio: "loopback"
	    });
	  });
	}, { useSystemPicker: false });

  const html = `
<!DOCTYPE html>
<html>
<body>
<script src="/peerjs.min.js"></script>
<script>
(async () => {
  const peer = new Peer("${PASSWORD}", {
    host: "localhost", // location.hostname
    port: ${PORT},
    path: "${peerServerPublicPath}",
    secure: false
  });

  fetch("log?log=" + location.hostname);

  // Modern API (NO desktopCapturer here)
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true
  });

  fetch("log?log=itworked");

  peer.on("call", (call) => {
  	fetch("log?log=ONCALL");
  
    call.answer(stream);

  	fetch("log?log=ANSWERED");
	
  });
})();
</script>
</body>
</html>
  `;

  await win.loadURL("data:text/html," + encodeURIComponent(html));
}

// ----------------------
// Boot
// ----------------------
await app.whenReady();
await createHostWindow();

server.listen(PORT, () => {
  console.log(`VNC running: https://${TUNNEL_URL}`);
});
