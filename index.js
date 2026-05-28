import express from "express";
import { ExpressPeerServer } from "peer";
import { launch } from "chrome-launcher";
const { fileURLToPath } from "node:url";
import { env } from "node:process";
const { PORT, PUBLIC_URL, PASSWORD = "", USERNAME = "" } = env;
const relativeURLToAbsolute = (url) => fileURLToPath(import.meta.resolve(url));

const app = express();
const server = app.listen(PORT);
app.use(express.static(relativeURLToAbsolute("./public")));
app.use("/peerjs", ExpressPeerServer(server, { path: "/" }));

console.log("[chrome-launcher] Starting Chrome...");

const chrome = await launch({
	startingUrl: `http://localhost:${PORT}/host`,
	chromeFlags: [
		"--headless=new",
		"--no-sandbox",
		"--disable-setuid-sandbox",
		"--allow-http-screen-capture",
		"--auto-select-desktop-capture-source=Entire screen",
		"--use-fake-ui-for-media-stream",
		"--disable-features=IsolateOrigins,site-per-process"
	]
});

console.log(`[chrome-launcher] Host ready on port ${chrome.port}`);
console.log(PUBLIC_URL);
