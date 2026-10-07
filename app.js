/* Simulasi POV Konser A7X di JIS — three.js r147 (global THREE + THREE.OrbitControls) */
(() => {
'use strict';

/* ------------------------------------------------------------------ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (id) => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const IDR = (n) => 'Rp' + n.toLocaleString('id-ID');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};
function toast(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  d.setAttribute('role', 'status');
  d.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:60;background:#FFD23F;color:#1a1400;' +
    'font-weight:700;padding:8px 14px;border-radius:99px;font-size:13px;max-width:90vw;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.5)';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

/* ------------------------------------------------------------ konfigurasi */
const HX = 34;          // setengah lebar lapangan (x), meter
const HZ = 52.5;        // setengah panjang lapangan (z), meter. Panggung di utara (z negatif)
const DOORS = 60;       // jumlah door per tier (x01..x60)
const SEATS = 120;      // rentang nomor seat per door (perkiraan)
const TARGET = V(0, 5, -41);   // titik yang dilihat POV (depan panggung)
const FEST = {
  A: { name: 'Festival A', z0: -36, z1: -14, x: 30, price: 2550000, color: 0x34447e, rows: [-32, -25, -17] },
  B: { name: 'Festival B', z0: -12, z1: 14, x: 30, price: 1855000, color: 0x273262, rows: [-8, 1, 10] },
};
const FEST_COLS = [-21, 0, 21];
const POS_NAMES = [['Depan', 'Tengah', 'Belakang'], ['kiri', 'tengah', 'kanan']];
const BASE_FOV = 58;    // fov vertikal pada zoom 1x

// Tier tribun: bawah (24°), tengah (29°), atas (32°)
const TIERS = [];
(() => {
  let d = 11, y = 1.5;
  [[1, 20, 24], [2, 22, 29], [3, 24, 32]].forEach(([id, rows, deg]) => {
    const slope = Math.tan(rad(deg)), rowD = 0.85;
    const t = { id, rows, slope, rowD, d0: d, y0: y, d1: d + rows * rowD, y1: y + rows * rowD * slope };
    TIERS.push(t);
    d = t.d1 + 5; y = t.y1 + 3.5;
  });
})();

const CATS = {
  1: ['CAT 1', 2175000, 1850000, 0x8e7dff, 0x5747c2],
  2: ['CAT 2', 1550000, 1100000, 0x3fcdb9, 0x22857a],
  3: ['CAT 3', 785000, 665000, 0xee8fa6, 0xa4526a],
};
const CLOSED_COLOR = 0x151a28;

function category(tier, i) {
  if (i <= 8 || i >= 53) return { closed: true, color: CLOSED_COLOR };
  const c = CATS[tier];
  const center = i >= 22 && i <= 38;
  return {
    closed: false, center,
    name: c[0] + (center ? ' Center' : i < 30 ? ' Right' : ' Left'),
    price: center ? c[1] : c[2],
    color: center ? c[3] : c[4],
  };
}

const doorTheta = (i) => -Math.PI / 2 + ((i - 1) / DOORS) * Math.PI * 2;
function surfPoint(t, theta, d) {
  return V((HX + d) * Math.cos(theta), t.y0 + (d - t.d0) * t.slope, (HZ + d) * Math.sin(theta));
}
function seatPos(tier, i, row, seat) {
  const t = TIERS[tier - 1];
  const theta = doorTheta(i) + ((seat - 0.5) / SEATS) * ((Math.PI * 2) / DOORS);
  return surfPoint(t, theta, t.d0 + (row - 0.5) * t.rowD);
}

/* ------------------------------------------------------------------ scene */
const canvas = el('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 1600);
camera.position.set(150, 120, 190);
const controls = new THREE.OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 600;
controls.minDistance = 8;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.target.set(0, 5, 0);
controls.update();

const hemi = new THREE.HemisphereLight(0xffffff, 0x4a5568, 1.0);
const sun = new THREE.DirectionalLight(0xffffff, 0.55);
sun.position.set(-80, 140, 60);
const redLight = new THREE.PointLight(0xff3050, 0, 160, 1.5);
redLight.position.set(-14, 12, -34);
const blueLight = new THREE.PointLight(0x4a6bff, 0, 160, 1.5);
blueLight.position.set(14, 12, -34);
scene.add(hemi, sun, redLight, blueLight);

const standMeshes = [];
const labelSprites = [];
const matCache = {};
const mat = (color, opts = {}) => new THREE.MeshLambertMaterial(Object.assign({ color, side: THREE.DoubleSide }, opts));

/* ---- strip melingkar mengelilingi lapangan (dinding, lantai, atap) */
function ringStrip(dA, yA, dB, yB, material, segs = 120) {
  const pos = [], idx = [];
  for (let s = 0; s <= segs; s++) {
    const th = -Math.PI / 2 + (s / segs) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
    pos.push((HX + dA) * c, yA, (HZ + dA) * sn, (HX + dB) * c, yB, (HZ + dB) * sn);
  }
  for (let s = 0; s < segs; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  scene.add(m);
  return m;
}

/* ---- permukaan kursi berwarna per door (vertex color) */
function seatsMesh(t) {
  const SEG = DOORS * 4, P = [], C = [], col = new THREE.Color();
  const v = (th, d, y) => [(HX + d) * Math.cos(th), y, (HZ + d) * Math.sin(th)];
  for (let s = 0; s < SEG; s++) {
    const i = Math.floor(s / 4) + 1, cat = category(t.id, i);
    const th0 = -Math.PI / 2 + (s / SEG) * Math.PI * 2, th1 = -Math.PI / 2 + ((s + 1) / SEG) * Math.PI * 2;
    for (let r = 0; r < t.rows; r++) {
      const dA = t.d0 + r * t.rowD, dB = dA + t.rowD;
      const yA = t.y0 + (dA - t.d0) * t.slope, yB = t.y0 + (dB - t.d0) * t.slope;
      const a = v(th0, dA, yA), b = v(th1, dA, yA), c = v(th0, dB, yB), d = v(th1, dB, yB);
      P.push(...a, ...b, ...c, ...b, ...d, ...c);
      col.setHex(cat.color).multiplyScalar(r % 2 ? 0.88 : 1);
      if (s % 4 === 0) col.multiplyScalar(0.78);
      for (let k = 0; k < 6; k++) C.push(col.r, col.g, col.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.userData.tier = t.id;
  scene.add(m);
  standMeshes.push(m);
}

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(11,16,32,.85)';
  g.beginPath();
  if (g.roundRect) g.roundRect(4, 8, 120, 48, 14); else g.rect(4, 8, 120, 48);
  g.fill();
  g.strokeStyle = '#FFD23F'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#fff'; g.font = '700 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 33);
  return new THREE.CanvasTexture(c);
}

const concourseMat = mat(0x58606f), wallMat = mat(0x7b8394), underMat = mat(0x3a4150);
const roofMat = mat(0xdfe3ee);
function buildStadium() {
  // tanah + lapangan
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshLambertMaterial({ color: 0x59616f }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  scene.add(ground);
  scene.userData.ground = ground;

  TIERS.forEach((t, k) => {
    seatsMesh(t);
    ringStrip(t.d0, 0, t.d0, t.y0, underMat);                 // dinding depan
    ringStrip(t.d1, 0, t.d1, t.y1 + 2.5, wallMat);            // dinding belakang
    if (TIERS[k + 1]) {                                       // lantai concourse ke tier berikutnya
      const n = TIERS[k + 1];
      ringStrip(t.d1, t.y1 + 2.5, n.d0, n.y0, concourseMat);
    }
    // nomor door
    for (let i = 1; i <= DOORS; i++) {
      const cat = category(t.id, i);
      if (cat.closed) continue;
      const th = doorTheta(i) + Math.PI / DOORS;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(String(t.id * 100 + i)), depthWrite: false }));
      const p = surfPoint(t, th, t.d1 + 1.5);
      sp.position.set(p.x, t.y1 + 5, p.z);
      sp.scale.set(8, 4, 1);
      scene.add(sp);
      labelSprites.push(sp);
    }
  });
  // kulit luar + atap melingkar
  const t3 = TIERS[2];
  ringStrip(t3.d1, t3.y1 + 2.5, t3.d1 + 5, t3.y1 + 10, wallMat);
  scene.userData.roof = ringStrip(t3.d1 + 5, t3.y1 + 10, t3.d1 - 26, t3.y1 + 6, roofMat);
}

/* ---------------------------------------------------------- lapangan, panggung */
function screenTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 1024, 512);
  gr.addColorStop(0, '#4a0d12'); gr.addColorStop(0.5, '#10122a'); gr.addColorStop(1, '#5a1010');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2;
  for (let i = 0; i < 1024; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); }
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 128px "Barlow Condensed","Arial Narrow",Impact,sans-serif';
  g.fillText(text, 512, 256, 940);
  return new THREE.CanvasTexture(c);
}

const screens = [];
const beams = [];
function buildField() {
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), new THREE.MeshLambertMaterial({ color: 0x25362d }));
  pitch.rotation.x = -Math.PI / 2;
  scene.add(pitch);
  scene.userData.pitch = pitch;

  [['A', FEST.A], ['B', FEST.B]].forEach(([, f]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(f.x * 2, f.z1 - f.z0), new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.8 }));
    p.rotation.x = -Math.PI / 2;
    p.position.set(0, 0.06, (f.z0 + f.z1) / 2);
    scene.add(p);
  });
  // barikade
  const bm = new THREE.MeshLambertMaterial({ color: 0xb8bfd4 });
  [FEST.A.z0 + 0.5, FEST.A.z1, FEST.B.z1].forEach((z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(FEST.A.x * 2, 1.1, 0.25), bm);
    b.position.set(0, 0.55, z); scene.add(b);
  });

  // panggung
  const stage = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1b1f2b });
  const metal = new THREE.MeshLambertMaterial({ color: 0x70788c });
  const base = new THREE.Mesh(new THREE.BoxGeometry(34, 2.5, 14), dark);
  base.position.set(0, 1.25, -45.5); stage.add(base);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 14), dark);
  tongue.position.set(0, 1.25, -31.5); stage.add(tongue);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(16, 2.5, 5), dark);
  tip.position.set(0, 1.25, -22.5); stage.add(tip);
  // rangka atap + tiang
  [[-16, -51], [16, -51], [-16, -39.5], [16, -39.5]].forEach(([x, z]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 1), metal);
    p.position.set(x, 11, z); stage.add(p);
  });
  const truss = new THREE.Mesh(new THREE.BoxGeometry(34, 1.4, 12.5), metal);
  truss.position.set(0, 21, -45.3); stage.add(truss);
  // layar LED
  const ledMat = new THREE.MeshBasicMaterial({ map: screenTexture('AVENGED SEVENFOLD') });
  const led = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), ledMat);
  led.position.set(0, 10, -51.6); stage.add(led);
  screens.push(ledMat);
  [-1, 1].forEach((s) => {
    const m = new THREE.MeshBasicMaterial({ map: screenTexture('A7X') });
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(10, 15), m);
    sc.position.set(s * 25, 14, -42); sc.rotation.y = s * -0.22; stage.add(sc);
    screens.push(m);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.8, 22, 0.8), metal);
    pole.position.set(s * 25, 11, -42.6); stage.add(pole);
  });
  scene.add(stage);

  // sorotan (muncul di mode Show)
  const colors = [0xff3050, 0xffffff, 0x4a6bff, 0xff3050, 0xffffff, 0x4a6bff, 0xffc04a, 0xff3050];
  colors.forEach((c, k) => {
    const g = new THREE.ConeGeometry(4.5, 90, 18, 1, true);
    g.translate(0, -45, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const pivot = new THREE.Group();
    pivot.position.set(-14 + k * 4, 20.5, -44);
    pivot.add(m);
    pivot.userData.k = k;
    pivot.visible = false;
    scene.add(pivot);
    beams.push(pivot);
  });

  // FOH di belakang Festival B
  const foh = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 7), dark);
  deck.position.set(0, 1.5, 21); foh.add(deck);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 8), metal);
  roof.position.set(0, 7, 21); foh.add(roof);
  [[-6, 17.5], [6, 17.5], [-6, 24.5], [6, 24.5]].forEach(([x, z]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), metal);
    p.position.set(x, 3.5, z); foh.add(p);
  });
  scene.add(foh);

  // tower delay
  [-1, 1].forEach((s) => {
    const tw = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(1.4, 16, 1.4), metal);
    pole.position.y = 8; tw.add(pole);
    const spk = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 2.2), dark);
    spk.position.y = 13; tw.add(spk);
    tw.position.set(s * 31, 0, 6);
    scene.add(tw);
  });
}

/* ----------------------------------------------------------------- penonton */
const crowd = []; // {x,y,z,seated}
let bodyIM = null, headIM = null;
function rnd(a, b) { return a + Math.random() * (b - a); }

function buildCrowd() {
  for (let n = 0; n < 900; n++) crowd.push({ x: rnd(-FEST.A.x + 1, FEST.A.x - 1), y: 0, z: rnd(FEST.A.z0 + 1.2, FEST.A.z1 - 0.5), seated: false });
  for (let n = 0; n < 650; n++) crowd.push({ x: rnd(-FEST.B.x + 1, FEST.B.x - 1), y: 0, z: rnd(FEST.B.z0 + 0.5, FEST.B.z1 - 0.5), seated: false });
  let guard = 0;
  while (crowd.length < 900 + 650 + 5200 && guard++ < 20000) {
    const tier = 1 + Math.floor(Math.random() * 3), i = 1 + Math.floor(Math.random() * DOORS);
    if (category(tier, i).closed || Math.random() < 0.25) continue;
    const t = TIERS[tier - 1];
    const p = seatPos(tier, i, 1 + Math.floor(Math.random() * t.rows), 1 + Math.floor(Math.random() * SEATS));
    crowd.push({ x: p.x, y: p.y, z: p.z, seated: true });
  }
  const n = crowd.length;
  bodyIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.26, 0.3, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  headIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe0b890 }), n);
  const palette = [0x111111, 0x1c1c26, 0x2a1414, 0x3a3a44, 0x0f2438, 0x4a1a1a, 0x222222, 0x5a5a66, 0x6a1010];
  const c = new THREE.Color();
  for (let k = 0; k < n; k++) { c.setHex(palette[Math.floor(Math.random() * palette.length)]); bodyIM.setColorAt(k, c); }
  scene.add(bodyIM, headIM);
  updateCrowd(null);
}
const dummy = new THREE.Object3D();
function updateCrowd(eye) {
  if (!bodyIM) return;
  for (let k = 0; k < crowd.length; k++) {
    const p = crowd[k];
    const near = eye && (p.x - eye.x) ** 2 + (p.z - eye.z) ** 2 < 1.7 && Math.abs(p.y - eye.y) < 3;
    const sy = p.seated ? 0.7 : 1;
    const h = 1.6 * sy;
    dummy.position.set(p.x, p.y + h / 2, p.z);
    dummy.scale.set(near ? 0 : 1, near ? 0 : sy, near ? 0 : 1);
    dummy.updateMatrix();
    bodyIM.setMatrixAt(k, dummy.matrix);
    dummy.position.set(p.x, p.y + h + 0.18, p.z);
    dummy.scale.setScalar(near ? 0 : 1);
    dummy.updateMatrix();
    headIM.setMatrixAt(k, dummy.matrix);
  }
  bodyIM.instanceMatrix.needsUpdate = true;
  headIM.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------- penanda "Kamu di sini" */
const marker = new THREE.Group();
(() => {
  const m = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 14), m);
  cone.rotation.x = Math.PI; cone.position.y = 3.4;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 24), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), m);
  stick.position.y = 2;
  marker.add(cone, ring, stick);
  marker.visible = false;
  scene.add(marker);
})();

/* ----------------------------------------------------------------- lampu */
let lights = 'on';
function setLights(mode) {
  lights = mode;
  const show = mode === 'show';
  const bg = show ? 0x04060d : 0x9db4d8;
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, show ? 120 : 260, show ? 520 : 900);
  hemi.intensity = show ? 0.28 : 1.0;
  sun.intensity = show ? 0.04 : 0.55;
  redLight.intensity = show ? 1.8 : 0;
  blueLight.intensity = show ? 1.8 : 0;
  scene.userData.ground.material.color.setHex(show ? 0x05070d : 0x59616f);
  scene.userData.pitch.material.color.setHex(show ? 0x0d1411 : 0x25362d);
  scene.userData.roof.material.color.setHex(show ? 0x1a1d27 : 0xdfe3ee);
  screens.forEach((m) => m.color.setHex(show ? 0xffffff : 0x8a8a8a));
  beams.forEach((b) => { b.visible = show; });
  $$('#lightSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lights === mode)));
}

/* ---------------------------------------------------------------- state */
let sel = null;            // pilihan saat ini
let view = 'overview';
let povActive = false;
let posture = 'stand';
let zoom = 1;
const pov = { yaw: 0, pitch: 0 };
let fly = null;
let festGrid = '1,1';
let festArea = 'A';
let seatsApi = false;

const eyeH = () => (posture === 'sit' ? 1.2 : 1.65);
const getEye = () => (sel ? sel.pos.clone().add(V(0, eyeH(), 0)) : V(0, 2, 0));
const povFov = () => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(rad(BASE_FOV) / 2) / zoom));

function zoomLabel() {
  const z = zoom.toFixed(1).replace('.', ',').replace(/,0$/, '');
  if (Math.abs(zoom - 1) < 0.05) return '1× = kamera HP';
  if (Math.abs(zoom - 0.5) < 0.05) return '0,5× = ultra wide';
  return z + '×';
}
function setZoom(z) {
  zoom = clamp(z, 0.5, 5);
  el('povZoom').value = String(zoom);
  el('povZoomOut').textContent = zoomLabel();
}

/* --------------------------------------------------------- info kartu kursi */
function distToStage(p) { return Math.round(p.distanceTo(TARGET)); }

function renderInfo() {
  const box = el('info');
  box.textContent = '';
  if (!sel) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Isi door & row, atau pilih posisi festival. Bisa juga klik langsung di tribun atau lapangan pada model.';
    box.appendChild(p);
    return;
  }
  const h = document.createElement('h2');
  h.textContent = sel.label;
  const cat = document.createElement('p');
  cat.className = 'cat';
  const sw = document.createElement('span');
  sw.className = 'sw';
  sw.style.background = '#' + sel.cat.color.toString(16).padStart(6, '0');
  const nm = document.createElement('span');
  nm.textContent = sel.cat.name;
  const pr = document.createElement('span');
  pr.className = 'price';
  pr.textContent = IDR(sel.cat.price);
  cat.append(sw, nm, pr);
  const dl = document.createElement('dl');
  const row = (k, v) => { const a = document.createElement('dt'), b = document.createElement('dd'); a.textContent = k; b.textContent = v; dl.append(a, b); };
  row('Jarak ke panggung', '± ' + distToStage(sel.pos) + ' m');
  row('Ketinggian dari lapangan', '± ' + Math.round(sel.pos.y) + ' m');
  box.append(h, cat, dl);
  if (sel.type === 'seat' && seatsApi) {
    const wrap = document.createElement('div');
    wrap.className = 'name-row';
    const inp = document.createElement('input');
    inp.id = 'nameInput';
    inp.maxLength = 30;
    inp.placeholder = 'Nama / @username (opsional)';
    inp.setAttribute('aria-label', 'Nama di kartu kursi');
    inp.value = store.get('a7x_name') || '';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ghost'; btn.textContent = 'Simpan';
    btn.addEventListener('click', () => saveName(inp.value));
    wrap.append(inp, btn);
    box.appendChild(wrap);
  }
}

/* -------------------------------------------------------------- pilihan */
function parseRow(s, t) {
  s = String(s == null ? '' : s).trim().toUpperCase();
  if (!s) return { row: Math.ceil(t.rows / 2), label: String(Math.ceil(t.rows / 2)) };
  if (/^\d{1,2}$/.test(s)) return { row: +s, label: String(+s) };
  if (/^[A-Z]$/.test(s)) return { row: s.charCodeAt(0) - 64, label: s };
  return null;
}
function selectSeat(doorS, rowS, seatS) {
  const door = parseInt(doorS, 10);
  if (!door) return 'Isi nomor door dulu (mis. 136).';
  const tier = Math.floor(door / 100), i = door % 100;
  if (tier < 1 || tier > 3 || i < 1 || i > DOORS) return 'Door ' + door + ' nggak ada. Door yang dipakai: 101–160, 201–260, 301–360.';
  const cat = category(tier, i);
  if (cat.closed) return 'Door ' + door + ' ada di samping atau belakang panggung, areanya ditutup.';
  const t = TIERS[tier - 1];
  const pr = parseRow(rowS, t);
  const lastLetter = String.fromCharCode(64 + t.rows);
  if (!pr) return 'Row nggak valid. Isi angka (1–' + t.rows + ') atau huruf (A–' + lastLetter + ').';
  if (pr.row < 1 || pr.row > t.rows) return 'Row ' + pr.label + ' di luar jangkauan. Tribun ini kira-kira punya row 1–' + t.rows + ' (A–' + lastLetter + ').';
  let seat = parseInt(seatS, 10);
  if (!seatS || !String(seatS).trim()) seat = Math.round(SEATS / 2);
  if (!seat || seat < 1 || seat > SEATS) return 'Seat harus antara 1 dan ' + SEATS + '.';
  applySelection({
    type: 'seat', door, tier, i, row: pr.row, rowLabel: pr.label, seat, cat,
    pos: seatPos(tier, i, pr.row, seat),
    label: 'Door ' + door + ' · Row ' + pr.label + ' · Seat ' + seat,
  });
  return null;
}
function selectFest(area, x, z, gridName) {
  const f = FEST[area];
  x = clamp(x, -f.x + 1, f.x - 1);
  z = clamp(z, f.z0 + 1, f.z1 - 1);
  applySelection({
    type: 'fest', area, x, z,
    cat: { name: f.name, price: f.price, color: f.color },
    pos: V(x, 0, z),
    label: f.name + (gridName ? ' · ' + gridName : ''),
  });
}
function gridFor(area, key) {
  const [r, c] = key.split(',').map(Number);
  const f = FEST[area];
  return { x: FEST_COLS[c], z: f.rows[r], name: POS_NAMES[0][r] + ' ' + POS_NAMES[1][c] };
}
function selectFestGrid(area, key) {
  festArea = area; festGrid = key;
  const g = gridFor(area, key);
  selectFest(area, g.x, g.z, g.name === 'Tengah tengah' ? 'Tengah' : g.name);
}
function updateFestButtons() {
  $$('[data-farea]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.farea === festArea)));
  $$('[data-fpos]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fpos === festGrid)));
}

function applySelection(s) {
  sel = s;
  el('finderError').hidden = true;
  setPosture(s.type === 'seat' ? 'sit' : 'stand', true);
  renderInfo();
  marker.position.copy(s.pos);
  marker.visible = !povActive && el('povHud').hidden;
  el('pipLabel').textContent = s.type === 'seat' ? 'Door ' + s.door : s.cat.name;
  syncHash();
  if (povActive) {
    updateCrowd(getEye());
    refreshPovHud();
  } else {
    updateCrowd(null);
  }
  updatePipVisibility();
}

function syncHash() {
  if (!sel) return;
  const h = sel.type === 'seat'
    ? '#s=' + [sel.door, sel.rowLabel, sel.seat].join('_')
    : '#f=' + [sel.area, sel.x.toFixed(1), sel.z.toFixed(1)].join('_');
  try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { /* ignore */ }
}
function loadHash() {
  const m = /^#([sf])=(.+)$/.exec(location.hash);
  if (!m) return false;
  const p = m[2].split('_');
  if (m[1] === 's') {
    if (p.length < 3) return false;
    el('doorInput').value = p[0]; el('rowInput').value = p[1]; el('seatInput').value = p[2];
    return selectSeat(p[0], p[1], p[2]) === null;
  }
  if (!FEST[p[0]]) return false;
  const x = parseFloat(p[1]), z = parseFloat(p[2]);
  if (!isFinite(x) || !isFinite(z)) return false;
  festArea = p[0];
  festGrid = '';
  selectFest(p[0], x, z, '');
  activateTab('fest');
  updateFestButtons();
  return true;
}

function setPosture(p, silent) {
  posture = p;
  $$('#postureSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.posture === p)));
  if (povActive && !silent) updateCrowd(getEye());
}

/* ------------------------------------------------------- kamera & tampilan */
const PRESETS = {
  overview: () => ({ p: V(150, 120, 190), t: V(0, 5, 0), f: 45 }),
  top: () => ({ p: V(0, 330, 0.5), t: V(0, 0, 0), f: 45 }),
  stage: () => ({ p: V(0, 7, -38), t: V(0, 5, 60), f: 62 }),
};
function flyTo(p, t, f, done, dur = 1.0) {
  fly = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), f0: camera.fov, p1: p.clone(), t1: t.clone(), f1: f, done };
  controls.enabled = false;
}
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function setPovAngles(from, to) {
  const d = to.clone().sub(from);
  pov.yaw = Math.atan2(-d.x, -d.z);
  pov.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
}

function showPovUi(on) {
  el('povHud').hidden = !on;
  document.body.classList.toggle('in-pov', on);
  labelSprites.forEach((s) => { s.visible = !on && el('labelsToggle').checked; });
  marker.visible = !!sel && !on;
  updatePipVisibility();
}
function refreshPovHud() {
  if (!sel) return;
  el('povTitle').textContent = sel.label;
  el('povMeta').textContent = sel.cat.name + ' · ± ' + distToStage(sel.pos) + ' m dari panggung';
}

function enterPov() {
  const eye = getEye();
  refreshPovHud();
  setZoom(zoom);
  showPovUi(true);
  updateCrowd(eye);
  if (povActive) return;
  flyTo(eye, TARGET, povFov(), () => {
    povActive = true;
    camera.position.copy(eye);
    setPovAngles(eye, TARGET);
    camera.rotation.order = 'YXZ';
  }, 1.1);
}

function leavePov() {
  if (!povActive && !fly) { showPovUi(false); return; }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  controls.target.copy(camera.position).addScaledVector(dir, 60);
  povActive = false;
  fly = null;
  updateCrowd(null);
  showPovUi(false);
}

function setView(v) {
  if (v === 'pov' && !sel) { toast('Pilih kursi atau posisi festival dulu.'); return; }
  const wasPov = view === 'pov';
  view = v;
  $$('.views button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (v === 'pov') { enterPov(); return; }
  if (wasPov) leavePov();
  const pr = PRESETS[v]();
  flyTo(pr.p, pr.t, pr.f);
}

/* --------------------------------------------------------- pointer & pick */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointers = new Map();
let down = null, pinch0 = 0, zoom0 = 1;

function pick(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(standMeshes.concat([scene.userData.pitch]), false);
  if (!hits.length) return null;
  const h = hits[0], p = h.point;
  if (h.object === scene.userData.pitch) return { kind: 'pitch', x: p.x, z: p.z };
  const t = TIERS[h.object.userData.tier - 1];
  const d = clamp(t.d0 + (p.y - t.y0) / t.slope, t.d0, t.d1 - 0.01);
  const th = Math.atan2(p.z / (HZ + d), p.x / (HX + d));
  const u = (((th + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
  const i = Math.min(DOORS, Math.floor(u * DOORS) + 1);
  const row = clamp(Math.floor((d - t.d0) / t.rowD) + 1, 1, t.rows);
  const seat = clamp(Math.floor((u * DOORS - (i - 1)) * SEATS) + 1, 1, SEATS);
  return { kind: 'stand', tier: t.id, i, row, seat, door: t.id * 100 + i, cat: category(t.id, i) };
}

function festAreaAt(z) {
  if (z >= FEST.A.z0 && z <= FEST.A.z1) return 'A';
  if (z >= FEST.B.z0 && z <= FEST.B.z1) return 'B';
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  if (pointers.size === 2) {
    const [a, b] = Array.from(pointers.values());
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom;
  }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (prev) {
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    if (povActive) {
      if (pointers.size === 1) {
        const k = rad(camera.fov) / canvas.clientHeight;
        pov.yaw += dx * k;
        pov.pitch = clamp(pov.pitch + dy * k, rad(-85), rad(85));
      } else if (pointers.size === 2 && pinch0) {
        const [a, b] = Array.from(pointers.values());
        setZoom(zoom0 * (Math.hypot(a.x - b.x, a.y - b.y) / pinch0));
      }
    }
    return;
  }
  if (e.pointerType === 'mouse' && !povActive) hover(e.clientX, e.clientY);
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = 0;
  if (down && pointers.size === 0 && e.type === 'pointerup' && down.moved < 6 && performance.now() - down.t < 500 && !povActive && !fly) {
    onTap(e.clientX, e.clientY);
  }
  if (pointers.size === 0) down = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { el('tooltip').hidden = true; });
canvas.addEventListener('wheel', (e) => {
  if (!povActive) return;
  e.preventDefault();
  setZoom(zoom * Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

function onTap(x, y) {
  const h = pick(x, y);
  if (!h) return;
  if (h.kind === 'pitch') {
    const a = festAreaAt(h.z);
    if (!a) { toast('Area ini bukan festival.'); return; }
    festArea = a; festGrid = '';
    activateTab('fest');
    selectFest(a, h.x, h.z, '');
    updateFestButtons();
  } else {
    if (h.cat.closed) { toast('Area samping/belakang panggung ditutup.'); return; }
    activateTab('seat');
    el('doorInput').value = h.door; el('rowInput').value = h.row; el('seatInput').value = h.seat;
    selectSeat(h.door, h.row, h.seat);
  }
}

let hoverRaf = 0;
function hover(x, y) {
  if (hoverRaf) return;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    const tip = el('tooltip');
    const h = pick(x, y);
    if (!h) { tip.hidden = true; return; }
    tip.textContent = '';
    const b = document.createElement('b');
    if (h.kind === 'pitch') {
      const a = festAreaAt(h.z);
      b.textContent = a ? FEST[a].name : 'Lapangan';
      tip.append(b, a ? ' · ' + IDR(FEST[a].price) : '');
    } else if (h.cat.closed) {
      b.textContent = 'Door ' + h.door;
      tip.append(b, ' · ditutup');
    } else {
      b.textContent = 'Door ' + h.door;
      tip.append(b, ' · ' + h.cat.name + ' · ' + IDR(h.cat.price));
    }
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    tip.hidden = false;
  });
}

/* --------------------------------------------------------------- PiP */
function pipActive() {
  return !!sel && !povActive && !fly && el('pipToggle').checked && !el('pip').dataset.closed;
}
function updatePipVisibility() {
  const on = !!sel && !povActive && el('pipToggle').checked;
  el('pip').hidden = !on;
  document.body.classList.toggle('has-pip', on);
}
const pipCam = new THREE.PerspectiveCamera(60, 1.5, 0.3, 1600);
pipCam.rotation.order = 'YXZ';

/* --------------------------------------------------------------- loop */
const clock = new THREE.Clock();
const arrow = el('youArrow');
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const tmpV = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;

  if (fly) {
    fly.t += dt / fly.dur;
    const k = ease(Math.min(fly.t, 1));
    camera.position.lerpVectors(fly.p0, fly.p1, k);
    controls.target.lerpVectors(fly.t0, fly.t1, k);
    camera.fov = fly.f0 + (fly.f1 - fly.f0) * k;
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    if (fly.t >= 1) {
      const done = fly.done;
      fly = null;
      if (done) done(); else { controls.enabled = true; controls.update(); }
    }
  } else if (povActive) {
    camera.position.copy(getEye());
    camera.rotation.set(pov.pitch, pov.yaw, 0, 'YXZ');
    const f = povFov();
    if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
  } else {
    controls.update();
  }

  // sorotan
  if (lights === 'show') {
    beams.forEach((b) => {
      const k = b.userData.k;
      b.rotation.x = -(0.55 + 0.35 * Math.sin(time * 0.8 + k));
      b.rotation.z = 0.5 * Math.sin(time * 0.6 + k * 1.3) + (k - 3.5) * 0.08;
    });
  }
  // penanda
  if (marker.visible) {
    const d = camera.position.distanceTo(marker.position);
    marker.scale.setScalar(clamp(d / 55, 1, 6));
    marker.position.y = sel.pos.y + Math.sin(time * 3) * 0.2 * marker.scale.x;
  }

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);

  // pratinjau POV
  if (pipActive()) {
    const r = el('pip').getBoundingClientRect();
    if (r.width > 10) {
      const eye = getEye();
      pipCam.position.copy(eye);
      const d = TARGET.clone().sub(eye);
      pipCam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ');
      pipCam.aspect = r.width / r.height;
      pipCam.updateProjectionMatrix();
      const was = marker.visible;
      marker.visible = false;
      const y = window.innerHeight - r.bottom;
      renderer.setScissorTest(true);
      renderer.setViewport(r.left, y, r.width, r.height);
      renderer.setScissor(r.left, y, r.width, r.height);
      renderer.clearDepth();
      renderer.render(scene, pipCam);
      renderer.setScissorTest(false);
      marker.visible = was;
    }
  }

  // panah "Kamu di sini"
  if (sel && !povActive && marker.visible) {
    tmpV.copy(marker.position).add(V(0, 3.6 * marker.scale.x, 0)).project(camera);
    if (tmpV.z < 1 && Math.abs(tmpV.x) < 1.05 && Math.abs(tmpV.y) < 1.05) {
      const px = (tmpV.x * 0.5 + 0.5) * window.innerWidth, py = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
      const w = arrow.offsetWidth || 110;
      arrow.hidden = false;
      arrow.style.transform = 'translate(' + Math.max(8, px - w - 10).toFixed(1) + 'px,' + (py - 12).toFixed(1) + 'px)';
    } else arrow.hidden = true;
  } else arrow.hidden = true;
}

/* ------------------------------------------------------------ UI wiring */
function activateTab(which) {
  const seat = which === 'seat';
  el('tabSeat').setAttribute('aria-selected', String(seat));
  el('tabFest').setAttribute('aria-selected', String(!seat));
  el('finder').hidden = !seat;
  el('festForm').hidden = seat;
}
el('tabSeat').addEventListener('click', () => activateTab('seat'));
el('tabFest').addEventListener('click', () => {
  activateTab('fest');
  if (!sel || sel.type !== 'fest') selectFestGrid(festArea, festGrid || '1,1');
  updateFestButtons();
});
el('finder').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = selectSeat(el('doorInput').value, el('rowInput').value, el('seatInput').value);
  const box = el('finderError');
  if (err) { box.textContent = err; box.hidden = false; return; }
  box.hidden = true;
  setView('pov');
});
$$('[data-farea]').forEach((b) => b.addEventListener('click', () => {
  selectFestGrid(b.dataset.farea, festGrid || '1,1');
  updateFestButtons();
}));
$$('[data-fpos]').forEach((b) => b.addEventListener('click', () => {
  selectFestGrid(festArea, b.dataset.fpos);
  updateFestButtons();
  if (view === 'pov') updateCrowd(getEye());
}));
$$('.views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
el('labelsToggle').addEventListener('change', (e) => { labelSprites.forEach((s) => { s.visible = e.target.checked && !povActive; }); });
el('crowdToggle').addEventListener('change', (e) => { bodyIM.visible = headIM.visible = e.target.checked; });
el('pipToggle').addEventListener('change', updatePipVisibility);
el('pipClose').addEventListener('click', () => { el('pipToggle').checked = false; updatePipVisibility(); });
el('pipOpen').addEventListener('click', () => setView('pov'));
el('povExit').addEventListener('click', () => setView('overview'));
el('povZoom').addEventListener('input', (e) => setZoom(parseFloat(e.target.value)));
$$('#postureSeg button').forEach((b) => b.addEventListener('click', () => setPosture(b.dataset.posture)));
$$('#lightSeg button').forEach((b) => b.addEventListener('click', () => setLights(b.dataset.lights)));
el('togglePanel').addEventListener('click', () => {
  const body = el('panelBody'), open = body.hidden;
  body.hidden = !open;
  el('togglePanel').textContent = open ? 'Sembunyikan' : 'Tampilkan';
  el('togglePanel').setAttribute('aria-expanded', String(open));
});
el('povHide').addEventListener('click', () => { document.body.classList.add('ui-hidden'); el('showUi').hidden = false; });
el('showUi').addEventListener('click', () => { document.body.classList.remove('ui-hidden'); el('showUi').hidden = true; });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && view === 'pov') setView('overview'); });

el('shareBtn').addEventListener('click', async () => {
  if (!sel) { toast('Pilih kursi atau posisi festival dulu.'); return; }
  syncHash();
  const url = location.href;
  const text = 'Cek POV-ku di konser Avenged Sevenfold JIS: ' + sel.label;
  try {
    if (navigator.share) { await navigator.share({ title: document.title, text, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Link POV-mu udah disalin'); }
  catch (e) { window.prompt('Salin link ini:', url); }
});

// disclaimer
(() => {
  const m = el('disclaimer');
  if (store.get('a7x_disc') === '1') return;
  m.hidden = false;
  el('discOk').addEventListener('click', () => { m.hidden = true; store.set('a7x_disc', '1'); });
  el('discOk').focus();
})();

/* ---------------------------------------------------------------- musik */
// Isi id video YouTube (11 karakter) buat tiap lagu. Entri tanpa id dilewati.
const SONGS = [
  { t: 'Nightmare', id: '94bGzWyHbu0' },
  { t: 'Bat Country', id: '' },
  { t: 'Hail to the King', id: '' },
  { t: 'So Far Away', id: '' },
  { t: 'Afterlife', id: '' },
].filter((s) => s.id);
let yt = null, songIdx = 0, errStreak = 0;
const musicEl = el('music');

function renderSongList() {
  const ol = el('musicList');
  ol.textContent = '';
  SONGS.forEach((s, k) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.textContent = s.t;
    if (k === songIdx) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => { playSong(k); el('musicList').hidden = true; el('musicPick').setAttribute('aria-expanded', 'false'); });
    li.appendChild(b); ol.appendChild(li);
  });
}
function playSong(k) {
  songIdx = (k + SONGS.length) % SONGS.length;
  el('musicNow').textContent = SONGS[songIdx].t;
  renderSongList();
  if (yt && yt.loadVideoById) yt.loadVideoById(SONGS[songIdx].id);
}
function initPlayer() {
  if (yt || !SONGS.length) return;
  const make = () => {
    const holder = document.createElement('div');
    el('player').appendChild(holder);
    yt = new YT.Player(holder, {
      width: 200, height: 113, videoId: SONGS[songIdx].id,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
      events: {
        onReady: (e) => {
          e.target.setVolume(+el('musicVol').value);
          e.target.playVideo();
          setTimeout(() => { if (yt && yt.getPlayerState && yt.getPlayerState() !== 1) el('musicHint').hidden = false; }, 2500);
        },
        onStateChange: (e) => {
          const s = e.data;
          if (s === 1) { errStreak = 0; el('musicHint').hidden = true; musicEl.classList.remove('paused'); el('musicPlay').setAttribute('aria-label', 'Jeda'); }
          if (s === 2) { musicEl.classList.add('paused'); el('musicPlay').setAttribute('aria-label', 'Putar'); }
          if (s === 0) playSong(songIdx + 1);
        },
        onError: () => { if (++errStreak < SONGS.length) playSong(songIdx + 1); else toast('Lagunya nggak bisa diputar.'); },
      },
    });
  };
  if (window.YT && YT.Player) { make(); return; }
  window.onYouTubeIframeAPIReady = make;
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}
function setMusicOpen(open) {
  musicEl.hidden = !open;
  $$('[data-music]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
  if (open) { renderSongList(); initPlayer(); if (yt && yt.playVideo) yt.playVideo(); }
  else if (yt && yt.pauseVideo) yt.pauseVideo();
}
$$('[data-music]').forEach((b) => b.addEventListener('click', () => setMusicOpen(musicEl.hidden)));
el('musicClose').addEventListener('click', () => setMusicOpen(false));
el('musicPlay').addEventListener('click', () => {
  if (!yt || !yt.getPlayerState) return;
  if (yt.getPlayerState() === 1) yt.pauseVideo(); else yt.playVideo();
});
el('musicNext').addEventListener('click', () => playSong(songIdx + 1));
el('musicPick').addEventListener('click', () => {
  const l = el('musicList'), open = l.hidden;
  l.hidden = !open;
  el('musicPick').setAttribute('aria-expanded', String(open));
});
el('musicMore').addEventListener('click', () => {
  const r = el('musicVolRow'), open = r.hidden;
  r.hidden = !open;
  el('musicMore').setAttribute('aria-expanded', String(open));
});
el('musicVol').addEventListener('input', (e) => { if (yt && yt.setVolume) yt.setVolume(+e.target.value); });

/* ----------------------------------------------- API opsional (kunjungan, teman) */
async function api(path, opts) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(path, Object.assign({ signal: ctl.signal }, opts));
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; } finally { clearTimeout(to); }
}
async function initVisits() {
  let counted = false;
  try { counted = sessionStorage.getItem('a7x_v') === '1'; } catch (e) { /* ignore */ }
  const j = await api('/api/visit', { method: counted ? 'GET' : 'POST' });
  if (!j || typeof j.n !== 'number') return;
  try { sessionStorage.setItem('a7x_v', '1'); } catch (e) { /* ignore */ }
  el('visitsN').textContent = j.n.toLocaleString('id-ID');
  el('visits').hidden = false;
}

let friends = [];
function myId() {
  let id = store.get('a7x_id');
  if (!id) { id = 'u' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set('a7x_id', id); }
  return id;
}
function renderFriends() {
  const q = el('friendSearch').value.trim().toLowerCase();
  const list = el('friendList');
  list.textContent = '';
  el('friendsCount').textContent = friends.length + ' orang udah isi nama';
  friends.filter((f) => !q || f.n.toLowerCase().includes(q)).slice(0, 40).forEach((f) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button';
    b.textContent = f.n;
    const s = document.createElement('small');
    s.textContent = 'Door ' + f.d + ' · Row ' + f.r + ' · Seat ' + f.s;
    b.appendChild(s);
    b.addEventListener('click', () => {
      activateTab('seat');
      el('doorInput').value = f.d; el('rowInput').value = f.r; el('seatInput').value = f.s;
      if (selectSeat(f.d, f.r, f.s) === null) setView('pov');
    });
    li.appendChild(b); list.appendChild(li);
  });
}
async function loadFriends() {
  const j = await api('/api/seats');
  if (!j || !Array.isArray(j.items)) return;
  seatsApi = true;
  friends = j.items.filter((f) => f && typeof f.n === 'string');
  el('friends').hidden = false;
  renderFriends();
  renderInfo();
}
async function saveName(name) {
  if (!sel || sel.type !== 'seat') return;
  name = name.trim().slice(0, 30);
  const j = await api('/api/seats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: myId(), name, door: sel.door, row: sel.rowLabel, seat: sel.seat }),
  });
  if (!j || !j.ok) { toast('Gagal nyimpen, coba lagi.'); return; }
  store.set('a7x_name', name);
  toast(name ? 'Nama kamu udah tersimpan' : 'Nama kamu dihapus');
  loadFriends();
}
el('friendSearch').addEventListener('input', renderFriends);

/* ------------------------------------------------------------------ start */
buildStadium();
buildField();
buildCrowd();
setLights('on');
setZoom(1);
renderInfo();
updateFestButtons();
resize();
const fromHash = loadHash();
if (fromHash) { setView('pov'); }
initVisits();
loadFriends();
frame();
})();
