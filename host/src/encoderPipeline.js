const { EventEmitter } = require('events');

class EncoderPipeline extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sampleRate = options.sampleRate || 48000;
    this.channels = options.channels || 2;
    
    // Polyfill or mock for Node environment without native WebCodecs AudioEncoder
    if (typeof AudioEncoder === 'undefined') {
      console.warn('AudioEncoder not found natively. Mocking WebCodecs AudioEncoder for demonstration.');
      global.AudioEncoder = class {
        constructor(init) {
          this.output = init.output;
          this.error = init.error;
        }
        configure(config) { this.config = config; }
        encode(data) {
          // Mock encoding: output an EncodedAudioChunk representation
          this.output({
            type: 'key',
            timestamp: data.timestamp,
            byteLength: data.numberOfFrames * 2,
            copyTo: (buf) => { buf.fill(0); } // Mock copy
          });
        }
        close() {}
      };
      
      global.AudioData = class {
        constructor(init) {
          this.timestamp = init.timestamp;
          this.numberOfFrames = init.numberOfFrames;
          this.numberOfChannels = init.numberOfChannels;
          this.sampleRate = init.sampleRate;
          this.format = init.format;
        }
        close() {}
      }
    }

    this.encoder = new AudioEncoder({
      output: (chunk, metadata) => this.handleEncodedChunk(chunk, metadata),
      error: (e) => console.error('[EncoderPipeline] WebCodecs Error:', e)
    });

    this.encoder.configure({
      codec: 'opus',
      sampleRate: this.sampleRate,
      numberOfChannels: this.channels,
      bitrate: 128000
    });
  }

  handleEncodedChunk(chunk, metadata) {
    const buffer = new Uint8Array(chunk.byteLength || 100);
    if (chunk.copyTo) {
        chunk.copyTo(buffer);
    }
    
    this.emit('encoded', {
      buffer: Array.from(buffer), 
      captureTime: chunk.timestamp,
      type: chunk.type
    });
  }

  processRawAudio(pcmData, captureTimeMs) {
    const numberOfFrames = pcmData.length / this.channels;
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: this.sampleRate,
      numberOfFrames: numberOfFrames,
      numberOfChannels: this.channels,
      timestamp: captureTimeMs,
      data: pcmData
    });

    this.encoder.encode(audioData);
    audioData.close();
  }
}

module.exports = { EncoderPipeline };
