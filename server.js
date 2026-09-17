const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));
app.use(express.json());

// ---------------------------------------------------------------------------
// TrajectoryManager — Environmental State Vector V
//
// V = [f_base, T_breath, alpha_noise, phi_color, harmonic_ratio, orbital_velocity, binaural_offset]
//
// FIX: The previous implementation called lerp(currentState[key], targetState[key], eased)
// while mutating currentState in-place each tick. Because eased is recalculated from
// startTime each tick the lerp argument `start` was never the original start value —
// it was the already-moved value, causing the interpolation to asymptotically creep
// and never cleanly reach the target.
//
// Correct approach: snapshot startState once at trajectory launch, then interpolate
// startState → targetState with the time-based eased progress every tick.
// ---------------------------------------------------------------------------

const DEFAULT_STATE = {
    f_base: 33,           // Hz — base binding frequency
    T_breath: 10,         // seconds — LFO period (1/f = breath rate)
    alpha_noise: 1.0,     // 1=pink  2=brown  3=red
    phi_color: 200,       // degrees 0-360 HSL hue
    harmonic_ratio: 1.5,  // frequency multiplier per node index
    orbital_velocity: 0,  // rad/s — spatial orbit speed
    binaural_offset: 0    // Hz — hemispheric sync beat frequency
};

// Real-world circadian presets — time-of-day automatic morphs
const CIRCADIAN_SCHEDULE = [
    // 06:00 — Dawn wake: alpha rise, gentle high-beta warm-up
    { hour: 6,  state: { f_base: 40, T_breath: 8,  alpha_noise: 1.0, phi_color: 40,  harmonic_ratio: 1.618, orbital_velocity: 0.01, binaural_offset: 0 } },
    // 09:00 — Focus block: 40Hz gamma binding, golden ratio
    { hour: 9,  state: { f_base: 40, T_breath: 8,  alpha_noise: 1.0, phi_color: 120, harmonic_ratio: 1.618, orbital_velocity: 0,    binaural_offset: 0 } },
    // 13:00 — Post-lunch dip: sub-delta anchor, slow breath
    { hour: 13, state: { f_base: 33, T_breath: 12, alpha_noise: 1.5, phi_color: 200, harmonic_ratio: 1.5,   orbital_velocity: 0,    binaural_offset: 0 } },
    // 17:00 — Late afternoon creative: beta / minor 3rd warmth
    { hour: 17, state: { f_base: 38, T_breath: 9,  alpha_noise: 1.2, phi_color: 270, harmonic_ratio: 1.2,   orbital_velocity: 0.02, binaural_offset: 2 } },
    // 21:00 — Evening wind-down: delta approach, brown noise
    { hour: 21, state: { f_base: 30, T_breath: 14, alpha_noise: 2.0, phi_color: 240, harmonic_ratio: 1.2,   orbital_velocity: 0,    binaural_offset: 0 } },
    // 23:00 — Sleep onset: sub-delta, red noise, slow breath
    { hour: 23, state: { f_base: 20, T_breath: 18, alpha_noise: 2.8, phi_color: 260, harmonic_ratio: 1.0,   orbital_velocity: 0,    binaural_offset: 0 } },
];

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Smoothstep S-curve: 3t² - 2t³
function smoothstep(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
}

class TrajectoryManager {
    constructor() {
        this.currentState = { ...DEFAULT_STATE };
        this.startState   = { ...DEFAULT_STATE }; // snapshot at trajectory launch
        this.targetState  = { ...DEFAULT_STATE };
        this.startTime    = 0;
        this.duration     = 0;
        this.active       = false;

        // 1Hz broadcast loop — always running
        this.intervalId = setInterval(() => this.tick(), 1000);
    }

    startTrajectory(target, durationMs) {
        // Snapshot current interpolated position as the new start baseline
        this.startState  = { ...this.currentState };
        this.targetState = { ...this.currentState, ...target };
        this.duration    = Math.max(durationMs || 1000, 100);
        this.startTime   = Date.now();
        this.active      = true;
        console.log(`[Trajectory] start → target over ${(this.duration / 60000).toFixed(1)} min`);
        console.log('  target:', JSON.stringify(this.targetState));
    }

    stopTrajectory() {
        this.active      = false;
        this.startState  = { ...this.currentState };
        this.targetState = { ...this.currentState };
        console.log('[Trajectory] stopped — state frozen at current position.');
    }

    tick() {
        if (this.active) {
            const elapsed  = Date.now() - this.startTime;
            const progress = smoothstep(elapsed / this.duration);

            for (const key in this.startState) {
                // Interpolate from the fixed snapshot, not from currentState
                this.currentState[key] = lerp(this.startState[key], this.targetState[key], progress);
            }

            if (elapsed >= this.duration) {
                // Clamp to exact target and deactivate
                this.currentState = { ...this.targetState };
                this.startState   = { ...this.targetState };
                this.active       = false;
                console.log('[Trajectory] complete — arrived at target.');
            }
        }

        this.broadcastState();
    }

    broadcastState() {
        const N = nodes.length;

        // Admin telemetry — full state regardless of client count
        io.emit('admin_state_update', { nodeCount: N, state: this.currentState });

        if (N === 0) return;

        // 2.5s lookahead lets clients schedule Web Audio API events in advance
        const targetSyncTime = Date.now() + 2500;

        nodes.forEach((id, index) => {
            // θᵢ = (2π · i) / N  — equal angular phase separation (per THEORY.md)
            const baseAngleRads = (2 * Math.PI * index) / N;

            io.to(id).emit('audio_state_update', {
                nodeCount:     N,
                myIndex:       index,
                baseAngleRads: baseAngleRads,
                targetSyncTime: targetSyncTime,
                v:             this.currentState
            });
        });
    }
}

let nodes = [];
const trajectory = new TrajectoryManager();

// ---------------------------------------------------------------------------
// Circadian Automation — fires at each schedule hour on the dot
// ---------------------------------------------------------------------------
CIRCADIAN_SCHEDULE.forEach(({ hour, state }) => {
    // Cron: "0 <hour> * * *"
    cron.schedule(`0 ${hour} * * *`, () => {
        const durationMs = 45 * 60 * 1000; // 45-minute morph
        console.log(`[Circadian] ${hour}:00 — auto-morphing environment.`);
        trajectory.startTrajectory(state, durationMs);
    });
});

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------
app.post('/api/trajectory/start', (req, res) => {
    const { targetState, durationMs } = req.body;
    if (!targetState || typeof targetState !== 'object') {
        return res.status(400).json({ error: 'targetState object required.' });
    }
    trajectory.startTrajectory(targetState, durationMs);
    res.json({ success: true, target: targetState, durationMs });
});

app.post('/api/trajectory/stop', (req, res) => {
    trajectory.stopTrajectory();
    res.json({ success: true, frozenState: trajectory.currentState });
});

app.get('/api/state', (req, res) => {
    res.json({ nodeCount: nodes.length, state: trajectory.currentState, active: trajectory.active });
});

// ---------------------------------------------------------------------------
// WebSocket Events
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
    console.log(`[+] Socket connected: ${socket.id}`);

    socket.on('register', (role) => {
        if (role === 'client') {
            nodes.push(socket.id);
            console.log(`[Mesh] client registered — N=${nodes.length}`);
            trajectory.broadcastState(); // Immediate geometry recalc
        }
        // Admin role is just an observer; no mesh geometry slot needed
    });

    // NTP-style round-trip latency measurement
    socket.on('sync_ping', (clientTime) => {
        socket.emit('sync_pong', { clientTime, serverTime: Date.now() });
    });

    socket.on('disconnect', () => {
        if (nodes.includes(socket.id)) {
            nodes = nodes.filter(id => id !== socket.id);
            console.log(`[-] Client node left — N=${nodes.length}`);
            trajectory.broadcastState(); // Recalculate 2π/N geometry
        }
    });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[HealingNodes] Engine running on http://0.0.0.0:${PORT}`);
    console.log(`[HealingNodes] Admin dashboard at http://0.0.0.0:${PORT}/admin.html`);
});
