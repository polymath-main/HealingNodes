import { NtpClient } from './ntpClient.js';
import { DecoderPipeline } from './decoderPipeline.js';
import { JitterBuffer } from './jitterBuffer.js';

let audioContext;

function initClient(ipAddress) {
  const wsUrl = `ws://${ipAddress}:8080`;
  const ws = new WebSocket(wsUrl);
  const statusText = document.getElementById('status-text');
  
  statusText.innerText = `Connecting to ${wsUrl}...`;

  ws.onopen = () => {
    statusText.innerText = "Connected! Receiving audio stream...";
    statusText.style.color = "#4CAF50";
    const ntpClient = new NtpClient(ws);
    ntpClient.startSync();

    const decoderPipeline = new DecoderPipeline(audioContext);
    const jitterBuffer = new JitterBuffer(audioContext, ntpClient);

    decoderPipeline.onDecodedAudio = (audioData) => {
      jitterBuffer.schedulePlayback(audioData);
    };

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'audio_chunk') {
          decoderPipeline.decodeChunk(data.payload);
        }
      } catch (e) {
        // Ignore non-JSON
      }
    });
  };

  ws.onerror = () => {
    statusText.innerText = "Connection Failed. Check IP address.";
    statusText.style.color = "#f44336";
  };
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('connect-btn');
  const input = document.getElementById('ip-input');
  
  btn.addEventListener('click', () => {
    // Resume audio context on first user interaction
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    if (input.value.trim() !== "") {
      initClient(input.value.trim());
    }
  });
});
