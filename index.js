// Use IPC instead, export the port to GITHUB_OUTPUT, getCoalescedEvents, onpointerrawupdate || onpointermove, ("use unjs/listhen" - no, its third party; "use our own custom input library" - only if Nut.JS only supports U.S. keyboard layout)
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

	win.loadFile(fileURLToPath(import.meta.resolve("./index.html")));
});

app.on('window-all-closed', () => app.quit());
