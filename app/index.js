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
	PASSWORD,
	METRICS_HOSTNAME
} = process.env;

const port = 8080;

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
	metrics: METRICS_HOSTNAME
});

while (!await tunnel.isReady())
	await setTimeout(1000);

const { hostname } = await tunnel.getQuickTunnelInfo();

const deployments = await github.paginate(
	github.rest.repos.listDeployments,
	{
		owner,
		repo,
		environment,
		sha: GITHUB_SHA
	}
);

const deployment = deployments[0];

if (!deployment)
	throw new Error("Deployment not found");

await github.rest.repos.createDeploymentStatus({
	owner,
	repo,
	environment,
	deployment_id: deployment.id,
	state: "in_progress",
	description: "Remote desktop ready",
	environment_url: `https://${hostname}`
});