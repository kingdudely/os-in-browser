// NWESM doesn't work .. :(, Do I use Electron?
console.log("A")
const { Octokit } = require("@octokit/action");
const express = require("express");
const expressWs = require("express-ws");
const basicAuth = require("express-basic-auth");
const { setTimeout } = require("node:timers/promises");

import ServerPeer from "./ServerPeer.js";

const {
	GITHUB_REPOSITORY,
	GITHUB_SHA,
	USERNAME,
	PASSWORD,
	METRICS_HOSTNAME,
	PORT
} = process.env;

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

app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});