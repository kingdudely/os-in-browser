const { contextBridge, desktopCapturer, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getSources: () => desktopCapturer.getSources({ types: ['screen'] }),
  sendControl: (msg) => ipcRenderer.send('control', msg)
})
