import { app, BrowserWindow, ipcMain } from 'electron'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { mouse, keyboard, Button, straightTo } from '@nut-tree/nut-js'

// --------------------
// WebSocket signaling
// --------------------
const server = createServer()
const wss = new WebSocketServer({ server })

let viewerSocket = null
let hostSocket = null

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw)

    if (msg.type === 'viewer') viewerSocket = ws
    if (msg.type === 'host') hostSocket = ws

    if (msg.type === 'offer') viewerSocket?.send(raw)
    if (msg.type === 'answer') hostSocket?.send(raw)
  })
})

server.listen(8080, () => {
  console.log('signaling server running on :8080')
})

// --------------------
// OS control
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
// Electron app
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
