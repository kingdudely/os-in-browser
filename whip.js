import puppeteer from "puppeteer-core";
import express from "express";
import { mouse, keyboard, Point } from '@nut-tree-fork/nut-js';

const app = express()
app.use(express.static("peer"));
const server = app.listen(0);

const peerUrl = `http://localhost:${server.address().port}`;

const browser = await puppeteer.launch({
	channel: "chrome",
	headless: true,
	args: [
		'--no-sandbox',
		'--disable-gpu',
		'--allow-http-screen-capture',
		'--use-fake-ui-for-media-stream',
		'--auto-select-desktop-capture-source=Entire screen',
		'--start-maximized',
		`--unsafely-treat-insecure-origin-as-secure=${peerUrl}`
	]
});


const page = await browser.newPage();
await page.goto(peerUrl);
await page.exposeFunction("pressKeyboardKey", keyboard.pressKey.bind(keyboard));
await page.exposeFunction("releaseKeyboardKey", keyboard.releaseKey.bind(keyboard));
await page.exposeFunction("pressMouseButton", mouse.pressButton.bind(mouse));
await page.exposeFunction("releaseMouseButton", mouse.releaseButton.bind(mouse));

const setMousePosition = async (x, y) => await mouse.setPosition(new Point(x, y));
await page.exposeFunction("setMousePosition", setMousePosition);
await page.exposeFunction("moveMouseDelta", async (deltaX, deltaY) => {
	const currentPos = await mouse.getPosition();

	const x = currentPos.x + deltaX;
	const y = currentPos.y + deltaY;

	await setMousePosition(x, y);
})


export async function createAnswer(offer) {
	return await page.evaluate((offer) => window.createAnswer(offer), offer);
}