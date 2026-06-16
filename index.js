import express from 'express';
import { fileURLToPath } from 'node:url';
import basicAuth from 'express-basic-auth';
import { env } from 'node:process';
import { startTunnel } from "untun";
import { createAnswer } from "./whip.js";

const relativeToAbsoluteURL = (relativeUrl) => fileURLToPath(import.meta.resolve(relativeUrl));
const { USERNAME = "", PASSWORD = "" } = env;
const PORT = 8080;

const app = express();
const server = app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

app.use(
	basicAuth({
		users: { [USERNAME]: PASSWORD },
		challenge: true,
	}),
	express.static(relativeToAbsoluteURL('./public'))
);

app.post('/whip', express.text({ type: 'application/sdp' }), async (req, res) => {
	res.status(201)
		.set('Content-Type', 'application/sdp')
		.send(await createAnswer(req.body)); 
})

const tunnel = await startTunnel({ port: PORT });
console.log(tunnel.getURL());