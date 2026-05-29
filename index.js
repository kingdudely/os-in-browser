import express from 'express';
import { ExpressPeerServer } from 'peer';
import puppeteer from 'puppeteer-core';
import { mouse, keyboard, screen, Button, Key, Point } from '@nut-tree-fork/nut-js';
import { fileURLToPath } from 'node:url';
import basicAuth from 'express-basic-auth';
import { env } from 'node:process';

const relativeToAbsoluteURL = (relativeUrl) => fileURLToPath(import.meta.resolve(relativeUrl));

const { PORT, USERNAME = "", PASSWORD = "", PUBLIC_URL, CHROME_PATH } = env;

if (!PORT || !PUBLIC_URL || !CHROME_PATH) {
	throw new Error("Make sure to include PORT, PUBLIC_URL, and CHROME_PATH in process.env!");
}

const app = express();
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Using structural import reference alias to protect static route registration
app.use(express.static(relativeToAbsoluteURL('./public')));

if (USERNAME && PASSWORD) {
    app.use(basicAuth({ users: { [USERNAME]: PASSWORD } }));
} else {
	console.warn("Make sure to include both username and password!");
}

app.use("/peerjs", ExpressPeerServer(server));

const browser = await puppeteer.launch({
	executablePath: CHROME_PATH,
	headless: 'shell', // Keeps window compositor active in Windows Session layer without visual popups
	args: [
		'--no-sandbox',
		'--disable-gpu',
		'--allow-http-screen-capture',
		'--use-fake-ui-for-media-stream',
		'--auto-select-desktop-capture-source=Entire screen',
		'--start-maximized'
	]
});

const page = await browser.newPage();

page.on('console', async (msg) => {
    const args = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => '[Unserializable]')));
    console.log(`[Browser Console]`, ...args);
});

// FIX #3: Receives percentages from client and translates them to host monitor pixels
await page.exposeFunction('mousemove', async (xPercent, yPercent) => {
	try {
		const screenWidth = await screen.width();
		const screenHeight = await screen.height();

		const targetX = Math.round(xPercent * screenWidth);
		const targetY = Math.round(yPercent * screenHeight);

		await mouse.setPosition(new Point(targetX, targetY));
	} catch (err) {
		console.error("Mouse movement execution error:", err);
	}
});

await page.exposeFunction('mousedown', async (buttonInt) => {
  const button = buttonInt === 2 ? Button.RIGHT : Button.LEFT;
  await mouse.pressButton(button);
});

await page.exposeFunction('mouseup', async (buttonInt) => {
  const button = buttonInt === 2 ? Button.RIGHT : Button.LEFT;
  await mouse.releaseButton(button);
});

await page.exposeFunction('keydown', async (keyStr) => {
  try {
    const upperKey = keyStr.toUpperCase();
    if (Key[upperKey]) {
      await keyboard.pressKey(Key[upperKey]);
    }
  } catch {}
});

await page.exposeFunction('keyup', async (keyStr) => {
  try {
    const upperKey = keyStr.toUpperCase();
    if (Key[upperKey]) {
      await keyboard.releaseKey(Key[upperKey]);
    }
  } catch {}
});

await page.addScriptTag({ url: `http://localhost:${PORT}/peerjs.min.js` });

await page.evaluate((PORT) => {
	const peer = new Peer("host", {
		host: "localhost",
		port: PORT,
		path: "/peerjs",
		secure: window.isSecureContext
	});

	console.log("A");

	peer.on('call', async (call) => {
		console.log("B");
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
			console.log("C");
			call.answer(stream);
			console.log("D");	
		} catch (err) {
			console.error("WebRTC stream generation exception raised:", err);
		}
	});

	console.log("E");

	peer.on('connection', (conn) => {
		console.log("F");
		conn.on('data', (data) => {
			// console.log("G");
			window[data.type]?.(...data.args);
			// console.log("H");
		});
		console.log("I");
	});

	console.log("J");
}, PORT);

console.log(PUBLIC_URL);
