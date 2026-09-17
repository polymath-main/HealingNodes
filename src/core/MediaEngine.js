class MediaEngine {
    constructor(io, getNodesFunc, getActiveCoreFunc) {
        this.io = io;
        this.getNodes = getNodesFunc;
        this.getActiveCore = getActiveCoreFunc;
        this.currentMediaState = { isPlaying: false, url: '' };
    }

    setMediaUrl(url) {
        this.currentMediaState.url = url;
        console.log(`[Media Engine] Active Media URL set to: ${url}`);
        this.broadcastState('sync'); // Tell everyone to download the buffer
    }

    play() {
        this.currentMediaState.isPlaying = true;
        // Need time for devices to download the buffer if it's YouTube. Let's give it 5 seconds.
        const executionTime = Date.now() + 5000; 
        console.log(`[Media Engine] PLAY broadcast. Execution time: ${executionTime}`);
        this.broadcastState('play', executionTime);
    }

    pause() {
        this.currentMediaState.isPlaying = false;
        console.log(`[Media Engine] PAUSE broadcast.`);
        this.broadcastState('pause');
    }

    broadcastState(action, targetTimeMs = null) {
        const nodes = this.getNodes();
        const N = nodes.length;
        this.io.emit('admin_state_update', { nodeCount: N, activeCore: this.getActiveCore(), mediaState: this.currentMediaState });
        
        if (N === 0) return;
        
        nodes.forEach((id, index) => {
            const baseAngleRads = (2 * Math.PI * index) / N;
            this.io.to(id).emit('media_action', {
                action: action,
                baseAngleRads: baseAngleRads,
                targetSyncTime: targetTimeMs,
                url: this.currentMediaState.url
            });
        });
    }
}

module.exports = MediaEngine;
