import express from 'express'
import { app, BrowserWindow, desktopCapturer } from 'electron'
import robot from 'robotjs'
import wrtc from 'wrtc'

global.RTCPeerConnection = wrtc.RTCPeerConnection
global.RTCSessionDescription = wrtc.RTCSessionDescription
global.RTCIceCandidate = wrtc.RTCIceCandidate

const expressApp = express()

expressApp.use(express.json())
expressApp.use(express.static('public'))

let offer = null
let answer = null

expressApp.post('/offer', (req, res) => {
  offer = req.body
  res.send('ok')
})

expressApp.get('/offer', (req, res) => {
  res.json(offer)
})

expressApp.post('/answer', (req, res) => {
  answer = req.body
  res.send('ok')
})

expressApp.get('/answer', (req, res) => {
  res.json(answer)
})

expressApp.listen(8080, () => {
  console.log('server running on 8080')
})

let win
let pc

async function waitForAnswer() {
  while (true) {
    try {
      const r = await fetch('http://localhost:8080/answer')
      const data = await r.json()

      if (data?.type) {
        return data
      }
    } catch {}

    await new Promise(r => setTimeout(r, 1000))
  }
}

async function startWebRTC() {
  pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          'stun:stun.cloudflare.com:3478',
          'stun:stun.l.google.com:19302'
        ]
      }
    ]
  })

  const channel = pc.createDataChannel('control')

  channel.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)

    if (msg.type === 'mouse') {
      robot.moveMouse(msg.x, msg.y)

      if (msg.click) {
        robot.mouseClick()
      }
    }

    if (msg.type === 'key') {
      robot.keyTap(msg.key)
    }
  }

  const sources = await desktopCapturer.getSources({
    types: ['screen']
  })

  const sourceId = sources[0].id

  const stream = await win.webContents.executeJavaScript(`
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: '${sourceId}'
        }
      }
    })
  `)

  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream)
  })

  const offer = await pc.createOffer()

  await pc.setLocalDescription(offer)

  await fetch('http://localhost:8080/offer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(pc.localDescription)
  })

  console.log('offer uploaded')

  const remoteAnswer = await waitForAnswer()

  await pc.setRemoteDescription(
    new RTCSessionDescription(remoteAnswer)
  )

  console.log('connected')
}

app.whenReady().then(async () => {
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  await win.loadURL('about:blank')

  await startWebRTC()
})