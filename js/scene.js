import {
  TAU, clamp, lerp, approach, smoothstep, noise1, hash1, V, mulberry32,
  easeOutCubic, easeInCubic, rgba, mixc,
} from './util.js';

// After Miró's "Bleu II" (1961): a blue field, one red stroke, a row of dark dots.
// The red stroke is the quantum state; the row of dots is the record of every measurement.
const PAL = {
  bleu: {
    field: [104, 156, 224], light: [150, 192, 240], deep: [76, 124, 202], pale: [236, 243, 252],
    ink: [15, 21, 38], red: [229, 72, 38], gray: [150, 155, 164],
  },
  night: {
    field: [18, 31, 70], light: [34, 54, 106], deep: [10, 19, 48], pale: [52, 74, 128],
    ink: [232, 237, 246], red: [255, 104, 74], gray: [70, 76, 92],
  },
};
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const MAXROW = 90;

export class Scene {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.theme = 'bleu'; this.t = 0; this.kappa = 0; this.modeT = 0;
    this.dots = []; this.fx = []; this.trail = []; this.row = []; this.slot = 0; this.rowPos = 0;
    this.precPhase = 0; this.drivePhase = 0; this.handA = 0; this.povFlash = 0;
    this.serif = '"Fraunces", Georgia, serif';
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
    this.seedDots();
  }
  fit(box, snap = false) {
    this.box = box;
    if (snap) { Object.assign(this, this.layout()); this.R = this.R0; }
  }
  // the sphere, its labels and the row of outcomes below it fit in the free area
  layout() {
    const b = this.box || { l: 0, r: this.W, t: 0, b: this.H };
    const aw = b.r - b.l, ah = b.b - b.t;
    const R0 = Math.max(36, Math.min(ah / 3.2, aw / 3.1));
    return { cx: (b.l + b.r) / 2, cy: b.t + 1.58 * R0 + Math.max(0, ah - 3.2 * R0) / 2, R0 };
  }
  camera() {
    const a = this.yaw, b = this.pitch;
    this.F = [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
    this.Rv = [-Math.sin(a), Math.cos(a), 0];
    this.U = V.cross(this.F, this.Rv);
  }
  proj(v) {
    const X = V.dot(v, this.Rv), Y = V.dot(v, this.U), Z = V.dot(v, this.F);
    const s = 1 / (1 - Z * 0.14);
    return { x: this.cx + X * this.R * s, y: this.cy - Y * this.R * s, z: Z, s };
  }
  dragRotate(vec, dx, dy, gain = 1) {
    const ang = Math.hypot(dx, dy) / this.R * gain;
    if (ang < 1e-5) return vec;
    const axis = V.norm(V.add(V.scale(this.Rv, dy), V.scale(this.U, dx)));
    return V.rotate(vec, axis, ang);
  }
  handToScreen(x, y) { return { x: ((x - 0.5) * 1.35 + 0.5) * this.W, y: ((y - 0.5) * 1.35 + 0.5) * this.H }; }

  palette() {
    const P = PAL[this.theme] || PAL.bleu, k = this.kappa;
    const toGray = c => mixc(c, P.gray, 0.72 * k); // the classical world loses its blue
    this.C = { field: toGray(P.field), light: toGray(P.light), deep: toGray(P.deep), pale: P.pale, ink: P.ink, red: mixc(P.red, P.gray, 0.15 * k) };
  }

  // ---------- environment: a few dark dots adrift ----------
  seedDots() {
    const rnd = mulberry32(5), n = this.mobile ? 9 : 16;
    this.dots = [];
    for (let i = 0; i < n; i++) {
      let x = rnd(), y = 0.12 + rnd() * 0.76;
      for (let k = 0; k < 30 && Math.hypot(x * this.W - this.cx, y * this.H - this.cy) < this.R0 * 1.5; k++) { x = rnd(); y = 0.12 + rnd() * 0.76; }
      const big = rnd() < 0.18;
      this.dots.push({ x, y, seed: rnd() * 1000, r: big ? 5 + rnd() * 4 : 1.8 + rnd() * 2.6, ent: 0, entT: 0, rec: -1, recA: 0, flash: 0, snap: 0 });
    }
  }
  entangle() {
    let best = null, bd = 1e9;
    for (let k = 0; k < 4; k++) {
      const d = this.dots[Math.floor(Math.random() * this.dots.length)];
      if (d.entT > 0) continue;
      const dist = Math.hypot(d.x * this.W - this.cx, d.y * this.H - this.cy);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best) return false;
    best.entT = 1; best.rec = -1; best.recA = 0;
    return true;
  }
  resolveRecords(out) { for (const d of this.dots) if (d.ent > 0.05) { d.entT = 0; d.rec = out; d.recA = 1; d.flash = 1; d.snap = 1; } }
  releaseRecords() { for (const d of this.dots) d.entT = 0; }

  // ---------- measurement events ----------
  shot(out, r, n) { this._ghost(out, r, n, false); }
  collapse(out, r, n) {
    this._ghost(out, r, n, true);
    this.fx.push({ k: 'numeral', out, t0: this.t + 0.12 });
    this.trail = [];
  }
  _ghost(out, r, n, big) {
    this.fx.push({ k: 'ghost', from: [...r], to: out === 0 ? [...n] : V.scale(n, -1), out, t0: this.t, dur: big ? 0.16 : 0.15, big });
    this.povFlash = 1;
  }
  _land(f) {
    const p = this.proj(f.to);
    const drops = [];
    for (let i = 0; i < (f.big ? 9 : 5); i++) drops.push({ a: Math.random() * TAU, d: this.R * (0.05 + Math.random() * (f.big ? 0.22 : 0.1)), s: 0.8 + Math.random() * (f.big ? 2.6 : 1.6) });
    this.fx.push({ k: 'splash', x: p.x, y: p.y, out: f.out, t0: this.t, drops, big: f.big });
    this.fx.push({ k: 'fall', x: p.x, y: p.y, out: f.out, t0: this.t, dur: 0.34 });
  }
  _record(out) {
    this.slot++;
    this.row.push({ out, slot: this.slot, t0: this.t, size: 0.8 + 0.45 * hash1(this.slot * 7.3 + out), seed: this.slot * 3.1 });
    if (this.row.length > MAXROW) this.row.shift();
  }
  clearRing() { this.row = []; this.slot = 0; this.rowPos = 0; }
  rowGeom() {
    const R = this.R, sp = Math.max(9, R * 0.1);
    return { xr: this.cx + R * 1.2, y: this.cy + R * 1.55, sp };
  }

  // ---------- frame ----------
  render(st, dt) {
    this.t += dt;
    const g = this.g, t = this.t;
    this.modeT = approach(this.modeT, st.mode === 'measure' ? 1 : 0, 4.5, dt);
    this.kappa = approach(this.kappa, st.kappa, 3, dt);
    this.yaw = 0.62 + 0.1 * Math.sin(t * 0.07);
    this.pitch = 0.3 + 0.04 * Math.sin(t * 0.053 + 1);
    this.camera();
    const L = this.layout();
    this.cx = approach(this.cx, L.cx, 6, dt); this.cy = approach(this.cy, L.cy, 6, dt); this.R0 = approach(this.R0, L.R0, 6, dt);
    this.R = this.R0 * lerp(1, 0.94, easeOutCubic(this.modeT));
    this.palette();
    this.povFlash = approach(this.povFlash, 0, 7, dt);
    this.precPhase += st.omega * dt;
    this.drivePhase += dt * 1.6;
    this.rowPos = approach(this.rowPos, this.slot, 9, dt);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    this.drawField();
    this.updateDots(dt);
    const sp = this.proj(st.r);
    this.drawThreads(sp);
    this.drawDots();
    this.drawSphere(st, sp);
    this.drawRow();
    this.drawFX();
    this.drawHand(st, sp, dt);
  }

  // ---------- primitives ----------
  brush(pts, w0, w1, col, alpha = 1, seed = 0, rough = 0.18) {
    const n = pts.length; if (n < 2) return;
    const g = this.g, L = [], Rr = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const tt = i / (n - 1), w = lerp(w0, w1, tt) * 0.5;
      const wl = w * (1 + rough * noise1(seed + tt * 7)), wr = w * (1 + rough * noise1(seed + 50 + tt * 7));
      L.push([p[0] - dy * wl, p[1] + dx * wl]); Rr.push([p[0] + dy * wr, p[1] - dx * wr]);
    }
    g.beginPath(); g.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
    g.closePath(); g.fillStyle = rgba(col, alpha); g.fill();
    g.beginPath(); g.arc(pts[0][0], pts[0][1], w0 * 0.5, 0, TAU); g.arc(pts[n - 1][0], pts[n - 1][1], w1 * 0.5, 0, TAU); g.fill();
  }
  dotted(pts, col, alpha, w = 1.1, dash = [1, 6]) {
    if (pts.length < 2) return;
    const g = this.g;
    g.save(); g.setLineDash(dash); g.lineWidth = w; g.strokeStyle = rgba(col, alpha);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke(); g.restore();
  }
  line3(a, b, n = 10) { const out = []; for (let i = 0; i <= n; i++) { const p = this.proj(V.add(V.scale(a, 1 - i / n), V.scale(b, i / n))); out.push([p.x, p.y]); } return out; }
  // Miró's dots are never perfect circles: slightly flattened, softly lumpy
  blot(x, y, r, col, alpha, seed) {
    const g = this.g, n = 14;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, rr = r * (1 + 0.09 * noise1(seed + i * 0.9));
      const px = x + Math.cos(a) * rr * 1.06, py = y + Math.sin(a) * rr * (Math.sin(a) > 0 ? 0.84 : 0.95);
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.fillStyle = rgba(col, alpha); g.fill();
  }
  ket(inner, x, y, size, col, alpha = 1, align = 'center', weight = 400) {
    const g = this.g;
    g.font = `${weight} ${size}px ${this.serif}`;
    const w = g.measureText(inner).width, total = size * 0.24 + w + size * 0.36;
    const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    g.strokeStyle = rgba(col, alpha); g.fillStyle = rgba(col, alpha); g.lineWidth = Math.max(1, size * 0.055);
    g.beginPath(); g.moveTo(x0 + size * 0.06, y - size * 0.74); g.lineTo(x0 + size * 0.06, y + size * 0.2); g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(inner, x0 + size * 0.22, y);
    const bx = x0 + size * 0.22 + w + size * 0.06;
    g.beginPath(); g.moveTo(bx, y - size * 0.74); g.lineTo(bx + size * 0.2, y - size * 0.27); g.lineTo(bx, y + size * 0.2); g.stroke();
  }

  // ---------- layers ----------
  // the painted blue field: mottled, low-resolution, slowly breathing
  drawField() {
    const W = this.W, H = this.H, t = this.t, C = this.C, s = 5;
    if (!this.bg || this.bg.width !== Math.ceil(W / s) || this.bg.height !== Math.ceil(H / s)) {
      this.bg = document.createElement('canvas'); this.bg.width = Math.ceil(W / s); this.bg.height = Math.ceil(H / s); this.bgT = -1;
    }
    if (t - this.bgT > 0.1) {
      this.bgT = t;
      const b = this.bg.getContext('2d'), w = this.bg.width, h = this.bg.height, M = Math.max(w, h);
      b.fillStyle = rgba(C.field); b.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) {
        const light = i % 2 === 0, px = (hash1(i * 3.7) + 0.05 * noise1(t * 0.03 + i * 5)) * w, py = (hash1(i * 9.1) + 0.05 * noise1(t * 0.035 + i * 11)) * h;
        const rr = M * (0.12 + 0.3 * hash1(i * 5.3)), a = light ? 0.28 : 0.2;
        const gr = b.createRadialGradient(px, py, 0, px, py, rr);
        gr.addColorStop(0, rgba(light ? C.light : C.deep, a)); gr.addColorStop(1, rgba(light ? C.light : C.deep, 0));
        b.fillStyle = gr; b.fillRect(0, 0, w, h);
      }
      // loose horizontal brushwork
      for (let i = 0; i < 22; i++) {
        const px = hash1(i * 13.1) * w, py = hash1(i * 17.7) * h, lw = M * (0.08 + 0.18 * hash1(i * 2.9));
        b.save(); b.translate(px + 3 * noise1(t * 0.05 + i), py); b.rotate(-0.08 + 0.16 * hash1(i * 4.4)); b.scale(1, 0.18);
        const gr = b.createRadialGradient(0, 0, 0, 0, 0, lw);
        gr.addColorStop(0, rgba(i % 3 ? C.light : C.deep, 0.16)); gr.addColorStop(1, rgba(C.light, 0));
        b.fillStyle = gr; b.beginPath(); b.arc(0, 0, lw, 0, TAU); b.fill(); b.restore();
      }
    }
    const g = this.g;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.bg, 0, 0, W, H);
  }

  updateDots(dt) {
    const t = this.t, W = this.W, H = this.H;
    for (const d of this.dots) {
      d.x += (noise1(d.seed + t * 0.04) * 5 + 1.5) / W * dt;
      d.y += (noise1(d.seed * 1.3 + 40 + t * 0.04) * 3) / H * dt;
      if (d.x > 1.03) d.x = -0.03; if (d.x < -0.03) d.x = 1.03;
      d.ent = approach(d.ent, d.entT, d.entT ? 5 : 2, dt);
      d.recA = Math.max(0, d.recA - dt / 10);
      d.flash = approach(d.flash, 0, 3, dt);
      d.snap = approach(d.snap, 0, 2, dt);
    }
  }
  drawDots() {
    const C = this.C, g = this.g, dim = 1 - 0.45 * this.modeT;
    for (const d of this.dots) {
      const x = d.x * this.W, y = d.y * this.H, r = d.r * (1 + 0.5 * d.flash);
      this.blot(x, y, r, d.rec === 1 && d.recA > 0 ? mixc(C.ink, C.red, Math.min(1, d.recA * 1.5)) : C.ink, 0.88 * dim, d.seed);
      if (d.ent > 0.02) { g.beginPath(); g.arc(x, y, r + 4, 0, TAU); g.lineWidth = 1; g.strokeStyle = rgba(C.pale, 0.7 * d.ent * dim); g.stroke(); }
    }
  }
  drawThreads(sp) {
    const g = this.g, C = this.C;
    for (const d of this.dots) {
      if (d.ent < 0.02 && d.snap < 0.02) continue;
      const x = d.x * this.W, y = d.y * this.H;
      const mx = (x + sp.x) / 2, my = (y + sp.y) / 2, dx = x - sp.x, dy = y - sp.y, bend = 0.12 * Math.sin(d.seed);
      g.beginPath(); g.moveTo(sp.x, sp.y); g.quadraticCurveTo(mx - dy * bend, my + dx * bend, x, y);
      if (d.ent > 0.02) { g.lineWidth = 0.8; g.strokeStyle = rgba(C.ink, 0.3 * d.ent); g.stroke(); }
      if (d.snap > 0.02) { g.lineWidth = 1.4; g.strokeStyle = rgba(d.rec ? C.red : C.ink, 0.7 * d.snap); g.stroke(); }
    }
  }

  drawCircle3D(u, w, front) {
    const n = 110, C = this.C; let run = [];
    const flush = () => {
      if (run.length > 1) front ? this.brush(run, 1.1, 1.1, C.ink, 0.42, run[0][0] * 0.01, 0.25) : this.dotted(run, C.ink, 0.22);
      run = [];
    };
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, p = this.proj(V.add(V.scale(u, Math.cos(a)), V.scale(w, Math.sin(a))));
      if ((p.z >= 0) === front) run.push([p.x, p.y]); else flush();
    }
    flush();
  }
  drawAxisHalf(dir, len, front, alpha) {
    for (const sgn of [1, -1]) {
      const end = V.scale(dir, len * sgn);
      if ((this.proj(end).z >= 0) !== front) continue;
      const pts = this.line3([0, 0, 0], end, 8);
      front ? this.brush(pts, 1.2, 0.9, this.C.ink, alpha, sgn * 7 + dir[0] * 3 + dir[1], 0.2) : this.dotted(pts, this.C.ink, alpha * 0.5);
    }
  }
  inkRing(cx, cy, r, w, alpha) {
    const g = this.g, n = 128, t = this.t, O = [], I = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, rr = r * (1 + 0.004 * noise1(1.7 + a * 2.2 + t * 0.2));
      const ww = w * (0.6 + 0.5 * (0.5 + 0.5 * noise1(3.1 + a * 1.6))) * (0.8 + 0.3 * Math.max(0, Math.cos(a - 0.7)));
      O.push([cx + Math.cos(a) * (rr + ww / 2), cy + Math.sin(a) * (rr + ww / 2)]);
      I.push([cx + Math.cos(a) * (rr - ww / 2), cy + Math.sin(a) * (rr - ww / 2)]);
    }
    g.beginPath(); O.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    for (let i = n; i >= 0; i--) g.lineTo(I[i][0], I[i][1]);
    g.closePath(); g.fillStyle = rgba(this.C.ink, alpha); g.fill();
  }

  drawSphere(st, sp) {
    const g = this.g, C = this.C, { cx, cy, R } = this, mT = this.modeT;
    const nIsZ = st.n[2] > 0.995;
    const ex = [1, 0, 0], ey = [0, 1, 0], ez = [0, 0, 1];

    // back
    this.drawCircle3D(ex, ey, false); this.drawCircle3D(ex, ez, false); this.drawCircle3D(ey, ez, false);
    this.drawAxisHalf(ex, 1.15, false, 0.4); this.drawAxisHalf(ey, 1.15, false, 0.4); this.drawAxisHalf(ez, 1.18, false, 0.6);
    if (!nIsZ || mT > 0.05) this.drawPov(st.n, false, lerp(0.6, 1, mT));
    const behind = sp.z < 0;
    if (behind) this.drawState(st, sp, 0.5);

    // body: a lighter wash of the same blue, with a pale glow while coherent
    const body = g.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx, cy, R);
    body.addColorStop(0, rgba(C.pale, 0.3)); body.addColorStop(1, rgba(C.pale, 0.07));
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = body; g.fill();
    if (st.coh > 0.02) {
      const yb = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R * 0.9);
      yb.addColorStop(0, rgba(C.pale, 0.2 * st.coh)); yb.addColorStop(1, rgba(C.pale, 0));
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip(); g.fillStyle = yb; g.fillRect(cx - R, cy - R, 2 * R, 2 * R); g.restore();
    }
    if (this.kappa > 0.02) { // graphite hatching as the system turns classical
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
      g.strokeStyle = rgba(C.ink, 0.12 * this.kappa); g.lineWidth = 0.8;
      for (let o = -2 * R; o < 2 * R; o += 6) { g.beginPath(); g.moveTo(cx + o - R, cy + R); g.lineTo(cx + o + R, cy - R); g.stroke(); }
      g.restore();
    }
    if (st.purity < 0.97) {
      g.save(); g.setLineDash([1.5, 6]); g.lineWidth = 1; g.strokeStyle = rgba(C.ink, 0.25 + 0.35 * (1 - st.purity));
      g.beginPath(); g.arc(cx, cy, R * st.purity, 0, TAU); g.stroke(); g.restore();
    }
    this.inkRing(cx, cy, R, Math.max(1.6, R * 0.013), 0.85);

    // front
    this.drawCircle3D(ex, ey, true); this.drawCircle3D(ex, ez, true); this.drawCircle3D(ey, ez, true);
    this.drawAxisHalf(ex, 1.15, true, 0.4); this.drawAxisHalf(ey, 1.15, true, 0.4); this.drawAxisHalf(ez, 1.18, true, 0.6);
    if (!nIsZ || mT > 0.05) this.drawPov(st.n, true, lerp(0.6, 1, mT));

    // Hamiltonian: faint beads travelling on the equator at the precession rate
    const wA = clamp(Math.abs(st.omega) / 1.2) * (1 - 0.7 * mT);
    if (wA > 0.03) {
      for (let k = 0; k < 6; k++) {
        const a = this.precPhase + (k / 6) * TAU, p = this.proj([Math.cos(a), Math.sin(a), 0]);
        g.beginPath(); g.arc(p.x, p.y, 2.4 * p.s, 0, TAU); g.fillStyle = rgba(C.pale, wA * (p.z >= 0 ? 0.9 : 0.35)); g.fill();
      }
    }

    // poles: |0> a dark dot, |1> a red dot
    const lab = Math.max(13, R * 0.08);
    const pn = this.proj([0, 0, 1]), ps = this.proj([0, 0, -1]);
    this.blot(pn.x, pn.y, Math.max(3, R * 0.022), C.ink, 0.95, 11);
    this.blot(ps.x, ps.y, Math.max(3, R * 0.022), C.red, 0.95, 12);
    const ln = this.proj([0, 0, 1.24]), ls = this.proj([0, 0, -1.26]);
    this.ket('0', ln.x + R * 0.1, ln.y + lab * 0.3, lab * 1.1, C.ink, 0.85, 'left');
    this.ket('1', ls.x + R * 0.1, ls.y + lab * 0.3, lab * 1.1, C.ink, 0.85, 'left');
    const small = lab * 0.78, la = 0.42 * (1 - 0.4 * mT);
    [[[1.28, 0, 0], '+'], [[-1.28, 0, 0], '−'], [[0, 1.28, 0], '+i'], [[0, -1.28, 0], '−i']].forEach(([v, s]) => {
      const p = this.proj(v); this.ket(s, p.x, p.y + small * 0.3, small, C.ink, la * (p.z >= 0 ? 1 : 0.6));
    });

    // theta / phi (the paper's two angles)
    const gA = 0.4 * (1 - 0.7 * mT);
    if (st.purity > 0.25 && st.theta > 0.12 && st.theta < Math.PI - 0.12 && gA > 0.05) {
      const r = st.r, q = this.proj([r[0], r[1], 0]), o = this.proj([0, 0, 0]);
      this.dotted([[sp.x, sp.y], [q.x, q.y]], C.ink, gA * 0.8, 1, [3, 5]);
      this.dotted([[o.x, o.y], [q.x, q.y]], C.ink, gA * 0.8, 1, [3, 5]);
      const ph = st.phi, th = st.theta, h = [Math.cos(ph), Math.sin(ph), 0];
      const arcT = []; for (let i = 0; i <= 16; i++) { const u = (i / 16) * th; const p = this.proj(V.add(V.scale(h, Math.sin(u) * 0.28), [0, 0, Math.cos(u) * 0.28])); arcT.push([p.x, p.y]); }
      this.brush(arcT, 1, 1, C.ink, gA, 9);
      const pm = this.proj(V.add(V.scale(h, Math.sin(th / 2) * 0.4), [0, 0, Math.cos(th / 2) * 0.4]));
      g.font = `italic 400 ${lab}px ${this.serif}`; g.fillStyle = rgba(C.ink, gA * 1.6); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('θ', pm.x, pm.y);
      const phN = ((ph % TAU) + TAU) % TAU;
      if (phN > 0.15) {
        const arcP = []; for (let i = 0; i <= 20; i++) { const u = (i / 20) * phN; const p = this.proj([Math.cos(u) * 0.22, Math.sin(u) * 0.22, 0]); arcP.push([p.x, p.y]); }
        this.brush(arcP, 1, 1, C.ink, gA, 12);
        const pq = this.proj([Math.cos(phN / 2) * 0.32, Math.sin(phN / 2) * 0.32, 0]);
        g.fillText('φ', pq.x, pq.y);
      }
    }

    // where the state has been: a faint red haze
    const tr = this.trail;
    for (let i = 0; i < tr.length; i++) {
      const p = this.proj(tr[i].v), a = (i / tr.length) * 0.28 * (p.z >= 0 ? 1 : 0.5);
      g.beginPath(); g.arc(p.x, p.y, (0.8 + 2 * i / tr.length) * p.s, 0, TAU); g.fillStyle = rgba(C.red, a); g.fill();
    }
    if (!behind) this.drawState(st, sp, 1);
  }

  // the point of view: a dashed axis and a small open eye-ring at its end
  povPos(n) { return this.proj(V.scale(n, 1.4)); }
  drawPov(n, front, alpha) {
    const g = this.g, C = this.C;
    for (const sgn of [1, -1]) {
      const end = V.scale(n, 1.4 * sgn);
      if ((this.proj(end).z >= 0) !== front) continue;
      this.dotted(this.line3([0, 0, 0], end, 10), C.ink, alpha * (front ? 0.6 : 0.28), front ? 1.4 : 1, [6, 6]);
    }
    const pe = this.povPos(n);
    if ((pe.z >= 0) === front) {
      const r = this.R * 0.045 * (1 + 0.25 * this.povFlash);
      g.beginPath(); g.arc(pe.x, pe.y, r, 0, TAU); g.fillStyle = rgba(C.pale, 0.5 * alpha); g.fill();
      g.lineWidth = 1.4; g.strokeStyle = rgba(C.ink, 0.85 * alpha); g.stroke();
      g.beginPath(); g.arc(pe.x, pe.y, r * 0.32, 0, TAU); g.fillStyle = rgba(C.ink, 0.9 * alpha); g.fill();
      if (this.modeT > 0.3 && !this.mobile && front) {
        g.font = `italic 400 ${Math.max(14, this.R * 0.065)}px ${this.serif}`; g.fillStyle = rgba(C.ink, 0.6 * this.modeT);
        g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('punto de vista', pe.x + r * 1.8, pe.y + 1);
      }
    }
    if (n[2] > 0.995 || !front) return;
    // this point of view's own poles
    const a = this.proj(n), b = this.proj(V.scale(n, -1));
    if (a.z >= 0) this.blot(a.x, a.y, Math.max(2.6, this.R * 0.02), C.ink, 0.9 * alpha, 21);
    if (b.z >= 0) this.blot(b.x, b.y, Math.max(2.6, this.R * 0.02), C.red, 0.9 * alpha, 22);
  }

  // the state: a single red brushstroke from the centre, like the one in Bleu II
  drawState(st, sp, alpha) {
    const g = this.g, C = this.C, { cx, cy, R } = this;
    const len = Math.hypot(sp.x - cx, sp.y - cy);
    if (st.coh > 0.02) {
      const gl = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R * (0.1 + 0.2 * st.coh));
      gl.addColorStop(0, rgba(C.pale, 0.55 * st.coh * alpha)); gl.addColorStop(1, rgba(C.pale, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(sp.x, sp.y, R * (0.1 + 0.2 * st.coh), 0, TAU); g.fill();
    }
    if (st.drive > 0.04) {
      for (let j = 0; j < 3; j++) {
        const f = (this.drivePhase + j / 3) % 1;
        g.beginPath(); g.arc(sp.x, sp.y, R * (0.06 + f * 0.22), 0, TAU); g.lineWidth = 1; g.strokeStyle = rgba(C.pale, (1 - f) * clamp(st.drive) * 0.7 * alpha); g.stroke();
      }
    }
    const w = R * 0.052 * (0.8 + 0.2 * st.purity);
    if (len < 2) { this.blot(cx, cy, w * 0.7, C.red, alpha, 3); return; }
    const pts = []; for (let i = 0; i <= 18; i++) pts.push([lerp(cx, sp.x, i / 18), lerp(cy, sp.y, i / 18)]);
    this.brush(pts, w * 0.95, w * 0.8, C.red, 0.96 * alpha, 21, 0.14);
    // paint texture: a lighter streak inside the stroke
    const inner = pts.map(p => [p[0] + (sp.y - cy) / len * w * 0.12, p[1] - (sp.x - cx) / len * w * 0.12]);
    this.brush(inner.slice(2, 16), w * 0.28, w * 0.18, mixc(C.red, [255, 190, 150], 0.45), 0.35 * alpha, 33, 0.4);
  }

  drawRow() {
    const g = this.g, C = this.C, { xr, y, sp } = this.rowGeom();
    const vis = Math.max(0.25, this.modeT);
    for (const s of this.row) {
      const x = xr - (this.rowPos - s.slot) * sp;
      if (x < -20) continue;
      const fadeL = clamp((x - 8) / (this.W * 0.18)), pop = clamp((this.t - s.t0) / 0.2);
      const r = this.R * 0.03 * s.size * (s.out ? 1.12 : 1) * (0.4 + 0.6 * pop);
      this.blot(x, y + (s.out ? -1 : 1) * this.R * 0.028, r, s.out ? C.red : C.ink, 0.92 * fadeL * vis, s.seed);
    }
  }

  drawFX() {
    const g = this.g, C = this.C, t = this.t, R = this.R;
    const keep = [];
    for (const f of this.fx) {
      const u = t - f.t0;
      const col = f.out ? C.red : C.ink;
      if (f.k === 'ghost') {
        const e = easeInCubic(clamp(u / f.dur));
        const v = V.add(V.scale(f.from, 1 - e), V.scale(f.to, e)), p = this.proj(v);
        const e0 = Math.max(0, e - 0.4), p0 = this.proj(V.add(V.scale(f.from, 1 - e0), V.scale(f.to, e0)));
        this.brush([[p0.x, p0.y], [p.x, p.y]], 0.8, R * 0.035, col, 0.6);
        if (u >= f.dur) this._land(f); else keep.push(f);
      } else if (f.k === 'splash') {
        const life = f.big ? 1.8 : 0.9; if (u > life) continue;
        const fly = easeOutCubic(clamp(u / 0.35)), al = 1 - smoothstep(life * 0.4, life, u);
        for (const d of f.drops) { g.beginPath(); g.arc(f.x + Math.cos(d.a) * d.d * fly, f.y + Math.sin(d.a) * d.d * fly, d.s, 0, TAU); g.fillStyle = rgba(col, al * 0.9); g.fill(); }
        g.beginPath(); g.arc(f.x, f.y, R * (0.04 + fly * (f.big ? 0.4 : 0.16)), 0, TAU); g.lineWidth = 1; g.strokeStyle = rgba(col, (1 - fly) * 0.6); g.stroke();
        keep.push(f);
      } else if (f.k === 'fall') { // the answer drops into the row of dots
        const { xr, y, sp } = this.rowGeom();
        const u1 = clamp(u / f.dur), e = u1 * u1 * (3 - 2 * u1);
        const tx = xr + sp, ty = y + (f.out ? -1 : 1) * R * 0.028;
        const x = lerp(f.x, tx, e), yy = lerp(f.y, ty, e) - Math.sin(Math.PI * e) * R * 0.25;
        this.blot(x, yy, R * 0.022, col, 0.9, 5);
        if (u1 >= 1) this._record(f.out); else keep.push(f);
      } else if (f.k === 'numeral') {
        if (u > 1.8) continue;
        if (u < 0) { keep.push(f); continue; }
        const al = smoothstep(0, 0.12, u) * (1 - smoothstep(1.0, 1.8, u)), size = R * 0.42 * (1 + 0.08 * easeOutCubic(u / 1.8));
        g.save(); g.globalAlpha = al;
        this.ket(String(f.out), this.cx, this.cy + size * 0.28, size, f.out ? C.red : C.ink, 0.9, 'center', 300);
        g.font = `italic 400 ${Math.max(16, R * 0.09)}px ${this.serif}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = rgba(C.ink, 0.8);
        g.fillText('colapso', this.cx, this.cy + size * 0.45);
        g.restore();
        keep.push(f);
      }
    }
    this.fx = keep;
  }

  pushTrail(r) {
    const last = this.trail[this.trail.length - 1];
    if (last && V.len(V.sub(last.v, r)) < 0.012) return;
    this.trail.push({ v: [...r] });
    if (this.trail.length > 70) this.trail.shift();
  }

  drawHand(st, sp, dt) {
    const h = st.hand, g = this.g, C = this.C;
    this.handA = approach(this.handA, h ? 1 : 0, 8, dt);
    if (!h || this.handA < 0.02) return;
    const P = h.pts.map(p => this.handToScreen(p.x, p.y)), a = this.handA;
    const bones = () => { g.beginPath(); for (const [i, j] of BONES) { g.moveTo(P[i].x, P[i].y); g.lineTo(P[j].x, P[j].y); } };
    bones(); g.lineWidth = 5; g.strokeStyle = rgba(C.field, 0.5 * a); g.stroke();
    bones(); g.lineWidth = 1.2; g.strokeStyle = rgba(C.ink, 0.5 * a); g.stroke();
    P.forEach((p, i) => { this.blot(p.x, p.y, i % 4 === 0 && i ? 3.6 : 1.8, i === 8 ? C.red : C.ink, 0.8 * a, i); });
    const c = this.handToScreen(h.x, h.y);
    if (h.pinch) {
      const target = st.mode === 'measure' ? this.povPos(st.n) : sp;
      this.dotted([[c.x, c.y], [target.x, target.y]], C.ink, 0.45 * a, 1.2, [3, 6]);
      this.blot(c.x, c.y, 8, C.red, 0.9 * a, 2);
      g.beginPath(); g.arc(c.x, c.y, 15 + 2 * Math.sin(this.t * 8), 0, TAU); g.lineWidth = 1.1; g.strokeStyle = rgba(C.ink, 0.6 * a); g.stroke();
    } else {
      g.beginPath(); g.arc(c.x, c.y, 11, 0, TAU); g.lineWidth = 1.1; g.strokeStyle = rgba(C.ink, 0.5 * a); g.stroke();
    }
  }
}
