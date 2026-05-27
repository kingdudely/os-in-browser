import { app, BrowserWindow } from "electron";

console.log("A: script started");

app.on("ready", () => {
  console.log("B: app is ready");

  const win = new BrowserWindow({
    width: 800,
    height: 600,
  });

  win.loadURL("data:text/html,<h1>Electron is working</h1>");

  console.log("C: window created");
});

app.on("window-all-closed", () => {
  console.log("D: all windows closed");
});
