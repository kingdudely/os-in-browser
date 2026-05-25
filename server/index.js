// server/index.js
import { app, BrowserWindow, ipcMain } from 'electron'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mouse, keyboard, Button, straightTo } from '@nut-tree-fork/nut-js'

const server = createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const html = readFileSync(path.resolve('client/index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
    res.end(html)
    return
  }
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return }
  res.writeHead(404); res.end('Not found')
})

const wss = new WebSocketServer({ server })
let viewerSocket = null
let hostSocket = null
let pendingOffer = null

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw)
    if (msg.type === 'viewer') {
      viewerSocket = ws
      if (pendingOffer) { ws.send(pendingOffer); pendingOffer = null }
    }
    if (msg.type === 'host') hostSocket = ws
    if (msg.type === 'offer') {
      if (viewerSocket) viewerSocket.send(raw)
      else pendingOffer = raw
    }
    if (msg.type === 'answer') hostSocket?.send(raw)
    if (msg.type === 'candidate') {
      if (ws === hostSocket) viewerSocket?.send(raw)
      else hostSocket?.send(raw)
    }
  })
})

server.listen(8080, () => console.log('HTTP + WS server running on :8080'))

ipcMain.on('control', async (_, msg) => {
  if (msg.type === 'mouse') {
    await mouse.move(straightTo({ x: msg.x, y: msg.y }))
    if (msg.click) await mouse.click(Button.LEFT)
  }
  if (msg.type === 'key') await keyboard.type(msg.key)
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  await win.loadFile('server/renderer.html')
})
