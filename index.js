// Use IPC instead, make whep endpoint with cloudflared, getMouseBitmap for quicker mouse movement, clipboardapi, webhid, onpointerrawupdate, getCoascledEvents, cam, mic
// update g_screenWidth and g_screenHeight when screen changes, maybe support screen mirroring so the virtual screen looks like the real one.
// Make a Fit to screen button that, well, fits to screen when clicked
// Add a video/audio codec changer
// Add audio support
// Enforce only one connection per session
// Fix MacOS keyboard not repeating when held down, fix Command key not working in MacOS

console.log("Node.js loaded!")
import { app, BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import artifact from '@actions/artifact';

app.whenReady().then(() => {
	console.log("App loaded!")

	const window = new BrowserWindow({
		show: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			sandbox: false
		}
	});

	const { webContents } = window;
	const { session } = webContents;

	session.setDisplayMediaRequestHandler(async (request, callback) => {
		const sources = await desktopCapturer.getSources({
			types: ['screen']
		});

		callback({
			video: sources[0],
			audio: 'loopback'
		});
	}, { useSystemPicker: false });

	webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
		console.log(`[renderer:${level}] ${message} (${sourceId}:${lineNumber})`);
	});

	webContents.on('render-process-gone', (e, details) => {
		console.log('Renderer gone:', details);
	});
	webContents.on('unresponsive', () => console.log('Renderer unresponsive'));
	// win.webContents.openDevTools({ mode: 'detach' });
	window.loadFile(fileURLToPath(import.meta.resolve("./app/index.html")));
});

app.on('window-all-closed', () => app.quit());

// Gotta do this cuz @actions/artifact only supports ESM not CJS, REALLY gotta make IPC one day... .. .. !
ipcMain.on('upload-artifact', (event, hostname) => artifact.uploadArtifact(hostname, [hostname], ".", { skipArchive: true }));