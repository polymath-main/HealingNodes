const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let coreProcess;
let isQuitting = false;

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Auto-select the first screen and inject the loopback audio source (Windows System Audio)
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(err => {
      console.error('[Host] desktopCapturer error:', err);
    });
  });

  function spawnCore() {
    // Fork the standalone Node.js core process with advanced serialization for binary buffers
    coreProcess = fork(path.join(__dirname, 'core.js'), { serialization: 'advanced' });

    coreProcess.on('error', (err) => {
      console.error('[Host] Core process error:', err);
    });

    coreProcess.on('exit', (code, signal) => {
      if (!isQuitting) {
        console.warn(`[Host] Core process exited (code: ${code}, signal: ${signal}). Restarting...`);
        spawnCore();
      }
    });
  }

  spawnCore();

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
    // Forward the encoded Opus chunk from the Renderer (Chromium) to the standalone Core process
    if (coreProcess && coreProcess.connected) {
      coreProcess.send({ type: 'audio_chunk', payload: chunkData });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  isQuitting = true;
  if (coreProcess) {
    coreProcess.kill();
  }
});
