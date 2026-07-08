import { app, BrowserWindow, desktopCapturer, session } from 'electron';
import { fileURLToPath } from 'node:url';
console.log("A")
await app.whenReady();
console.log("B")
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
    // width: 1280,
    // height: 800,
    // autoHideMenuBar: true,
    show: false,
    webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
    }
});

win.loadFile(fileURLToPath(import.meta.resolve("./app/index.html")));

app.on('window-all-closed', () => app.quit());