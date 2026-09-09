const {
    app,
    BrowserWindow,
    desktopCapturer
} = require("electron");

/*
const features = [];
switch (process.platform) {
    case "linux": {
        features.push(
            "PulseaudioLoopbackForScreenShare"
        );
        break;
    }

    case "darwin": {
        features.push(
            "MacLoopbackAudioForScreenShare",
            "MacSckSystemAudioLoopbackOverride"
            // "MacCatapSystemAudioLoopbackCapture"
        );
        break;
    }
}

if (features.length > 0) {
    app.commandLine.appendSwitch(
        "enable-features",
        features.join(",")
    );
}
*/

app.whenReady().then(() => {
    const window = new BrowserWindow({
        width: 1280,
        height: 720,

        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const { webContents } = window;
    const { session } = webContents;

    /*
     * Forward renderer console messages to the main process.
     */
    webContents.on("console-message", (event, level, message, line, sourceId) => {
        const levels = [
            "debug",
            "info",
            "warning",
            "error"
        ];

        console.log(
            `[renderer:${levels[level] ?? level}] ${message}` +
            ` (${sourceId}:${line})`
        );
    });

    /*
     * Forward renderer uncaught exceptions.
     */
    webContents.on("render-process-gone", (event, details) => {
        console.error(
            `[renderer] process gone: ${details.reason}` +
            ` (exitCode=${details.exitCode})`
        );
    });

    /* By default, Electron allows all permissions.
    session.setPermissionCheckHandler(
        (webContents, permission) =>
            permission === "clipboard-read" ||
            permission === "clipboard-sanitized-write" ||
            permission === "display-capture"
    );

    session.setPermissionRequestHandler(
        (webContents, permission, callback) =>
            callback(
                permission === "clipboard-read" ||
                permission === "clipboard-sanitized-write" ||
                permission === "display-capture"
            )
    );
    */

    /*
     * navigator.mediaDevices.getDisplayMedia()
     */
    session.setDisplayMediaRequestHandler(async (request, callback) => {
        const [source] = await desktopCapturer.getSources({
            types: ["screen"]
        });

        const options = {
            video: source
        };

        if (request.audioRequested) {
            options.audio = "loopback";
        }

        callback(options);
    });

    /*
     * Load renderer.
     */
    window.loadFile("app/index.html");
});

app.on("window-all-closed", () => app.quit());