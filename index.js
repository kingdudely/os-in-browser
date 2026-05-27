const express = require("express");
const { ExpressPeerServer } = require("peer");
const puppeteer = require("puppeteer-core");
const chromeLauncher = require("chrome-launcher");
const path = require("path");

const {
  env: {
    PORT,
    TUNNEL_URL,
    PASSWORD = "",
    USERNAME = ""
  }
} = require("node:process");

const app = express();
const server = app.listen(PORT);

app.use(express.static(path.join(__dirname, "public")));

const peerServer = ExpressPeerServer(server, {
	path: "/"
});

app.use("/peerjs", peerServer);

async function launchHost() {
  const executablePath = chromeLauncher.Launcher.getFirstInstallation();
  console.log("[chrome]", executablePath);

  const browser = await puppeteer.launch({
    executablePath,

    headless: true,

    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",

      // "--enable-usermedia-screen-capturing",

      "--allow-http-screen-capture",

      "--auto-select-desktop-capture-source=Entire screen",

      "--use-fake-ui-for-media-stream",

      "--disable-features=IsolateOrigins,site-per-process"
    ]
  });

  const page = await browser.newPage();

  page.on("console", msg => {
    console.log("[browser]", msg.text());
  });

  await page.goto(`http://localhost:${PORT}/host`);

  console.log("[puppeteer] host ready");
}

launchHost()
  .then(() => console.log(TUNNEL_URL))
  .catch(console.error);
