import express from 'express';
import basicAuth from 'express-basic-auth';
import { env } from 'node:process';
import { startTunnel } from "untun";
import { createAnswer } from "./whip.js";

const { USERNAME = "", PASSWORD = "" } = env;

const app = express();
const server = app.listen(0);

app.use(
	basicAuth({
		users: { [USERNAME]: PASSWORD },
		challenge: true,
	}),
	express.static("public")
);

app.post('/whip', express.text({ type: 'application/sdp' }), async (req, res) => {
	const offer = req.body;

	res.status(201)
		.set('Content-Type', 'application/sdp')
		.send(await createAnswer(offer)); 
})

const tunnel = await startTunnel({
	port: server.address().port,
	acceptCloudflareNotice: true
});
console.log(tunnel.getURL());