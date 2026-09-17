const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Microservices
const ModeEngine = require('./src/core/ModeEngine');
const MediaEngine = require('./src/core/MediaEngine');
const YouTubeProxy = require('./src/services/YouTubeProxy');

// Ensure media directory exists
const mediaDir = path.join(__dirname, 'public', 'media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, mediaDir),
    filename: (req, file, cb) => cb(null, 'theater_track.mp3') // Overwrite for simplicity in V1
});
const upload = multer({ storage: storage });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));
app.use(express.json());

// --- Global State ---
let nodes = [];
let activeCore = 'mode'; 
const getNodes = () => nodes;
const getActiveCore = () => activeCore;

// --- Initialize Engines ---
const modeEngine = new ModeEngine(io, getNodes, getActiveCore);
const mediaEngine = new MediaEngine(io, getNodes, getActiveCore);

// --- Initialize Services ---
YouTubeProxy.setupRoutes(app);

// --- REST APIs ---
app.post('/api/core/switch', (req, res) => {
    activeCore = req.body.core;
    console.log(`[Orchestrator] Core switched to: ${activeCore}`);
    io.emit('core_switch', { activeCore });
    
    // Broadcast immediate updates to admin UI
    if (activeCore === 'mode') modeEngine.broadcastState();
    else mediaEngine.broadcastState('sync');
    
    res.json({ success: true, activeCore });
});

// Mode Engine Routes
app.post('/api/trajectory/start', (req, res) => {
    modeEngine.startTrajectory(req.body.targetState, req.body.durationMs);
    res.json({ success: true });
});
app.post('/api/trajectory/stop', (req, res) => {
    modeEngine.stopTrajectory();
    res.json({ success: true });
});

// Media Engine Routes
app.post('/api/media/upload', upload.single('track'), (req, res) => {
    console.log('[Media Engine] Local MP3 track uploaded.');
    mediaEngine.setMediaUrl('/media/theater_track.mp3');
    res.json({ success: true });
});

app.post('/api/media/youtube', (req, res) => {
    const videoUrl = req.body.url;
    console.log(`[Media Engine] YouTube URL submitted: ${videoUrl}`);
    mediaEngine.setMediaUrl(`/api/media/youtube?url=${encodeURIComponent(videoUrl)}`);
    res.json({ success: true });
});

app.post('/api/media/play', (req, res) => {
    mediaEngine.play();
    res.json({ success: true });
});

app.post('/api/media/pause', (req, res) => {
    mediaEngine.pause();
    res.json({ success: true });
});

// --- Socket Orchestration ---
io.on('connection', (socket) => {
    socket.on('register', (role) => {
        if (role === 'client') {
            nodes.push(socket.id);
            socket.emit('core_switch', { activeCore }); 
            if (activeCore === 'mode') modeEngine.broadcastState();
            else mediaEngine.broadcastState('sync');
        } else if (role === 'admin') {
            if (activeCore === 'mode') modeEngine.broadcastState();
            else mediaEngine.broadcastState('sync');
        }
    });

    socket.on('sync_ping', (clientTime) => {
        socket.emit('sync_pong', { clientTime: clientTime, serverTime: Date.now() });
    });

    socket.on('disconnect', () => {
        if (nodes.includes(socket.id)) {
            nodes = nodes.filter(id => id !== socket.id);
            if (activeCore === 'mode') modeEngine.broadcastState();
            else mediaEngine.broadcastState('sync');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[HealingNodes Dual-Core] Orchestrator running on http://0.0.0.0:${PORT}`);
});
