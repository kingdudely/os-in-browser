import process from "node:process";
import express from "express";
import { fileURLToPath } from 'node:url';
import { ExpressPeerServer } from "peer";
import { ... } from "@nut-tree-fork/nut-js";
import { ... } from "electron";

const { PORT, TUNNEL_URL, PASSWORD } = process.env;
const app = express();

const peerjsPath = fileURLToPath(import.meta.resolve('peerjs/dist/peerjs.min.js'));
app.get('/peerjs.min.js', (req, res) => res.sendFile(peerjsPath));

app.listen(PORT, () => {
	console.log(`https://${TUNNEL_URL}`);
});
