import { contextBridge, desktopCapturer, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getSources: () => desktopCapturer.getSources({ types: ['screen'] }),
  sendControl: (msg) => ipcRenderer.send('control', msg)
})
