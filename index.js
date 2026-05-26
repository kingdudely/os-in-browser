import { env } from "node:process"
import serveIndex from "serve-index";
import express from "express";
import { normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from 'node:fs/promises';

const { PASSWORD, TUNNEL_URL, PORT } = process.env;
const getRelativePath = (filePath) => normalize(fileURLToPath(import.meta.resolve(filePath)));
const isDirectory = async (filePath) => (await stat(filePath)).isDirectory();

const app = express();

import { execSync } from 'node:child_process';
import serveIndex from "serve-index";
import express from "express";
import { normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from 'node:fs/promises';

const { TUNNEL_URL, PORT } = process.env;
const getRelativePath = (filePath) => normalize(fileURLToPath(import.meta.resolve(filePath)));
const isDirectory = async (filePath) => (await stat(filePath)).isDirectory();

const getDrives = () => {
    if (process.platform !== 'win32') return null;
    return execSync('wmic logicaldisk get name')
        .toString()
        .split('\n')
        .map(s => s.trim())
        .filter(s => /^[A-Z]:$/.test(s));
};

const app = express();

app.use(async (request, response, next) => {
    const requestPath = normalize(decodeURIComponent(request.path.replace(/^\//, ''))) || "/";
	const drives = getDrives();

    try {
        if (requestPath === "/" && drives) {
            return response.send(drives.map(d => `<a href="/${encodeURIComponent(d + '\\')}"> ${d}\\</a>`).join('<br>'));
        };

		const root = (await isDirectory(requestPath)) ? requestPath : dirname(requestPath);
		request.url = '/';
		express.static(root)(request, response, () => serveIndex(root, { icons: true })(request, response, next));
    } catch (error) {
        console.warn(error)
        return next();
    }
});

app.listen(PORT, () => {
    console.log(`https://${TUNNEL_URL}/${encodeURIComponent(getRelativePath("./public/index.html"))}`);
});

app.listen(PORT, () => {
	console.log(`https://${TUNNEL_URL}/${encodeURIComponent(getRelativePath("./public/index.html"))}`);
});
