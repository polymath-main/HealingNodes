import { NtpClient } from './ntpClient.js';
import { DecoderPipeline } from './decoderPipeline.js';
import { JitterBuffer } from './jitterBuffer.js';

async function initClient() {
  const wsUrl = `ws://${window.location.hostname}:8080`;
  const ws = new WebSocket(wsUrl);
  const ntpClient = new NtpClient(ws);
  ntpClient.startSync();

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  document.body.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
      console.log('AudioContext resumed.');
    }
  });

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

  console.log('[Client] Initialized Phase 7 Receiver, waiting for audio chunks...');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initClient);
} else {
  initClient();
}
