const WebSocket = require('ws');
const { EventEmitter } = require('events');

class NtpWebSocketServer extends EventEmitter {
  constructor(port) {
    super();
    this.port = port;
    this.wss = new WebSocket.Server({ port });
    
    this.wss.on('connection', (ws) => {
      console.log('[NtpWebSocketServer] Client connected');
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'ping') {
            const t1 = Date.now();
            ws.send(JSON.stringify({
              type: 'pong',
              t0: data.t0,
              t1: t1,
              t2: Date.now()
            }));
          }
        } catch (e) {
          console.warn('[NtpWebSocketServer] Failed to parse message', e);
        }
      });
      
      ws.on('close', () => console.log('[NtpWebSocketServer] Client disconnected'));
    });
    
    console.log(`[NtpWebSocketServer] Running on ws://localhost:${this.port}`);
  }

  broadcast(chunkData) {
    const payload = JSON.stringify({
      type: 'audio_chunk',
      payload: chunkData
    });
    
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }
}

module.exports = { NtpWebSocketServer };
