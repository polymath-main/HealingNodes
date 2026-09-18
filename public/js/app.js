const fabMain = document.getElementById('fab-main');
const fabMenu = document.getElementById('fab-menu');
const btnHost = document.getElementById('btn-host');
const btnJoin = document.getElementById('btn-join');
const autoplayOverlay = document.getElementById('autoplay-overlay');
const webrtcAudio = document.getElementById('webrtc-audio');

let audioCtx = null;
let peerConnection = null;
let signalingSocket = null;
let masterOscillator = null;
let pinkNoiseNode = null;
let currentMode = '33'; // Default to 33 Hz from THEORY.md

const btnMode = document.getElementById('btn-mode');
const modeOverlay = document.getElementById('mode-overlay');
const closeModeBtn = document.getElementById('close-mode');
const modeSelectBtns = document.querySelectorAll('.mode-select');

// Phase 4: FAB Toggle
fabMain.addEventListener('click', () => {
    fabMenu.classList.toggle('hidden');
});

function createPinkNoise() {
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds of noise
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
        let white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11; // scale down
        b6 = white * 0.115926;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    return noise;
}

// Phase 4: Mathematical Environments UI Logic
btnMode.addEventListener('click', () => {
    fabMenu.classList.add('hidden');
    modeOverlay.classList.remove('hidden');
});
closeModeBtn.addEventListener('click', () => {
    modeOverlay.classList.add('hidden');
});
modeSelectBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        currentMode = e.target.getAttribute('data-mode');
        console.log(`[Mode Engine] Switched mathematical environment to: ${currentMode}`);
        
        if (currentMode === '33') {
            visualIntensity = 1.0;
            if (pinkNoiseNode) { pinkNoiseNode.stop(); pinkNoiseNode = null; }
            if (masterOscillator) {
                masterOscillator.frequency.setTargetAtTime(33, audioCtx.currentTime, 0.1);
            }
        } else if (currentMode === 'pink') {
            visualIntensity = 0.5; // Calmer, slower visuals
            if (masterOscillator) { masterOscillator.frequency.setTargetAtTime(0.01, audioCtx.currentTime, 0.1); } // mute osc
            if (!pinkNoiseNode && analyser) {
                pinkNoiseNode = createPinkNoise();
                pinkNoiseNode.connect(analyser);
                pinkNoiseNode.start();
            }
        } else if (currentMode === 'inverse') {
            visualIntensity = 0.2; // Dimmed, phase-canceled state
            if (pinkNoiseNode) { pinkNoiseNode.stop(); pinkNoiseNode = null; }
            if (masterOscillator) {
                masterOscillator.frequency.setTargetAtTime(16.5, audioCtx.currentTime, 0.1); // Sub-harmonic inversion
            }
        }
        modeOverlay.classList.add('hidden');
    });
});

// Phase 5: WebRTC Autoplay Bypass (Strategy B)
async function unlockAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        console.log("[Audio] AudioContext permanently unlocked via user gesture.");
    }
}

function connectSignaling() {
    // Assuming the Rust server is running on the same host, port 3000
    const wsUrl = `ws://${window.location.hostname}:3000/ws`;
    signalingSocket = new WebSocket(wsUrl);
    signalingSocket.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (!peerConnection) return;

        if (msg.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(msg));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            signalingSocket.send(JSON.stringify(peerConnection.localDescription));
        } else if (msg.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(msg));
        } else if (msg.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(msg));
        }
    };
}

btnHost.addEventListener('click', async () => {
    await unlockAudio();
    connectSignaling();
    
    peerConnection = new RTCPeerConnection();
    peerConnection.onicecandidate = (e) => {
        if (e.candidate && signalingSocket.readyState === WebSocket.OPEN) {
            signalingSocket.send(JSON.stringify(e.candidate));
        }
    };

    // Phase 5: Host generates Master Audio Stream
    const dest = audioCtx.createMediaStreamDestination();
    
    // Wire up the Analyser for the GPU Shaders
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    masterOscillator = audioCtx.createOscillator();
    masterOscillator.frequency.value = 33; // Core Theory Baseline
    
    masterOscillator.connect(analyser);
    analyser.connect(dest);
    analyser.connect(audioCtx.destination); // Play on local speakers!
    masterOscillator.start();
    
    if (currentMode === 'pink') {
        masterOscillator.frequency.value = 0.01;
        pinkNoiseNode = createPinkNoise();
        pinkNoiseNode.connect(analyser);
        pinkNoiseNode.start();
    } else if (currentMode === 'inverse') {
        masterOscillator.frequency.value = 16.5;
    }

    // Broadcast the stream
    dest.stream.getTracks().forEach(track => peerConnection.addTrack(track, dest.stream));
    
    // Create offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    // Send offer once socket opens
    signalingSocket.onopen = () => signalingSocket.send(JSON.stringify(peerConnection.localDescription));
    
    fabMenu.classList.add('hidden');
    console.log("[WebRTC] Hosting Mode Engine Stream.");
});

btnJoin.addEventListener('click', async () => {
    await unlockAudio();
    connectSignaling();

    peerConnection = new RTCPeerConnection();
    peerConnection.onicecandidate = (e) => {
        if (e.candidate && signalingSocket.readyState === WebSocket.OPEN) {
            signalingSocket.send(JSON.stringify(e.candidate));
        }
    };

    // Phase 5: AirPods Topology (Dumb Receiver)
    peerConnection.ontrack = (event) => {
        console.log("[WebRTC] Track received.");
        webrtcAudio.srcObject = event.streams[0];
        webrtcAudio.play().catch(err => {
            if (err.name === 'NotAllowedError') {
                console.warn("[Autoplay] Blocked by Low Power Mode. Showing UI.");
                autoplayOverlay.classList.remove('hidden');
            }
        });
    };

    fabMenu.classList.add('hidden');
    console.log("[WebRTC] Listening for Host Stream.");
});

autoplayOverlay.addEventListener('click', () => {
    webrtcAudio.play();
    autoplayOverlay.classList.add('hidden');
});

// Phase 5: WebGL Fluid Boilerplate & Audio Reactive Uniforms
const canvas = document.getElementById('webgl-canvas');
const gl = canvas.getContext('webgl2');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height); // INITIALIZE VIEWPORT

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
});

// GLSL Shaders
const vsSource = `
    attribute vec4 aVertexPosition;
    void main() { gl_Position = aVertexPosition; }
`;

const fsSource = `
    precision highp float;
    uniform float uTime;
    uniform float uAudioBass;
    uniform float uAudioMid;
    uniform float uIntensity;
    uniform vec2 uResolution;

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        uv = uv * 2.0 - 1.0;
        uv.x *= uResolution.x / uResolution.y;

        float d = length(uv);
        
        // Liquid fluid math modulated by audio frequencies and visual intensity
        float liquid = sin(d * (8.0 - uAudioBass*2.0) - uTime * (2.0 * uIntensity) + uAudioBass * 5.0) * 0.5 + 0.5;
        float ring = smoothstep(0.4, 0.45, liquid) - smoothstep(0.45, 0.5, liquid);
        
        vec3 color = vec3(0.05, 0.3, 0.6) * liquid + vec3(0.2, 0.9, 0.8) * ring * (uAudioMid + 0.2);
        gl_FragColor = vec4(color * uIntensity, 1.0);
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const shaderProgram = gl.createProgram();
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
gl.linkProgram(shaderProgram);
gl.useProgram(shaderProgram);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const positionLocation = gl.getAttribLocation(shaderProgram, "aVertexPosition");
gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

const uTimeLoc = gl.getUniformLocation(shaderProgram, "uTime");
const uResolutionLoc = gl.getUniformLocation(shaderProgram, "uResolution");
const uAudioBassLoc = gl.getUniformLocation(shaderProgram, "uAudioBass");
const uAudioMidLoc = gl.getUniformLocation(shaderProgram, "uAudioMid");
const uIntensityLoc = gl.getUniformLocation(shaderProgram, "uIntensity");

// Global Audio Analyser
let analyser = null;
let dataArray = null;
let visualIntensity = 1.0; // Controlled by Presets

function render(time) {
    gl.uniform1f(uTimeLoc, time * 0.001);
    gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
    gl.uniform1f(uIntensityLoc, visualIntensity);

    let bassAvg = 0, midAvg = 0;
    if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        // Extract Bass (0-100Hz approx) and Mids
        for(let i=0; i<5; i++) bassAvg += dataArray[i];
        for(let i=10; i<30; i++) midAvg += dataArray[i];
        bassAvg = (bassAvg / 5) / 255.0;
        midAvg = (midAvg / 20) / 255.0;
    }

    gl.uniform1f(uAudioBassLoc, bassAvg);
    gl.uniform1f(uAudioMidLoc, midAvg);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
}
requestAnimationFrame(render);

// (Future) WASM DSP Import Stub
// import init, { LinkwitzRiley4 } from '../dsp-wasm/pkg/dsp_wasm.js';
// async function initWasm() { await init(); console.log("WASM DSP Loaded"); }

