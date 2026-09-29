// Camera hand tracking (MediaPipe, vendored so it works offline). Pinch = grab.
let vision = null;
const base = new URL('../vendor/mediapipe/', import.meta.url).href;

export class HandInput {
  constructor(video) {
    this.video = video; this.active = false; this.ready = false;
    this.hand = null; this.pinch = false; this._lastT = -1; this._miss = 0; this._sx = null;
  }

  async start(onStatus) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    });
    const v = this.video;
    v.srcObject = this.stream; v.muted = true; v.playsInline = true;
    await v.play();
    this.active = true;
    if (!this.landmarker) {
      onStatus?.('despertando el detector de manos…');
      vision = vision || await import('../vendor/mediapipe/vision_bundle.mjs');
      const { FilesetResolver, HandLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks(base + 'wasm');
      const opts = delegate => ({
        baseOptions: { modelAssetPath: base + 'hand_landmarker.task', delegate },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      try { this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('GPU')); }
      catch { this.landmarker = await HandLandmarker.createFromOptions(fileset, opts('CPU')); }
    }
    this.ready = true;
  }

  stop() {
    this.active = false; this.hand = null; this.pinch = false;
    this.stream?.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
  }

  update() {
    if (!this.ready || !this.active) return this.hand;
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this._lastT) return this.hand;
    this._lastT = v.currentTime;
    let res;
    try { res = this.landmarker.detectForVideo(v, performance.now()); } catch { return this.hand; }
    const lm = res?.landmarks?.[0];
    if (!lm) {
      if (++this._miss > 5) { this.hand = null; this.pinch = false; this._sx = null; }
      return this.hand;
    }
    this._miss = 0;
    const pts = lm.map(p => ({ x: 1 - p.x, y: p.y }));  // mirror: move right, it goes right
    const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
    const ratio = d(4, 8) / (d(0, 9) + 1e-6);
    if (this.pinch ? ratio > 0.45 : ratio < 0.27) this.pinch = !this.pinch;
    const cx = this.pinch ? (pts[4].x + pts[8].x) / 2 : pts[8].x;
    const cy = this.pinch ? (pts[4].y + pts[8].y) / 2 : pts[8].y;
    // speed-adaptive smoothing (one-euro-ish): calm when still, quick when moving
    if (!this._sx) this._sx = { x: cx, y: cy };
    const sp = Math.hypot(cx - this._sx.x, cy - this._sx.y);
    const a = Math.min(1, 0.25 + sp * 18);
    this._sx.x += (cx - this._sx.x) * a; this._sx.y += (cy - this._sx.y) * a;
    this.hand = { pts, x: this._sx.x, y: this._sx.y, pinch: this.pinch, ratio };
    return this.hand;
  }
}
