import { fileURLToPath } from "node:url";
import { env } from "node:process";
import express from "express";
import { ExpressPeerServer } from "peer";
import basicAuth from "express-basic-auth";

const relativeToAbsoluteURL = (url) => fileURLToPath(import.meta.resolve(url));
const { PORT = 3000, PUBLIC_URL, USERNAME = "", PASSWORD = "" } = env;

if (!PUBLIC_URL) {
	throw new Error("Expected PUBLIC_URL in env");
}

const app = express();
const server = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(PUBLIC_URL);
});

app.use(express.static(relativeToAbsoluteURL('./public')));

if (USERNAME && PASSWORD) {
    app.use(basicAuth({ users: { [USERNAME]: PASSWORD } }));
}

app.use("/peerjs", ExpressPeerServer(server));

nw.Screen.Init();

let primaryScreenMediaId = null;
const dcm = nw.Screen.DesktopCaptureMonitor;

dcm.on("added", (id, name, order, type) => {
    if (type === "screen") {
        console.log(`[Screen Monitor] Detected screen: ${name} (Order: ${order})`);

        primaryScreenMediaId = dcm.registerStream(id);
    }
});

dcm.on("removed", (id) => {
    console.log(`[Screen Monitor] Screen source removed.`);
});

dcm.start(true, false);

const peer = new Peer("main", {
    host: "localhost",
    port: PORT,
    path: "/peerjs",
    secure: window.isSecureContext 
});

peer.on("open", (id) => {
    console.log(`PeerJS Client ready with ID: ${id}`);
});

peer.on("error", (err) => {
    console.error("PeerJS Client Error:", err);
});

peer.on("call", async (call) => {
    console.log("Receiving call... Fetching screen stream natively.");
    
    try {
        const stream = await getHeadlessDisplayStream();
        call.answer(stream);
        console.log("Call successfully answered with desktop stream.");
    } catch (error) {
        console.error("Failed to answer call due to stream capture error:", error);
    }
});

function getHeadlessDisplayStream() {
    return new Promise((resolve, reject) => {
        if (!primaryScreenMediaId) {
            return reject(new Error("No valid primary screen discovered by DesktopCaptureMonitor yet."));
        }

        const constraints = {
            audio: false, 
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: primaryScreenMediaId
                }
            }
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => resolve(stream))
            .catch((err) => reject(err));
    });
}
