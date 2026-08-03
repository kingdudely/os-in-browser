// Use IPC instead, make whep endpoint with cloudflared, getMouseBitmap for quicker mouse movement, clipboardapi, webhid, onpointerrawupdate, getCoascledEvents, cam, mic
// update g_screenWidth and g_screenHeight when screen changes, maybe support screen mirroring so the virtual screen looks like the real one.

console.log("Node.js loaded!")
import { app, BrowserWindow, desktopCapturer, session } from 'electron';
import { fileURLToPath } from 'node:url';

app.whenReady().then(() => {
	console.log("App loaded!")
	session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
		const sources = await desktopCapturer.getSources({
			types: ['screen']
		});

		callback({
			video: sources[0],
			audio: 'loopback'
		});
	}, { useSystemPicker: false });

	const win = new BrowserWindow({
		show: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			sandbox: false
		}
	});

	win.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
		console.log(`[renderer:${level}] ${message} (${sourceId}:${lineNumber})`);
	});
	win.loadFile(fileURLToPath(import.meta.resolve("./index.html")));
});

app.on('window-all-closed', () => app.quit());