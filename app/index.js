// NWESM doesn't work .. :(, Do I use Electron?
console.log("A")
const { Octokit } = require("@octokit/action");
const express = require("express");
const expressWs = require("express-ws");
const basicAuth = require("express-basic-auth");
const { setTimeout } = require("node:timers/promises");
const Tunnel = require("firetunnel");

import ServerPeer from "./ServerPeer.js";

const {
	GITHUB_REPOSITORY,
	GITHUB_SHA,
	USERNAME,
	PASSWORD
} = process.env;

const port = 8080;
const metricsPort = 8081;

const github = new Octokit();

const [owner, repo] = GITHUB_REPOSITORY.split("/");
const environment = "Cloudflare tunnel";

const app = express();
expressWs(app);

app.use(
	basicAuth({
		users: {
			[USERNAME]: PASSWORD
		},
		challenge: true
	})
);

app.use(express.static("./public"));

app.ws("/", (ws, req) => new ServerPeer(ws));

app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
});

await Tunnel.installCloudflared();

const tunnel = new Tunnel({
	url: `localhost:${port}`,
	metrics: `localhost:${metricsPort}`
});

const deployment = await github.rest.repos.createDeployment({
	owner,
	repo,
	ref: process.env.GITHUB_SHA,
	environment: "Cloudflare tunnel",
	auto_merge: false,
	required_contexts: []
});

const deploymentId = deployment.data.id;

while (!await tunnel.isReady())
	await setTimeout(1000);

const { hostname } = await tunnel.getQuickTunnelInfo();

await github.rest.repos.createDeploymentStatus({
	owner,
	repo,
	environment,
	deployment_id: deploymentId,
	state: "success", // in_progress
	description: "Remote desktop ready",
	environment_url: `https://${hostname}`
});