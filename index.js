import process from "node:process";
import serveIndex from 'serve-index';
import express from 'express';
import path from 'node:path';

const { PASSWORD, TUNNEL_URL, PORT } = process.env;
const __dirname = import.meta.dirname;
const app = express();
const osRoot = path.parse(__dirname).root;

app.use('/', async (req, res, next) => {
  try {
    express.static(osRoot)(req, res, next);
  } catch (err) {
    next();
  }
});

app.use('/', serveIndex(osRoot, { icons: true }));

app.listen(PORT, () => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  console.log(`https://${TUNNEL_URL}/${path.relative(osRoot, publicIndex)}`);
});
