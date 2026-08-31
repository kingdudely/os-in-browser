// NWESM doesn't work .. :(, Do I use Electron?
const { Octokit } = require("@octokit/action");
const { WebSocketServer } = require("ws");
const { setTimeout } = require("node:timers/promises");
const { STATUS_CODES } = require("node:http");
const { serve, upgradeWebSocket } = require("@hono/node-server");
const { serveStatic } = require("@hono/node-server/serve-static");
const { basicAuth } = require("hono/basic-auth");
const { Hono } = require("hono");
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

const app = new Hono();

app.use(
	"*",
	basicAuth({
		verifyUser: (username, password) =>
			username === USERNAME &&
			password === PASSWORD
	})
);

app.use("*", serveStatic({ root: "./public" }));

const wss = new WebSocketServer({
	noServer: true
});

app.get(
	"/",
	upgradeWebSocket(() => ({
		onOpen(_event, ws) {
			new ServerPeer(ws);
		}
	}))
);

serve({
	fetch: app.fetch,
	port,
	websocket: {
		server: wss
	}
});

await Tunnel.installCloudflared();

const tunnel = new Tunnel({
	url: `localhost:${port}`,
	metrics: `localhost:${metricsPort}`
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

console.log(`https://${hostname}`)