export class DecoderPipeline {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.onDecodedAudio = null;
    
    // Check if WebCodecs is supported
    if (typeof AudioDecoder === 'undefined') {
      console.warn('WebCodecs AudioDecoder not supported in this environment.');
      return;
    }

    this.decoder = new AudioDecoder({
      output: (audioData) => {
        if (this.onDecodedAudio) {
          this.onDecodedAudio(audioData);
        }
      },
      error: (e) => console.error('[DecoderPipeline] Error:', e)
    });

    this.decoder.configure({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2
    });
  }

  decodeChunk(chunkData) {
    if (!this.decoder) return;
    
    const chunk = new EncodedAudioChunk({
      type: chunkData.type,
      timestamp: chunkData.captureTime,
      data: new Uint8Array(chunkData.buffer)
    });
    this.decoder.decode(chunk);
  }
}
