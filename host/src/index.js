const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const { NtpWebSocketServer } = require('./ntpWebSocketServer');

const PORT = 8080;
let server;
let mainWindow;

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Auto-select the first screen and inject the loopback audio source (Windows System Audio)
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(err => {
      console.error('[Host] desktopCapturer error:', err);
    });
  });

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
