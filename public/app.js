let socket;
let isAudioActive = false;
let activeCore = 'mode'; 
let audioCtx;

// --- Network & Sync ---
let timeOffsets = [];
let serverTimeOffset = 0;
let baseNodeAngle = 0;

// --- Mode Engine State ---
let currentV = { f_base: 33, T_breath: 10, alpha_noise: 1, phi_color: 200, harmonic_ratio: 1.5, orbital_velocity: 0, binaural_offset: 0 };
let currentAngleRads = 0;
let baseOsc, binauralOsc, breathingFilter, noiseNode, panner3D;

// --- Media Engine State ---
let mediaBuffer = null;
let mediaSource = null;
let currentMediaUrl = '';

const workletCode = `
class SpectralNoiseProcessor extends AudioWorkletProcessor {
    constructor() { super(); this.b0=0; this.b1=0; this.b2=0; this.b3=0; this.b4=0; this.b5=0; this.b6=0; this.brown=0; }
    static get parameterDescriptors() { return [{ name: 'alpha', defaultValue: 1, minValue: 0, maxValue: 3 }]; }
    process(inputs, outputs, parameters) {
        const output = outputs[0]; const alpha = parameters.alpha[0]; 
        for (let channel = 0; channel < output.length; ++channel) {
            const outChannel = output[channel];
            for (let i = 0; i < outChannel.length; ++i) {
                const white = Math.random() * 2 - 1;
                this.b0 = 0.99886 * this.b0 + white * 0.0555179;
                this.b1 = 0.99332 * this.b1 + white * 0.0750759;
                this.b2 = 0.96900 * this.b2 + white * 0.1538520;
                this.b3 = 0.86650 * this.b3 + white * 0.3104856;
                this.b4 = 0.55000 * this.b4 + white * 0.5329522;
                this.b5 = -0.7616 * this.b5 - white * 0.0168980;
                let pink = (this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362) * 0.11;
                this.b6 = white * 0.115926;
                this.brown = (white * 0.02) + (this.brown * 0.95);
                let blend = Math.max(0, Math.min(1, alpha - 1));
                outChannel[i] = pink * (1 - blend) + (this.brown * 3.5) * blend;
            }
        }
        return true;
    }
}
registerProcessor('spectral-noise', SpectralNoiseProcessor);
`;

function initNetwork() {
    socket = io();
    socket.on('connect', () => {
        document.getElementById('status-text').innerText = "Connected. Synchronizing...";
        socket.emit('register', 'client');
        socket.emit('sync_ping', Date.now());
    });
    
    socket.on('sync_pong', (data) => {
        const latency = (Date.now() - data.clientTime) / 2;
        timeOffsets.push(data.serverTime - data.clientTime - latency);
        if (timeOffsets.length < 10) setTimeout(() => socket.emit('sync_ping', Date.now()), 100);
        else {
            timeOffsets.sort((a,b) => a-b);
            serverTimeOffset = timeOffsets[Math.floor(10/2)];
            document.getElementById('status-text').innerText = "Synchronized. Ready.";
        }
    });

    socket.on('core_switch', (data) => {
        if (isAudioActive) stopEngine(); // Force reboot if active
        activeCore = data.activeCore;
        document.getElementById('status-text').innerText = `Switched to ${activeCore.toUpperCase()} Core`;
        document.getElementById('start-btn').innerText = `Enter ${activeCore === 'mode' ? 'Daydream' : 'Theater'}`;
    });

    socket.on('audio_state_update', (state) => {
        if (activeCore !== 'mode') return;
        baseNodeAngle = state.baseAngleRads;
        if(state.v) currentV = state.v;
        if (isAudioActive && audioCtx) scheduleModeUpdate(state);
    });

    socket.on('media_action', async (state) => {
        if (activeCore !== 'media') return;
        baseNodeAngle = state.baseAngleRads;
        
        if (state.action === 'play') {
            if (!mediaBuffer && state.url) await loadMediaBuffer(state.url);
            scheduleMediaPlayback(state.targetSyncTime);
        } else if (state.action === 'pause') {
            if (mediaSource) { mediaSource.stop(); mediaSource = null; }
        } else if (state.action === 'sync') {
            if (state.url) await loadMediaBuffer(state.url);
        }
    });
}

async function loadMediaBuffer(url) {
    document.getElementById('status-text').innerText = "Downloading Media Chunk...";
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    mediaBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    document.getElementById('status-text').innerText = "Media Ready.";
}

async function initEngine() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (activeCore === 'mode') await initModeEngine();
        else await initMediaEngine();
        
        isAudioActive = true;
        document.getElementById('ui-container').classList.add('fade-out');
        if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(e => console.warn(e));
    } catch (err) {
        console.error("Engine Crash:", err);
        document.getElementById('status-text').innerText = `Crash: ${err.message}`;
        stopEngine();
    }
}

function stopEngine() {
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    mediaBuffer = null;
    mediaSource = null;
    isAudioActive = false;
    document.getElementById('ui-container').classList.remove('fade-out');
    document.getElementById('status-text').innerText = "Engine Stopped.";
    document.getElementById('start-btn').innerText = `Enter ${activeCore === 'mode' ? 'Daydream' : 'Theater'}`;
}

// ==========================================
// CORE 1: MODE ENGINE (Phase 2 - Fixes applied)
// ==========================================
async function initModeEngine() {
    const masterGain = audioCtx.createGain(); masterGain.gain.value = 0.316; masterGain.connect(audioCtx.destination);
    
    // Hard-pan Binaural via ChannelMerger (Fix for Binaural blending bug)
    const merger = audioCtx.createChannelMerger(2);
    merger.connect(masterGain);

    const baseOscGain = audioCtx.createGain(); baseOscGain.gain.value = 0.8;
    const binOscGain = audioCtx.createGain(); binOscGain.gain.value = 0.8;
    
    baseOscGain.connect(merger, 0, 0); // L
    binOscGain.connect(merger, 0, 1);  // R

    baseOsc = audioCtx.createOscillator(); binauralOsc = audioCtx.createOscillator();
    const initialFreq = currentV.f_base * currentV.harmonic_ratio;
    baseOsc.frequency.value = initialFreq; binauralOsc.frequency.value = initialFreq + currentV.binaural_offset;
    baseOsc.connect(baseOscGain); binauralOsc.connect(binOscGain);

    panner3D = audioCtx.createPanner(); panner3D.panningModel = "HRTF"; panner3D.connect(masterGain);
    breathingFilter = audioCtx.createGain(); breathingFilter.connect(panner3D); // VCA amplitude mod

    try {
        if (audioCtx.audioWorklet) {
            const blob = new Blob([workletCode], { type: "application/javascript" });
            await audioCtx.audioWorklet.addModule(URL.createObjectURL(blob));
            noiseNode = new AudioWorkletNode(audioCtx, 'spectral-noise');
            noiseNode.connect(breathingFilter);
        }
    } catch (e) { console.warn('No Worklet', e); noiseNode = null; }

    baseOsc.start(); binauralOsc.start();
}

function scheduleModeUpdate(state) {
    let tDelta = state.targetSyncTime - serverTimeOffset - Date.now();
    if (tDelta < 0) tDelta = 0;
    const t = audioCtx.currentTime + (tDelta / 1000) + 0.1;
    const targetFreq = currentV.f_base * currentV.harmonic_ratio;
    
    baseOsc.frequency.setTargetAtTime(targetFreq, t, 2.0);
    binauralOsc.frequency.setTargetAtTime(targetFreq + currentV.binaural_offset, t, 2.0);
    if(noiseNode) noiseNode.parameters.get('alpha').setTargetAtTime(currentV.alpha_noise, t, 2.0);
}

// ==========================================
// CORE 2: MEDIA THEATER (Phase 3 - M/S & Limiters)
// ==========================================
async function initMediaEngine() {
    // 1. Hardware Profiling Crossover
    const isPhone = window.innerWidth < 768;
    const crossover = audioCtx.createBiquadFilter();
    if (isPhone) {
        crossover.type = "highpass";
        crossover.frequency.value = 150; // Protect phone speakers
        crossover.Q.value = 0.707; // Butterworth
    } else {
        crossover.type = "allpass"; // Let subs through
    }

    // 2. Brickwall Limiter
    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = -1.0; limiter.knee.value = 0.0; limiter.ratio.value = 20.0;
    limiter.attack.value = 0.002; limiter.release.value = 0.100;
    
    crossover.connect(limiter);
    limiter.connect(audioCtx.destination);

    // 3. Setup M/S Node Graph (waiting for source)
    window.theaterDest = crossover;
    document.getElementById('status-text').innerText = "Theater Active. Waiting for Admin Play.";
}

function scheduleMediaPlayback(targetSyncTimeMs) {
    if (!mediaBuffer || !audioCtx) return;
    
    let tDelta = targetSyncTimeMs - serverTimeOffset - Date.now();
    if (tDelta < 0) tDelta = 0; // If late, play immediately
    const executionTime = audioCtx.currentTime + (tDelta / 1000);

    if (mediaSource) mediaSource.stop();
    mediaSource = audioCtx.createBufferSource();
    mediaSource.buffer = mediaBuffer;

    // --- M/S Phase Extraction Matrix ---
    const splitter = audioCtx.createChannelSplitter(2);
    mediaSource.connect(splitter);

    const midMix = audioCtx.createGain(); midMix.gain.value = 0.5; // (L+R)/2
    splitter.connect(midMix, 0); splitter.connect(midMix, 1);

    const sideMix = audioCtx.createGain(); sideMix.gain.value = 0.5; // (L-R)/2
    const invertGain = audioCtx.createGain(); invertGain.gain.value = -1.0;
    splitter.connect(sideMix, 0); 
    splitter.connect(invertGain, 1); invertGain.connect(sideMix);

    // Dynamic mix based on physical geometry
    const mixRatio = Math.abs(Math.cos(baseNodeAngle)); // 0 rad = 1 (Mid). PI/2 rad = 0 (Side)
    const finalMix = audioCtx.createGain();
    
    const applyMid = audioCtx.createGain(); applyMid.gain.value = mixRatio;
    const applySide = audioCtx.createGain(); applySide.gain.value = 1.0 - mixRatio;
    
    midMix.connect(applyMid); applyMid.connect(finalMix);
    sideMix.connect(applySide); applySide.connect(finalMix);
    
    finalMix.connect(window.theaterDest); // Route to crossover & limiter
    
    mediaSource.start(executionTime);
    console.log(`[Media] Scheduled at ${executionTime}`);
}

// ==========================================
// VISUAL ENGINE (Canvas)
// ==========================================
const canvas = document.getElementById('visual-engine');
const ctx = canvas.getContext('2d');
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
canvas.width = window.innerWidth; canvas.height = window.innerHeight;

document.body.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
});

function drawDaydream() {
    ctx.fillStyle = 'rgba(2, 2, 5, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (isAudioActive && audioCtx) {
        const time = audioCtx.currentTime;
        const baseRadius = Math.min(canvas.width, canvas.height) * 0.5;
        
        if (activeCore === 'mode') {
            currentAngleRads = baseNodeAngle + (currentV.orbital_velocity * time);
            if (panner3D) {
                panner3D.positionX.setValueAtTime(2 * Math.cos(currentAngleRads), time);
                panner3D.positionZ.setValueAtTime(2 * Math.sin(currentAngleRads), time);
            }
            
            let breathHz = 1.0 / (currentV.T_breath || 10);
            const breath = Math.sin(time * 2 * Math.PI * breathHz);
            if(breathingFilter) breathingFilter.gain.setValueAtTime(0.75 + 0.25 * breath, time); // Amplitude mod fix

            // Sub-harmonic aliasing fix
            const visualVib = Math.sin(time * 2 * Math.PI * (currentV.f_base / 300)) * (1.5 + breath * 0.5);

            ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(currentAngleRads + time * 0.05);

            // HSL to RGB fix
            ctx.strokeStyle = `hsl(${currentV.phi_color}, 70%, 50%)`;
            for (let layer = 0; layer < 3; layer++) {
                ctx.beginPath();
                for (let i = 0; i <= Math.PI * 2 + 0.1; i += 0.1) {
                    const dist = Math.sin(i * (3 + layer) + time * 0.5) * (baseRadius * 0.15);
                    const r = baseRadius + dist + visualVib;
                    if (i === 0) ctx.moveTo(Math.cos(i) * r, Math.sin(i) * r); else ctx.lineTo(Math.cos(i) * r, Math.sin(i) * r);
                }
                ctx.closePath(); ctx.stroke();
            }
            ctx.restore();
        } else if (activeCore === 'media') {
            // Theater Visuals
            ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.beginPath();
            ctx.arc(0, 0, baseRadius * 0.8 * (0.9 + 0.1 * Math.sin(time * 2)), 0, Math.PI * 2);
            ctx.strokeStyle = '#43e8d8'; ctx.lineWidth = 2; ctx.stroke();
            ctx.restore();
        }
    }
    requestAnimationFrame(drawDaydream);
}

document.getElementById('start-btn').addEventListener('click', () => {
    if (isAudioActive) stopEngine();
    else initEngine();
});

window.onload = () => { initNetwork(); drawDaydream(); };
