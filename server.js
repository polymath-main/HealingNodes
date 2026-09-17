const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Middleware
app.use(express.static('public'));
app.use(express.json()); // For parsing bio-feedback REST payloads

// Global State
let nodes = [];
let baseFrequency = 33; // 33Hz Isochronic baseline

// --- Circadian Automation ---
// Example: At 10:00 PM every night, shift the frequency down to 10Hz (Theta/Delta waves)
cron.schedule('0 22 * * *', () => {
    console.log('[Automation] Evening circadian shift triggered. Dropping to 10Hz.');
    baseFrequency = 10;
    broadcastState();
});

// Example: At 7:00 AM, shift frequency to 40Hz (Gamma waves for focus)
cron.schedule('0 7 * * *', () => {
    console.log('[Automation] Morning circadian shift triggered. Raising to 40Hz.');
    baseFrequency = 40;
    broadcastState();
});

// --- REST API for Bio-Feedback Triggers ---
// e.g. A smartwatch heart-rate spike hits this endpoint to calm the user
app.post('/api/bio-feedback', (req, res) => {
    const { heartRate } = req.body;
    
    if (heartRate > 100) {
        console.log(`[Bio-Feedback] Elevated HR detected (${heartRate} BPM). Shifting to calming 20Hz.`);
        baseFrequency = 20;
        broadcastState();
    }
    
    res.json({ success: true, activeFrequency: baseFrequency });
});

io.on('connection', (socket) => {
    console.log(`[+] Node connected: ${socket.id}`);
    
    // Allow nodes to identify as 'client' or 'admin'
    socket.on('register', (role) => {
        if (role === 'client') {
            nodes.push(socket.id);
            broadcastState();
        }
    });

    // --- Admin Overrides ---
    socket.on('admin_override', (data) => {
        if (data.frequency) {
            baseFrequency = data.frequency;
            console.log(`[Admin Override] Base Frequency manually set to ${baseFrequency}Hz`);
            broadcastState();
        }
    });

    // --- NTP-style Clock Synchronization ---
    socket.on('sync_ping', (clientTime) => {
        socket.emit('sync_pong', {
            clientTime: clientTime,
            serverTime: Date.now()
        });
    });

    socket.on('disconnect', () => {
        if (nodes.includes(socket.id)) {
            console.log(`[-] Client Node disconnected: ${socket.id}`);
            nodes = nodes.filter(id => id !== socket.id);
            broadcastState();
        }
    });
});

function broadcastState() {
    const N = nodes.length;
    
    // Broadcast to admins regardless of client count
    io.emit('admin_state_update', { nodeCount: N, currentFrequency: baseFrequency });

    if (N === 0) return;
    const targetSyncTime = Date.now() + 2500; 

    nodes.forEach((id, index) => {
        const angleRads = (2 * Math.PI * index) / N;
        io.to(id).emit('audio_state_update', {
            nodeCount: N,
            myIndex: index,
            angleRads: angleRads,
            baseFreq: baseFrequency,
            targetSyncTime: targetSyncTime,
            timestamp: Date.now()
        });
    });
    
    console.log(`[State Updated] N: ${N} | Freq: ${baseFrequency}Hz | Sync Target: +2.5s`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[HealingNodes] Spatial Audio Engine running on http://0.0.0.0:${PORT}`);
});
