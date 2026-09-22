export class JitterBuffer {
  constructor(audioContext, ntpClient) {
    this.audioContext = audioContext;
    this.ntpClient = ntpClient;
    this.targetDelayMs = 500; // 500ms global jitter buffer
  }

  schedulePlayback(audioData) {
    if (!this.ntpClient.isReady) {
      console.log('[JitterBuffer] Dropping chunk: NTP sync not ready');
      audioData.close();
      return;
    }

    // 1. Calculate global target time
    const captureTimeMs = Math.floor(audioData.timestamp / 1000); // Usually WebCodecs is in microseconds, map to ms
    const targetGlobalTime = captureTimeMs + this.targetDelayMs;

    // 2. Map global time to local device clock using NTP offset
    const localClock = Date.now();
    const clockOffset = this.ntpClient.getOffset();
    
    const timeUntilPlayMs = targetGlobalTime - (localClock + clockOffset);
    
    let playDelay = timeUntilPlayMs / 1000;
    if (playDelay < 0) {
      console.warn('[JitterBuffer] Chunk arrived too late by', -timeUntilPlayMs, 'ms, playing immediately');
      playDelay = 0;
    }

    // 3. Map to AudioContext time
    const localAudioContextTime = this.audioContext.currentTime + playDelay;
    
    // Render AudioData to an AudioBuffer
    const audioBuffer = this.audioContext.createBuffer(
      audioData.numberOfChannels,
      audioData.numberOfFrames,
      audioData.sampleRate
    );
    
    for (let c = 0; c < audioData.numberOfChannels; c++) {
      const channelData = audioBuffer.getChannelData(c);
      audioData.copyTo(channelData, { planeIndex: c });
    }

    // Schedule exact playback
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start(localAudioContextTime);
    
    audioData.close();
  }
}
