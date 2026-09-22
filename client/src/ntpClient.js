export class NtpClient {
  constructor(ws) {
    this.ws = ws;
    this.clockOffset = 0;
    this.isReady = false;
    
    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          const t3 = Date.now();
          const t0 = data.t0;
          const t1 = data.t1;
          const t2 = data.t2;
          
          // RTT calculation
          const rtt = (t3 - t0) - (t2 - t1);
          // Clock offset calculation
          const offset = ((t1 - t0) + (t2 - t3)) / 2;
          
          // Exponential moving average for stability
          if (this.clockOffset === 0 && !this.isReady) {
            this.clockOffset = offset;
            this.isReady = true;
          } else {
            this.clockOffset = this.clockOffset * 0.9 + offset * 0.1;
          }
        }
      } catch (e) {
        // Ignore non-JSON
      }
    });
  }

  startSync() {
    this.syncInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', t0: Date.now() }));
      }
    }, 1000);
  }
  
  stopSync() {
    clearInterval(this.syncInterval);
  }

  getOffset() {
    return this.clockOffset;
  }
}
