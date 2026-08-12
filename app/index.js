console.log("app/index.js loaded!");
// Import the WebSocket Server from the 'ws' library
const { GITHUB_TOKEN, GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY } = require("process").env;
const { WebSocketServer } = require('ws');
const { startTunnel } = require("untun");
import createServerPeer from "./createServerPeer.js";

const port = 8080;
const wss = new WebSocketServer({ port });
const stream = await navigator.mediaDevices.getDisplayMedia();
const tracks = stream.getTracks();

wss.on('connection', async (ws) => {
	const accessToken = await new Promise((resolve) => ws.once('message', resolve));
    const gh = ghFactory.bind(accessToken);
    try {
        await gh("GET", "/user");
    } catch {
        ws.close();
        return;
    }

	const peer = createServerPeer();
    tracks.forEach((track) => peer.addTrack(track, stream));

    function send(type, message) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type, message }));
        }
    }

    peer.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
            send("ice-candidate", event.candidate);
        }
    });

    peer.addEventListener("negotiationneeded", async () => {
        try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            send("offer", peer.localDescription);
        } catch (err) {
            console.error("Failed to create/send offer:", err);
        }
    });

    ws.on("message", async (raw) => {
        let data;
        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        switch (data.type) {
            case "answer":
                try {
                    await peer.setRemoteDescription(data.message);
                } catch (err) {
                    console.error("Failed to set remote description:", err);
                }
                break;
            case "ice-candidate":
                try {
                    await peer.addIceCandidate(data.message);
                } catch (err) {
                    console.error("Failed to add ICE candidate:", err);
                }
                break;
        }
    });

    ws.once("close", () => peer.close());
});

const tunnel = await startTunnel({ port, acceptCloudflareNotice: true });
const tunnelUrl = await tunnel.getURL();
const gh = ghFactory.bind(GITHUB_TOKEN);
await gh("POST", `/repos/${GITHUB_REPOSITORY}/statuses/${GITHUB_SHA}`, {
	"state": "success",
	"target_url": tunnelUrl,
	"context": GITHUB_RUN_ID
});

async function ghFactory(method, path, body) {
	const response = await fetch(`https://api.github.com${path}`, {
		"method": method,
		"headers": {
			"Authorization": `Bearer ${this}`,
			"Accept": "application/vnd.github+json",
			"Content-Type": "application/json",
			// browser sets useragent for us
		},
		"body": JSON.stringify(body)
	});

	const json = await response.json();

	if (!response.ok) {
		throw new Error(`Got HTTP status code ${response.status}${json.message ? `, error message: ${json.message}` : ""}`);
	}

	return json;
}