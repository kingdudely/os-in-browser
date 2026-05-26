import { env } from "node:process";
import { execSync } from 'node:child_process';
import serveIndex from "serve-index";
import express from "express";
import { normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from 'node:fs/promises';

const { PASSWORD, TUNNEL_URL, PORT } = process.env;
const getRelativePath = (filePath) => normalize(fileURLToPath(import.meta.resolve(filePath)));
const isDirectory = async (filePath) => (await stat(filePath)).isDirectory();

function getDrives() {
	if (process.platform !== 'win32') return null;
	return execSync('wmic logicaldisk get name')
		.toString()
		.split('\n')
		.map(s => s.trim())
		.filter(s => /^[A-Z]:$/.test(s));
};

const app = express();

app.get("/", (req, res, next) => {
	const drives = getDrives();

	if (Array.isArray(drives)) {
		res.send(
			drives
				.map((d) => `<a href="/${encodeURIComponent(d + "\\")}">${d}\\</a>`)
				.join("<br>")
		);
	} else {
		return next()
	}
});

app.use(async (request, response, next) => {
	try {
		const requestPath = normalize(decodeURIComponent(request.path.slice(1))) || "/";
		const root = await isDir(requestPath) ? requestPath : dirname(requestPath);
		
		express.static(root)(request, response, () => serveIndex(root, { icons: true })(request, response, next));
	} catch (error) {
		console.warn(error)
		next();
	}
});

app.listen(PORT, () => {
	console.log(`https://${TUNNEL_URL}/${encodeURIComponent(getRelativePath("./public/index.html"))}`);
});
