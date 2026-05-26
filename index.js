import { env } from "node:process"
import serveIndex from "serve-index";
import express from "express";
import { normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from 'node:fs/promises';

const { PASSWORD, TUNNEL_URL, PORT } = process.env;
const getRelativePath = (filePath) => normalize(fileURLToPath(import.meta.resolve(filePath)));
const isDirectory = async (filePath) => (await stat(filePath)).isDirectory();

const app = express();

app.use((request, response, next) => {
    const requestPath = normalize(decodeURIComponent(request.path.replace(/^\//, '')));
    express.static(requestPath)(request, response, next);
});

app.listen(PORT, () => {
	console.log(`https://${TUNNEL_URL}/${encodeURIComponent(getRelativePath("./public/index.html"))}`);
});
