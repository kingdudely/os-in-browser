const {
    app,
    BrowserWindow,
    desktopCapturer
} = require("electron");

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
    session.setDisplayMediaRequestHandler((request, callback) => {
        console.log("[display-media] request received");
        console.log("[display-media] audioRequested:", request.audioRequested);
        console.log("[display-media] videoRequested:", request.videoRequested);

        desktopCapturer.getSources({
            types: ["screen"]
        }).then((sources) => {
            console.log(
                "[display-media] sources:",
                sources.map(({ id, name }) => ({ id, name }))
            );

            const [source] = sources;

            if (!source) {
                console.error("[display-media] No screen source found");
                callback({});
                return;
            }

            console.log("[display-media] using source:", source.name);
            console.log("[display-media] granting loopback audio");

            callback({
                video: source,
                audio: "loopback"
            });

            console.log("[display-media] callback completed");
        }).catch((error) => {
            console.error(
                "[display-media] getSources failed:",
                error
            );

            callback({});
        });
    });

    /*
     * Load renderer.
     */
    window.loadFile("app/index.html");
});

app.on("window-all-closed", () => app.quit());