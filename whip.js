import { app, BrowserWindow, desktopCapturer, session } from "electron";
import hostSource from "./host.js" with { type: "text" };

session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
	const sources = await desktopCapturer.getSources({ types: ['screen'] });
	if (sources.length > 0) {
		// Automatically select the first available screen
		callback({ video: sources[0], audio: 'loopback' });
	} else {
		console.error('No screens found');
	}
});

await app.whenReady();
export function createAnswer(offer) {
	const window = new BrowserWindow({
		show: false,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true
		}
	});
	window.loadURL('about:blank'); 
	return window.webContents.executeJavaScript(hostSource);
}