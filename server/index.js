import { env } from "node:process";
import { fileURLToPath } from "node:url";
import express from "express";
import { app, BrowserWindow, desktopCapturer, session } from "electron";
import { ExpressPeerServer } from "peer";

const { PORT, TUNNEL_URL, PASSWORD = "" } = env;
const peerServerPublicPath = "/peer-server";
const peerClientLibraryPath = fileURLToPath(import.meta.resolve("peerjs/dist/peerjs.min.js"));

const web = express();

const hostHtml = `<!DOCTYPE html>
<html>
<body>
<script src="/peerjs.min.js"></script>
<script>
(async () => {
  const peer = new Peer("${PASSWORD}", {
    host: "localhost",
    port: ${PORT},
    path: "${peerServerPublicPath}",
    secure: false
  });
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
</html>`;

web.get("/peerjs.min.js", (req, res) => {
  res.sendFile(peerClientLibraryPath);
});

web.get("/log", (req, res) => {
  console.log("[renderer]", req.query.log);
  res.sendStatus(204);
});

web.get("/host", (req, res) => {
  res.send(hostHtml);
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
    const password = prompt("Password? (leave blank if you did not set one)");
    const video = document.getElementById("video");
    const peer = new Peer(undefined, {
      host: location.hostname,
      port: location.port,
      path: "${peerServerPublicPath}",
      secure: window.isSecureContext
    });
    peer.on("open", () => {
      const call = peer.call(password, null);
      call.on("stream", (stream) => {
        video.srcObject = stream;
      });
    });
  </script>
</body>
</html>`);
});

const server = web.listen(PORT);
const peerServer = ExpressPeerServer(server, { path: "/" });
web.use(peerServerPublicPath, peerServer);

async function createHostWindow() {
  const win = new BrowserWindow({ show: false });

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      callback({ video: sources[0], audio: "loopback" });
    });
  }, { useSystemPicker: false });

  await win.loadURL(`http://localhost:${PORT}/host`);
}

await app.whenReady();
await createHostWindow();
console.log(`VNC running: https://${TUNNEL_URL}`);
