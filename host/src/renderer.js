let audioContext;
let encoder;

document.getElementById('start-btn').addEventListener('click', async () => {
  try {
    // 1. Capture System Audio
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor' }, // Must request video to get desktop audio on some OS
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    // We only care about the audio track
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      alert("No audio track found. Make sure you check 'Share audio'!");
      return;
    }

    const audioStream = new MediaStream([audioTrack]);
    audioContext = new AudioContext({ sampleRate: 48000 });
    const source = audioContext.createMediaStreamSource(audioStream);

    // 2. Setup WebCodecs Encoder
    encoder = new AudioEncoder({
      output: (chunk, metadata) => {
        const buffer = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buffer);
        
        // Map capture time precisely
        const captureTimeUs = chunk.timestamp;
        
        window.electronAPI.sendAudioChunk({
          buffer: Array.from(buffer),
          captureTime: captureTimeUs,
          type: chunk.type
        });
      },
      error: (e) => console.error('[Renderer] AudioEncoder error:', e)
    });

    encoder.configure({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128000
    });

    // 3. Pipe Audio to Encoder via MediaStreamTrackProcessor
    const processor = new MediaStreamTrackProcessor({ track: audioTrack });
    const reader = processor.readable.getReader();

    console.log('[Renderer] Started WebCodecs capture loop...');
    document.body.innerHTML = "<h1>Streaming Audio to Network in perfect sync...</h1>";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // value is an AudioData object
      encoder.encode(value);
      value.close();
    }
  } catch (err) {
    console.error('[Renderer] Failed to capture audio:', err);
    alert("Capture failed: " + err.message);
  }
});
