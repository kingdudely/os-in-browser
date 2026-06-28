import express from 'express';
import basicAuth from 'express-basic-auth';
import { env } from 'node:process';
import { spawn } from 'node:child_process';
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

spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);