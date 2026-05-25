import { app, BrowserWindow, ipcMain, desktopCapturer } from 'electron'
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

  if (req.url === '/log') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', () => {
      console.log('[client-log]', body)
      res.end('ok')
    })
    return
  }

  if (req.url === '/health') {
    res.writeHead(200)
    res.end('ok')
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

const wss = new WebSocketServer({ server })

let viewerSocket = null
let hostSocket = null
let pendingOffer = null

wss.on('connection', (ws) => {
  console.log('WS connected')

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw)

    if (msg.type === 'viewer') {
      viewerSocket = ws
      if (pendingOffer) {
        viewerSocket.send(pendingOffer)
        pendingOffer = null
      }
    }

    if (msg.type === 'host') {
      hostSocket = ws
    }

    if (msg.type === 'offer') {
      if (viewerSocket) viewerSocket.send(raw)
      else pendingOffer = raw
    }

    if (msg.type === 'answer') {
      hostSocket?.send(raw)
    }

    if (msg.type === 'candidate') {
      if (ws === hostSocket) viewerSocket?.send(raw)
      else hostSocket?.send(raw)
    }
  })

  ws.on('close', () => console.log('WS closed'))
  ws.on('error', console.error)
})

server.listen(8080, () => {
  console.log('HTTP + WS server running on :8080')
})

ipcMain.handle('GET_SOURCES', async () => {
  return await desktopCapturer.getSources({ types: ['screen'] })
})

ipcMain.on('control', async (_, msg) => {
  if (msg.type === 'mouse') {
    await mouse.move(straightTo({ x: msg.x, y: msg.y }))
    if (msg.click) await mouse.click(Button.LEFT)
  }

  if (msg.type === 'key') {
    await keyboard.type(msg.key)
  }
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(process.cwd(), 'server/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('server/renderer.html')
})
