import { V, clamp } from './util.js';

// Bloch vector r (|r| = 1 pure, |r| < 1 mixed): rho = (1 + r.sigma) / 2
export const PRESETS = {
  '0': [0, 0, 1], '1': [0, 0, -1],
  '+': [1, 0, 0], '-': [-1, 0, 0],
  '+i': [0, 1, 0], '-i': [0, -1, 0],
};
export const AXES = { z: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0] };

export class Qubit {
  constructor() {
    this.r = [0, 0, 1];
    this.lastPhi = 0;
    this.target = null;      // animated preparation (geodesic + re-purification)
    this.driveAxis = null;   // fixed axis during a Rabi drive episode
    this.driveIdle = 0;
  }
  get purity() { return V.len(this.r); }
  get theta() { const l = V.len(this.r) || 1; return Math.acos(clamp(this.r[2] / l, -1, 1)); }
  get phi() {
    const r = this.r;
    if (Math.hypot(r[0], r[1]) > 1e-4) this.lastPhi = Math.atan2(r[1], r[0]);
    return this.lastPhi;
  }
  // Born rule along point of view n: outcome 0 <-> +n
  prob0(n) { return clamp((1 + V.dot(this.r, n)) / 2); }
  // coherence w.r.t. the basis defined by n (off-diagonal magnitude, 0..1)
  transverse(n) { const d = V.dot(this.r, n); return Math.sqrt(Math.max(0, V.dot(this.r, this.r) - d * d)); }

  rotate(axis, ang) { this.target = null; this.r = V.rotate(this.r, axis, ang); }
  prepare(vec) { this.target = V.norm(vec); this.driveAxis = null; }

  update(dt, { omega = 0, drive = 0, gamma = 0 } = {}) {
    if (this.target) {
      const l = V.len(this.r);
      const u = l > 1e-6 ? V.scale(this.r, 1 / l) : [0, 0, 1];
      const ang = Math.acos(clamp(V.dot(u, this.target), -1, 1));
      let k = V.cross(u, this.target);
      k = V.len(k) < 1e-6 ? V.perp(u) : V.norm(k);
      const step = Math.min(ang, ang * (1 - Math.exp(-7 * dt)) + 0.6 * dt);
      const nl = l + (1 - l) * (1 - Math.exp(-6 * dt)) + 0.02 * dt;
      this.r = V.scale(V.rotate(u, k, step), Math.min(1, nl));
      if (ang - step < 0.002 && nl > 0.998) { this.r = [...this.target]; this.target = null; }
      return;
    }
    // Hamiltonian: precession around z at angular frequency omega (energy <-> frequency)
    if (omega) {
      this.r = V.rotate(this.r, [0, 0, 1], omega * dt);
      if (this.driveAxis) this.driveAxis = V.rotate(this.driveAxis, [0, 0, 1], omega * dt);
    }
    // Rabi drive: rotation around a fixed transverse axis -> 0 <-> 1 oscillation
    if (drive > 1e-3) {
      if (!this.driveAxis) { const p = this.phi; this.driveAxis = [-Math.sin(p), Math.cos(p), 0]; }
      this.r = V.rotate(this.r, this.driveAxis, drive * dt);
      this.driveIdle = 0;
    } else if (this.driveAxis && (this.driveIdle += dt) > 0.5) this.driveAxis = null;
    // decoherence (Zurek): the environment dephases in the pointer basis z
    if (gamma) { const f = Math.exp(-gamma * dt); this.r[0] *= f; this.r[1] *= f; }
  }

  sample(n, u) { const p0 = this.prob0(n); return { out: u < p0 ? 0 : 1, p0 }; }
  collapse(n, out) { this.r = out === 0 ? [...n] : V.scale(n, -1); this.target = null; this.driveAxis = null; }
}
