import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { app, BrowserWindow, desktopCapturer } from 'electron'
import { RTCPeerConnection, RTCSessionDescription } from 'wrtc'
import { mouse, keyboard, Button, straightTo } from '@nut-tree/nut-js'

const server = createServer()
const wss = new WebSocketServer({ server })

let hostSocket = null
let viewerSocket = null

wss.on('connection', ws => {
  ws.on('message', raw => {
    const msg = JSON.parse(raw)

    if (msg.type === 'host')   { hostSocket = ws }
    if (msg.type === 'viewer') { viewerSocket = ws }

    // relay offer/answer directly instead of polling
    if (msg.type === 'offer')  viewerSocket?.send(raw)
    if (msg.type === 'answer') hostSocket?.send(raw)
  })
})

server.listen(8080, () => console.log('server running on 8080'))

async function startWebRTC(win) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
  })

  const channel = pc.createDataChannel('control')
  channel.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.type === 'mouse') {
      await mouse.move(straightTo({ x: msg.x, y: msg.y }))
      if (msg.click) await mouse.click(Button.LEFT)
    }
    if (msg.type === 'key') await keyboard.type(msg.key)
  }

  const sources = await desktopCapturer.getSources({ types: ['screen'] })
  const stream = await win.webContents.executeJavaScript(`
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: '${sources[0].id}'
        }
      }
    })
  `)
  stream.getTracks().forEach(track => pc.addTrack(track, stream))

  // register as host then send offer
  const ws = new WebSocket('ws://localhost:8080')
  ws.onopen = async () => {
    ws.send(JSON.stringify({ type: 'host' }))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    ws.send(JSON.stringify({ type: 'offer', ...offer }))
  }

  // answer comes back via push, no polling
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg))
      ws.close()
      console.log('connected')
    }
  }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  await win.loadURL('about:blank')
  await startWebRTC(win)
})
