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
		'--start-maximized',
		`--unsafely-treat-insecure-origin-as-secure=http://localhost:${PORT}`
	]
});

const page = await browser.newPage();

page.on('console', msg => {
    console.log(`[Browser Console] ${msg.text()}`);
});

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

await page.goto(`http://localhost:${PORT}/host`);

console.log(`${PUBLIC_URL}/view`);
