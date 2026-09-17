let socket;
let isAudioActive = false;
let wakeLock = null;

// Pure Math Web Audio API Context
let audioCtx;

// Audio Graph Nodes
let baseOsc;
let panner3D;
let pinkNoiseSource;
let breathingFilter;
let masterGain;

// Synchronization state
let timeOffsets = [];
let serverTimeOffset = 0;
const SYNC_SAMPLES = 10;

// UI Elements
const statusText = document.getElementById('status-text');
const startBtn = document.getElementById('start-btn');
const hudNodes = document.getElementById('hud-nodes');
const hudAngle = document.getElementById('hud-angle');
const hudOffset = document.getElementById('hud-offset');
const myMarker = document.getElementById('my-marker');

// --- 1. Network & Synchronization ---
function initNetwork() {
    socket = io();

    socket.on('connect', () => {
        statusText.innerText = "Connected. Synchronizing Clocks...";
        socket.emit('register', 'client');
        syncClock();
    });

    socket.on('sync_pong', (data) => {
        const now = Date.now();
        const rtt = now - data.clientTime;
        const latency = rtt / 2;
        const offset = (data.serverTime - data.clientTime - latency);
        
        timeOffsets.push(offset);

        if (timeOffsets.length < SYNC_SAMPLES) {
            setTimeout(() => socket.emit('sync_ping', Date.now()), 100);
        } else {
            timeOffsets.sort((a,b) => a-b);
            const mid = Math.floor(SYNC_SAMPLES/2);
            serverTimeOffset = Math.round(timeOffsets[mid]);
            hudOffset.innerText = serverTimeOffset;
            statusText.innerText = "Synchronized. Awaiting Initialization.";
        }
    });

    socket.on('audio_state_update', (state) => {
        hudNodes.innerText = state.nodeCount;
        hudAngle.innerText = state.angleRads.toFixed(2);
        
        updateVisualizer(state.angleRads);

        if (isAudioActive) {
            scheduleAudioUpdate(state);
        }
    });
}

function syncClock() {
    timeOffsets = [];
    socket.emit('sync_ping', Date.now());
}

// --- 2. Pure Mathematical Sound Synthesis (Native AudioContext) ---

// Voss-McCartney Algorithm for 1/f Pink Noise
// Converts linear white noise (entropy) into 1/f spectral density via cascaded filters
function createPinkNoiseBuffer(ctx) {
    const bufferSize = ctx.sampleRate * 4; // 4 seconds of looping entropy
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    
    for (let i = 0; i < bufferSize; i++) {
        let white = Math.random() * 2 - 1; // Pure entropy (-1 to 1)
        
        // Mathematical integration to shift power spectrum
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11; // Amplitude Normalization
        b6 = white * 0.115926;
    }
    return buffer;
}

async function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Master Volume (-10dB math equivalent: 10^(-10/20) ≈ 0.316)
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.316;
    masterGain.connect(audioCtx.destination);
    
    // True 3D Spherical Panner (HRTF)
    panner3D = audioCtx.createPanner();
    panner3D.panningModel = "HRTF";
    panner3D.distanceModel = "inverse";
    panner3D.refDistance = 1;
    panner3D.maxDistance = 10000;
    panner3D.rolloffFactor = 1;
    
    // Position listener at true center (0,0,0)
    audioCtx.listener.positionX.value = 0;
    audioCtx.listener.positionY.value = 0;
    audioCtx.listener.positionZ.value = 0;
    
    panner3D.connect(masterGain);
    
    // Mathematical Base Oscillator (33Hz Sine wave)
    baseOsc = audioCtx.createOscillator();
    baseOsc.type = "sine";
    baseOsc.frequency.value = 33;
    baseOsc.connect(panner3D);

    // Generate Pink Noise mathematically
    pinkNoiseSource = audioCtx.createBufferSource();
    pinkNoiseSource.buffer = createPinkNoiseBuffer(audioCtx);
    pinkNoiseSource.loop = true;
    
    // Lowpass filter for Pink Noise to create "Warmth"
    breathingFilter = audioCtx.createBiquadFilter();
    breathingFilter.type = "lowpass";
    breathingFilter.frequency.value = 400; // Base cutoff
    
    // LFO (Low Frequency Oscillator) to drive the Breathing Math
    // Frequency: 0.1 Hz (10 seconds per cycle)
    const lfo = audioCtx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.1;
    
    // Gain node to amplify LFO mathematically (amplitude mapping)
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 200; // Sweep cutoff frequency by 200 Hz
    
    // Connect LFO -> Gain -> Filter cutoff parameter
    lfo.connect(lfoGain);
    lfoGain.connect(breathingFilter.frequency);
    
    // Route Pink noise -> Filter -> Panner
    pinkNoiseSource.connect(breathingFilter);
    breathingFilter.connect(panner3D);

    // Start all mathematical generators
    const startTime = audioCtx.currentTime;
    baseOsc.start(startTime);
    pinkNoiseSource.start(startTime);
    lfo.start(startTime);
    
    isAudioActive = true;
    statusText.innerText = "Audio Active. Native Math & Spatial Resonance Engaged.";
    startBtn.innerText = "Stop Engine";
    startBtn.classList.add('active');

    requestWakeLock();
}

function stopAudio() {
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
    
    isAudioActive = false;
    statusText.innerText = "Engine Stopped.";
    startBtn.innerText = "Initialize Math Engine";
    startBtn.classList.remove('active');
    
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

// --- 4. The Daydream Engine (Liquid Fluid Math) ---
const canvas = document.getElementById('visual-engine');
const ctx = canvas.getContext('2d');
let currentAngleRads = 0;
let currentFreq = 33; 
let animationFrameId;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Double-tap to enter true fullscreen
document.body.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});

function drawDaydream() {
    // Liquid fade effect (Motion Blur)
    ctx.fillStyle = 'rgba(2, 2, 5, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (isAudioActive && audioCtx) {
        const time = audioCtx.currentTime;
        
        // 0.1 Hz Breathing Cycle (matches the Pink Noise LFO)
        const breath = Math.sin(time * 2 * Math.PI * 0.1); 
        
        // 33 Hz (or current harmonic) vibration
        const vibration = Math.sin(time * 2 * Math.PI * currentFreq) * (1.5 + breath * 0.5);
        
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        // Dynamically scale based on TV vs Phone screen size
        const baseRadius = Math.min(cx, cy) * 0.5; // 50% of screen

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(currentAngleRads + time * 0.05); // Slow atmospheric rotation

        // Dynamic $\pi$-based circadian coloring
        const rVal = Math.floor(Math.sin(currentAngleRads) * 50 + 100);
        const gVal = Math.floor(Math.sin(currentAngleRads + Math.PI/2) * 200 + 55);
        const bVal = Math.floor(Math.sin(currentAngleRads + Math.PI) * 200 + 100);

        // Draw multiple overlapping liquid layers
        for (let layer = 0; layer < 3; layer++) {
            ctx.beginPath();
            
            for (let i = 0; i <= Math.PI * 2 + 0.1; i += 0.1) {
                // Fluid Math: Overlapping low-frequency sine waves acting like Perlin noise
                const fluidDistortion = Math.sin(i * (3 + layer) + time * (0.5 + layer*0.2)) * (baseRadius * 0.15)
                                      + Math.cos(i * (2 + layer) - time * (0.3 + layer*0.1)) * (baseRadius * 0.1);
                
                // Radius = Base + Fluid Waves + Breathing Swell + Micro-vibration
                const r = baseRadius + fluidDistortion + (breath * baseRadius * 0.1) + vibration;
                
                const x = Math.cos(i) * r;
                const y = Math.sin(i) * r;
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            
            ctx.closePath();
            
            // Create a liquid glow gradient
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, baseRadius * 1.5);
            gradient.addColorStop(0, `rgba(${rVal}, ${gVal}, ${bVal}, 0.0)`);
            gradient.addColorStop(0.8, `rgba(${rVal}, ${gVal}, ${bVal}, ${0.1 - layer*0.02})`);
            gradient.addColorStop(1, `rgba(${rVal}, ${gVal}, ${bVal}, 0.0)`);
            
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Soft liquid edge
            ctx.strokeStyle = `rgba(${rVal}, ${gVal}, ${bVal}, ${0.4 - layer*0.1})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        ctx.restore();
    }

    animationFrameId = requestAnimationFrame(drawDaydream);
}

// Updating state dynamically
function scheduleAudioUpdate(state) {
    if (!audioCtx) return;

    const localTargetTimeMs = state.targetSyncTime - serverTimeOffset;
    const timeUntilChangeMs = localTargetTimeMs - Date.now();
    
    if (timeUntilChangeMs > 0) {
        const audioCtxTargetTime = audioCtx.currentTime + (timeUntilChangeMs / 1000);
        
        const radius = 2;
        const posX = radius * Math.cos(state.angleRads);
        const posZ = radius * Math.sin(state.angleRads);
        
        const harmonicFreq = state.baseFreq * Math.pow(1.5, state.myIndex);

        // Update visuals globally
        currentAngleRads = state.angleRads;
        currentFreq = harmonicFreq;

        baseOsc.frequency.linearRampToValueAtTime(harmonicFreq, audioCtxTargetTime);
        
        panner3D.positionX.linearRampToValueAtTime(posX, audioCtxTargetTime);
        panner3D.positionY.linearRampToValueAtTime(0, audioCtxTargetTime);
        panner3D.positionZ.linearRampToValueAtTime(posZ, audioCtxTargetTime);
    }
}

startBtn.addEventListener('click', () => {
    if (isAudioActive) {
        stopAudio();
        document.getElementById('ui-container').classList.remove('fade-out');
    } else {
        initAudio();
        document.getElementById('ui-container').classList.add('fade-out');
        if (!animationFrameId) drawDaydream();
    }
});

window.onload = () => {
    initNetwork();
    drawDaydream();
};
