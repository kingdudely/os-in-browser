console.log("app/index.js loaded!");
// Import the WebSocket Server from the 'ws' library
const { GITHUB_TRIGGERING_ACTOR } = require("node:process").env;
const { WebSocketServer } = require('ws');
const Tunnel = require("firetunnel");
const { uploadArtifact } = require('@actions/artifact');
const { writeFile } = require('node:fs/promises');
const { STATUS_CODES } = require('node:http');
const { setTimeout } = require('node:timers/promises');
import ServerPeer from "./ServerPeer.js";
import { Octokit } from "https://esm.sh/@octokit/rest?bundle";

const port = 8080;
const metricsPort = 8081;
const wss = new WebSocketServer({
	port,
	async verifyClient(info, callback) {
		try {
			const accessToken = request.headers['sec-websocket-protocol'];
			const githubUser = new Octokit({
				auth: accessToken,
			});

			const username = (await githubUser.rest.users.getAuthenticated()).data.login;
			if (username === GITHUB_TRIGGERING_ACTOR) {
				callback(true);
			} else {
				callback(false, 401, 'Unauthorized');
			}
		} catch ({ status = 500, message = STATUS_CODES[status] }) {
			callback(false, status, message);
		}
	}
});

wss.on('connection', (ws) => new ServerPeer(ws));

const tunnel = new Tunnel({
	"url": `localhost:${port}`,
	"metrics": `localhost:${metricsPort}`
});

while (!await tunnel.isReady()) await setTimeout(1000);

const { hostname } = await tunnel.getQuickTunnelInfo();
await writeFile(hostname, "");

await uploadArtifact(
	hostname,
	[hostname],
	".",
	{ skipArchive: true }
);