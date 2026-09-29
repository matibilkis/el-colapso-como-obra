import { clamp, lerp, approach } from './util.js';

// Voice -> loudness (Rabi drive) + pitch (Hamiltonian); clap -> measurement
export class MicInput {
  constructor() {
    this.active = false; this.level = 0; this.pitch = 0; this.sens = 1;
    this.floor = 0.004; this._peakAvg = 0.02; this._lastClap = 0; this._voicedT = 0;
  }

  async start(ctx) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }, video: false,
    });
    this.src = ctx.createMediaStreamSource(this.stream);
    this.an = ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0;
    this.src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.ds = new Float32Array(1024);
    this.corr = new Float32Array(1024);
    this.sr = ctx.sampleRate;
    this.active = true;
  }

  stop() {
    this.active = false; this.level = 0; this.pitch = 0;
    this.stream?.getTracks().forEach(t => t.stop());
    this.src?.disconnect();
  }

  update(dt, now) {
    if (!this.active) return null;
    const b = this.buf;
    this.an.getFloatTimeDomainData(b);
    let sum = 0, peak = 0;
    for (let i = 0; i < b.length; i++) { const v = b[i]; sum += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
    const rms = Math.sqrt(sum / b.length);

    // adaptive noise floor: falls fast, rises slowly (absorbs room hum and our own drone)
    this.floor = rms < this.floor ? lerp(this.floor, rms, 0.3) : this.floor + (rms - this.floor) * Math.min(1, dt * 0.06);
    this.floor = Math.max(this.floor, 0.0008);
    const raw = clamp((rms - this.floor * 1.7) * 13 * this.sens);
    this.level = approach(this.level, raw, raw > this.level ? 16 : 5, dt);

    // clap: sudden, impulsive peak
    let clap = false;
    const crest = peak / (rms + 1e-6);
    if (peak > Math.max(0.2 / this.sens, this._peakAvg * 5) && crest > 3.4 && now - this._lastClap > 0.4) {
      clap = true; this._lastClap = now;
    }
    this._peakAvg = lerp(this._peakAvg, peak, 0.04);

    if (raw > 0.06 && now - this._lastClap > 0.15) {
      const p = this._detectPitch();
      if (p) { this.pitch = this.pitch ? lerp(this.pitch, p, 0.25) : p; this._voicedT = now; }
    }
    if (now - this._voicedT > 0.3) this.pitch = 0;
    return { level: this.level, pitch: this.pitch, clap, rms };
  }

  // normalised autocorrelation on a 2x-downsampled frame, first strong peak wins
  _detectPitch() {
    const b = this.buf, d = this.ds, N = 1024, s = this.sr / 2;
    for (let i = 0; i < N; i++) d[i] = (b[2 * i] + b[2 * i + 1]) * 0.5;
    const minLag = Math.max(2, Math.floor(s / 900)), maxLag = Math.min(N - 2, Math.floor(s / 75));
    const W = N - maxLag;
    let e0 = 0; for (let i = 0; i < W; i++) e0 += d[i] * d[i];
    if (e0 < 1e-7) return 0;
    const r = this.corr; let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let ac = 0, e1 = 0;
      for (let i = 0; i < W; i++) { const y = d[i + lag]; ac += d[i] * y; e1 += y * y; }
      const v = ac / Math.sqrt(e0 * e1 + 1e-12);
      r[lag] = v; if (v > best) best = v;
    }
    if (best < 0.72) return 0;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (r[lag] > 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
        const a = r[lag - 1], c = r[lag + 1], den = a - 2 * r[lag] + c;
        const shift = den ? 0.5 * (a - c) / den : 0;
        return s / (lag + shift);
      }
    }
    return 0;
  }
}
