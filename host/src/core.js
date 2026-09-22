const { NtpWebSocketServer } = require('./ntpWebSocketServer');

const PORT = 8080;
const server = new NtpWebSocketServer(PORT);

process.on('message', (message) => {
  if (message.type === 'audio_chunk') {
    server.broadcast(message.payload);
  }
});

console.log(`[Core] Standalone core process started.`);
