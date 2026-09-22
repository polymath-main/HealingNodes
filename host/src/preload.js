const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendAudioChunk: (chunk) => ipcRenderer.send('audio-chunk', chunk),
  onStartCapture: (callback) => ipcRenderer.on('start-capture', callback)
});
