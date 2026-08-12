console.log("app/index.js loaded!");
// Import the WebSocket Server from the 'ws' library
const { GITHUB_TOKEN, GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY, RUNNER_OS } = require("process").env;
console.log("GITHUb_SHA present:", GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY, RUNNER_OS);

const { WebSocketServer } = require('ws');
const { startTunnel } = require("untun");
import createServerPeer from "./createServerPeer.js";

const port = 8080;
const wss = new WebSocketServer({ port });
const stream = await navigator.mediaDevices.getDisplayMedia();
const tracks = stream.getTracks();
const etagCache = new Map(); // path -> { etag, data }

wss.on('connection', async (ws) => {
	const accessToken = await new Promise((resolve) => ws.once('message', resolve));
    const gh = ghFactory.bind(accessToken);
    try {
        await gh("GET", "/user");
    } catch {
        ws.close();
        return;
    }

	const peer = createServerPeer(ws);
    tracks.forEach((track) => peer.addTrack(track, stream));
});

const tunnel = await startTunnel({ port, acceptCloudflareNotice: true });
const tunnelUrl = await tunnel.getURL();
const gh = ghFactory.bind(GITHUB_TOKEN);
await gh("POST", `/repos/${GITHUB_REPOSITORY}/statuses/${GITHUB_SHA}`, {
	"state": "success",
	"target_url": tunnelUrl,
	"context": GITHUB_RUN_ID,
	"description": RUNNER_OS
});

async function ghFactory(method, path, body) {
	const cacheKey = `${this}:${path}`;
	const cached = etagCache.get(cacheKey);
	const headers = {
		"Authorization": `Bearer ${this}`,
		"Accept": "application/vnd.github+json",
		"Content-Type": "application/json",
		// browser sets useragent for us
	};
	if (method === "GET" && cached) headers["If-None-Match"] = cached.etag;

	const response = await fetch(`https://api.github.com${path}`, {
		"method": method,
		"headers": headers,
		"body": body !== undefined ? JSON.stringify(body) : undefined
	});

	if (response.status === 304) return cached.data;

	const json = await response.json();

	if (!response.ok) {
		throw new Error(`Got HTTP status code ${response.status}${json.message ? `, error message: ${json.message}` : ""}`);
	}

	const etag = response.headers.get("ETag");
	if (method === "GET" && etag) etagCache.set(cacheKey, { etag, data: json });

	return json;
}