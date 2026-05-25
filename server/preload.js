const { contextBridge, ipcRenderer } = require('electron')

console.log('[preload loaded]')
console.log(JSON.stringify(Object.keys(require("electron")), null, 2))

contextBridge.exposeInMainWorld('api', {
  getSources: () => ipcRenderer.invoke('GET_SOURCES'),
  sendControl: (msg) => ipcRenderer.send('control', msg)
})
