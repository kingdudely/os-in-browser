import process from "node:process";
import serveIndex from 'serve-index';
import express from 'express'

const { PASSWORD, TUNNEL_URL, PORT } = process.env;

const __dirname = import.meta.dirname

const app = express()

const osRoot = path.parse(__dirname).root;

app.use('/', express.static(osRoot), serveIndex(osRoot, { icons: true }));

app.listen(PORT, () => {
  console.log(`https://${TUNNEL_URL}`)
});
