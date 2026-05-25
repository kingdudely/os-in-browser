import { app, BrowserWindow, desktopCapturer } from 'electron'
import { createServer } from 'node:http'
import { ExpressPeerServer } from 'peer'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express from 'express'

const __dirname = dirname(fileURLToPath(import.meta.url))

const expressApp = express()
const server = createServer(expressApp)

const peerServer = ExpressPeerServer(server, { path: '/myapp' })
expressApp.use('/myapp', peerServer)

expressApp.use(express.static(join(__dirname, 'client')))

function createHostWindow() {
  const win = new BrowserWindow({
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  win.loadURL('about:blank')

  win.webContents.on('did-finish-load', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    const source = sources[0]

    win.webContents.executeJavaScript(`
      const { Peer } = require('peerjs')

      const peer = new Peer('${process.env.PASSWORD}', {
        host: 'localhost',
        port: 8080,
        path: '/myapp'
      })

      peer.on('open', async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: '${source.id}'
            }
          }
        })

        peer.on('call', call => call.answer(stream))
      })
    `)
  })
}

server.listen(8080, () => {
  console.log('HTTP + PeerJS broker running on :8080')
})

app.whenReady().then(() => {
  createHostWindow()
})
