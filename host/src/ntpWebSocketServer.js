const WebSocket = require('ws');
const { EventEmitter } = require('events');
const http = require('http');
const fs = require('fs');
const path = require('path');

class NtpWebSocketServer extends EventEmitter {
  constructor(port) {
    super();
    this.port = port;
    
    const server = http.createServer((req, res) => {
      let filePath = req.url === '/' ? '/index.html' : req.url;
      let extname = path.extname(filePath);
      let contentType = 'text/html';
      
      switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
      }
      
      const fullPath = path.join(__dirname, '../../client', filePath);
      
      fs.readFile(fullPath, (err, content) => {
        if (err) {
          res.writeHead(404);
          res.end(`File not found: ${filePath}`);
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf8');
        }
      });
    });

    this.wss = new WebSocket.Server({ server });
    
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
    
    server.listen(this.port, () => {
      console.log(`[Host] Serving Web App & WebSocket on http://localhost:${this.port}`);
    });
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
