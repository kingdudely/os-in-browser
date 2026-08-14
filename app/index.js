console.log("app/index.js loaded!");
// Import the WebSocket Server from the 'ws' library
const { GITHUB_TOKEN, GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY, RUNNER_OS } = require("process").env;
const { WebSocketServer } = require('ws');
const { startTunnel } = require("untun");
import ServerPeer from "./ServerPeer.js";
import { Octokit } from "https://esm.sh/@octokit/rest?bundle";

const port = 8080;
const [owner, repo] = GITHUB_REPOSITORY.split("/");
const wss = new WebSocketServer({ port });
const etagCache = new Map(); // path -> { etag, data }

wss.on('connection', async (ws) => {
	const accessToken = await new Promise((resolve) => ws.once('message', resolve));
    const githubUser = new Octokit({
		auth: accessToken,
	});

    try {
        await githubUser.rest.users.getAuthenticated();
    } catch {
        ws.close();
        return;
    }

	new ServerPeer(ws);
});

const tunnel = await startTunnel({ port, acceptCloudflareNotice: true });
const tunnelUrl = await tunnel.getURL();

const actionUser = new Octokit({
    auth: GITHUB_TOKEN
});

await actionUser.rest.repos.createCommitStatus({
	owner,
	repo,
	sha: GITHUB_SHA,
	state: "success",
	target_url: tunnelUrl,
	context: GITHUB_RUN_ID,
	description: RUNNER_OS
});