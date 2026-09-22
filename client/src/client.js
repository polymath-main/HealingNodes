class NtpClient {
    constructor(wsUrl, WebSocketClass, pingCount = 5) {
        this.wsUrl = wsUrl;
        this.WebSocketClass = WebSocketClass || (typeof window !== 'undefined' ? window.WebSocket : null);
        this.ws = null;
        this.clockOffset = 0;
        this.onSync = null;
        this.pingCount = pingCount;
        this.syncResults = [];
        this.isSyncing = false;
    }

    now() {
        if (typeof performance !== 'undefined' && performance.timeOrigin) {
            return performance.timeOrigin + performance.now();
        }
        return Date.now();
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new this.WebSocketClass(this.wsUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (e) => reject(e);
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'ntp_sync_reply') {
                        const t3 = this.now();
                        const { t0, t1, t2 } = data;

                        const rtt = (t3 - t0) - (t2 - t1);
                        const offset = ((t1 - t0) + (t2 - t3)) / 2;

                        this.syncResults.push({ offset, rtt });

                        if (this.syncResults.length < this.pingCount) {
                            this.sendPing();
                        } else {
                            // Filter out outliers? For now, just average them all.
                            // Or better: sort by RTT and take the offset with the lowest RTT, or average the best few.
                            // To keep it simple, just average them.
                            let totalOffset = 0;
                            let totalRtt = 0;
                            for (const res of this.syncResults) {
                                totalOffset += res.offset;
                                totalRtt += res.rtt;
                            }
                            this.clockOffset = totalOffset / this.syncResults.length;
                            const avgRtt = totalRtt / this.syncResults.length;
                            
                            this.isSyncing = false;
                            if (this.onSync) this.onSync(this.clockOffset, avgRtt);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse", e);
                }
            };
        });
    }

    sendPing() {
        if (!this.ws || this.ws.readyState !== 1) return;
        this.ws.send(JSON.stringify({
            type: 'ntp_sync',
            t0: this.now()
        }));
    }

    sync() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        this.syncResults = [];
        this.sendPing();
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NtpClient };
}
