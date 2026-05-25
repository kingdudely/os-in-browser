import { app, BrowserWindow, ipcMain } from 'electron'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mouse, keyboard, Button, straightTo } from '@nut-tree-fork/nut-js'

// --------------------
// HTTP + WebSocket server (SAME PORT)
// --------------------
const server = createServer((req, res) => {
  // Serve viewer page
  if (req.url === '/' || req.url === '/index.html') {
    const filePath = path.resolve('client/index.html')
    const html = readFileSync(filePath)

    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store'
    })
    res.end(html)
    return
  }

  // Health check (useful for debugging tunnels)
  if (req.url === '/health') {
    res.writeHead(200)
    res.end('ok')
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

// WebSocket signaling on same server
const wss = new WebSocketServer({ server })

let viewerSocket = null
let hostSocket = null

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw)

    if (msg.type === 'viewer') viewerSocket = ws
    if (msg.type === 'host') hostSocket = ws

    // signaling relay
    if (msg.type === 'offer') viewerSocket?.send(raw)
    if (msg.type === 'answer') hostSocket?.send(raw)
  })
})

// start server
server.listen(8080, () => {
  console.log('HTTP + WS server running on :8080')
})

// --------------------
// OS CONTROL (from renderer)
// --------------------
ipcMain.on('control', async (_, msg) => {
  if (msg.type === 'mouse') {
    await mouse.move(straightTo({ x: msg.x, y: msg.y }))
    if (msg.click) await mouse.click(Button.LEFT)
  }

  if (msg.type === 'key') {
    await keyboard.type(msg.key)
  }
})

// --------------------
// ELECTRON HOST APP
// --------------------
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  await win.loadFile('server/renderer.html')
})
