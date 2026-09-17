// =============================================================================
// HealingNodes — Client Node Engine (app.js)
// Pure Web Audio API + Canvas — zero external audio frameworks
// =============================================================================

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let socket;
let isAudioActive = false;
let wakeLock = null;

// Web Audio nodes
let audioCtx        = null;
let masterGain      = null;   // master amplitude (also breathes)
let breathGain      = null;   // LFO-driven amplitude breath
let panner3D        = null;   // spatial node (HRTF, inverse-square)

// Oscillator chain
let baseOsc         = null;   // primary tone at f_base × harmonic_ratio
let binauralOscL    = null;   // binaural left  channel (f_local)
let binauralOscR    = null;   // binaural right channel (f_local + binaural_offset)
let binauralMerger  = null;   // ChannelMergerNode for L/R hard-pan

// Noise chain
let noiseWorklet    = null;   // AudioWorkletNode (SpectralNoiseProcessor)
let noiseGain       = null;   // noise level control
let noiseFilter     = null;   // anti-aliasing lowpass on noise

// Environmental state vector V
let currentV = {
    f_base:          33,
    T_breath:        10,
    alpha_noise:     1.0,
    phi_color:       200,
    harmonic_ratio:  1.5,
    orbital_velocity: 0,
    binaural_offset: 0
};
let baseNodeAngle  = 0;
let currentAngle   = 0;

// NTP sync
let timeOffsets    = [];
let serverTimeOffset = 0;

// ---------------------------------------------------------------------------
// AudioWorklet Processor — Spectral Noise (Pink ↔ Brown blend)
//
// FIXED: The original code reused b6 as both the pink noise accumulator
// (b6 = white * 0.115926) AND the brown noise integrator (b6 *= 0.95),
// corrupting both signals. Brown noise now has its own separate state variable.
//
// Pink noise: Voss-McCartney 7-term IIR cascade → -3 dB/octave (α = 1)
// Brown noise: first-order integrator y[n] = 0.95·y[n-1] + 0.05·x[n] → -6 dB/oct (α = 2)
// Blend:  out = pink·(1−t) + brown·t,  t = clamp(alpha−1, 0, 1)
// ---------------------------------------------------------------------------
const WORKLET_CODE = `
class SpectralNoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Pink noise IIR state (Voss-McCartney)
        this.p0 = 0; this.p1 = 0; this.p2 = 0;
        this.p3 = 0; this.p4 = 0; this.p5 = 0; this.p6 = 0;
        // Brown noise integrator state (separate from pink)
        this.brown = 0;
    }

    static get parameterDescriptors() {
        return [{ name: 'alpha', defaultValue: 1, minValue: 0, maxValue: 3 }];
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const alpha  = parameters.alpha[0];  // k-rate

        // Blend factor: 0 → full pink (α=1), 1 → full brown (α=2), >1 → red territory
        const blend = Math.max(0, Math.min(1, alpha - 1));

        for (let ch = 0; ch < output.length; ch++) {
            const out = output[ch];
            for (let i = 0; i < out.length; i++) {
                const w = Math.random() * 2 - 1;

                // Pink noise — Voss-McCartney cascaded IIR
                this.p0 = 0.99886 * this.p0 + w * 0.0555179;
                this.p1 = 0.99332 * this.p1 + w * 0.0750759;
                this.p2 = 0.96900 * this.p2 + w * 0.1538520;
                this.p3 = 0.86650 * this.p3 + w * 0.3104856;
                this.p4 = 0.55000 * this.p4 + w * 0.5329522;
                this.p5 = -0.7616 * this.p5 - w * 0.0168980;
                this.p6 = w * 0.115926;
                const pink = (this.p0 + this.p1 + this.p2 + this.p3 +
                              this.p4 + this.p5 + this.p6 + w * 0.5362) * 0.11;

                // Brown noise — leaky integrator (separate state: this.brown)
                this.brown = this.brown * 0.99 + w * 0.01;
                const brown = this.brown * 3.5;

                out[i] = pink * (1 - blend) + brown * blend;
            }
        }
        return true;
    }
}
registerProcessor('spectral-noise', SpectralNoiseProcessor);
`;

// ---------------------------------------------------------------------------
// Wake Lock
// ---------------------------------------------------------------------------
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.warn(`WakeLock: ${err.name} — ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Network + NTP Clock Sync
// ---------------------------------------------------------------------------
function initNetwork() {
    socket = io();

    socket.on('connect', () => {
        document.getElementById('status-text').innerText = 'Connected. Synchronizing clock...';
        socket.emit('register', 'client');
        // Fire 10 ping/pongs to estimate median RTT offset
        socket.emit('sync_ping', Date.now());
    });

    socket.on('sync_pong', (data) => {
        const rtt    = Date.now() - data.clientTime;
        const offset = data.serverTime - data.clientTime - rtt / 2;
        timeOffsets.push(offset);

        if (timeOffsets.length < 10) {
            setTimeout(() => socket.emit('sync_ping', Date.now()), 80);
        } else {
            // Median filter — robust against outliers
            const sorted = [...timeOffsets].sort((a, b) => a - b);
            serverTimeOffset = sorted[Math.floor(sorted.length / 2)];
            document.getElementById('status-text').innerText =
                `Synchronized (RTT ${rtt}ms). Tap to enter.`;
        }
    });

    socket.on('audio_state_update', (state) => {
        baseNodeAngle = state.baseAngleRads;   // θᵢ = 2π·i/N
        if (state.v) currentV = state.v;
        if (isAudioActive && audioCtx) scheduleAudioUpdate(state);
    });

    socket.on('disconnect', () => {
        document.getElementById('status-text').innerText = 'Disconnected. Reconnecting...';
    });
}

// ---------------------------------------------------------------------------
// Audio Engine Init
//
// Correct signal graph (fixed from original):
//
//  baseOsc ──────────────────────────────────────────┐
//                                                     ▼
//  noiseWorklet → noiseFilter → noiseGain ─────► panner3D → breathGain → masterGain → destination
//                                                     ▲
//  binauralOscL ─► merger[0] ─► binauralSplitter ───┘  (L channel only → panner)
//  binauralOscR ─► merger[1] ─► (R channel only → separate gain → masterGain)
//
// Binaural hard-pan: L ear hears f_local, R ear hears f_local + binaural_offset.
// The beat frequency = binaural_offset induces the target brainwave entrainment.
// ---------------------------------------------------------------------------
async function initAudio() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();

        // ── Master chain ──
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.6;
        masterGain.connect(audioCtx.destination);

        breathGain = audioCtx.createGain();
        breathGain.gain.value = 1.0;  // will be animated by drawDaydream RAF loop
        breathGain.connect(masterGain);

        // ── Spatial panner ──
        // Inverse-square law: intensity ∝ 1/r² i.e. A = 4πr² (THEORY.md §2)
        panner3D = audioCtx.createPanner();
        panner3D.panningModel   = 'HRTF';
        panner3D.distanceModel  = 'inverse';
        panner3D.refDistance    = 1;    // 1 metre reference
        panner3D.maxDistance    = 20;
        panner3D.rolloffFactor  = 1;    // matches 1/r² (inverse-square)
        panner3D.coneInnerAngle = 360;  // omnidirectional source
        panner3D.positionX.value = 1;
        panner3D.positionY.value = 0;
        panner3D.positionZ.value = 0;
        panner3D.connect(breathGain);

        // ── Base oscillator → panner ──
        baseOsc = audioCtx.createOscillator();
        baseOsc.type = 'sine';
        const initialFreq = currentV.f_base * currentV.harmonic_ratio;
        baseOsc.frequency.value = initialFreq;

        const oscGain = audioCtx.createGain();
        oscGain.gain.value = 0.35;
        baseOsc.connect(oscGain);
        oscGain.connect(panner3D);

        // ── Binaural stereo pair (hard L/R pan) ──
        // L and R must be on separate channels routed directly to destination,
        // NOT through the spatial panner (which would destroy the inter-aural difference).
        binauralOscL = audioCtx.createOscillator();
        binauralOscR = audioCtx.createOscillator();
        binauralOscL.type = 'sine';
        binauralOscR.type = 'sine';
        binauralOscL.frequency.value = initialFreq;
        binauralOscR.frequency.value = initialFreq + currentV.binaural_offset;

        binauralMerger = audioCtx.createChannelMerger(2);
        const binGainL = audioCtx.createGain();
        const binGainR = audioCtx.createGain();
        binGainL.gain.value = 0.0;  // starts silent, enabled when binaural_offset > 0
        binGainR.gain.value = 0.0;

        // L oscillator → left channel of merger
        binauralOscL.connect(binGainL);
        binGainL.connect(binauralMerger, 0, 0);
        // R oscillator → right channel of merger
        binauralOscR.connect(binGainR);
        binGainR.connect(binauralMerger, 0, 1);
        // Merged stereo → masterGain (bypasses panner to preserve L/R difference)
        binauralMerger.connect(masterGain);

        // ── Spectral Noise → lowpass → noiseGain → panner ──
        noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 2000;  // High-cut: keeps noise sub-sonic warm
        noiseFilter.Q.value = 0.707;

        noiseGain = audioCtx.createGain();
        noiseGain.gain.value = 0.55;

        try {
            const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            await audioCtx.audioWorklet.addModule(blobUrl);
            noiseWorklet = new AudioWorkletNode(audioCtx, 'spectral-noise');
            noiseWorklet.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(panner3D);
            URL.revokeObjectURL(blobUrl);
        } catch (workletErr) {
            console.warn('[AudioWorklet] Fallback: no noise (unsupported).', workletErr);
            noiseWorklet = null;
        }

        // ── Start all oscillators ──
        const t0 = audioCtx.currentTime + 0.05;
        baseOsc.start(t0);
        binauralOscL.start(t0);
        binauralOscR.start(t0);

        isAudioActive = true;
        document.getElementById('status-text').innerText = 'Audio Active — Phase 2 Vector Engine.';
        document.getElementById('start-btn').innerText   = 'Stop Engine';

        // Store binaural gain refs for later modulation
        audioCtx._binGainL = binGainL;
        audioCtx._binGainR = binGainR;

        await requestWakeLock();
    } catch (err) {
        console.error('[Audio Init Error]', err);
        document.getElementById('status-text').innerText = `Init Error: ${err.message}`;
        document.getElementById('ui-container').classList.remove('fade-out');
    }
}

function stopAudio() {
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
    panner3D = breathGain = masterGain = null;
    baseOsc = binauralOscL = binauralOscR = noiseWorklet = null;
    isAudioActive = false;
    document.getElementById('status-text').innerText = 'Engine Stopped.';
    document.getElementById('start-btn').innerText   = 'Enter Daydream';
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

// ---------------------------------------------------------------------------
// Scheduled Audio Parameter Update
// Uses Web Audio API time-scheduling (NOT setTimeout) to apply
// parameter changes at a precise future AudioContext timestamp.
// ---------------------------------------------------------------------------
function scheduleAudioUpdate(state) {
    if (!audioCtx || !isAudioActive) return;

    // Convert server sync-time to local AudioContext time
    const localTargetMs = state.targetSyncTime - serverTimeOffset;
    const msFromNow     = Math.max(0, localTargetMs - Date.now());
    const t             = audioCtx.currentTime + (msFromNow / 1000) + 0.05;

    const v    = currentV;
    const freq = v.f_base * v.harmonic_ratio;

    // Exponential ramp: perceptually linear, no click artifacts
    try {
        // Ensure no scheduled automation conflicts before ramp
        baseOsc.frequency.cancelScheduledValues(t);
        baseOsc.frequency.setTargetAtTime(freq, t, 2.0);

        binauralOscL.frequency.cancelScheduledValues(t);
        binauralOscL.frequency.setTargetAtTime(freq, t, 2.0);

        binauralOscR.frequency.cancelScheduledValues(t);
        binauralOscR.frequency.setTargetAtTime(freq + v.binaural_offset, t, 2.0);

        // Enable/disable binaural pair based on offset
        const binActive = v.binaural_offset > 0 ? 0.15 : 0.0;
        if (audioCtx._binGainL) {
            audioCtx._binGainL.gain.setTargetAtTime(binActive, t, 1.0);
            audioCtx._binGainR.gain.setTargetAtTime(binActive, t, 1.0);
        }

        // Spectral noise alpha parameter
        if (noiseWorklet) {
            const alphaParam = noiseWorklet.parameters.get('alpha');
            alphaParam.cancelScheduledValues(t);
            alphaParam.setTargetAtTime(v.alpha_noise, t, 3.0);
        }
    } catch (e) {
        console.warn('[Audio schedule skipped]', e.message);
    }
}

// ---------------------------------------------------------------------------
// Canvas Visual Engine — Liquid Fluid Daydream
//
// FIXED color system: phi_color is a hue angle (0–360°).
// Previously it was misused as a radian offset in Math.sin(), producing
// meaningless arbitrary RGB values with no connection to the intended hue.
//
// Correct: convert HSL(phi_color, saturation, lightness) to RGB using the
// standard hsl-to-rgb formula and modulate saturation/lightness with breath.
//
// FIXED vibration aliasing: the original drew Math.sin(time * 2π * 33Hz)
// on a 60fps canvas — 33Hz oscillates 33 full cycles per second but canvas
// only samples at 60fps, causing complete aliasing (no visible wave).
// Fix: use a slow sub-harmonic (0.1 × f_base Hz) for visible visual pulsation.
// ---------------------------------------------------------------------------
const canvas = document.getElementById('visual-engine');
const ctx2d  = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

document.body.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
});

// HSL to RGB conversion
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if      (h <  60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255)
    ];
}

function drawDaydream() {
    const W = canvas.width;
    const H = canvas.height;

    // Trailing fade — persistence gives liquid comet-trail effect
    ctx2d.fillStyle = 'rgba(2, 2, 8, 0.12)';
    ctx2d.fillRect(0, 0, W, H);

    if (isAudioActive && audioCtx) {
        const time = audioCtx.currentTime;

        // ── Breathing LFO ──
        // ω_breath = 2π / T_breath  (angular frequency of the breath cycle)
        const omegaBreath = (2 * Math.PI) / (currentV.T_breath || 10);
        const breath      = Math.sin(time * omegaBreath);   // [-1, 1]
        const breathNorm  = (breath + 1) / 2;               // [0, 1]

        // Apply breath to audio masterGain (actual audible amplitude breathing)
        if (breathGain) {
            const breathAmp = 0.75 + breathNorm * 0.25;     // oscillates 0.75–1.0
            breathGain.gain.setValueAtTime(breathAmp, time);
        }

        // ── Spatial orbit: θ(t) = θ_base + ω_orbit · t  (per THEORY.md §2) ──
        currentAngle = baseNodeAngle + (currentV.orbital_velocity * time);

        if (panner3D) {
            // Project onto XZ plane (horizontal orbital plane around listener)
            // Using inverse-square model: intensity = 1/r², r fixed at refDistance=1
            const r = 2.5;  // metres from listener
            panner3D.positionX.setValueAtTime(r * Math.cos(currentAngle), time);
            panner3D.positionZ.setValueAtTime(r * Math.sin(currentAngle), time);
            panner3D.positionY.setValueAtTime(0, time);
        }

        // ── Color from phi_color (HSL hue angle, correct) ──
        // Hue drifts slowly with orbital angle for visual spatial cue
        const hue = (currentV.phi_color + (currentAngle * 180 / Math.PI * 0.3)) % 360;
        const sat = 0.55 + breathNorm * 0.25;    // 55–80% saturation
        const lit = 0.35 + breathNorm * 0.15;    // 35–50% lightness

        const [rC, gC, bC] = hslToRgb(hue, sat, lit);

        // ── Sub-harmonic pulsation for visual (NOT f_base direct — aliased) ──
        // Use f_base / 300 to get a slow visible oscillation (~0.11 Hz at 33Hz)
        const visualFreq   = currentV.f_base / 300;
        const visualPulse  = Math.sin(time * 2 * Math.PI * visualFreq);

        const baseRadius   = Math.min(W, H) * 0.35;
        const pulseRadius  = baseRadius + visualPulse * baseRadius * 0.08
                           + breath * baseRadius * 0.06;

        ctx2d.save();
        ctx2d.translate(W / 2, H / 2);
        // Slow rotation tied to orbital velocity and time
        ctx2d.rotate(currentAngle + time * 0.025);

        // ── Multi-layer fluid geometry ──
        // 3 layers with offset frequency and phase; each represents a
        // different spatial harmonic of the mesh (per harmonic_ratio)
        const LAYERS = 3;
        for (let layer = 0; layer < LAYERS; layer++) {
            // Each layer uses a harmonic of the visual frequency
            const layerFreqMult = 1 + layer * (currentV.harmonic_ratio - 1) * 0.4;
            const layerPhase    = (2 * Math.PI * layer) / LAYERS;  // 2π/N separation
            const layerOpacity  = 0.5 - layer * 0.12;

            ctx2d.beginPath();
            const STEPS = 128;
            for (let k = 0; k <= STEPS; k++) {
                const theta = (k / STEPS) * 2 * Math.PI;

                // Multi-harmonic distortion — organic fluid boundary
                const d1 = Math.sin(theta * (3 + layer) * layerFreqMult + time * (0.4 + layer * 0.15) + layerPhase)
                           * (baseRadius * 0.14);
                const d2 = Math.cos(theta * (2 + layer) * layerFreqMult - time * (0.25 + layer * 0.08) + layerPhase)
                           * (baseRadius * 0.09);
                // Binaural offset creates a visible ripple frequency at beat rate
                const d3 = Math.sin(theta + time * currentV.binaural_offset * 0.5)
                           * (baseRadius * 0.04 * (currentV.binaural_offset > 0 ? 1 : 0));

                const r = pulseRadius + d1 + d2 + d3;
                const x = Math.cos(theta) * r;
                const y = Math.sin(theta) * r;
                if (k === 0) ctx2d.moveTo(x, y);
                else ctx2d.lineTo(x, y);
            }
            ctx2d.closePath();

            // Radial gradient from transparent core to hue-colored edge
            const grad = ctx2d.createRadialGradient(0, 0, 0, 0, 0, pulseRadius * 1.4);
            grad.addColorStop(0,   `rgba(${rC}, ${gC}, ${bC}, 0.0)`);
            grad.addColorStop(0.7, `rgba(${rC}, ${gC}, ${bC}, ${layerOpacity * 0.5})`);
            grad.addColorStop(1,   `rgba(${rC}, ${gC}, ${bC}, 0.0)`);
            ctx2d.fillStyle = grad;
            ctx2d.fill();

            ctx2d.strokeStyle = `rgba(${rC}, ${gC}, ${bC}, ${layerOpacity})`;
            ctx2d.lineWidth   = 1.2 - layer * 0.3;
            ctx2d.stroke();
        }

        // ── Central glow — marks the listener position ──
        const glowR = 4 + breathNorm * 6;
        const glowGrad = ctx2d.createRadialGradient(0, 0, 0, 0, 0, glowR * 4);
        glowGrad.addColorStop(0,   `rgba(${rC}, ${gC}, ${bC}, 0.9)`);
        glowGrad.addColorStop(0.5, `rgba(${rC}, ${gC}, ${bC}, 0.2)`);
        glowGrad.addColorStop(1,   `rgba(${rC}, ${gC}, ${bC}, 0.0)`);
        ctx2d.beginPath();
        ctx2d.arc(0, 0, glowR * 4, 0, 2 * Math.PI);
        ctx2d.fillStyle = glowGrad;
        ctx2d.fill();

        ctx2d.restore();
    }

    requestAnimationFrame(drawDaydream);
}

// ---------------------------------------------------------------------------
// UI Controls
// ---------------------------------------------------------------------------
document.getElementById('start-btn').addEventListener('click', () => {
    if (isAudioActive) {
        stopAudio();
        document.getElementById('ui-container').classList.remove('fade-out');
    } else {
        initAudio().then(() => {
            if (isAudioActive) {
                document.getElementById('ui-container').classList.add('fade-out');
            }
        });
    }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
window.onload = () => {
    initNetwork();
    drawDaydream();
};
