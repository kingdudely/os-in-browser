const { launch } = require("puppeteer");
const { createServer } = require("node:http");
const { env: { PASSWORD = "", USERNAME = "", PORT, TUNNEL_URL } } = require("node:process");

const server = createServer((req, res) => {
  if (req.url === "/log") {
    console.log("[renderer]", req.url);
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/host") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js"></script>
        <script defer>
          const peer = new Peer("${TUNNEL_URL}");
          peer.on("call", async (call) => {
            // In Puppeteer with flags, this will auto-pick the screen
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            call.answer(stream);
          });
        </script>
      </head>
      <body></body>
      </html>
    `);
    return;
  }
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js"></script>
        <script defer>
          const video = document.getElementById("video");
          const peer = new Peer();
          peer.on("open", () => {
            const call = peer.call("${TUNNEL_URL}", null);
            call.on("stream", (stream) => {
              video.srcObject = stream;
            });
          });
        </script>
      </head>
      <body>
        <video id="video" autoplay playsinline></video>
      </body>
      </html>
    `);
    return;
  }
  res.writeHead(404);
  res.end();
});

async function main() {
  // Start the HTTP server first so the browser can load the page
  server.listen(PORT, async () => {
    console.log("Server running. Client URL:", TUNNEL_URL);

    // Launch a headless browser with special flags to allow automatic screen sharing
    const browser = await launch({
      headless: true, 
      args: [
        "--allow-http-screen-capture",
        "--auto-select-desktop-capture-source=Entire screen",
        "--use-fake-ui-for-media-stream"
      ]
    });

    const page = await browser.newPage();
    
    // Forward browser console logs to your terminal
    page.on("console", msg => console.log("[Browser Log]:", msg.text()));

    // Load the host page
    await page.goto(`http://localhost:${PORT}/host`);
    console.log("Puppeteer is hosting the stream...");
  });
}

main();
