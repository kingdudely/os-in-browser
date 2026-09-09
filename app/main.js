const {
    app,
    BrowserWindow,
    desktopCapturer
} = require("electron");
const path = require("node:path");

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
        console.log("[display-media] request received");
        console.log("[display-media] audioRequested:", request.audioRequested);
        console.log("[display-media] videoRequested:", request.videoRequested);

        try {
            const options = {};

            if (request.audioRequested) {
                console.log("[display-media] audio requested");
                console.log("[display-media] using loopback audio");

                options.audio = "loopback";
            } else {
                console.log("[display-media] audio not requested");
            }

            if (request.videoRequested) {
                console.log("[display-media] video requested");
                console.log("[display-media] getting screen sources...");

                const sources = await desktopCapturer.getSources({
                    types: ["screen"]
                });

                console.log(
                    "[display-media] sources:",
                    sources.map(source => ({
                        id: source.id,
                        name: source.name
                    }))
                );

                const [source] = sources;

                if (!source) {
                    console.error("[display-media] no screen source found");
                    callback({});
                    return;
                }

                console.log("[display-media] using screen source");
                options.video = source;
            } else {
                console.log("[display-media] video not requested");
            }

            console.log("[display-media] callback options:", options);

            callback(options);

            console.log("[display-media] callback completed");
        } catch (error) {
            console.error("[display-media] handler failed:", error);
            callback({});
        }
    });

    /*
     * Load renderer.
     */
    // window.loadFile("app/index.html");
    window.loadFile(
        path.join(__dirname, "index.html")
    );
});

app.on("window-all-closed", () => app.quit());