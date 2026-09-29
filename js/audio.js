import { TAU, qrand } from './util.js';

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];                       // D major pentatonic
const LADDER = [50, 52, 54, 57, 59, 62, 64, 66, 69]; // D3 .. A4, for the pattern pad

// Voices: |0> = D3 (moon, low), |1> = A4 (sun, high), coherence = F#4 (the "colour" third)
export class AudioEngine {
  constructor() { this.ctx = null; this.on = true; this._lastDrone = -1; }

  async init(offline) {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const c = this.ctx = offline || new AC({ latencyHint: 'interactive' });
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 24; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.3;
    this.master.connect(comp); comp.connect(c.destination);

    this.revIn = c.createGain();
    const conv = c.createConvolver(); conv.buffer = this._impulse(3.4, 2.6);
    const revLP = c.createBiquadFilter(); revLP.type = 'lowpass'; revLP.frequency.value = 4800;
    const revOut = c.createGain(); revOut.gain.value = 0.5;
    this.revIn.connect(conv); conv.connect(revLP); revLP.connect(revOut); revOut.connect(this.master);
    this.dry = c.createGain(); this.dry.gain.value = 0.85; this.dry.connect(this.master);

    this._buildDrone();
    this._buildPad();
    this.master.gain.setTargetAtTime(this.on ? 0.9 : 0, c.currentTime, offline ? 0.01 : 0.8);
    if (!offline && c.state === 'suspended') await c.resume();
  }

  setOn(on) { this.on = on; if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.15); }
  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  _impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), pre = Math.floor(c.sampleRate * 0.025);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  _out(node, send = 0.4) {
    node.connect(this.dry);
    const s = this.ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(this.revIn);
  }
  _osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  _gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  _buildDrone() {
    const c = this.ctx;
    this.droneBus = this._gain(0); this._out(this.droneBus, 0.55);
    // |0> — round, low
    const f0 = mtof(50);
    const o0 = this._osc('sine', f0), o0b = this._osc('triangle', f0 * 2), o0bg = this._gain(0.16);
    const lp0 = c.createBiquadFilter(); lp0.type = 'lowpass'; lp0.frequency.value = 850; lp0.Q.value = 0.3;
    this.g0 = this._gain(0);
    o0.connect(lp0); o0b.connect(o0bg); o0bg.connect(lp0); lp0.connect(this.g0); this.g0.connect(this.droneBus);
    // |1> — bright, gently FM'd, with a slow vibrato
    const f1 = mtof(69);
    const o1 = this._osc('sine', f1), m1 = this._osc('sine', f1 * 2), m1g = this._gain(f1 * 0.16);
    const vib = this._osc('sine', 4.4), vibg = this._gain(1.4);
    m1.connect(m1g); m1g.connect(o1.frequency); vib.connect(vibg); vibg.connect(o1.frequency);
    this.g1 = this._gain(0); o1.connect(this.g1); this.g1.connect(this.droneBus);
    // coherence — F#4 + C#5, tremolo at the precession rate, panned by the phase
    const fc = mtof(66);
    const oc = this._osc('sine', fc), oc2 = this._osc('sine', fc * 1.5), oc2g = this._gain(0.22);
    this.gc = this._gain(0);
    this.trem = this._osc('sine', 0.3); this.tremDepth = this._gain(0);
    this.trem.connect(this.tremDepth); this.tremDepth.connect(this.gc.gain);
    this.panC = c.createStereoPanner ? c.createStereoPanner() : this._gain(1);
    oc.connect(this.gc); oc2.connect(oc2g); oc2g.connect(this.gc); this.gc.connect(this.panC); this.panC.connect(this.droneBus);
    [o0, o0b, o1, m1, vib, oc, oc2, this.trem].forEach(o => o.start());
  }

  _buildPad() {
    const c = this.ctx;
    this.padBus = this._gain(0); this._out(this.padBus, 0.7);
    this.padA = this._osc('triangle', mtof(57)); this.padB = this._osc('sine', mtof(69));
    const bg = this._gain(0.35);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    this.padA.connect(lp); this.padB.connect(bg); bg.connect(lp); lp.connect(this.padBus);
    this.padA.start(); this.padB.start();
  }

  // continuous voice of the state (manipulate mode)
  setDrone({ p0, coh, phi, omega, on }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this._lastDrone < 0.03) return;
    this._lastDrone = t;
    const tc = 0.07;
    this.droneBus.gain.setTargetAtTime(on ? 0.3 : 0, t, on ? 0.35 : 0.25);
    this.g0.gain.setTargetAtTime(Math.sqrt(p0) * 0.95, t, tc);
    this.g1.gain.setTargetAtTime(Math.sqrt(1 - p0) * 0.5, t, tc);
    const base = coh * 0.34;
    this.gc.gain.setTargetAtTime(base, t, tc);
    this.tremDepth.gain.setTargetAtTime(base * 0.55, t, tc);
    this.trem.frequency.setTargetAtTime(0.12 + Math.abs(omega) / TAU * 1.6, t, 0.2);
    if (this.panC.pan) this.panC.pan.setTargetAtTime(Math.sin(phi) * 0.65, t, 0.12);
  }

  // pattern pad (measure mode): pitch follows the fraction of ones
  setPad(on, f1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = LADDER[Math.round(Math.max(0, Math.min(1, f1)) * 8)];
    this.padA.frequency.setTargetAtTime(mtof(m), t, 0.12);
    this.padB.frequency.setTargetAtTime(mtof(m + 12), t, 0.12);
    this.padBus.gain.setTargetAtTime(on ? 0.1 : 0, t, 0.35);
  }

  // one measurement outcome: 0 = low wooden moon, 1 = high glass sun
  pluck(out, degree = 0, delay = 0, vel = 1) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + 0.004 + delay;
    const midi = (out === 0 ? 50 : 74) + PENTA[degree % 5];
    const f = mtof(midi);
    const env = c.createGain();
    const dur = out === 0 ? 1.2 : 1.7;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.4 * vel, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    const nodes = [];
    if (out === 0) {
      const o = this._osc('sine', f), o2 = this._osc('sine', f * 3.93), g2 = c.createGain();
      g2.gain.setValueAtTime(0.28, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(env); nodes.push(o, o2);
    } else {
      const o = this._osc('sine', f), m = this._osc('sine', f * 3.5), mg = c.createGain();
      mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + 0.4);
      m.connect(mg); mg.connect(o.frequency); o.connect(env); nodes.push(o, m);
    }
    let last = env;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = (qrand() - 0.5) * 0.6; env.connect(p); last = p; }
    this._out(last, 0.45);
    nodes.forEach(o => { o.start(t); o.stop(t + dur + 0.1); });
    nodes[0].onended = () => last.disconnect();
  }

  // the environment becomes entangled with the qubit: a tiny glassy tick
  tick() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + 0.002;
    const f = mtof(81 + PENTA[Math.floor(qrand() * 5)]);
    const o = this._osc('sine', f), env = c.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.045, t + 0.004); env.gain.exponentialRampToValueAtTime(0.0005, t + 0.28);
    o.connect(env); this._out(env, 0.6); o.start(t); o.stop(t + 0.32); o.onended = () => env.disconnect();
  }

  // a single, destructive look: swoosh + the outcome, louder
  collapse(out) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime + 0.003;
    const len = Math.floor(c.sampleRate * 0.5), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(out ? 1200 : 220, t + 0.3);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.24, t + 0.05); env.gain.exponentialRampToValueAtTime(0.0005, t + 0.45);
    src.connect(bp); bp.connect(env); this._out(env, 0.5); src.start(t); src.onended = () => env.disconnect();
    this.pluck(out, 0, 0.07, 1.8);
    this.pluck(out, 2, 0.16, 0.8);
    this.pluck(out, 4, 0.3, 0.45);
  }

  chime(up = true) {
    if (!this.ctx || !this.on) return;
    this.pluck(up ? 1 : 0, 3, 0, 0.35);
    this.pluck(up ? 1 : 0, up ? 4 : 1, 0.09, 0.3);
  }
}
