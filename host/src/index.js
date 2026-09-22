const { AudioCapture } = require('./audioCapture');
const { EncoderPipeline } = require('./encoderPipeline');
const { NtpWebSocketServer } = require('./ntpWebSocketServer');

const PORT = 8080;

const capture = new AudioCapture();
const encoder = new EncoderPipeline();
const server = new NtpWebSocketServer(PORT);

capture.on('data', (audio) => {
  encoder.processRawAudio(audio.buffer, audio.captureTime);
});

encoder.on('encoded', (chunkData) => {
  server.broadcast(chunkData);
});

console.log('[Host] Starting Phase 7 streaming system...');
capture.start();
