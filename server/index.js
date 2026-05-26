import { platform, env } from "node:process";
import express from "express";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import drivelist from "drivelist";

const { PORT, PASSWORD, TUNNEL_URL } = env;

const app = express();
const getRelativePath = (filePath) => fileURLToPath(import.meta.resolve(filePath));

async function getDrives() {
  if (platform !== "win32") return ["/"];

  const drives = await drivelist.list();

  return drives
    .flatMap(d => d.mountpoints?.map(m => m.path) ?? [])
    .filter(Boolean);
}

function htmlPage(title, body) {
  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        body { font-family: sans-serif; padding: 20px; }
        a { display: block; padding: 4px 0; text-decoration: none; }
      </style>
    </head>
    <body>
      <h2>${title}</h2>
      ${body}
    </body>
  </html>
  `;
}

app.get("/", async (req, res) => {
  const drives = await getDrives();

  const links = drives
    .map(d => {
      const safe = encodeURIComponent(d);
      return `<a href="${safe}">📀 ${d}</a>`;
    })
    .join("");

  res.send(htmlPage("Drives", links));
});

app.get("/*", async (req, res, next) => {
  try {
    const rawPath = decodeURIComponent(req.path);
	  console.log(rawPath)

    // Windows fix: remove leading "/" for "C:\"
    let targetPath = rawPath;

    if (process.platform === "win32" && targetPath.startsWith("/")) {
      targetPath = targetPath.slice(1);
    }

    const absPath = path.resolve(targetPath);

    const stat = await fs.stat(absPath);

    // ---------- DIRECTORY ----------
    if (stat.isDirectory()) {
      const items = await fs.readdir(absPath, { withFileTypes: true });

      const parent = path.dirname(absPath);

      const list = [];

      // parent link
      list.push(`<a href="${pathToUrl(parent)}">.. (parent)</a>`);

      for (const item of items) {
        const full = path.join(absPath, item.name);

        list.push(
          item.isDirectory()
            ? `<a href="${pathToUrl(full)}">📁 ${item.name}</a>`
            : `<a href="${pathToUrl(full)}">📄 ${item.name}</a>`
        );
      }

      return res.send(htmlPage(absPath, list.join("")));
    }
    res.sendFile(absPath, next);
  } catch (err) {
	  console.warn(err);
    next();
  }
});

// ---------- convert filesystem path → URL path ----------
function pathToUrl(p) {
  let urlPath = path.resolve(p);

  if (process.platform === "win32") {
    urlPath = "/" + urlPath.replace(/\\/g, "/");
  }

  return encodeURI(urlPath);
}

// ---------- START ----------
app.listen(PORT, () => {
  const relative = getRelativePath("./public/index.html");

  const url = `https://${TUNNEL_URL}/${encodeURIComponent(relative)}`;

  console.log(url);
});
