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

wss.on('connection', async (ws) => {
	new ServerPeer(ws);
});