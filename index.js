import { env } from "node:process"
import serveIndex from "serve-index";
import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from 'node:fs/promises';

const { PASSWORD, TUNNEL_URL, PORT } = process.env;
const getRelativePath = (filePath) => fileURLToPath(import.meta.resolve(filePath));
const isDirectory = async (filePath) => (await stat(filePath)).isDirectory();

const app = express();

app.use(async (request, response, next) => {
	const requestPath = resolve(decodeURIComponent(request.path));
	console.log(requestPath)
	
	try {
		if (await isDirectory(requestPath)) {
			return serveIndex(requestPath, { icons: true })(request, response, next);
		} else {
			return response.sendFile(requestPath, { root: "/" }, next);
		}
	} catch (error) {
		console.warn(error);
		return next();
	}
});

app.listen(PORT, () => {
	console.log(`https://${TUNNEL_URL}/${encodeURIComponent(getRelativePath("./public/index.html"))}`);
});
