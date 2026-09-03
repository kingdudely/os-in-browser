// NWESM doesn't work .. :(, Do I use Electron?
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
	GITHUB_RUN_ID
} = process.env;

const port = 8080;
const metricsPort = 8081;

const github = new Octokit();

const [owner, repo] = GITHUB_REPOSITORY.split("/");

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

while (!await tunnel.isReady())
	await setTimeout(1000);

const { hostname } = await tunnel.getQuickTunnelInfo();

const [deployment] = await github.paginate(
	github.rest.repos.listDeployments,
	{
		owner,
		repo,
		environment: GITHUB_RUN_ID,
		sha: GITHUB_SHA
	}
);

if (!deployment)
	throw new Error("Deployment not found");

await github.rest.repos.createDeploymentStatus({
	owner,
	repo,
	environment: GITHUB_RUN_ID,
	deployment_id: deployment.id,
	state: "in_progress",
	description: "Remote desktop ready",
	environment_url: `https://${hostname}`
});