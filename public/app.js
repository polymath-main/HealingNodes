let socket;
let isAudioActive = false;
let wakeLock = null;

let audioCtx;
let masterGain, panner3D, breathingFilter;
let baseOsc, binauralOsc;
let noiseNode; 

let currentV = { f_base: 33, T_breath: 10, alpha_noise: 1, phi_color: 200, harmonic_ratio: 1.5, orbital_velocity: 0, binaural_offset: 0 };
let currentAngleRads = 0;
let baseNodeAngle = 0;
let timeOffsets = [];
let serverTimeOffset = 0;

const workletCode = `
class SpectralNoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.b0=0; this.b1=0; this.b2=0; this.b3=0; this.b4=0; this.b5=0; this.b6=0;
    }
    static get parameterDescriptors() {
        return [{ name: 'alpha', defaultValue: 1, minValue: 0, maxValue: 3 }];
    }
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const alpha = parameters.alpha[0]; 
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
                let brown = (this.b6 * 3.5); 
                let blend = Math.max(0, Math.min(1, alpha - 1));
                outChannel[i] = pink * (1 - blend) + brown * blend;
            }
        }
        return true;
    }
}
registerProcessor('spectral-noise', SpectralNoiseProcessor);
`;

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
    }
}

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
        if (timeOffsets.length < 10) {
            setTimeout(() => socket.emit('sync_ping', Date.now()), 100);
        } else {
            timeOffsets.sort((a,b) => a-b);
            serverTimeOffset = timeOffsets[Math.floor(10/2)];
            document.getElementById('status-text').innerText = "Synchronized. Awaiting Initialization.";
        }
    });
    socket.on('audio_state_update', (state) => {
        baseNodeAngle = state.baseAngleRads;
        if(state.v) currentV = state.v;
        if (isAudioActive && audioCtx) scheduleAudioUpdate(state);
    });
}

async function initAudio() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.316;
        masterGain.connect(audioCtx.destination);
        
        panner3D = audioCtx.createPanner();
        panner3D.panningModel = "HRTF";
        panner3D.distanceModel = "inverse";
        panner3D.connect(masterGain);
        
        baseOsc = audioCtx.createOscillator();
        binauralOsc = audioCtx.createOscillator();
        
        const initialFreq = currentV.f_base * currentV.harmonic_ratio;
        baseOsc.frequency.value = initialFreq;
        binauralOsc.frequency.value = initialFreq + currentV.binaural_offset;
        
        baseOsc.connect(panner3D);
        binauralOsc.connect(panner3D);

        breathingFilter = audioCtx.createBiquadFilter();
        breathingFilter.type = "lowpass";
        breathingFilter.frequency.value = 400; 
        breathingFilter.connect(panner3D);

        try {
            if (audioCtx.audioWorklet) {
                const blob = new Blob([workletCode], { type: "application/javascript" });
                const url = URL.createObjectURL(blob);
                await audioCtx.audioWorklet.addModule(url);
                noiseNode = new AudioWorkletNode(audioCtx, 'spectral-noise');
                noiseNode.connect(breathingFilter);
            }
        } catch (workletErr) {
            console.warn('AudioWorklet failed/unsupported. Running Lite Mode.', workletErr);
            noiseNode = null;
        }

        const startTime = audioCtx.currentTime;
        baseOsc.start(startTime);
        binauralOsc.start(startTime);
        
        isAudioActive = true;
        document.getElementById('status-text').innerText = "Audio Active. Phase 2 Vector Engine Engaged.";
        document.getElementById('start-btn').innerText = "Stop Engine";
        
        requestWakeLock();
    } catch (err) {
        console.error("Fatal Audio Error:", err);
        document.getElementById('status-text').innerText = `Init Error: ${err.message}`;
        document.getElementById('ui-container').classList.remove('fade-out');
    }
}

function stopAudio() {
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    isAudioActive = false;
    document.getElementById('status-text').innerText = "Engine Stopped.";
    document.getElementById('start-btn').innerText = "Enter Daydream";
}

function scheduleAudioUpdate(state) {
    if (!audioCtx) return;
    const localTargetTimeMs = state.targetSyncTime - serverTimeOffset;
    let timeUntilChangeMs = localTargetTimeMs - Date.now();
    if (timeUntilChangeMs < 0) timeUntilChangeMs = 0; // Prevent skipped updates
    
    const t = audioCtx.currentTime + (timeUntilChangeMs / 1000) + 0.1;
    const targetFreq = currentV.f_base * currentV.harmonic_ratio;

    try {
        baseOsc.frequency.setTargetAtTime(targetFreq, t, 2.0);
        binauralOsc.frequency.setTargetAtTime(targetFreq + currentV.binaural_offset, t, 2.0);
        if(noiseNode) {
            noiseNode.parameters.get('alpha').setTargetAtTime(currentV.alpha_noise, t, 2.0);
        }
    } catch(e) { console.warn("Audio glide skipped:", e); }
}

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
        currentAngleRads = baseNodeAngle + (currentV.orbital_velocity * time);
        
        if (panner3D) {
            const radius = 2;
            panner3D.positionX.setValueAtTime(radius * Math.cos(currentAngleRads), time);
            panner3D.positionZ.setValueAtTime(radius * Math.sin(currentAngleRads), time);
        }

        let breathHz = 1.0 / (currentV.T_breath || 10);
        if(!isFinite(breathHz)) breathHz = 0.1;
        const breath = Math.sin(time * 2 * Math.PI * breathHz);
        
        if(breathingFilter) breathingFilter.frequency.setValueAtTime(400 + breath * 200, time);

        const vibration = Math.sin(time * 2 * Math.PI * currentV.f_base) * (1.5 + breath * 0.5);
        const baseRadius = Math.min(canvas.width, canvas.height) * 0.5;

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(currentAngleRads + time * 0.05);

        const rVal = Math.floor(Math.sin(currentAngleRads + currentV.phi_color) * 50 + 100);
        const gVal = Math.floor(Math.sin(currentAngleRads + currentV.phi_color + Math.PI/2) * 200 + 55);
        const bVal = Math.floor(Math.sin(currentAngleRads + currentV.phi_color + Math.PI) * 200 + 100);

        for (let layer = 0; layer < 3; layer++) {
            ctx.beginPath();
            for (let i = 0; i <= Math.PI * 2 + 0.1; i += 0.1) {
                const fluidDistortion = Math.sin(i * (3 + layer) + time * (0.5 + layer*0.2)) * (baseRadius * 0.15)
                                      + Math.cos(i * (2 + layer) - time * (0.3 + layer*0.1)) * (baseRadius * 0.1);
                
                const r = baseRadius + fluidDistortion + (breath * baseRadius * 0.1) + vibration;
                const x = Math.cos(i) * r;
                const y = Math.sin(i) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, baseRadius * 1.5);
            gradient.addColorStop(0, `rgba(${rVal}, ${gVal}, ${bVal}, 0.0)`);
            gradient.addColorStop(0.8, `rgba(${rVal}, ${gVal}, ${bVal}, ${0.1 - layer*0.02})`);
            gradient.addColorStop(1, `rgba(${rVal}, ${gVal}, ${bVal}, 0.0)`);
            
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.strokeStyle = `rgba(${rVal}, ${gVal}, ${bVal}, ${0.4 - layer*0.1})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    }
    requestAnimationFrame(drawDaydream);
}

document.getElementById('start-btn').addEventListener('click', () => {
    if (isAudioActive) {
        stopAudio();
        document.getElementById('ui-container').classList.remove('fade-out');
    } else {
        initAudio();
        document.getElementById('ui-container').classList.add('fade-out');
    }
});

window.onload = () => {
    initNetwork();
    drawDaydream();
};
