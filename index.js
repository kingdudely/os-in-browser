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

app.use(async (request, response, next) => {
	const requestPath = normalize(decodeURIComponent(request.path.replace(/^\//, '')));
	console.log(requestPath)
	console.log(decodeURIComponent(request.path))
	
	try {
		if (await isDirectory(requestPath)) {
			console.log("directory")
			return serveIndex(requestPath, { icons: true })(request, response, next);
		} else {
			console.log("file")
			return response.sendFile(requestPath, next);
		}
	} catch (error) {
		console.warn(error);
		return next();
	}
});

app.listen(PORT, () => {
	console.log(`https://${TUNNEL_URL}/${encodeURIComponent(getRelativePath("./public/index.html"))}`);
});
