import {
  TAU, clamp, lerp, approach, smoothstep, noise1, V, mulberry32,
  easeOutCubic, easeInCubic, easeOutBack, rgba, mixc,
} from './util.js';

const PAL = {
  day: {
    paper: [243, 234, 215], pale: [252, 248, 238], ink: [30, 27, 24], graphite: [124, 118, 110],
    red: [214, 68, 50], blue: [44, 84, 168], yellow: [243, 188, 44], green: [58, 138, 96],
  },
  night: {
    paper: [14, 22, 50], pale: [30, 44, 88], ink: [241, 233, 214], graphite: [128, 138, 168],
    red: [255, 108, 86], blue: [118, 160, 255], yellow: [255, 206, 84], green: [108, 204, 150],
  },
};
const GLYPHS = ['star', 'dot', 'moon', 'spiral', 'eye', 'hairy', 'comet', 'bird', 'cluster', 'dot', 'star', 'dot', 'sun'];
const GCOLS = ['red', 'blue', 'yellow', 'green', 'ink', 'red', 'yellow'];
const SLOTS = 40;
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const TIPS = { 4: 'red', 8: 'yellow', 12: 'blue', 16: 'green', 20: 'ink' };

export class Scene {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.theme = 'day'; this.t = 0; this.kappa = 0; this.k01 = 0; this.modeT = 0;
    this.glyphs = []; this.fx = []; this.trail = []; this.ring = []; this.slot = 0;
    this.eyeFlash = 0; this.blink = 0; this.nextBlink = 4; this.precPhase = 0; this.drivePhase = 0; this.handA = 0;
    this.serif = '"Fraunces", Georgia, serif';
    this.hand = '"Caveat", "Segoe Print", cursive';
    this.lens = [];
    for (let i = 0; i <= 200; i++) { const d = i / 100; this.lens.push((2 * Math.acos(d / 2) - (d / 2) * Math.sqrt(4 - d * d)) / Math.PI); }
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // ---------- layout & camera ----------
  resize() {
    const dpr = this.dpr = Math.min(devicePixelRatio || 1, 2);
    const W = this.W = innerWidth, H = this.H = innerHeight;
    this.c.width = Math.round(W * dpr); this.c.height = Math.round(H * dpr);
    this.mobile = W < 760;
    this.box = null;
    Object.assign(this, this.layout());
    this.R = this.R0;
    this.seedGlyphs();
  }
  // fit the sphere (and the measurement ring + eye) inside the free area left by the UI
  fit(box, snap = false) {
    this.box = box;
    if (snap) { Object.assign(this, this.layout()); this.R = this.R0; }
  }
  layout() {
    const b = this.box || { l: 0, r: this.W, t: 0, b: this.H };
    const aw = b.r - b.l, ah = b.b - b.t;
    // vertical extent in units of R0: eye on top in measure mode (with perspective) + ring below
    const R0 = Math.max(36, Math.min(ah / 3.36, aw / 3.1));
    return { cx: (b.l + b.r) / 2, cy: b.t + 1.9 * R0 + Math.max(0, ah - 3.36 * R0) / 2, R0 };
  }

  camera() {
    const a = this.yaw, b = this.pitch;
    this.F = [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)]; // toward the viewer
    this.Rv = [-Math.sin(a), Math.cos(a), 0];                                        // screen right
    this.U = V.cross(this.F, this.Rv);                                              // screen up
  }
  proj(v) {
    const X = V.dot(v, this.Rv), Y = V.dot(v, this.U), Z = V.dot(v, this.F);
    const s = 1 / (1 - Z * 0.14);
    return { x: this.cx + X * this.R * s, y: this.cy - Y * this.R * s, z: Z, s };
  }
  // trackball: drag (px) rotates a world vector as if the sphere were a globe under the finger
  dragRotate(vec, dx, dy, gain = 1) {
    const ang = Math.hypot(dx, dy) / this.R * gain;
    if (ang < 1e-5) return vec;
    const axis = V.norm(V.add(V.scale(this.Rv, dy), V.scale(this.U, dx)));
    return V.rotate(vec, axis, ang);
  }
  handToScreen(x, y) {
    return { x: ((x - 0.5) * 1.35 + 0.5) * this.W, y: ((y - 0.5) * 1.35 + 0.5) * this.H };
  }

  palette() {
    const P = PAL[this.theme], k = this.kappa, gr = P.graphite;
    this.C = {
      paper: P.paper, pale: P.pale, ink: P.ink, graphite: gr,
      red: mixc(P.red, gr, 0.22 * k), blue: mixc(P.blue, gr, 0.22 * k),       // classical bits keep their colours
      yellow: mixc(P.yellow, gr, 0.85 * k), green: mixc(P.green, gr, 0.8 * k), // quantum colour drains away
    };
  }
  lensD(p1) {
    if (p1 <= 0.002) return 2.3;
    if (p1 >= 0.998) return 0;
    let i = 1; while (i < 200 && this.lens[i] > p1) i++;
    const a = this.lens[i - 1], b = this.lens[i];
    return (i - 1 + (a - p1) / (a - b || 1)) / 100;
  }

  // ---------- environment (Miró glyphs = Zurek's environment) ----------
  seedGlyphs() {
    const rnd = mulberry32(11), n = this.mobile ? 22 : 40;
    this.glyphs = [];
    for (let i = 0; i < n; i++) {
      let x = rnd(), y = rnd();
      for (let k = 0; k < 24 && Math.hypot(x * this.W - this.cx, y * this.H - this.cy) < this.R0 * 1.3; k++) { x = rnd(); y = rnd(); }
      this.glyphs.push({
        type: GLYPHS[Math.floor(rnd() * GLYPHS.length)], x, y, seed: rnd() * 1000,
        s: (this.mobile ? 7 : 9) + rnd() * (this.mobile ? 10 : 15), rot: rnd() * TAU, vr: (rnd() - 0.5) * 0.12,
        col: GCOLS[Math.floor(rnd() * GCOLS.length)], ring: rnd() < 0.5,
        ent: 0, entT: 0, p1: 0.5, rec: -1, recA: 0, flash: 0, snap: 0,
      });
    }
  }
  entangle(p1) {
    let best = null, bd = 1e9;
    for (let k = 0; k < 4; k++) {
      const gl = this.glyphs[Math.floor(Math.random() * this.glyphs.length)];
      if (gl.entT > 0) continue;
      const d = Math.hypot(gl.x * this.W - this.cx, gl.y * this.H - this.cy);
      if (d < bd) { bd = d; best = gl; }
    }
    if (!best) return false;
    best.entT = 1; best.p1 = p1; best.rec = -1; best.recA = 0;
    return true;
  }
  resolveRecords(out) {
    for (const gl of this.glyphs) if (gl.ent > 0.05) { gl.entT = 0; gl.rec = out; gl.recA = 1; gl.flash = 1; gl.snap = 1; }
  }
  releaseRecords() { for (const gl of this.glyphs) gl.entT = 0; }
  entangledCount() { let n = 0; for (const gl of this.glyphs) n += gl.entT > 0 ? 1 : 0; return n; }

  // ---------- events ----------
  shot(out, r, n) {
    const to = out === 0 ? [...n] : V.scale(n, -1);
    this.fx.push({ k: 'ghost', from: [...r], to, out, t0: this.t, dur: 0.2, big: false });
    this.eyeFlash = 1;
  }
  collapse(out, r, n) {
    const to = out === 0 ? [...n] : V.scale(n, -1);
    this.fx.push({ k: 'ghost', from: [...r], to, out, t0: this.t, dur: 0.16, big: true });
    this.fx.push({ k: 'numeral', out, t0: this.t + 0.12 });
    this.trail = [];
    this.eyeFlash = 1;
  }
  _land(f) {
    const p = this.proj(f.to);
    const drops = [];
    const n = f.big ? 16 : 8;
    for (let i = 0; i < n; i++) drops.push({ a: Math.random() * TAU, d: this.R * (0.06 + Math.random() * (f.big ? 0.42 : 0.2)), s: 1.3 + Math.random() * (f.big ? 5 : 3.2) });
    this.fx.push({ k: 'splash', x: p.x, y: p.y, out: f.out, t0: this.t, drops, big: f.big });
    this.fx.push({ k: 'ripple', x: p.x, y: p.y, out: f.out, t0: this.t, big: f.big });
    if (!f.big) {
      this.slot++;
      this.ring.push({ out: f.out, slot: this.slot, t0: this.t });
      while (this.ring.length && this.ring[0].slot <= this.slot - SLOTS) this.ring.shift();
    }
  }
  clearRing() { this.ring = []; this.slot = 0; }

  // ---------- frame ----------
  render(st, dt) {
    this.t += dt;
    const g = this.g, t = this.t;
    this.modeT = approach(this.modeT, st.mode === 'measure' ? 1 : 0, 4.5, dt);
    this.kappa = approach(this.kappa, st.kappa, 3, dt);
    this.k01 = approach(this.k01, st.k01, 5, dt);
    this.yaw = 0.62 + 0.11 * Math.sin(t * 0.07);
    this.pitch = 0.3 + 0.045 * Math.sin(t * 0.053 + 1);
    this.camera();
    const L = this.layout();
    this.cx = approach(this.cx, L.cx, 6, dt); this.cy = approach(this.cy, L.cy, 6, dt); this.R0 = approach(this.R0, L.R0, 6, dt);
    this.R = this.R0 * lerp(1, 0.84, easeOutCubic(this.modeT));
    this.palette();
    this.eyeFlash = approach(this.eyeFlash, 0, 7, dt);
    if (t > this.nextBlink) { this.blink = 1; this.nextBlink = t + 3 + Math.random() * 5; }
    this.blink = approach(this.blink, 0, 14, dt);
    this.precPhase += st.omega * dt;
    this.drivePhase += dt * 1.6;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    this.drawBackground();
    this.drawHorizon();
    this.updateGlyphs(dt);
    this.drawGlyphs();
    const sp = this.proj(st.r);
    this.drawThreads(sp);
    this.drawSphere(st, sp, dt);
    this.drawRing();
    this.drawFX();
    this.drawHand(st, sp, dt);
  }

  // ---------- primitives ----------
  brush(pts, w0, w1, col, alpha = 1, seed = 0) {
    const n = pts.length; if (n < 2) return;
    const g = this.g, L = [], Rr = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const tt = i / (n - 1);
      const w = lerp(w0, w1, tt) * (1 + 0.22 * noise1(seed + tt * 5)) * 0.5;
      L.push([p[0] - dy * w, p[1] + dx * w]); Rr.push([p[0] + dy * w, p[1] - dx * w]);
    }
    g.beginPath(); g.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
    g.closePath(); g.fillStyle = rgba(col, alpha); g.fill();
    g.beginPath(); g.arc(pts[0][0], pts[0][1], w0 * 0.5, 0, TAU); g.arc(pts[n - 1][0], pts[n - 1][1], w1 * 0.5, 0, TAU); g.fill();
  }
  dotted(pts, col, alpha, w = 1.3, dash = [1.2, 6.5]) {
    if (pts.length < 2) return;
    const g = this.g;
    g.save(); g.setLineDash(dash); g.lineWidth = w; g.strokeStyle = rgba(col, alpha);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke(); g.restore();
  }
  seg3(a, b, n = 10) { const out = []; for (let i = 0; i <= n; i++) { const p = this.proj(V.add(V.scale(a, 1 - i / n), V.scale(b, i / n))); out.push([p.x, p.y, p.z]); } return out; }
  inkRing(cx, cy, r, w, seed, col, alpha) {
    const g = this.g, n = 128, t = this.t, O = [], I = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (1 + 0.006 * noise1(seed + a * 2.2 + t * 0.22));
      const ww = w * (0.5 + 0.55 * (0.5 + 0.5 * noise1(seed * 1.7 + a * 1.6))) * (0.75 + 0.45 * Math.max(0, Math.cos(a - 0.7)));
      O.push([cx + Math.cos(a) * (rr + ww / 2), cy + Math.sin(a) * (rr + ww / 2)]);
      I.push([cx + Math.cos(a) * (rr - ww / 2), cy + Math.sin(a) * (rr - ww / 2)]);
    }
    g.beginPath(); O.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    for (let i = n; i >= 0; i--) g.lineTo(I[i][0], I[i][1]);
    g.closePath(); g.fillStyle = rgba(col, alpha); g.fill();
  }
  ket(inner, x, y, size, col, alpha = 1, align = 'center') {
    const g = this.g;
    g.font = `400 ${size}px ${this.serif}`;
    const w = g.measureText(inner).width, total = size * 0.24 + w + size * 0.36;
    const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    g.strokeStyle = rgba(col, alpha); g.fillStyle = rgba(col, alpha); g.lineWidth = Math.max(1, size * 0.065);
    g.beginPath(); g.moveTo(x0 + size * 0.06, y - size * 0.74); g.lineTo(x0 + size * 0.06, y + size * 0.2); g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(inner, x0 + size * 0.22, y);
    const bx = x0 + size * 0.22 + w + size * 0.06;
    g.beginPath(); g.moveTo(bx, y - size * 0.74); g.lineTo(bx + size * 0.2, y - size * 0.27); g.lineTo(bx, y + size * 0.2); g.stroke();
  }

  // Miró vocabulary
  moon(x, y, s, col, alpha = 1, rot = -0.6) {
    const g = this.g, C = this.C, dx = s * 0.55, dy = -s * 0.2, s2 = s * 0.9;
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = alpha;
    g.save(); g.beginPath(); g.arc(1.4, 1.2, s, 0, TAU); g.clip();
    g.beginPath(); g.arc(1.4, 1.2, s, 0, TAU); g.arc(1.4 + dx, 1.2 + dy, s2, 0, TAU); g.fillStyle = rgba(col); g.fill('evenodd'); g.restore();
    g.lineWidth = Math.max(1.2, s * 0.13); g.strokeStyle = rgba(C.ink, 0.9);
    g.save(); g.beginPath(); g.rect(-s * 3, -s * 3, s * 6, s * 6); g.arc(dx, dy, s2, 0, TAU); g.clip('evenodd');
    g.beginPath(); g.arc(0, 0, s, 0, TAU); g.stroke(); g.restore();
    g.save(); g.beginPath(); g.arc(0, 0, s, 0, TAU); g.clip(); g.beginPath(); g.arc(dx, dy, s2, 0, TAU); g.stroke(); g.restore();
    g.restore();
  }
  sun(x, y, s, col, alpha = 1, spin = 0) {
    const g = this.g, C = this.C;
    g.save(); g.translate(x, y); g.globalAlpha = alpha;
    g.strokeStyle = rgba(C.ink, 0.9); g.lineWidth = Math.max(1.1, s * 0.11);
    for (let i = 0; i < 12; i++) {
      const a = spin + (i / 12) * TAU, l = i % 2 ? 1.55 : 1.9;
      g.beginPath(); g.moveTo(Math.cos(a) * s * 1.28, Math.sin(a) * s * 1.28); g.lineTo(Math.cos(a) * s * l, Math.sin(a) * s * l); g.stroke();
    }
    g.beginPath(); g.arc(1.4, 1.2, s, 0, TAU); g.fillStyle = rgba(col); g.fill();
    g.beginPath(); g.arc(0, 0, s, 0, TAU); g.lineWidth = Math.max(1.2, s * 0.13); g.stroke();
    g.restore();
  }
  star(x, y, s, alpha = 1, seed = 0, col) {
    const g = this.g;
    g.save(); g.translate(x, y); g.globalAlpha = alpha; g.strokeStyle = rgba(col || this.C.ink, 0.92); g.lineWidth = Math.max(1.1, s * 0.12);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4 + 0.15 * noise1(seed + k), l1 = s * (0.75 + 0.35 * (0.5 + 0.5 * noise1(seed * 3 + k))), l2 = s * (0.7 + 0.3 * (0.5 + 0.5 * noise1(seed * 5 + k)));
      g.beginPath(); g.moveTo(-Math.cos(a) * l2, -Math.sin(a) * l2); g.lineTo(Math.cos(a) * l1, Math.sin(a) * l1); g.stroke();
    }
    g.restore();
  }
  eye(x, y, s, look, alpha, flash, blink) {
    const g = this.g, C = this.C, h = s * 0.52 * (1 - 0.92 * blink);
    g.save(); g.translate(x, y); g.globalAlpha = alpha;
    const almond = () => { g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -h * 1.3, s, 0); g.quadraticCurveTo(0, h * 1.3, -s, 0); g.closePath(); };
    almond(); g.fillStyle = rgba(C.pale); g.fill();
    g.save(); almond(); g.clip();
    const px = look[0] * s * 0.34, py = look[1] * s * 0.2;
    g.beginPath(); g.arc(px + 1.2, py + 1, s * 0.4, 0, TAU); g.fillStyle = rgba(C.red); g.fill();
    g.beginPath(); g.arc(px, py, s * 0.17 * (1 - 0.45 * flash), 0, TAU); g.fillStyle = rgba(C.ink); g.fill();
    g.restore();
    almond(); g.lineWidth = Math.max(1.3, s * 0.1); g.strokeStyle = rgba(C.ink, 0.95); g.stroke();
    for (let i = 0; i < 5; i++) {
      const u = -0.7 + i * 0.35, bx = u * s, by = -h * 1.3 * (1 - u * u) * 0.5 * 2 * 0.5;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + u * s * 0.25, by - s * 0.32); g.stroke();
    }
    g.restore();
  }

  // ---------- layers ----------
  // soft watercolour washes, painted at 1/6 resolution and upscaled (cheap on phones)
  drawBackground() {
    const W = this.W, H = this.H, t = this.t, C = this.C, s = 6;
    if (!this.bg || this.bg.width !== Math.ceil(W / s) || this.bg.height !== Math.ceil(H / s)) {
      this.bg = document.createElement('canvas'); this.bg.width = Math.ceil(W / s); this.bg.height = Math.ceil(H / s);
      this.bgT = -1;
    }
    if (t - this.bgT > 0.1) {
      this.bgT = t;
      const b = this.bg.getContext('2d'), w = this.bg.width, h = this.bg.height;
      b.fillStyle = rgba(C.paper); b.fillRect(0, 0, w, h);
      const q = 1 - 0.55 * this.kappa, night = this.theme === 'night' ? 0.85 : 1;
      const washes = [['yellow', 0.16, 0.2, 0.6, 0.26 * q], ['blue', 0.88, 0.26, 0.5, 0.14], ['red', 0.08, 0.94, 0.34, 0.1],
        ['green', 0.94, 0.92, 0.42, 0.1 * q], ['yellow', 0.62, 0.78, 0.28, 0.12 * q]];
      washes.forEach(([c, x, y, r, a], i) => {
        const px = (x + 0.035 * noise1(t * 0.04 + i * 7)) * w, py = (y + 0.035 * noise1(t * 0.05 + i * 13)) * h, rr = r * Math.max(w, h);
        const gr = b.createRadialGradient(px, py, 0, px, py, rr);
        gr.addColorStop(0, rgba(C[c], a * night)); gr.addColorStop(1, rgba(C[c], 0));
        b.fillStyle = gr; b.fillRect(0, 0, w, h);
      });
    }
    const g = this.g;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.bg, 0, 0, W, H);
  }

  drawHorizon() {
    if (this.mobile) return;
    // the hill of Zurek's border territory, drawn faintly behind everything
    const W = this.W, y0 = this.cy + this.R0 * 1.62, amp = this.R0 * 0.22;
    const pts = [];
    for (let x = -10; x <= W + 10; x += 14) pts.push([x, y0 - Math.sin(Math.PI * x / W) * amp + noise1(x * 0.012 + 3) * 2.5]);
    this.brush(pts, 1.4, 1.4, this.C.ink, 0.18, 4);
  }

  updateGlyphs(dt) {
    const t = this.t, W = this.W, H = this.H;
    for (const gl of this.glyphs) {
      gl.x += (noise1(gl.seed + t * 0.05) * 9 + 2.5) / W * dt;
      gl.y += (noise1(gl.seed * 1.3 + 40 + t * 0.045) * 7) / H * dt;
      if (gl.x > 1.04) gl.x = -0.04; if (gl.x < -0.04) gl.x = 1.04;
      if (gl.y > 1.04) gl.y = -0.04; if (gl.y < -0.04) gl.y = 1.04;
      gl.rot += gl.vr * dt;
      gl.ent = approach(gl.ent, gl.entT, gl.entT ? 5 : 2.2, dt);
      gl.recA = Math.max(0, gl.recA - dt / 12);
      gl.flash = approach(gl.flash, 0, 3, dt);
      gl.snap = approach(gl.snap, 0, 2.2, dt);
    }
  }

  drawGlyphs() {
    for (const gl of this.glyphs) this.drawGlyph(gl);
  }
  drawGlyph(gl) {
    const g = this.g, C = this.C, s = gl.s * (1 + 0.35 * gl.flash), col = C[gl.col];
    const x = gl.x * this.W, y = gl.y * this.H;
    g.save(); g.translate(x, y); g.rotate(gl.rot);
    g.strokeStyle = rgba(C.ink, 0.85); g.fillStyle = rgba(col); g.lineWidth = Math.max(1.1, s * 0.1);
    switch (gl.type) {
      case 'star': g.restore(); this.star(x, y, s, 0.85, gl.seed); g.save(); g.translate(x, y); break;
      case 'dot':
        g.beginPath(); g.arc(1.3, 1.1, s * 0.42, 0, TAU); g.fill();
        if (gl.ring) { g.beginPath(); g.arc(0, 0, s * 0.42, 0, TAU); g.stroke(); }
        break;
      case 'moon': g.restore(); this.moon(x, y, s * 0.5, col, 1, gl.rot); g.save(); g.translate(x, y); break;
      case 'sun': g.restore(); this.sun(x, y, s * 0.32, col, 1, gl.rot); g.save(); g.translate(x, y); break;
      case 'spiral':
        g.beginPath();
        for (let a = 0; a < TAU * 2.2; a += 0.25) { const r = s * 0.075 * a; const px = Math.cos(a) * r, py = Math.sin(a) * r; a ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.stroke(); break;
      case 'eye': g.restore(); this.eye(x, y, s * 0.6, [Math.cos(gl.rot), Math.sin(gl.rot)], 0.9, 0, 0); g.save(); g.translate(x, y); break;
      case 'hairy':
        g.beginPath(); g.arc(0, 0, s * 0.28, 0, TAU); g.fillStyle = rgba(C.ink, 0.9); g.fill();
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * s * 0.12, -s * 0.25); g.quadraticCurveTo(i * s * 0.35 + s * 0.15, -s * 0.6, i * s * 0.2, -s * 0.9); g.stroke(); }
        break;
      case 'comet':
        g.beginPath(); g.moveTo(-s, s * 0.2); g.quadraticCurveTo(-s * 0.2, -s * 0.35, s * 0.35, 0); g.stroke();
        g.beginPath(); g.arc(s * 0.5, 0, s * 0.24, 0, TAU); g.fill(); g.stroke(); break;
      case 'bird':
        g.beginPath(); g.moveTo(-s * 0.7, -s * 0.2); g.quadraticCurveTo(-s * 0.3, s * 0.25, 0, 0); g.quadraticCurveTo(s * 0.3, s * 0.25, s * 0.7, -s * 0.2); g.stroke(); break;
      case 'cluster':
        g.fillStyle = rgba(C.ink, 0.85);
        [[0, 0, 0.14], [s * 0.35, -s * 0.2, 0.1], [-s * 0.25, s * 0.3, 0.08]].forEach(([a, b, r]) => { g.beginPath(); g.arc(a, b, s * r * 1.4, 0, TAU); g.fill(); });
        break;
    }
    g.restore();
    // entangled with the qubit: a small eclipse disc (knows "both")
    const bx = x + s * 0.55, by = y - s * 0.55, br = Math.max(3.5, s * 0.3);
    if (gl.ent > 0.02) {
      const a = gl.ent;
      g.save(); g.beginPath(); g.arc(bx, by, br, 0, TAU); g.clip();
      g.fillStyle = rgba(C.blue, a); g.fillRect(bx - br, by - br, br * 2, br * 2);
      const d = this.lensD(gl.p1) * br; g.beginPath(); g.arc(bx, by + d, br, 0, TAU); g.fillStyle = rgba(C.red, a); g.fill();
      g.restore();
      g.beginPath(); g.arc(bx, by, br, 0, TAU); g.lineWidth = 1.1; g.strokeStyle = rgba(C.ink, 0.8 * a); g.stroke();
    }
    // a definite record left after the look
    if (gl.rec >= 0 && gl.recA > 0.01) {
      const a = Math.min(1, gl.recA * 1.4);
      g.beginPath(); g.arc(bx, by, br * (1 + 0.6 * gl.flash), 0, TAU); g.fillStyle = rgba(gl.rec ? C.red : C.blue, a); g.fill();
      g.lineWidth = 1.1; g.strokeStyle = rgba(C.ink, 0.8 * a); g.stroke();
    }
  }

  drawThreads(sp) {
    const g = this.g, C = this.C;
    for (const gl of this.glyphs) {
      if (gl.ent < 0.02 && gl.snap < 0.02) continue;
      const x = gl.x * this.W + gl.s * 0.55, y = gl.y * this.H - gl.s * 0.55;
      const mx = (x + sp.x) / 2, my = (y + sp.y) / 2, dx = x - sp.x, dy = y - sp.y, bend = 0.14 * Math.sin(gl.seed);
      g.beginPath(); g.moveTo(sp.x, sp.y); g.quadraticCurveTo(mx - dy * bend, my + dx * bend, x, y);
      if (gl.ent > 0.02) { g.lineWidth = 0.9; g.strokeStyle = rgba(C.ink, 0.34 * gl.ent); g.stroke(); }
      if (gl.snap > 0.02) { g.lineWidth = 2; g.strokeStyle = rgba(gl.rec ? C.red : C.blue, 0.8 * gl.snap); g.stroke(); }
    }
  }

  drawCircle3D(u, w, front) {
    const n = 110, pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; const p = this.proj(V.add(V.scale(u, Math.cos(a)), V.scale(w, Math.sin(a)))); pts.push(p); }
    let run = [];
    const flush = () => {
      if (run.length > 1) front ? this.brush(run, 1.5, 1.5, this.C.ink, 0.5, run[0][0] * 0.01) : this.dotted(run, this.C.ink, 0.3);
      run = [];
    };
    for (const p of pts) { if ((p.z >= 0) === front) run.push([p.x, p.y]); else flush(); }
    flush();
  }
  drawAxisHalf(dir, len, front, alpha) {
    const o = this.proj([0, 0, 0]);
    for (const sgn of [1, -1]) {
      const end = V.scale(dir, len * sgn), pe = this.proj(end);
      if ((pe.z >= 0) !== front) continue;
      const pts = this.seg3([0, 0, 0], end, 8).map(p => [p[0], p[1]]);
      front ? this.brush(pts, 1.9, 1.2, this.C.ink, alpha, sgn * 7 + dir[0] * 3 + dir[1]) : this.dotted(pts, this.C.ink, alpha * 0.55);
    }
    void o;
  }

  drawSphere(st, sp, dt) {
    const g = this.g, C = this.C, { cx, cy, R } = this, t = this.t, mT = this.modeT;
    const nIsZ = st.n[2] > 0.995;

    // ground shadow
    g.beginPath(); g.ellipse(cx + R * 0.06, cy + R * 1.13, R * 0.78, R * 0.1, 0, 0, TAU); g.fillStyle = rgba(C.ink, 0.06); g.fill();

    // back of the sphere
    const ex = [1, 0, 0], ey = [0, 1, 0], ez = [0, 0, 1];
    this.drawCircle3D(ex, ey, false); this.drawCircle3D(ex, ez, false); this.drawCircle3D(ey, ez, false);
    this.drawAxisHalf(ex, 1.18, false, 0.55); this.drawAxisHalf(ey, 1.18, false, 0.55); this.drawAxisHalf(ez, 1.22, false, 0.8);
    if (!nIsZ || mT > 0.05) this.drawPovAxis(st.n, false, lerp(0.55, 1, mT));
    const behind = sp.z < 0;
    if (behind) this.drawState(st, sp, 0.5);

    // body: soft glass, a yellow blush while coherent, graphite hatching when classical
    const body = g.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.08, cx, cy, R);
    body.addColorStop(0, rgba(C.pale, 0.62)); body.addColorStop(1, rgba(C.pale, 0.2));
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = body; g.fill();
    if (st.coh > 0.02) {
      const yb = g.createRadialGradient(sp.x, sp.y, 0, cx, cy, R * 1.05);
      yb.addColorStop(0, rgba(C.yellow, 0.2 * st.coh)); yb.addColorStop(1, rgba(C.yellow, 0));
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = yb; g.fill();
    }
    if (this.kappa > 0.02) {
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
      g.beginPath(); g.moveTo(cx + R * 1.3, cy - R * 1.3); g.lineTo(cx + R * 1.3, cy + R * 1.3); g.lineTo(cx - R * 1.3, cy + R * 1.3); g.closePath(); g.clip();
      g.strokeStyle = rgba(C.graphite, 0.3 * this.kappa); g.lineWidth = 1;
      for (let o = -2 * R; o < 2 * R; o += 7) { g.beginPath(); g.moveTo(cx + o - R, cy + R); g.lineTo(cx + o + R, cy - R); g.stroke(); }
      g.restore();
    }
    // mixed states live inside: show the shrunken shell
    if (st.purity < 0.97) {
      g.save(); g.setLineDash([2, 7]); g.lineWidth = 1.2; g.strokeStyle = rgba(C.graphite, 0.55 * (1 - st.purity) + 0.15);
      g.beginPath(); g.arc(cx, cy, R * st.purity, 0, TAU); g.stroke(); g.restore();
    }

    this.inkRing(cx, cy, R, Math.max(3, R * 0.03), 1.7, C.ink, 0.92);

    // front
    this.drawCircle3D(ex, ey, true); this.drawCircle3D(ex, ez, true); this.drawCircle3D(ey, ez, true);
    this.drawAxisHalf(ex, 1.18, true, 0.55); this.drawAxisHalf(ey, 1.18, true, 0.55); this.drawAxisHalf(ez, 1.22, true, 0.85);
    if (!nIsZ || mT > 0.05) this.drawPovAxis(st.n, true, lerp(0.55, 1, mT));

    // Hamiltonian: beads running on the equator at the precession rate
    const wA = clamp(Math.abs(st.omega) / 1.2) * (1 - 0.7 * mT);
    if (wA > 0.03) {
      for (let k = 0; k < 6; k++) {
        const a = this.precPhase + (k / 6) * TAU, p = this.proj([Math.cos(a), Math.sin(a), 0]);
        const al = wA * (p.z >= 0 ? 0.95 : 0.35);
        g.beginPath(); g.arc(p.x, p.y, 3.4 * p.s, 0, TAU); g.fillStyle = rgba(C.yellow, al); g.fill();
        g.lineWidth = 1.1; g.strokeStyle = rgba(C.ink, al * 0.8); g.stroke();
      }
    }

    // poles and axis labels
    const pn = this.proj([0, 0, 1.28]), ps = this.proj([0, 0, -1.3]);
    const lab = Math.max(13, R * 0.085);
    this.moon(pn.x, pn.y, R * 0.075, C.blue, 1, -0.5 + 0.05 * Math.sin(t * 0.6));
    this.ket('0', pn.x + R * 0.2, pn.y + lab * 0.35, lab * 1.15, C.ink, 0.9, 'left');
    this.sun(ps.x, ps.y, R * 0.058, C.red, 1, t * 0.15);
    this.ket('1', ps.x + R * 0.21, ps.y + lab * 0.35, lab * 1.15, C.ink, 0.9, 'left');
    const small = lab * 0.8, la = 0.55 * (1 - 0.4 * mT);
    [[[1.3, 0, 0], '+'], [[-1.3, 0, 0], '−'], [[0, 1.3, 0], '+i'], [[0, -1.3, 0], '−i']].forEach(([v, s]) => {
      const p = this.proj(v); this.ket(s, p.x, p.y + small * 0.3, small, C.ink, la * (p.z >= 0 ? 1 : 0.6));
    });

    // theta / phi guides (the paper's two angles)
    const gA = 0.5 * (1 - 0.7 * mT);
    if (st.purity > 0.25 && st.theta > 0.12 && st.theta < Math.PI - 0.12 && gA > 0.05) {
      const r = st.r, q = this.proj([r[0], r[1], 0]), o = this.proj([0, 0, 0]);
      this.dotted([[sp.x, sp.y], [q.x, q.y]], C.ink, gA * 0.7, 1.1, [3, 5]);
      this.dotted([[o.x, o.y], [q.x, q.y]], C.ink, gA * 0.7, 1.1, [3, 5]);
      const ph = st.phi, th = st.theta, h = [Math.cos(ph), Math.sin(ph), 0];
      const arcT = []; for (let i = 0; i <= 16; i++) { const u = (i / 16) * th; const p = this.proj(V.add(V.scale(h, Math.sin(u) * 0.3), [0, 0, Math.cos(u) * 0.3])); arcT.push([p.x, p.y]); }
      this.brush(arcT, 1.3, 1.3, C.ink, gA, 9);
      const pmid = this.proj(V.add(V.scale(h, Math.sin(th / 2) * 0.42), [0, 0, Math.cos(th / 2) * 0.42]));
      g.font = `italic 500 ${lab}px ${this.serif}`; g.fillStyle = rgba(C.ink, gA * 1.4); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('θ', pmid.x, pmid.y);
      const phN = ((ph % TAU) + TAU) % TAU;
      if (phN > 0.15) {
        const arcP = []; for (let i = 0; i <= 20; i++) { const u = (i / 20) * phN; const p = this.proj([Math.cos(u) * 0.24, Math.sin(u) * 0.24, 0]); arcP.push([p.x, p.y]); }
        this.brush(arcP, 1.3, 1.3, C.ink, gA, 12);
        const pm = this.proj([Math.cos(phN / 2) * 0.34, Math.sin(phN / 2) * 0.34, 0]);
        g.fillText('φ', pm.x, pm.y);
      }
    }

    // cloud of possibilities: where the state has been
    const tr = this.trail;
    for (let i = 0; i < tr.length; i++) {
      const p = this.proj(tr[i].v), a = (i / tr.length) * 0.4 * (p.z >= 0 ? 1 : 0.5);
      g.beginPath(); g.arc(p.x, p.y, (1 + 2.6 * i / tr.length) * p.s, 0, TAU); g.fillStyle = rgba(mixc(C.blue, C.red, tr[i].p1), a); g.fill();
    }

    if (!behind) this.drawState(st, sp, 1);

    // the point of view: an eye looking at the qubit
    const n = st.n, pe = this.eyePos(n), pc = this.proj([0, 0, 0]);
    let lx = pc.x - pe.x, ly = pc.y - pe.y; const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
    const eyeS = R * (0.1 + 0.035 * mT), eyeA = lerp(0.45, 1, mT);
    const pn2 = this.proj(V.scale(n, 1.06));
    this.dotted([[pe.x + lx * eyeS * 1.1, pe.y + ly * eyeS * 1.1], [pn2.x, pn2.y]], C.ink, 0.45 * eyeA, 1.2, [2, 5]);
    this.eye(pe.x, pe.y, eyeS, [lx, ly], eyeA, this.eyeFlash, this.blink);
    if (mT > 0.3 && !this.mobile) {
      g.font = `600 ${Math.max(16, R * 0.075)}px ${this.hand}`; g.fillStyle = rgba(C.ink, 0.6 * mT); g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText('punto de vista', pe.x + eyeS * 1.35, pe.y + 2);
    }
    void dt;
  }

  eyePos(n) {
    const p = this.proj(V.scale(n, lerp(1.5, 1.92, easeOutCubic(this.modeT))));
    return p;
  }

  drawPovAxis(n, front, alpha) {
    const g = this.g, C = this.C;
    for (const sgn of [1, -1]) {
      const end = V.scale(n, 1.2 * sgn), pe = this.proj(end);
      if ((pe.z >= 0) !== front) continue;
      const pts = this.seg3([0, 0, 0], end, 10).map(p => [p[0], p[1]]);
      this.dotted(pts, sgn > 0 ? C.blue : C.red, alpha * (front ? 0.95 : 0.45), front ? 2.6 : 1.6, [7, 6]);
    }
    if (n[2] > 0.995) return;
    // this point of view's own "poles": 0 = moon side, 1 = sun side
    const a = this.proj(V.scale(n, 1.07)), b = this.proj(V.scale(n, -1.07));
    if ((a.z >= 0) === front) this.moon(a.x, a.y, this.R * 0.042, C.blue, alpha * 0.95, -0.4);
    if ((b.z >= 0) === front) this.sun(b.x, b.y, this.R * 0.032, C.red, alpha * 0.95, this.t * 0.2);
    void g;
  }

  drawState(st, sp, alpha) {
    const g = this.g, C = this.C, { cx, cy, R } = this;
    const pts = []; for (let i = 0; i <= 10; i++) pts.push([lerp(cx, sp.x, i / 10), lerp(cy, sp.y, i / 10)]);
    if (Math.hypot(sp.x - cx, sp.y - cy) > 3) this.brush(pts, R * 0.034, R * 0.014, C.ink, alpha * 0.95, 21);
    const rad = R * 0.085 * sp.s * (0.72 + 0.28 * st.purity);
    // Rabi drive (voice): sound rings leave the state
    if (st.drive > 0.04) {
      for (let j = 0; j < 3; j++) {
        const f = (this.drivePhase + j / 3) % 1;
        g.beginPath(); g.arc(sp.x, sp.y, rad * (1.5 + f * 2.6), 0, TAU); g.lineWidth = 1.4; g.strokeStyle = rgba(C.ink, (1 - f) * clamp(st.drive) * 0.55 * alpha); g.stroke();
      }
    }
    const b = this.proj(V.scale(st.n, -1));
    let dx = b.x - sp.x, dy = b.y - sp.y; const l = Math.hypot(dx, dy);
    if (l < 1) { dx = 0; dy = 1; } else { dx /= l; dy /= l; }
    this.blob(sp.x, sp.y, rad, 1 - st.p0, st.coh, st.phi, [dx, dy], alpha);
  }

  // the state: an eclipse between moon-blue (0) and sun-red (1), crowned by coherence
  blob(x, y, rad, p1, coh, phase, dir, alpha) {
    const g = this.g, C = this.C, t = this.t;
    if (coh > 0.02) {
      const n = 9, rin = rad * 1.16, rout = rad * (1.3 + 1.3 * coh);
      g.beginPath();
      for (let k = 0; k <= 2 * n; k++) {
        const a = phase + (k * Math.PI) / n, rr = (k % 2 === 0 ? rout : rin) * (1 + 0.07 * noise1(k * 3.1 + t * 0.9));
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fillStyle = rgba(C.yellow, 0.92 * coh * alpha); g.fill();
      g.lineWidth = 1.2; g.strokeStyle = rgba(C.ink, 0.4 * coh * alpha); g.stroke();
    }
    g.save(); g.beginPath(); g.arc(x + 1.6, y + 1.4, rad, 0, TAU); g.clip();
    g.fillStyle = rgba(C.blue, alpha); g.fillRect(x - rad * 2, y - rad * 2, rad * 4, rad * 4);
    const d = this.lensD(p1) * rad;
    g.beginPath(); g.arc(x + 1.6 + dir[0] * d, y + 1.4 + dir[1] * d, rad, 0, TAU); g.fillStyle = rgba(C.red, alpha); g.fill();
    g.restore();
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.lineWidth = Math.max(1.6, rad * 0.15); g.strokeStyle = rgba(C.ink, alpha); g.stroke();
  }

  drawRing() {
    const a = this.modeT; if (a < 0.01) return;
    const g = this.g, C = this.C, { cx, cy, R } = this, R0 = R * 1.44, R1 = R * 1.68;
    for (const rr of [R0, R1]) { g.save(); g.setLineDash([1.2, 7]); g.lineWidth = 1.2; g.strokeStyle = rgba(C.ink, 0.25 * a); g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke(); g.restore(); }
    const pos = s => { const ang = -Math.PI / 2 + (((s.slot - 1) % SLOTS) / SLOTS) * TAU, rr = s.out ? R1 : R0; return [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]; };
    if (this.ring.length > 1) {
      g.beginPath(); this.ring.forEach((s, i) => { const p = pos(s); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
      g.lineWidth = 1.1; g.strokeStyle = rgba(C.ink, 0.42 * a); g.stroke();
    }
    for (const s of this.ring) {
      const age = (this.slot - s.slot) / SLOTS, al = a * Math.pow(1 - age, 0.6), pop = easeOutBack(clamp((this.t - s.t0) / 0.35));
      const p = pos(s), sz = R * 0.048 * Math.max(0.01, pop);
      s.out ? this.sun(p[0], p[1], sz * 0.8, C.red, al, s.slot * 0.3) : this.moon(p[0], p[1], sz, C.blue, al, -0.5);
    }
    // the needle: where the next answer will land
    const ang = -Math.PI / 2 + ((this.slot % SLOTS) / SLOTS) * TAU;
    g.lineWidth = 1.2; g.strokeStyle = rgba(C.ink, 0.35 * a);
    g.beginPath(); g.moveTo(cx + Math.cos(ang) * R * 1.34, cy + Math.sin(ang) * R * 1.34); g.lineTo(cx + Math.cos(ang) * R * 1.76, cy + Math.sin(ang) * R * 1.76); g.stroke();
    g.beginPath(); g.arc(cx + Math.cos(ang) * R * 1.76, cy + Math.sin(ang) * R * 1.76, 2.6, 0, TAU); g.fillStyle = rgba(C.ink, 0.5 * a); g.fill();
  }

  drawFX() {
    const g = this.g, C = this.C, t = this.t, R = this.R;
    const keep = [];
    for (const f of this.fx) {
      const u = t - f.t0;
      if (f.k === 'ghost') {
        const e = easeInCubic(clamp(u / f.dur));
        const v = V.add(V.scale(f.from, 1 - e), V.scale(f.to, e)), p = this.proj(v);
        const e0 = Math.max(0, e - 0.35), p0 = this.proj(V.add(V.scale(f.from, 1 - e0), V.scale(f.to, e0)));
        this.brush([[p0.x, p0.y], [p.x, p.y]], 1, R * 0.05, f.out ? C.red : C.blue, 0.55);
        g.beginPath(); g.arc(p.x, p.y, R * 0.04 * p.s, 0, TAU); g.fillStyle = rgba(f.out ? C.red : C.blue, 0.9); g.fill();
        if (u >= f.dur) this._land(f); else keep.push(f);
      } else if (f.k === 'splash') {
        const life = f.big ? 2.4 : 1.4; if (u > life) continue;
        const fly = easeOutCubic(clamp(u / 0.4)), al = 1 - smoothstep(life * 0.45, life, u);
        const col = f.out ? C.red : C.blue;
        for (const d of f.drops) {
          const x = f.x + Math.cos(d.a) * d.d * fly, y = f.y + Math.sin(d.a) * d.d * fly;
          g.beginPath(); g.arc(x, y, d.s, 0, TAU); g.fillStyle = rgba(col, al); g.fill();
        }
        this.star(f.x, f.y, R * (f.big ? 0.12 : 0.06) * (0.6 + 0.4 * fly), al * 0.9, f.x);
        keep.push(f);
      } else if (f.k === 'ripple') {
        const life = f.big ? 1.2 : 0.8; if (u > life) continue;
        const e = easeOutCubic(u / life);
        g.beginPath(); g.arc(f.x, f.y, R * (0.08 + e * (f.big ? 0.8 : 0.35)), 0, TAU);
        g.lineWidth = f.big ? 2.2 : 1.4; g.strokeStyle = rgba(f.out ? C.red : C.blue, (1 - e) * 0.6); g.stroke();
        keep.push(f);
      } else if (f.k === 'numeral') {
        if (u > 1.9) continue;
        if (u < 0) { keep.push(f); continue; }
        const al = smoothstep(0, 0.12, u) * (1 - smoothstep(1.1, 1.9, u)), sc = 1 + 0.12 * easeOutCubic(clamp(u / 1.9));
        const size = R * 0.52 * sc;
        g.save(); g.globalAlpha = al;
        this.ket(String(f.out), this.cx, this.cy + size * 0.28, size, f.out ? C.red : C.blue, 0.95);
        g.font = `700 ${Math.max(18, R * 0.12)}px ${this.hand}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = rgba(C.ink, 0.85);
        g.fillText('colapso', this.cx, this.cy + size * 0.45);
        g.restore();
        keep.push(f);
      }
    }
    this.fx = keep;
  }

  pushTrail(r, p1) {
    const last = this.trail[this.trail.length - 1];
    if (last && V.len(V.sub(last.v, r)) < 0.012) return;
    this.trail.push({ v: [...r], p1 });
    if (this.trail.length > 80) this.trail.shift();
  }

  drawHand(st, sp, dt) {
    const h = st.hand, g = this.g, C = this.C;
    this.handA = approach(this.handA, h ? 1 : 0, 8, dt);
    if (!h || this.handA < 0.02) return;
    const P = h.pts.map(p => this.handToScreen(p.x, p.y)), a = this.handA;
    const bones = () => { g.beginPath(); for (const [i, j] of BONES) { g.moveTo(P[i].x, P[i].y); g.lineTo(P[j].x, P[j].y); } };
    bones(); g.lineWidth = 6; g.strokeStyle = rgba(C.paper, 0.55 * a); g.stroke();   // cut-out halo, reads apart from the sphere
    bones(); g.lineWidth = 1.6; g.strokeStyle = rgba(C.ink, 0.62 * a); g.stroke();
    P.forEach((p, i) => {
      if (TIPS[i]) {
        const r = 6.5;
        g.beginPath(); g.arc(p.x + 1.3, p.y + 1.1, r, 0, TAU); g.fillStyle = rgba(C[TIPS[i]], 0.9 * a); g.fill();
        g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.lineWidth = 1.3; g.strokeStyle = rgba(C.ink, 0.85 * a); g.stroke();
      } else { g.beginPath(); g.arc(p.x, p.y, 2.2, 0, TAU); g.fillStyle = rgba(C.ink, 0.6 * a); g.fill(); }
    });
    const c = this.handToScreen(h.x, h.y);
    if (h.pinch) {
      const target = st.mode === 'measure' ? this.eyePos(st.n) : sp;
      this.dotted([[c.x, c.y], [target.x, target.y]], C.red, 0.55 * a, 1.6, [4, 6]);
      g.beginPath(); g.arc(c.x, c.y, 11, 0, TAU); g.fillStyle = rgba(C.red, 0.9 * a); g.fill();
      g.beginPath(); g.arc(c.x, c.y, 19 + 2 * Math.sin(this.t * 8), 0, TAU); g.lineWidth = 1.5; g.strokeStyle = rgba(C.ink, 0.7 * a); g.stroke();
    } else {
      g.beginPath(); g.arc(c.x, c.y, 13, 0, TAU); g.lineWidth = 1.5; g.strokeStyle = rgba(C.ink, 0.55 * a); g.stroke();
    }
  }
}
