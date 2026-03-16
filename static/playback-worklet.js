/**
 * AudioWorklet for gapless, low-latency PCM playback.
 * Receives Float32 chunks via port, plays them through a ring buffer.
 */
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 2-second ring buffer at 24kHz
    this._ring = new Float32Array(48000);
    this._readPos = 0;
    this._writePos = 0;
    this._len = 48000;

    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        // Interruption: clear the buffer
        this._readPos = 0;
        this._writePos = 0;
        return;
      }
      const samples = new Float32Array(e.data);
      for (let i = 0; i < samples.length; i++) {
        this._ring[this._writePos] = samples[i];
        this._writePos = (this._writePos + 1) % this._len;
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (this._readPos !== this._writePos) {
        out[i] = this._ring[this._readPos];
        this._readPos = (this._readPos + 1) % this._len;
      } else {
        out[i] = 0;
      }
    }
    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);
