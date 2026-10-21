/*
 * Home hero: a built-in oak wardrobe assembles itself from a flat-packed pile as the visitor scrolls.
 * Self-contained: it builds its own simple panel geometry (it does not use the configurator's geometry.js).
 *
 * Choreography (progress 0..1 across the sticky hero track):
 *   01 0.02-0.24  panels lift off the flat-pack pile and hover in the shape of the wardrobe
 *   02 0.26-0.58  they slide into the alcove and lock; folded linen, garments and LED strips follow
 *   03 0.60-0.86  the two oak doors fly in and swing open
 *   04 0.86-1.00  the camera pulls back to show the wardrobe fitted in its alcove, with soft light
 * The camera is framed so everything stays in view (portrait phones use the top half of the screen). Under prefers-reduced-motion, or when WebGL is
 * unavailable, the wardrobe is shown fully assembled (a still render, or an SVG composition as the last resort).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const root = document.querySelector('[data-hero]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c1 = 1.5; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ------------------------------------------------------------ procedural textures */
function grainCanvas(base, seed, size = 1024) {
  const rand = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, size, size);
  // broad tonal drift between growth bands
  for (let i = 0; i < 26; i++) {
    const y = rand() * size; const h = 30 + rand() * 120;
    const dark = rand() < 0.5;
    const grad = g.createLinearGradient(0, y - h, 0, y + h);
    const col = dark ? '90,56,24' : '255,232,190';
    grad.addColorStop(0, `rgba(${col},0)`); grad.addColorStop(0.5, `rgba(${col},${0.05 + rand() * 0.07})`); grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.fillRect(0, y - h, size, h * 2);
    g.fillRect(0, y - h - size, size, h * 2);
    g.fillRect(0, y - h + size, size, h * 2);
  }
  // cathedral figures
  for (let k = 0; k < 3; k++) {
    const cx = size * (0.2 + rand() * 0.6); const cy = size * (0.2 + rand() * 0.6);
    for (let r = 4; r < 46; r += 2 + rand() * 2) {
      g.strokeStyle = `rgba(112,66,26,${0.05 + rand() * 0.06})`;
      g.lineWidth = 0.8 + rand() * 1.4;
      g.beginPath(); g.ellipse(cx, cy, r * (6 + rand()), r * 0.9, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  // long streaks (tileable: integer wave counts, drawn three times vertically)
  for (let i = 0; i < 380; i++) {
    const y0 = rand() * size; const amp = 1.5 + rand() * 9; const w = 0.5 + rand() * 2.2;
    const k1 = 1 + Math.floor(rand() * 5); const k2 = 3 + Math.floor(rand() * 7); const ph = rand() * 6.283;
    const light = rand() < 0.45; const a = 0.04 + rand() * 0.13;
    g.strokeStyle = light ? `rgba(255,238,206,${a})` : `rgba(96,56,22,${a * 1.25})`;
    g.lineWidth = w;
    for (const off of [-size, 0, size]) {
      g.beginPath();
      for (let x = 0; x <= size; x += 12) {
        const y = y0 + off + Math.sin((x / size) * 6.283 * k1 + ph) * amp + Math.sin((x / size) * 6.283 * k2 + ph * 1.7) * amp * 0.25;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // pores
  for (let i = 0; i < 1400; i++) {
    const x = rand() * size; const y = rand() * size; const len = 3 + rand() * 14;
    g.strokeStyle = `rgba(80,46,18,${0.08 + rand() * 0.14})`;
    g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rand() - 0.5) * 1.2); g.stroke();
  }
  return c;
}
function rotated(canvas) {
  const s = canvas.width;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.translate(s, 0); g.rotate(Math.PI / 2); g.drawImage(canvas, 0, 0);
  return c;
}
function floorCanvas(size = 1024) {
  const rand = rng(91);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rows = 10; const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 400;
    while (x < size) {
      const len = 320 + rand() * 360;
      const tone = 0.95 + rand() * 0.1;
      g.fillStyle = `rgb(${Math.round(212 * tone)},${Math.round(190 * tone)},${Math.round(158 * tone)})`;
      g.fillRect(x, r * rh, len, rh);
      g.strokeStyle = 'rgba(70,46,24,0.16)'; g.lineWidth = 2;
      g.strokeRect(x, r * rh, len, rh);
      for (let i = 0; i < 14; i++) {
        const yy = r * rh + rand() * rh;
        g.strokeStyle = rand() < 0.5 ? 'rgba(255,236,200,0.10)' : 'rgba(90,52,20,0.12)';
        g.lineWidth = 0.7 + rand() * 1.2;
        g.beginPath(); g.moveTo(x + 4, yy); g.bezierCurveTo(x + len * 0.3, yy + (rand() - 0.5) * 6, x + len * 0.6, yy + (rand() - 0.5) * 6, x + len - 4, yy + (rand() - 0.5) * 4); g.stroke();
      }
      x += len;
    }
  }
  return c;
}

/* ------------------------------------------------------------ the scene */
function createHero(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const wallColor = new THREE.Color((getComputedStyle(document.documentElement).getPropertyValue('--paper-2') || '').trim() || '#e9e8e3');
  renderer.setClearColor(wallColor, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  scene.background = wallColor;
  scene.fog = new THREE.Fog(wallColor, 10, 26);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const texFrom = (cv, rx, ry, seedOffset = 0) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    t.repeat.set(rx, ry);
    t.offset.set((seedOffset * 0.37) % 1, (seedOffset * 0.61) % 1);
    return t;
  };
  const oakH = grainCanvas([188, 133, 76], 11);
  const oakV = rotated(oakH);
  const plyH = grainCanvas([236, 214, 172], 23);
  const plyV = rotated(plyH);
  const oakMat = (vertical, rx, ry, i) => new THREE.MeshStandardMaterial({ map: texFrom(vertical ? oakV : oakH, rx, ry, i), roughness: 0.58, metalness: 0, color: new THREE.Color().setScalar(0.92 + ((i * 37) % 17) / 100) });
  const plyMat = (vertical, rx, ry, i) => new THREE.MeshStandardMaterial({ map: texFrom(vertical ? plyV : plyH, rx, ry, i + 5), roughness: 0.7, metalness: 0, color: new THREE.Color().setScalar(0.96) });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 0.7 });
  const steelMat = new THREE.MeshStandardMaterial({ color: '#b9b3a8', roughness: 0.35, metalness: 0.9 });
  const brassMat = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.4, metalness: 0.7 });
  const ledMat = new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffd9a0', emissiveIntensity: 0, roughness: 0.5 });

  /* room: wall, floor, skirting */
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), new THREE.MeshStandardMaterial({ color: '#e7e6e1', roughness: 1 }));
  wall.position.set(0, 7, -0.002); wall.receiveShadow = true; scene.add(wall);
  const floorTex = texFrom(floorCanvas(), 7, 7);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, color: '#e6e3df' }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.001, 10); floor.receiveShadow = true; scene.add(floor);
  // the wall stands proud of the niche: the wardrobe is built into an alcove (opening x -1..1, height 2.38, depth 0.66)
  const WALL_FRONT = 0.66;
  const wallMat = new THREE.MeshStandardMaterial({ color: '#e7e6e1', roughness: 1 });
  [[-16, 30], [16, 30]].forEach(([cx, w]) => {
    const blk = new THREE.Mesh(new THREE.BoxGeometry(w, 14, WALL_FRONT), wallMat);
    blk.position.set(cx + (cx < 0 ? -1 : 1), 7, WALL_FRONT / 2);
    blk.receiveShadow = true; blk.castShadow = true; scene.add(blk);
  });
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(2, 14, WALL_FRONT), wallMat);
  soffit.position.set(0, 2.38 + 7, WALL_FRONT / 2); soffit.receiveShadow = true; soffit.castShadow = true; scene.add(soffit);
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.8 });
  [[-16, 30], [16, 30]].forEach(([cx, w]) => {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.018), skirtMat);
    sk.position.set(cx + (cx < 0 ? -1 : 1), 0.05, WALL_FRONT + 0.009); sk.receiveShadow = true; sk.castShadow = true; scene.add(sk);
  });

  /* lights */
  const hemi = new THREE.HemisphereLight('#f3f6f9', '#8c8984', 1.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff3e4', 2.1);
  key.position.set(0.8, 5.4, 5.6);
  key.target.position.set(0, 1, 0.3);
  key.castShadow = true;
  const sm = opts.small ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  Object.assign(key.shadow.camera, { left: -4.2, right: 4.2, top: 4.2, bottom: -4.2, near: 1, far: 16 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.35);
  fill.position.set(-4, 2.5, 3);
  fill.intensity = 0.5;
  scene.add(fill);
  const inner = new THREE.PointLight('#ffcf94', 0, 2.6, 2);
  inner.position.set(0, 1.5, 0.38);
  scene.add(inner);

  /* wardrobe dimensions (metres) */
  const W = 2.0; const H = 2.3; const D = 0.6; const T = 0.022; const PL = 0.1;
  const yb = PL + T; const yt = H - T;
  const bayW = W / 2 - T - T / 2;
  const lx = -(W / 2 - T) / 2 - T / 4; const rx = -lx;

  const panels = [];
  const items = [];

  const addPanel = (name, dims, pos, mat, o = {}) => {
    const geo = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
    const local = new THREE.Vector3();
    if (o.hingeDir) { geo.translate((o.hingeDir * dims[0]) / 2, 0, 0); local.set((o.hingeDir * dims[0]) / 2, 0, 0); }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = name;
    scene.add(mesh);
    const finalOrigin = new THREE.Vector3(...pos);
    const rec = { name, mesh, dims, local, finalOrigin, finalCenter: finalOrigin.clone().add(local), thick: Math.min(...dims), door: o.door || null, t0: 0, t1: 1, lift: 0.9, pileCenter: new THREE.Vector3(), pileQ: new THREE.Quaternion() };
    panels.push(rec);
    return rec;
  };

  // carcass: [name, dims, final centre, material]
  const fy = (PL + H) / 2;
  const carcass = [];
  carcass.push(addPanel('sideL', [T, H, D], [-(W / 2 - T / 2), H / 2, D / 2], oakMat(true, 0.5, 1.9, 2)));
  carcass.push(addPanel('sideR', [T, H, D], [W / 2 - T / 2, H / 2, D / 2], oakMat(true, 0.5, 1.9, 3)));
  carcass.push(addPanel('bottom', [W - 2 * T, T, D - 0.01], [0, PL + T / 2, D / 2 + 0.005], plyMat(false, 1.7, 0.5, 1)));
  carcass.push(addPanel('plinth', [W - 2 * T, PL, 0.018], [0, PL / 2, D - 0.07], darkMat));
  [-1, 1].forEach((sd, i) => carcass.push(addPanel(`back${i}`, [(W - 2 * T) / 2 - 0.001, H - PL, 0.008], [sd * (W - 2 * T) / 4, fy, 0.004], plyMat(true, 0.8, 1.9, 4 + i))));
  carcass.push(addPanel('divider', [T, yt - yb, D - 0.012], [0, (yt + yb) / 2, (D - 0.012) / 2 + 0.008], plyMat(true, 0.5, 1.8, 5)));
  carcass.push(addPanel('top', [W, T, D], [0, H - T / 2, D / 2], oakMat(false, 1.7, 0.5, 6)));
  const shelfH = [];
  for (let k = 1; k <= 4; k++) shelfH.push(yb + ((yt - yb) / 5) * k);
  shelfH.forEach((y, i) => carcass.push(addPanel(`shelfL${i}`, [bayW, T, D - 0.04], [lx, y, (D - 0.04) / 2 + 0.01], plyMat(false, 0.8, 0.5, 7 + i))));
  const railY = 1.86;
  const rShelves = [shelfH[0], shelfH[1], 2.02];
  rShelves.forEach((y, i) => carcass.push(addPanel(`shelfR${i}`, [bayW, T, D - 0.04], [rx, y, (D - 0.04) / 2 + 0.01], plyMat(false, 0.8, 0.5, 12 + i))));
  const rail = addPanel('rail', [bayW - 0.02, 0.026, 0.026], [rx, railY, 0.3], steelMat);
  carcass.push(rail);
  const doorRecs = [];
  const doorW = W / 2 - 0.004; const doorH = H - PL - 0.008;
  [[-1, -W / 2 + 0.002, 'left'], [1, W / 2 - 0.002, 'right']].forEach(([side, hx, hinge], i) => {
    const hingeDir = side === -1 ? 1 : -1; // left hinge: the leaf extends to +x
    const d = addPanel(`door${i}`, [doorW, doorH, T], [hx, (PL + 0.004 + H - 0.004) / 2, D + T / 2 + 0.002], oakMat(true, 0.8, 1.9, 20 + i), { hingeDir, door: { hinge, open: 0 } });
    // handle: a vertical bar near the free edge
    const hGeo = new THREE.BoxGeometry(0.014, 0.34, 0.02);
    const handle = new THREE.Mesh(hGeo, brassMat);
    handle.position.set(hingeDir * (doorW - 0.07), -0.05, T / 2 + 0.01);
    handle.castShadow = true; d.mesh.add(handle);
    doorRecs.push(d);
  });

  /* ---- flat-pack pile (stack order: first to fly sits on top) */
  const flightOrder = carcass.slice();
  const rand = rng(5);
  const pileX = 0.15; const pileZ = 1.6;
  const stack = [...flightOrder, ...doorRecs].reverse();
  const surface = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let ySum = 0.02;
  stack.forEach((rec) => {
    const [dx, dy, dz] = rec.dims;
    // axes sorted: longest -> X, middle -> Z, thinnest -> Y
    const idx = [0, 1, 2].sort((a, b) => rec.dims[b] - rec.dims[a]);
    const m = new THREE.Matrix4();
    const cols = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    // local axis idx[0] -> world X, idx[1] -> world Z, idx[2] -> world Y
    cols[idx[0]].set(1, 0, 0); cols[idx[1]].set(0, 0, 1); cols[idx[2]].set(0, 1, 0);
    m.makeBasis(cols[0], cols[1], cols[2]);
    if (m.determinant() < 0) { cols[idx[2]].set(0, -1, 0); m.makeBasis(cols[0], cols[1], cols[2]); }
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rand() - 0.5) * 0.18));
    const th = rec.dims[idx[2]];
    rec.pileQ.copy(q);
    rec.pileCenter.set(pileX + (rand() - 0.5) * 0.22, ySum + th / 2, pileZ + (rand() - 0.5) * 0.14);
    ySum += th + 0.0015;
  });
  void surface;
  const pileTopY = ySum;

  // choreography. 01: panels lift off the pile to a hover pose (0.02-0.24). 02: they slide into the alcove and lock (0.26-0.46),
  // linen and garments follow (0.46-0.58). 03: the doors fly in (0.60-0.73) and swing open (0.72-0.86). 04: the camera pulls back (0.86-1).
  const hoverOf = (n) => {
    if (n.startsWith('side')) return new THREE.Vector3(0, 0.25, 0.85);
    if (n === 'top') return new THREE.Vector3(0, 0.75, 0.8);
    if (n === 'bottom') return new THREE.Vector3(0, 0.05, 1.0);
    if (n === 'plinth') return new THREE.Vector3(0, 0, 1.1);
    if (n.startsWith('back')) return new THREE.Vector3(0, 0.12, 0.95);
    if (n === 'divider') return new THREE.Vector3(0, 0.35, 0.8);
    if (n === 'rail') return new THREE.Vector3(0, 0.3, 0.8);
    return new THREE.Vector3(0, 0.2, 0.95);
  };
  const flyers = flightOrder;
  const nFly = flyers.length;
  flyers.forEach((rec, i) => {
    rec.t0 = 0.02 + (i / (nFly - 1)) * 0.09; rec.t1 = rec.t0 + 0.13;
    rec.lift = 0.45 + rand() * 0.35;
    rec.hoverCenter = rec.finalCenter.clone().add(hoverOf(rec.name));
  });
  [...flyers].sort((a, b) => a.finalCenter.y - b.finalCenter.y).forEach((rec, j) => { rec.l0 = 0.26 + (j / (nFly - 1)) * 0.11; rec.l1 = rec.l0 + 0.09; });
  doorRecs.forEach((rec, i) => { rec.t0 = 0.6 + i * 0.03; rec.t1 = rec.t0 + 0.1; rec.lift = 0.45; rec.swing = [0.72 + i * 0.03, 0.83 + i * 0.03]; rec.angle = 1.78; });

  /* ---- folded linen, garments, LED strips */
  const palette = ['#efe6d4', '#7d8b6a', '#c0765a', '#6b4a35', '#8aa0aa', '#d9a441', '#e6d6b8', '#a9b59a'];
  const foldGeo = new RoundedBoxGeometry(0.4, 0.05, 0.32, 3, 0.014);
  const boxGeo = new RoundedBoxGeometry(0.36, 0.22, 0.3, 3, 0.012);
  const foldMats = palette.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
  const addStack = (cx, baseY, cz, count, colorIdx, order) => {
    const g = new THREE.Group();
    g.position.set(cx, baseY, cz);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(foldGeo, foldMats[(colorIdx + (i % 5 === 3 ? 1 : 0)) % foldMats.length]);
      m.position.set((rand() - 0.5) * 0.014, 0.025 + i * 0.05, (rand() - 0.5) * 0.014);
      m.rotation.y = (rand() - 0.5) * 0.05;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
    scene.add(g);
    items.push({ obj: g, t0: 0.46 + order * 0.0028, dur: 0.06, drop: 0.5, base: baseY, kind: 'stack' });
  };
  const bayBottoms = [yb, ...shelfH];
  let order = 0; let ci = 0;
  bayBottoms.forEach((y0, i) => {
    const y = y0 + T / 2;
    const counts = [5, 4, 6, 4, 3][i];
    addStack(lx - 0.2, y, 0.34, counts, ci++, order++);
    if (i % 2 === 0) addStack(lx + 0.22, y, 0.34, Math.max(2, counts - 2), ci++, order++);
    else {
      const g = new THREE.Group();
      const bx = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: '#d8c7a6', roughness: 0.9 }));
      bx.castShadow = true; bx.receiveShadow = true; g.add(bx);
      g.position.set(lx + 0.22, y + 0.11, 0.34);
      scene.add(g);
      items.push({ obj: g, t0: 0.46 + order++ * 0.0028, dur: 0.06, drop: 0.5, base: y + 0.11, kind: 'stack' });
    }
  });
  [yb, rShelves[0], rShelves[2]].forEach((y0, i) => {
    const y = y0 + T / 2;
    addStack(rx - 0.2, y, 0.34, [5, 4, 3][i], ci++, order++);
    addStack(rx + 0.22, y, 0.34, [3, 5, 4][i], ci++, order++);
  });
  // garments
  const shirt = new THREE.Shape();
  [[-0.05, 0], [-0.22, -0.07], [-0.3, -0.24], [-0.225, -0.285], [-0.18, -0.2], [-0.18, -0.7], [0.18, -0.7], [0.18, -0.2], [0.225, -0.285], [0.3, -0.24], [0.22, -0.07], [0.05, 0], [0, -0.035]].forEach(([x, y], i) => (i ? shirt.lineTo(x, y) : shirt.moveTo(x, y)));
  const shirtGeo = new THREE.ExtrudeGeometry(shirt, { depth: 0.024, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
  shirtGeo.translate(0, 0, -0.012);
  const hookGeo = new THREE.TorusGeometry(0.018, 0.003, 6, 14, Math.PI * 1.5);
  const nGar = 8;
  for (let i = 0; i < nGar; i++) {
    const g = new THREE.Group();
    const gm = new THREE.Mesh(shirtGeo, foldMats[[1, 2, 0, 4, 3, 5, 7, 1][i]]);
    gm.castShadow = true; gm.scale.set(0.92 + rand() * 0.2, 0.86 + rand() * 0.28, 1);
    g.add(gm);
    const hook = new THREE.Mesh(hookGeo, steelMat); hook.position.set(0, 0.022, 0); hook.rotation.z = Math.PI * 0.2; g.add(hook);
    g.position.set(rx - bayW / 2 + 0.1 + (i * (bayW - 0.2)) / (nGar - 1), railY - 0.012, 0.3);
    g.rotation.y = Math.PI / 2 - 0.85 + (rand() - 0.5) * 0.16;
    scene.add(g);
    items.push({ obj: g, t0: 0.5 + i * 0.006, dur: 0.06, kind: 'garment', base: railY - 0.012 });
  }
  // LED strips under the top panel and the top shelf. Each strip gets a soft warm halo (a normal-blended
  // sprite, so the glow reads on the light day-time ground too) and a small warm light that washes the bay.
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,196,120,1)'); gr.addColorStop(0.3, 'rgba(255,176,90,.55)'); gr.addColorStop(0.65, 'rgba(255,160,70,.16)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ledGlows = []; const ledLights = [];
  [[lx, yt, 0.32], [rx, 2.02 - T / 2, 0.32]].forEach(([x, y, z], i) => {
    const led = new THREE.Mesh(new THREE.BoxGeometry(bayW - 0.1, 0.012, 0.034), ledMat);
    led.position.set(x, y - 0.006, z + 0.08);
    scene.add(led);
    items.push({ obj: led, t0: 0.55 + i * 0.01, dur: 0.05, kind: 'led', base: led.position.y });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffb45a', transparent: true, opacity: 0, depthWrite: false }));
    halo.scale.set(bayW * 1.35, 0.62, 1); halo.position.set(x, y - 0.17, z + 0.12); halo.renderOrder = 5; halo.visible = false;
    scene.add(halo); ledGlows.push(halo);
    const lamp = new THREE.PointLight('#ffc27a', 0, 2.1, 2);
    lamp.position.set(x, y - 0.12, z + 0.1); scene.add(lamp); ledLights.push(lamp);
  });

  items.forEach((it) => { it.obj.visible = false; });

  /* ------------------------------------------------------------ state + render */
  const state = { target: 0, current: 0, mx: 0, my: 0, cmx: 0, cmy: 0, w: 1, h: 1, running: false, visible: true, raf: 0, last: performance.now() };
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  function applyProgress(pRaw) {
    const p = clamp(pRaw / 0.97, 0, 1);
    panels.forEach((rec) => {
      const door = rec.door;
      if (door) {
        const t = easeInOut(range(p, rec.t0, rec.t1));
        if (p >= rec.t1) {
          const open = easeInOut(range(p, rec.swing[0], rec.swing[1]));
          const sign = rec.local.x > 0 ? -1 : 1;
          rec.mesh.quaternion.setFromAxisAngle(yAxis, sign * rec.angle * open);
          rec.mesh.position.copy(rec.finalOrigin);
          return;
        }
        tmpQ.slerpQuaternions(rec.pileQ, tmpQuatIdentity, t);
        tmpV.lerpVectors(rec.pileCenter, rec.finalCenter, t);
        tmpV.y += Math.sin(Math.PI * t) * rec.lift;
      } else {
        const a = easeInOut(range(p, rec.t0, rec.t1));
        const b = easeInOut(range(p, rec.l0, rec.l1));
        tmpQ.slerpQuaternions(rec.pileQ, tmpQuatIdentity, a);
        tmpV.lerpVectors(rec.pileCenter, rec.hoverCenter, a);
        tmpV.y += Math.sin(Math.PI * a) * rec.lift;
        if (b > 0) tmpV.lerpVectors(rec.hoverCenter, rec.finalCenter, b);
      }
      rec.mesh.quaternion.copy(tmpQ);
      rec.mesh.position.copy(tmpV).sub(rec.local.clone().applyQuaternion(tmpQ));
    });
    items.forEach((it) => {
      const t = range(p, it.t0, it.t0 + it.dur);
      it.obj.visible = t > 0;
      if (t <= 0) return;
      if (it.kind === 'led') { ledMat.emissiveIntensity = 3.6 * smooth(range(p, 0.8, 0.93)); return; }
      const e = easeOutBack(t);
      if (it.kind === 'garment') { it.obj.scale.set(1, clamp(e, 0.001, 1.08), 1); it.obj.position.y = it.base; return; }
      it.obj.scale.setScalar(Math.max(0.001, e));
      it.obj.position.y = it.base + (1 - easeOutCubic(t)) * it.drop;
    });
    const ledOn = smooth(range(p, 0.8, 0.93));
    ledGlows.forEach((h) => { h.visible = ledOn > 0.01; h.material.opacity = 0.8 * ledOn; });
    ledLights.forEach((l) => { l.intensity = 2.6 * ledOn; });
    const soft = smooth(range(p, 0.84, 1));
    inner.intensity = 3.2 * smooth(range(p, 0.72, 0.95));
    hemi.intensity = lerp(1.6, 1.8, soft);
    key.intensity = lerp(2.1, 1.6, soft);

    // camera: the whole wardrobe (open doors, flying panels) stays inside the frame at every position
    const aspect = state.w / state.h;
    const portrait = aspect < 1.0;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const frac = portrait ? 0.5 : 1; // share of the screen height the 3D subject may use (the text sits below on phones)
    const fitD = (w, h) => Math.max(h / frac / (2 * tanV), w / (aspect * 2 * tanV));
    const dA = portrait ? fitD(3.5, 4.1) : fitD(5.2, 4.3);
    const dB = portrait ? fitD(4.4, 4.2) : fitD(6.2, 4.5);
    const pull = opts.still ? 0 : smooth(range(p, 0.86, 1));
    const dist = lerp(dA, dB, pull);
    const orbit = opts.still ? 1 : smooth(range(p, 0, 0.84));
    const az = lerp(-0.6, 0.1, orbit) * (1 - pull) + state.cmx * 0.07;
    const tx = portrait ? 0 : opts.still ? -1.25 : lerp(-1.1, -0.95, orbit) * (1 - pull * 0.35);
    const ty = lerp(portrait ? 0.75 : 1.15, lerp(1.5, 1.15, orbit), smooth(range(p, 0, 0.14)));
    const camY = lerp(2.4, 1.6, orbit) + pull * 0.25 + state.cmy * 0.15;
    camera.position.set(tx + Math.sin(az) * dist, camY, 0.5 + Math.cos(az) * dist);
    camera.lookAt(tx, ty, 0.5);
  }
  const tmpQuatIdentity = new THREE.Quaternion();

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    state.w = Math.max(1, Math.round(r.width)); state.h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.w < 700 ? 1.5 : 1.75));
    renderer.setSize(state.w, state.h, false);
    camera.aspect = state.w / state.h;
    camera.fov = state.w / state.h < 1.0 ? 36 : 34;
    if (state.w / state.h < 1.0) camera.setViewOffset(state.w, state.h, 0, state.h * 0.25, state.w, state.h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    invalidate();
  }

  function frame() {
    state.raf = 0;
    if (!state.visible && !opts.still) return;
    const now = performance.now();
    const dt = Math.min(0.12, (now - state.last) / 1000 || 0.016);
    state.last = now;
    const k = 1 - Math.exp(-dt * 7);
    const dp = state.target - state.current;
    state.current = Math.abs(dp) < 0.0002 ? state.target : state.current + dp * k;
    const km = 1 - Math.exp(-dt * 3.5);
    state.cmx += (state.mx - state.cmx) * km; state.cmy += (state.my - state.cmy) * km;
    applyProgress(state.current);
    renderer.render(scene, camera);
    if (opts.onFrame) opts.onFrame(state.current);
    const moving = Math.abs(state.target - state.current) > 0.0002 || Math.abs(state.mx - state.cmx) > 0.002 || Math.abs(state.my - state.cmy) > 0.002;
    if (moving && !opts.still) state.raf = requestAnimationFrame(frame);
  }
  function invalidate() { if (!state.raf) state.raf = requestAnimationFrame(frame); }

  return {
    setTarget(p) { state.target = clamp(p, 0, 1); invalidate(); },
    jump(p) { state.target = state.current = clamp(p, 0, 1); invalidate(); },
    pointer(x, y) { state.mx = x; state.my = y; invalidate(); },
    setVisible(v) { state.visible = v; if (v) invalidate(); },
    resize,
    get progress() { return state.current; },
  };
}

/* ------------------------------------------------------------ DOM wiring */
function initHero() {
  const canvas = root.querySelector('.hero__canvas');
  const track = root.querySelector('.hero__track');
  const stage = root.querySelector('.hero__stage');
  const stageEl = stage;
  const copy = root.querySelector('.hero__copy');
  const hint = root.querySelector('.hero__scroll');
  const chapters = root.querySelector('.hero__chapters');
  const chapterItems = [...root.querySelectorAll('[data-chapter]')];
  const bar = root.querySelector('.hero__bar i');
  const end = root.querySelector('.hero__end');

  const showStill = () => { root.classList.add('hero--still'); };
  let hero;
  try {
    hero = createHero(canvas, { still: reducedMotion, small: window.innerWidth < 700, onFrame: reducedMotion ? null : onProgress });
  } catch (err) {
    console.warn('Hero 3D unavailable, showing the still composition.', err);
    showStill();
    return;
  }

  let lastChapter = -1;
  function onProgress(p) {
    const pe = clamp(p / 0.97, 0, 1);
    if (copy) {
      const f = smooth(range(p, 0.025, 0.12));
      copy.style.opacity = String(1 - f);
      copy.style.transform = `translate3d(0, ${(-f * 48).toFixed(1)}px, 0)`;
      copy.inert = f > 0.5;
    }
    stageEl.style.setProperty('--vig', String(1 - smooth(range(p, 0.02, 0.16))));
    if (hint) hint.style.opacity = String(1 - smooth(range(p, 0.005, 0.04)));
    if (chapters) {
      const f = smooth(range(p, 0.1, 0.18)) * (1 - smooth(range(p, 0.86, 0.92)));
      chapters.style.opacity = String(f);
      if (bar) bar.parentElement.style.opacity = String(f);
    }
    if (end) {
      const f = smooth(range(p, 0.88, 0.97));
      end.style.opacity = String(f);
      end.style.transform = `translate3d(0, ${((1 - f) * 36).toFixed(1)}px, 0)`;
      end.inert = f < 0.5;
    }
    if (bar) bar.style.transform = `scaleY(${pe.toFixed(3)})`;
    const ch = pe < 0.25 ? 0 : pe < 0.59 ? 1 : pe < 0.87 ? 2 : 3;
    if (ch !== lastChapter) {
      lastChapter = ch;
      chapterItems.forEach((li, i) => { li.classList.toggle('is-active', i === ch); li.classList.toggle('is-done', i < ch); });
    }
  }

  const ro = new ResizeObserver(() => hero.resize());
  ro.observe(stage);
  hero.resize();
  root.classList.add('hero--ready');

  if (reducedMotion) {
    root.classList.add('hero--static');
    hero.jump(1);
    return;
  }

  const io = new IntersectionObserver((es) => es.forEach((e) => hero.setVisible(e.isIntersecting)), { rootMargin: '10% 0px' });
  io.observe(track);

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    hero.pointer((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
  }, { passive: true });

  const drive = () => {
    const r = track.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    hero.setTarget(total > 0 ? clamp(-r.top / total, 0, 1) : 0);
  };
  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.ScrollTrigger.create({ trigger: track, start: 'top top', end: 'bottom bottom', onUpdate: (self) => hero.setTarget(self.progress), onRefresh: (self) => hero.setTarget(self.progress) });
  } else {
    window.addEventListener('scroll', drive, { passive: true });
    drive();
  }
  window.__hero = hero;
}

if (root) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHero, { once: true });
  else initHero();
}

export { grainCanvas, rotated, floorCanvas, rng };
