import process from "node:process";
import serveIndex from 'serve-index';
import express from 'express';
import path from 'node:path';

const { PASSWORD, TUNNEL_URL, PORT } = process.env;
const __dirname = import.meta.dirname;
const app = express();
const osRoot = path.parse(__dirname).root;

console.log(osRoot)

// Error: EINVAL: invalid argument, stat 'D:\DumpStack.log.tmp'
const staticMiddleman = express.static(osRoot);
const serveIndexMiddleman = serveIndex(osRoot, { icons: true });
app.use(
	'/',
	(req, res, next) => staticMiddleman(req, res, () => next()),
	(req, res, next) => serveIndexMiddleman(req, res, () => next())
);

app.listen(PORT, () => {
	const publicIndex = path.join(__dirname, 'public', 'index.html');
	console.log(`https://${TUNNEL_URL}/${path.relative(osRoot, publicIndex)}`);
});
