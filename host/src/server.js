const WebSocket = require('ws');
const { performance } = require('perf_hooks');

class SyncServer {
    constructor(port = 8080) {
        this.port = port;
        this.wss = null;
    }

    now() {
        return performance.timeOrigin + performance.now();
    }

    start() {
        return new Promise((resolve) => {
            this.wss = new WebSocket.Server({ port: this.port }, () => {
                resolve();
            });
            
            this.wss.on('connection', (ws) => {
                ws.on('message', (message) => {
                    const t1 = this.now();
                    try {
                        const data = JSON.parse(message);
                        if (data.type === 'ntp_sync') {
                            const t2 = this.now();
                            ws.send(JSON.stringify({
                                type: 'ntp_sync_reply',
                                t0: data.t0,
                                t1: t1,
                                t2: t2
                            }));
                        }
                    } catch (e) {
                        console.error("Failed to parse message", e);
                    }
                });
            });
        });
    }

    stop() {
        return new Promise((resolve, reject) => {
            if (this.wss) {
                this.wss.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = { SyncServer };
