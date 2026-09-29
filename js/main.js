import { Qubit, PRESETS, AXES } from './quantum.js';
import { AudioEngine } from './audio.js';
import { MicInput } from './mic.js';
import { HandInput } from './hands.js';
import { Scene } from './scene.js';
import { V, clamp, approach, smoothstep, qrand, TAU } from './util.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const scene = new Scene($('#stage'));
const q = new Qubit();
const audio = new AudioEngine();
const mic = new MicInput();
const hands = new HandInput($('#video'));

const S = {
  mode: 'manip', n: [0, 0, 1], nTarget: null, axis: 'z',
  k: 0, gamma: 0, omega0: 0, omega: 0, drive: 0,
  auto: true, tempo: 4, shotAcc: 0, total: 0, win: [], stampAcc: 0,
  started: false, handPrev: null, wasPinch: false, micLevel: 0,
};

// system size (Zurek's horizontal axis) -> dephasing rate. Illustrative, not quantitative.
const SIZES = [[1.5, 'un átomo'], [4, 'una molécula'], [6, 'una proteína'], [9, 'un virus'], [12.5, 'una bacteria'], [19, 'una mota de polvo'], [99, 'un gato · nosotros']];
const gammaOf = k => (k < 0.8 ? 0 : 0.012 * Math.pow(10, (k - 0.8) / 5.2));
const kappaOf = k => smoothstep(2.5, 17, k);
const pitchToOmega = f => 0.25 + 6.5 * clamp(Math.log2(f / 90) / Math.log2(700 / 90));

// ---------- actions ----------
function look() {
  if (!S.started) return;
  flashLook();
  if (S.mode === 'measure') { shoot(); return; }
  const { out } = q.sample(S.n, qrand());
  scene.collapse(out, q.r, S.n);
  q.collapse(S.n, out);
  audio.collapse(out);
  S.stampAcc = 0;
  if (Math.abs(S.n[2]) > 0.99) scene.resolveRecords(S.n[2] > 0 ? out : 1 - out);
  else scene.releaseRecords();
}

function shoot() {
  const { out } = q.sample(S.n, qrand());
  S.win.push(out); if (S.win.length > 64) S.win.shift();
  S.total++;
  const ones4 = S.win.slice(-4).reduce((a, b) => a + b, 0);
  audio.pluck(out, ones4, 0.19);
  scene.shot(out, q.r, S.n);
  const w = S.win.slice(-16);
  audio.setPad(true, w.reduce((a, b) => a + b, 0) / w.length);
}

function resetStats() { S.win = []; S.total = 0; S.shotAcc = 0.5; scene.clearRing(); }

function setMode(m) {
  if (S.mode === m) return;
  S.mode = m;
  document.body.dataset.mode = m;
  $$('.mode').forEach(b => { const on = b.dataset.mode === m; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  $('#lookTxt').textContent = m === 'measure' ? 'un tiro' : 'mirar';
  if (m === 'measure') resetStats(); else audio.setPad(false, 0.5);
  audio.chime(m === 'measure');
  hintIdx = 0; showHint(true);
}

function setAxis(name) {
  S.nTarget = AXES[name]; S.axis = name;
  $$('.abtn').forEach(b => b.classList.toggle('active', b.dataset.axis === name));
  resetStats();
}

function snapAxis() {
  let best = null, bd = 0.97; // ~14 degrees
  for (const [name, v] of Object.entries(AXES)) {
    const d = V.dot(S.n, v);
    if (Math.abs(d) > bd) { bd = Math.abs(d); best = [name, d > 0 ? v : V.scale(v, -1), d > 0]; }
  }
  if (best && best[2]) { setAxis(best[0]); return; }
  if (best) { S.nTarget = best[1]; S.axis = '−' + best[0]; } else S.axis = null;
  $$('.abtn').forEach(b => b.classList.remove('active'));
  resetStats();
}

function prepare(key) {
  if (!S.started) return;
  q.prepare(PRESETS[key]);
  scene.releaseRecords(); scene.trail = []; S.stampAcc = 0;
  if (S.mode === 'measure') resetStats();
  audio.pluck(key === '1' ? 1 : 0, 2, 0, 0.35);
}

function applyDrag(dx, dy, gain) {
  if (S.mode === 'manip') { q.target = null; q.r = scene.dragRotate(q.r, dx, dy, gain); }
  else { S.nTarget = null; S.n = V.norm(scene.dragRotate(S.n, dx, dy, gain)); S.axis = null; S.nDragged = true; }
}

function setSize(k) {
  S.k = k; S.gamma = gammaOf(k);
  const name = SIZES.find(([lim]) => k < lim)[1];
  $('#sizeTxt').innerHTML = k < 0.5 ? `1 átomo` : `10<sup>${Math.round(k)}</sup> átomos · ${name}`;
  $('#size').value = k;
}

// ---------- sensors ----------
async function toggleCam() {
  const btn = $('#btnCam');
  if (hands.active) { hands.stop(); btn.setAttribute('aria-pressed', 'false'); $('#camBubble').hidden = true; showHint(true); return; }
  btn.classList.add('busy');
  try {
    $('#camBubble').hidden = false;
    await hands.start(msg => toast(msg));
    btn.setAttribute('aria-pressed', 'true');
    toast('mostrá la mano · pellizcá para agarrar');
  } catch (err) {
    console.error(err); hands.stop(); $('#camBubble').hidden = true;
    toast('no pude abrir la cámara');
  } finally { btn.classList.remove('busy'); hintIdx = 1; showHint(true); }
}

async function toggleMic() {
  const btn = $('#btnMic');
  if (mic.active) { mic.stop(); btn.setAttribute('aria-pressed', 'false'); showHint(true); return; }
  btn.classList.add('busy');
  try {
    await audio.init();
    await mic.start(audio.ctx);
    btn.setAttribute('aria-pressed', 'true');
    toast('cantá · o aplaudí para mirar');
  } catch (err) { console.error(err); toast('no pude abrir el micrófono'); }
  finally { btn.classList.remove('busy'); hintIdx = 2; showHint(true); }
}

function toggleSound() {
  const on = !audio.on; audio.setOn(on);
  $('#btnSound').setAttribute('aria-pressed', on);
}

function toggleTheme() {
  const night = document.documentElement.dataset.theme !== 'night';
  document.documentElement.dataset.theme = night ? 'night' : 'day';
  scene.theme = night ? 'night' : 'day';
  document.querySelector('meta[name="theme-color"]').content = night ? '#0e1632' : '#f3ead7';
  makeGrain();
}

function toggleAuto(force) {
  S.auto = typeof force === 'boolean' ? force : !S.auto;
  $('#btnPlay').setAttribute('aria-pressed', S.auto);
  if (!S.auto) audio.setPad(false, 0.5);
}

// ---------- hints & toasts ----------
const HINTS = {
  manip: [
    ['', 'Arrastrá la esfera como un globo para rotar el estado · doble toque o espacio para mirar'],
    ['cam', 'Pellizcá en el aire (pulgar + índice) y mové la mano: el qubit te sigue'],
    ['mic', 'Cantá: el volumen empuja el estado entre 0 y 1; la altura de tu voz lo hace girar · un aplauso lo mide'],
    ['', 'La superposición suena como acorde: grave (0) y agudo (1) a la vez; la nota del medio es la coherencia'],
    ['', 'Subí el tamaño: el entorno se enreda con el qubit, apaga la coherencia y el color se vuelve grafito'],
  ],
  measure: [
    ['', 'Preparar y medir, una y otra vez: luna = 0 (grave) · sol = 1 (agudo)'],
    ['', 'Más ceros → más grave · más unos → más agudo · las frecuencias tienden a la regla de Born'],
    ['', 'Cambiá el punto de vista (z · x · y, o arrastrando): el mismo estado da otras respuestas'],
    ['', 'Probá |+⟩: medido en z es azar puro; medido en x da siempre 0'],
    ['', 'Con decoherencia, |+⟩ en x deja de dar siempre 0: el entorno ya lo miró'],
    ['cam', 'Pellizcá y mové la mano para girar el ojo (el punto de vista)'],
  ],
};
let hintIdx = 0, hintT = 0;
function showHint(now) {
  const list = HINTS[S.mode].filter(([req]) => !req || (req === 'cam' ? hands.active : mic.active));
  const el = $('#hint');
  const set = () => { el.textContent = list[hintIdx % list.length][1]; el.classList.remove('fade'); };
  hintT = 0;
  if (now) { set(); return; }
  el.classList.add('fade'); setTimeout(() => { hintIdx++; set(); }, 600);
}
let toastTimer = 0;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function flashLook() { const b = $('#btnLook'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }

// ---------- panel ----------
const fmt = x => x.toFixed(2);
function updateUI(p0, coh) {
  const pur = q.purity, th = q.theta, ph = ((q.phi % TAU) + TAU) % TAU;
  const a = Math.cos(th / 2), b = Math.sin(th / 2), cz = Math.hypot(q.r[0], q.r[1]);
  let html;
  if (pur > 0.97) {
    if (b < 0.005) html = '<span class="k">|ψ⟩ = |0⟩</span>';
    else if (a < 0.005) html = '<span class="k">|ψ⟩ = |1⟩</span>';
    else html = `<span class="k">|ψ⟩ = ${fmt(a)}|0⟩</span> <span class="k">+ ${fmt(b)} e<sup>i·${fmt(ph / Math.PI)}π</sup>|1⟩</span>`;
    html += '<small>estado puro</small>';
  } else if (cz < 0.03) {
    const z0 = (1 + q.r[2]) / 2;
    html = `<span class="k">ρ = ${fmt(z0)}|0⟩⟨0| + ${fmt(1 - z0)}|1⟩⟨1|</span><small>mezcla clásica: el entorno ya "sabe"</small>`;
  } else {
    html = `<span class="k">ρ: pureza ${fmt(pur)}</span><small>parcialmente coherente: el entorno está mirando</small>`;
  }
  $('#ketLine').innerHTML = html;
  $('#p0bar').style.width = `${p0 * 100}%`;
  $('#p0txt').textContent = `${Math.round(p0 * 100)}%`;
  $('#p1txt').textContent = `${Math.round((1 - p0) * 100)}%`;
  $('#povTxt').textContent = S.axis ? `eje ${S.axis}` : 'eje libre';
  $('#cohBar').style.width = `${coh * 100}%`;
  $('#purBar').style.width = `${pur * 100}%`;
  $('#vu').style.width = `${(mic.active ? mic.level : 0) * 100}%`;
  if (S.mode === 'measure') {
    const n1 = S.win.reduce((x, y) => x + y, 0), n = S.win.length, f0 = n ? (n - n1) / n : 0.5;
    $('#f0bar').style.width = `${n ? f0 * 100 : 0}%`;
    $('#f1bar').style.opacity = n ? 1 : 0;
    $('#bornTick').style.left = `${p0 * 100}%`;
    $('#c0').textContent = n - n1; $('#c1').textContent = n1;
    $('#ctot').textContent = `${S.total} tiros`;
  }
}

// ---------- grain ----------
function makeGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 220;
  const g = c.getContext('2d'), img = g.createImageData(220, 220), night = scene.theme === 'night';
  for (let i = 0; i < img.data.length; i += 4) {
    const v = night ? 255 * Math.random() ** 3 : 255 - 70 * Math.random() ** 2.2;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  $('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

// ---------- QR ----------
function openQR() {
  const url = location.href.split('#')[0];
  const cv = $('#qrCanvas'), g = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  g.fillStyle = css.getPropertyValue('--pale').trim(); g.fillRect(0, 0, cv.width, cv.height);
  if (window.qrcode) {
    const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), cell = Math.floor((cv.width - 48) / n), off = (cv.width - cell * n) / 2;
    g.fillStyle = css.getPropertyValue('--ink').trim();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(off + c * cell, off + r * cell, cell, cell);
  }
  $('#qrUrl').textContent = url.replace(/^https?:\/\//, '');
  $('#qr').showModal();
}

// ---------- input wiring ----------
const cv = $('#stage');
let drag = null, lastTap = 0, lastTapXY = [0, 0];
cv.addEventListener('pointerdown', e => {
  if (drag) return;
  cv.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  const now = performance.now();
  if (now - lastTap < 330 && Math.hypot(e.clientX - lastTapXY[0], e.clientY - lastTapXY[1]) < 40) { look(); lastTap = 0; }
  else { lastTap = now; lastTapXY = [e.clientX, e.clientY]; }
});
cv.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.hypot(dx, dy);
  applyDrag(dx, dy, 1);
});
const endDrag = e => {
  if (!drag || drag.id !== e.pointerId) return;
  if (S.mode === 'measure' && drag.moved > 4) snapAxis();
  drag = null;
};
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);

function handleHand(h) {
  const pinch = !!(h && h.pinch);
  if (pinch) {
    const p = scene.handToScreen(h.x, h.y);
    if (S.handPrev) {
      const dx = p.x - S.handPrev.x, dy = p.y - S.handPrev.y;
      if (Math.hypot(dx, dy) > 0.6) applyDrag(dx, dy, 1.3);
    }
    S.handPrev = p;
  } else {
    if (S.wasPinch && S.mode === 'measure') snapAxis();
    S.handPrev = null;
  }
  S.wasPinch = pinch;
}

$$('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$$('.kbtn').forEach(b => b.addEventListener('click', () => prepare(b.dataset.prep)));
$$('.abtn').forEach(b => b.addEventListener('click', () => setAxis(b.dataset.axis)));
$('#btnLook').addEventListener('click', look);
$('#btnPlay').addEventListener('click', () => toggleAuto());
$('#tempo').addEventListener('input', e => { S.tempo = +e.target.value; $('#tempoTxt').textContent = S.tempo; });
$('#energy').addEventListener('input', e => { S.omega0 = +e.target.value; });
$('#size').addEventListener('input', e => setSize(+e.target.value));
$('#btnCam').addEventListener('click', toggleCam);
$('#btnMic').addEventListener('click', toggleMic);
$('#btnSound').addEventListener('click', toggleSound);
$('#btnTheme').addEventListener('click', toggleTheme);
$('#btnInfo').addEventListener('click', () => $('#info').showModal());
$('#btnQR').addEventListener('click', openQR);
$$('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d || e.target.hasAttribute('data-close')) d.close(); });
});

async function enter(withSensors) {
  await audio.init();
  S.started = true;
  $('#intro').classList.add('gone');
  setTimeout(() => $('#intro').remove(), 1000);
  showHint(true);
  if (withSensors) {
    try { // one permission prompt for both
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      s.getTracks().forEach(t => t.stop());
    } catch { /* each toggle reports its own failure */ }
    await toggleMic();
    await toggleCam();
  }
}
$('#enterAll').addEventListener('click', () => enter(true));
$('#enterTouch').addEventListener('click', () => enter(false));

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches('input') && e.key.startsWith('Arrow')) return;
  if (!S.started) { if (e.key === 'Enter') enter(false); return; }
  const k = e.key, R = scene.R * 0.1;
  switch (k) {
    case ' ': e.preventDefault(); look(); break;
    case 'm': case 'M': setMode(S.mode === 'manip' ? 'measure' : 'manip'); break;
    case '0': case '1': case '+': case '-': prepare(k); break;
    case 'i': prepare('+i'); break;
    case 'z': case 'x': case 'y': case 'Z': case 'X': case 'Y': setAxis(k.toLowerCase()); break;
    case 'p': case 'P': toggleAuto(); break;
    case '[': setSize(clamp(S.k - 1, 0, 23)); break;
    case ']': setSize(clamp(S.k + 1, 0, 23)); break;
    case 'c': case 'C': toggleCam(); break;
    case 'v': case 'V': toggleMic(); break;
    case 's': case 'S': toggleSound(); break;
    case 't': case 'T': toggleTheme(); break;
    case 'q': case 'Q': openQR(); break;
    case '?': $('#info').showModal(); break;
    case 'f': case 'F': document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); break;
    case 'h': case 'H': document.body.classList.toggle('clean'); break;
    case 'ArrowLeft': e.preventDefault(); applyDrag(-R, 0, 1); break;
    case 'ArrowRight': e.preventDefault(); applyDrag(R, 0, 1); break;
    case 'ArrowUp': e.preventDefault(); applyDrag(0, -R, 1); break;
    case 'ArrowDown': e.preventDefault(); applyDrag(0, R, 1); break;
    default: return;
  }
  if (S.mode === 'measure' && k.startsWith('Arrow')) snapAxis();
});

document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()));

// ---------- loop ----------
let last = performance.now(), lastUi = 0;
function frame(ts) {
  const now = ts / 1000, dt = clamp((ts - last) / 1000, 0.001, 0.05);
  last = ts;
  const hand = hands.update();
  const m = mic.update(dt, now);
  handleHand(hand);

  if (S.nTarget) {
    const ang = Math.acos(clamp(V.dot(S.n, S.nTarget), -1, 1));
    if (ang < 0.003) { S.n = [...S.nTarget]; S.nTarget = null; }
    else {
      let k = V.cross(S.n, S.nTarget); k = V.len(k) < 1e-6 ? V.perp(S.n) : V.norm(k);
      S.n = V.norm(V.rotate(S.n, k, Math.min(ang, ang * (1 - Math.exp(-8 * dt)) + 0.4 * dt)));
    }
  }

  let omega = 0, drive = 0;
  if (S.mode === 'manip' && S.started) {
    omega = m && m.pitch ? pitchToOmega(m.pitch) : S.omega0;
    drive = m ? m.level * 2.6 : 0;
  }
  S.omega = approach(S.omega, omega, 3, dt);
  q.update(dt, { omega: S.omega, drive, gamma: S.gamma });

  // decoherence as entanglement: every bit of lost coherence leaves records in the environment,
  // and a bigger system leaves more redundant copies (Zurek's quantum Darwinism)
  if (S.gamma > 0 && !q.target) {
    const cz = Math.hypot(q.r[0], q.r[1]);
    const lost = cz * (Math.exp(Math.min(S.gamma * dt, 8)) - 1);
    S.stampAcc = Math.min(S.stampAcc + lost * (4 + 1.3 * S.k), 40);
  }
  for (let i = 0; i < 2 && S.stampAcc >= 1; i++) {
    S.stampAcc -= 1;
    if (scene.entangle(clamp((1 - q.r[2]) / 2))) audio.tick();
  }

  if (m && m.clap) look();
  if (S.mode === 'measure' && S.auto && S.started) {
    S.shotAcc += dt * S.tempo * (1 + (m ? m.level * 1.5 : 0));
    for (let i = 0; S.shotAcc >= 1 && i < 3; i++) { S.shotAcc -= 1; shoot(); }
    if (S.shotAcc > 1) S.shotAcc = 0;
  }

  const p0 = q.prob0(S.n), coh = q.transverse(S.n);
  if (S.mode === 'manip') scene.pushTrail(q.r, 1 - p0);
  audio.setDrone({ p0, coh, phi: q.phi, omega: S.omega, on: S.started && S.mode === 'manip' });
  scene.render({
    r: q.r, n: S.n, p0, coh, purity: q.purity, theta: q.theta, phi: q.phi,
    omega: S.omega, drive, mode: S.mode, kappa: kappaOf(S.k), k01: S.k / 23, hand,
  }, dt);

  if (now - lastUi > 0.08) { updateUI(p0, coh); lastUi = now; }
  if ((hintT += dt) > 8 && S.started) showHint(false);
  requestAnimationFrame(frame);
}

// ---------- layout: the sphere lives in whatever space the interface leaves free ----------
function fitScene(snap = false) {
  const W = innerWidth, H = innerHeight;
  let box;
  if (W < 760) {
    box = { l: 0, r: W, t: 56, b: $('.hud').getBoundingClientRect().top - 4 };
  } else {
    const pl = $('#panel').getBoundingClientRect().left;
    box = { l: Math.min(300, W * 0.2), r: pl - 12, t: 4, b: $('.dock .row').getBoundingClientRect().top - 8 };
  }
  if (box.b - box.t < 120) box = { l: 0, r: W, t: 0, b: H };
  scene.fit(box, snap);
}
const ro = new ResizeObserver(() => fitScene());
ro.observe($('#panel')); ro.observe($('.dock'));
addEventListener('resize', () => fitScene(true));

makeGrain();
setSize(0);
showHint(true);
updateUI(1, 0);
fitScene(true);
document.fonts?.ready.then(() => { scene.resize(); fitScene(true); });
requestAnimationFrame(frame);

// debug handle for the console / tests
window.__bloch = { S, q, scene, audio, hands, mic, setMode, prepare, setAxis, setSize, look, enter };
