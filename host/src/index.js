const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { NtpWebSocketServer } = require('./ntpWebSocketServer');

const PORT = 8080;
let server;
let mainWindow;

app.whenReady().then(() => {
  server = new NtpWebSocketServer(PORT);

  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));

  ipcMain.on('audio-chunk', (event, chunkData) => {
    // Forward the encoded Opus chunk from the Renderer (Chromium) to the WebSocket server
    server.broadcast(chunkData);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
