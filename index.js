import express from 'express';
import { ExpressPeerServer } from 'peer';
import puppeteer from 'puppeteer-core';
import { mouse, keyboard, screen, Button, Key, Point } from '@nut-tree-fork/nut-js';
import { fileURLToPath } from 'node:url';
import basicAuth from 'express-basic-auth';
import { env } from 'node:process';
import nutKeyMap from './nutKeyMap.json' with { type: 'json' };
import nutButtonMap from "./nutButtonMap.json" with { type: 'json' };

const relativeToAbsoluteURL = (relativeUrl) => fileURLToPath(import.meta.resolve(relativeUrl));

const { PORT, USERNAME = "", PASSWORD = "", PUBLIC_URL, CHROME_PATH } = env;

if (!PORT || !PUBLIC_URL || !CHROME_PATH) {
	throw new Error("Make sure to include PORT, PUBLIC_URL, and CHROME_PATH in process.env!");
}

const app = express();
const server = app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

app.use(express.static(relativeToAbsoluteURL('./public')));

if (USERNAME && PASSWORD) {
	app.use(basicAuth({ users: { [USERNAME]: PASSWORD } }));
} else {
	console.warn("Make sure to include both username and password!");
}

app.use("/peerjs", ExpressPeerServer(server, {
	path: "/",
	proxied: true 
}));

const browser = await puppeteer.launch({
	executablePath: CHROME_PATH,
	headless: 'shell',
	args: [
		'--no-sandbox',
		'--disable-gpu',
		'--allow-http-screen-capture',
		'--use-fake-ui-for-media-stream',
		'--auto-select-desktop-capture-source=Entire screen',
		'--start-maximized',
		`--unsafely-treat-insecure-origin-as-secure=http://localhost:${PORT}`
	]
});

const page = await browser.newPage();

page.on('console', (msg) => {
	console.log(`[Browser Console] ${msg.text()}`);
});

// --- UPDATED: Exposing Functions Matching Client Pointer Events ---

await page.exposeFunction('pointermove', async (xPercent, yPercent) => {
	try {
		const screenWidth = await screen.width();
		const screenHeight = await screen.height();

		const targetX = Math.round(xPercent * screenWidth);
		const targetY = Math.round(yPercent * screenHeight);

		await mouse.setPosition(new Point(targetX, targetY));
	} catch (err) {
		console.error("Pointer movement execution error:", err);
	}
});

await page.exposeFunction('pointerdown', async (buttonInt) => {
	try {
		const nutButton = Button[nutButtonMap[buttonInt]];
		if (nutButton != null) {
			await mouse.pressButton(nutButton);
		}
	} catch (err) {
		console.error("Pointerdown action failed:", err);
	}
});

await page.exposeFunction('pointerup', async (buttonInt) => {
	try {
		const nutButton = Button[nutButtonMap[buttonInt]];
		if (nutButton != null) {
			await mouse.releaseButton(nutButton);
		}
	} catch (err) {
		console.error("Pointerup action failed:", err);
	}
});

// Hardware keyboard and mobile inputs remain unchanged
await page.exposeFunction('keydown', async (payload) => {
	try {
		const { code, key } = payload;
		const nutKey = Key[nutKeyMap[code]];

		if (code && nutKey != null) {
			await keyboard.pressKey(nutKey);
		} else if (key && Array.from(key).length === 1) {
			await keyboard.type(key);
		}
	} catch (err) {
		console.error("Hardware Mapping Keydown Exception:", err);
	}
});

await page.exposeFunction('keyup', async (payload) => {
	try {
		const { code } = payload;
		const nutKey = Key[nutKeyMap[code]];

		if (code && nutKey != null) {
			await keyboard.releaseKey(nutKey);
		}
	} catch (err) {
		console.error("Hardware Mapping Keyup Exception:", err);
	}
});

await page.exposeFunction('input', async (textStr) => {
	try {
		await keyboard.type(textStr);
	} catch (err) {
		console.error("Mobile IME text entry failed:", err);
	}
});

await page.exposeFunction('resize', async (width, height) => {
	try {
		const targetWidth = Math.round(width);
		const targetHeight = Math.round(height);
		
		console.log(`[OS Resolution Sync - NOT SUPPORTED YET] Shifting Host OS Monitor to: ${targetWidth}x${targetHeight}`);
		
	} catch (err) {
		console.error("Host screenres update execution failed:", err);
	}
});

await page.goto(`http://localhost:${PORT}/host`);

console.log(`Viewer endpoint fully live at: ${PUBLIC_URL}/view`);
