const fabMain = document.getElementById('fab-main');
const fabMenu = document.getElementById('fab-menu');
const btnHost = document.getElementById('btn-host');
const btnJoin = document.getElementById('btn-join');
const autoplayOverlay = document.getElementById('autoplay-overlay');
const webrtcAudio = document.getElementById('webrtc-audio');

let audioCtx = null;
let peerConnection = null;
let signalingSocket = null;

// Phase 4: FAB Toggle
fabMain.addEventListener('click', () => {
    fabMenu.classList.toggle('hidden');
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
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 432; // Mode Engine Example
    osc.connect(dest);
    osc.start();

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

// Phase 5: WebGL Fluid Boilerplate
const canvas = document.getElementById('webgl-canvas');
const gl = canvas.getContext('webgl2');
gl.clearColor(0.05, 0.05, 0.1, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);
// Real GLSL compilation is deferred to WASM link phase.
