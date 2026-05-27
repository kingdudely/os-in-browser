import { env } from "node:process";
import { fileURLToPath } from "node:url";
import express from "express";
import basicAuth from "express-basic-auth";
import { app, BrowserWindow, desktopCapturer, session } from "electron";
import { ExpressPeerServer } from "peer";

const { PORT, TUNNEL_URL, PASSWORD = "", USERNAME = "" } = env;
const peerServerPublicPath = "/peer-server";
const peerClientLibraryPath = fileURLToPath(import.meta.resolve("peerjs/dist/peerjs.min.js"));

const web = express();

// ----------------------
// Auth (gates everything)
// ----------------------
web.use(basicAuth({
  users: { [USERNAME]: PASSWORD },
  challenge: true
}));

// ----------------------
// Routes
// ----------------------
web.get("/peerjs.min.js", (req, res) => {
  res.sendFile(peerClientLibraryPath);
});

web.get("/log", (req, res) => {
  console.log("[renderer]", req.query.log);
  res.sendStatus(204);
});

web.get("/host", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<body>
<script src="/peerjs.min.js"></script>
<script>
  fetch("log?log=beginning");

(async () => {
  fetch("log?log=async_beginning");

  const peer = new Peer("${USERNAME}:${PASSWORD}", {
    host: "localhost",
    port: ${PORT},
    path: "${peerServerPublicPath}",
    secure: false
  });
  fetch("log?log=location.hostname: " + location.hostname);
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true
  });
  fetch("log?log=stream");
  peer.on("call", (call) => {
  fetch("log?log=call");
  
    call.answer(stream);
  fetch("log?log=call_stream");
    
  });
  fetch("log?log=on_call");
  
})();
</script>
</body>
</html>`);
});

web.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
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
    const video = document.getElementById("video");
    const peer = new Peer(undefined, {
      host: location.hostname,
      port: location.port,
      path: "${peerServerPublicPath}",
      secure: window.isSecureContext
    });
    peer.on("open", () => {
      const call = peer.call("${USERNAME}:${PASSWORD}", null);
      call.on("stream", (stream) => {
        video.srcObject = stream;
      });
    });
  </script>
</body>
</html>`);
});

// ----------------------
// PeerJS signaling server
// ----------------------
const server = web.listen(PORT);
const peerServer = ExpressPeerServer(server, { path: "/" });
web.use(peerServerPublicPath, peerServer);

// ----------------------
// Host (Electron hidden renderer)
// ----------------------
async function createHostWindow() {
  const win = new BrowserWindow({ show: false });

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      callback({ video: sources[0], audio: "loopback" });
    });
  }, { useSystemPicker: false });

  await win.loadURL(`http://${USERNAME}:${PASSWORD}@localhost:${PORT}/host`);
}
console.log("A")
// ----------------------
// Boot
// ----------------------
await app.whenReady();
console.log("B")
await createHostWindow();
console.log("C")
console.log(`VNC running: https://${TUNNEL_URL}`);
