const { contextBridge, desktopCapturer, ipcRenderer } = require('electron')

console.log('[preload loaded]')
console.log(JSON.stringify(Object.keys(require("electron")), null, 2))

contextBridge.exposeInMainWorld('api', {
  getSources: () => desktopCapturer.getSources({ types: ['screen'] }),
  sendControl: (msg) => ipcRenderer.send('control', msg)
})
