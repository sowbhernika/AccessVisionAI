/**
 * AudioWorklet processor — low-latency PCM 16-bit 16kHz mono capture.
 * Uses a preallocated ring buffer to avoid GC pressure.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Ring buffer: 16000 samples = 1 second max
    this._ring = new Float32Array(16000);
    this._writePos = 0;
    // Send every 128 samples = 8ms at 16kHz (matches AudioWorklet quantum)
    this._chunkSize = 128;
    this._pcmBuf = new Int16Array(this._chunkSize);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];
    const len = samples.length;

    // Write to ring
    for (let i = 0; i < len; i++) {
      this._ring[this._writePos++] = samples[i];

      if (this._writePos >= this._chunkSize) {
        // Convert float32 → int16 in-place
        for (let j = 0; j < this._writePos; j++) {
          const s = this._ring[j];
          this._pcmBuf[j] = s > 0 ? (s * 0x7fff) | 0 : (s * 0x8000) | 0;
        }
        // Copy and transfer
        const out = new Int16Array(this._pcmBuf.length);
        out.set(this._pcmBuf);
        this.port.postMessage(out.buffer, [out.buffer]);
        this._writePos = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
