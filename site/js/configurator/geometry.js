// Parametric furniture geometry. buildModule() turns a design module (cm) into a THREE.Group (metres).
// Local origin: left end, bottom, back (wall side) of the module. +x right, +y up, +z out of the wall.
// Doors and drawers are child groups with userData.door / userData.drawer so the scene can animate them.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MODULE_TYPES } from './model.js';
import { layoutOf } from './pricing.js';
export { createMaterialLib } from './materials.js';

const T = 0.018;      // body board
const F = 0.019;      // front board
const BACK = 0.008;   // back panel
const GAP = 0.003;
const DECOR = ['#d8d0c0', '#8d96a1', '#4a525c', '#c4a98a', '#7a8b78', '#bfb8ae', '#a8694f', '#e6dccb'];

function rngFor(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; };
}

// Face order of BoxGeometry: +x, -x, +y, -y, +z, -z. Each face's two axes (u, v).
const FACE_AXES = [['z', 'y'], ['z', 'y'], ['x', 'z'], ['x', 'z'], ['x', 'y'], ['x', 'y']];

function mapUV(geo, size, grain, tile, offU, offV) {
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    let [a, b] = FACE_AXES[f];
    const swap = b === grain && a !== grain;
    if (swap) [a, b] = [b, a];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u0 = uv.getX(i), v0 = uv.getY(i);
      // u0 runs along the face's first axis, v0 along its second; swapped when grain must follow v.
      const ua = swap ? v0 : u0, vb = swap ? u0 : v0;
      uv.setXY(i, ua * size[a] / tile + offU, vb * size[b] / tile + offV);
    }
  }
  uv.needsUpdate = true;
}

export function buildModule(module, THREE, lib) {
  const m = module;
  const g = new THREE.Group();
  g.name = m.id;
  g.userData.moduleId = m.id;
  const rnd = rngFor(m.id + m.type);
  const ctx = { THREE, lib, g, m, rnd, doors: [], leds: { mats: [], lights: [] } };
  const type = MODULE_TYPES[m.type] ? m.type : 'wardrobe';
  if (type === 'table') buildTable(ctx);
  else if (type === 'desk') buildDesk(ctx);
  else buildCabinet(ctx);
  g.userData.leds = ctx.leds;
  const free = MODULE_TYPES[type].freestanding;
  g.position.set(m.x / 100, (m.elevation || 0) / 100, free ? (m.z || 0) / 100 : 0);
  return g;
}

// ---------- primitives ----------
const V = (THREE, a) => new THREE.Vector3(a[0], a[1], a[2]);

function box(ctx, parent, o) {
  const { THREE, lib, rnd } = ctx;
  const mat = o.material || lib.get(o.id);
  const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
  if (!o.material && lib.textured(o.id)) {
    mapUV(geo, { x: o.w, y: o.h, z: o.d }, o.grain || 'x', lib.tileSize, rnd(), rnd());
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(o.x0 + o.w / 2, o.y0 + o.h / 2, o.z0 + o.d / 2);
  mesh.userData.part = o.part || 'panel';
  mesh.userData.explode = V(THREE, o.ex || [0, 0, 0]);
  mesh.userData.base = mesh.position.clone();
  if (o.cast !== false) { mesh.castShadow = true; mesh.receiveShadow = true; }
  else mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addMesh(ctx, parent, geo, mat, part, pos, ex, rot) {
  const { THREE } = ctx;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.userData.part = part;
  mesh.userData.explode = V(THREE, ex);
  mesh.userData.base = mesh.position.clone();
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Handles. orient 'v' (vertical, on doors) or 'h' (horizontal, on drawers). Origin: front face centre of the panel.
function handle(ctx, parent, kind, orient, len, x, y, ex) {
  const { THREE, lib } = ctx;
  const mat = lib.handle();
  const vert = orient === 'v';
  if (kind === 'bar') {
    const sx = vert ? 0.012 : len, sy = vert ? len : 0.012;
    addMesh(ctx, parent, new THREE.BoxGeometry(sx, sy, 0.012), mat, 'handle', [x, y, 0.026], ex);
    const off = len / 2 - 0.03;
    [-1, 1].forEach((s) => {
      addMesh(ctx, parent, new THREE.BoxGeometry(0.008, 0.008, 0.024), mat, 'handle',
        [x + (vert ? 0 : s * off), y + (vert ? s * off : 0), 0.012], ex);
    });
  } else if (kind === 'knob') {
    addMesh(ctx, parent, new THREE.SphereGeometry(0.016, 18, 12), mat, 'handle', [x, y, 0.028], ex);
    addMesh(ctx, parent, new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 10), mat, 'handle', [x, y, 0.01], ex, [Math.PI / 2, 0, 0]);
  } else if (kind === 'push') {
    addMesh(ctx, parent, new THREE.CylinderGeometry(0.012, 0.012, 0.0025, 20), mat, 'handle', [x, y, 0.0012], ex, [Math.PI / 2, 0, 0]);
  } else {
    // groove: a dark finger slot
    const L = Math.min(len * 2.4, 0.7);
    const sx = vert ? 0.011 : Math.min(L, 0.5), sy = vert ? L : 0.011;
    addMesh(ctx, parent, new THREE.BoxGeometry(sx, sy, 0.002), mat, 'handle', [x, y, 0.001], ex);
  }
}

function led(ctx, parent, x0, y0, z0, w, lightPos, lightW, lightH) {
  const { THREE, lib } = ctx;
  const mat = lib.led();
  const mesh = box(ctx, parent, { material: mat, part: 'led', x0, y0, z0, w, h: 0.007, d: 0.014, cast: false });
  mesh.castShadow = false;
  ctx.leds.mats.push(mat);
  if (lightPos && ctx.leds.lights.length < 2) {
    const light = new THREE.RectAreaLight(0xffd7a0, 0, lightW, lightH);
    light.position.set(lightPos[0], lightPos[1], lightPos[2]);
    light.rotation.x = -Math.PI / 2; // face down
    light.userData.led = true;
    parent.add(light);
    ctx.leds.lights.push(light);
  }
}

// ---------- drawers ----------
function drawer(ctx, o) {
  const { THREE, g, m } = ctx;
  const grp = new THREE.Group();
  grp.name = 'drawer';
  const travel = Math.min(0.34, Math.max(0.12, o.cD * 0.55));
  grp.userData.drawer = { open: 0, travel };
  const ex = [0, 0, 0.5];
  box(ctx, grp, { id: m.front, part: 'drawer-front', x0: o.x0, y0: o.y0, z0: o.zf, w: o.w, h: o.h, d: F, grain: 'x', ex });
  // box behind the front
  const bw = o.bayW - 0.026, bx = o.bayX + 0.013;
  const dd = Math.max(0.2, o.cD - 0.06), bz = o.zf - dd;
  const bh = o.h * 0.7, by = o.y0 + 0.02;
  const ex2 = [0, 0, 0.3];
  box(ctx, grp, { id: m.body, part: 'drawer-box', x0: bx, y0: by, z0: bz, w: bw, h: 0.008, d: dd, ex: ex2 });
  box(ctx, grp, { id: m.body, part: 'drawer-box', x0: bx, y0: by, z0: bz, w: 0.012, h: bh, d: dd, grain: 'z', ex: ex2 });
  box(ctx, grp, { id: m.body, part: 'drawer-box', x0: bx + bw - 0.012, y0: by, z0: bz, w: 0.012, h: bh, d: dd, grain: 'z', ex: ex2 });
  box(ctx, grp, { id: m.body, part: 'drawer-box', x0: bx, y0: by, z0: bz, w: bw, h: bh, d: 0.012, ex: ex2 });
  const hg = new THREE.Group();
  hg.position.z = o.zf + F;
  grp.add(hg);
  handle(ctx, hg, m.handle, 'h', Math.min(0.3, o.w * 0.5), o.x0 + o.w / 2, o.y0 + o.h * 0.55, ex);
  g.add(grp);
  return grp;
}

// ---------- doors ----------
function hingedDoor(ctx, o) {
  const { THREE, g, m } = ctx;
  const grp = new THREE.Group();
  grp.name = 'door';
  const left = o.hinge === 'left';
  grp.position.set(o.hx, 0, o.zf + F);
  grp.userData.door = { hinge: o.hinge, open: 0, angle: 1.85 };
  const x0 = left ? 0 : -o.dw;
  const ex = [0, 0, 0.55];
  const h = o.y1 - o.y0;
  if (m.doors === 'glass') {
    const st = 0.045;
    const mk = (xa, ya, w, hh, grain) => box(ctx, grp, { id: m.front, part: 'door', x0: xa, y0: ya, z0: -F, w, h: hh, d: F, grain, ex });
    mk(x0, o.y0, st, h, 'y'); mk(x0 + o.dw - st, o.y0, st, h, 'y');
    mk(x0 + st, o.y0, o.dw - 2 * st, st, 'x'); mk(x0 + st, o.y1 - st, o.dw - 2 * st, st, 'x');
    box(ctx, grp, { material: ctx.lib.glass(), part: 'glass', x0: x0 + st, y0: o.y0 + st, z0: -F * 0.5 - 0.0025, w: o.dw - 2 * st, h: h - 2 * st, d: 0.005, cast: false, ex });
  } else {
    box(ctx, grp, { id: m.front, part: 'door', x0, y0: o.y0, z0: -F, w: o.dw, h, d: F, grain: 'y', ex });
  }
  const lh = Math.min(0.24, h * 0.4);
  let yc;
  if (m.type === 'kitchen-wall') yc = o.y0 + 0.04 + lh / 2;
  else if (m.type === 'kitchen-base' || m.type === 'island') yc = o.y1 - 0.04 - lh / 2;
  else yc = Math.min(o.y1 - 0.1 - lh / 2, Math.max(o.y0 + lh / 2 + 0.05, 1.0));
  const hx = left ? o.dw - 0.035 : -o.dw + 0.035;
  handle(ctx, grp, m.handle, 'v', lh, hx, yc, ex);
  g.add(grp);
  ctx.doors.push(grp);
  return grp;
}

function slidingDoors(ctx, o) {
  const { THREE, g, m } = ctx;
  const n = Math.max(2, Math.ceil(m.width / 100));
  const ov = 0.03;
  const pw = (o.W + (n - 1) * ov) / n;
  const h = o.y1 - o.y0;
  const rail = ctx.lib.plain('#a6a6a0', 0.35, 0.85);
  for (let i = 0; i < n; i++) {
    const grp = new THREE.Group();
    grp.name = 'door';
    const x0 = i * (pw - ov);
    grp.position.set(x0, 0, 0);
    const front = i % 2 === 0;
    grp.userData.door = { hinge: 'slide', open: 0, slide: i === 0 ? 0 : -(pw - ov), baseX: x0 };
    const z0 = front ? o.D - F : o.D - 2 * F - 0.006;
    const ex = [0, 0, front ? 0.6 : 0.35];
    box(ctx, grp, { id: m.front, part: 'door', x0: 0, y0: o.y0, z0, w: pw, h, d: F, grain: 'y', ex });
    const hg = new THREE.Group();
    hg.position.z = z0 + F;
    grp.add(hg);
    handle(ctx, hg, m.handle === 'push' ? 'push' : m.handle, 'v', Math.min(0.24, h * 0.4), i % 2 ? 0.04 : pw - 0.04, Math.min(o.y1 - 0.15, Math.max(o.y0 + 0.2, 1.0)), ex);
    g.add(grp);
    ctx.doors.push(grp);
  }
  const zt = o.D - 2 * F - 0.01;
  box(ctx, g, { material: rail, part: 'rail', x0: 0, y0: o.y1 - 0.004, z0: zt, w: o.W, h: 0.014, d: 2 * F + 0.01, ex: [0, 0.3, 0.3] });
  box(ctx, g, { material: rail, part: 'rail', x0: 0, y0: o.y0 - 0.012, z0: zt, w: o.W, h: 0.012, d: 2 * F + 0.01, ex: [0, -0.2, 0.3] });
}

// ---------- cabinet (wardrobe, kitchen, tall, island, shelving, bench, window-seat) ----------
function buildCabinet(ctx) {
  const { THREE, lib, g, m, rnd } = ctx;
  const type = m.type;
  const L = layoutOf(m);
  const W = m.width / 100, H = m.height / 100, D = m.depth / 100;
  const ph = m.elevation === 0 ? L.ph / 100 : 0;
  const hasWt = type === 'kitchen-base' || type === 'island' || type === 'bench';
  const wtT = 0.04;
  const seat = type === 'window-seat';
  const cushionH = seat ? 0.08 : 0;
  const carcTop = H - (hasWt ? wtT : 0) - cushionH;
  const Df = hasWt ? D - 0.02 : D; // front plane (worktop overhangs by 2 cm)
  const mode = m.doors;
  const anyDrawers = L.bays.some((b) => b.drawers > 0);
  const sliding = mode === 'sliding';
  const hingeLike = mode === 'hinged' || mode === 'glass';
  const fronts = sliding || hingeLike || anyDrawers;
  const cD = sliding ? Df - 2 * F - 0.01 : fronts ? Df - F - 0.002 : Df;
  const zf = Df - F; // front panel back face
  const island = type === 'island';
  const zS = island ? F : BACK;
  const drawersTop = type === 'kitchen-base' || type === 'island';

  // carcass
  const sideEx = (s) => [s * 0.32, 0, 0];
  box(ctx, g, { id: m.body, part: 'side', x0: 0, y0: ph, z0: 0, w: T, h: carcTop - ph, d: cD, grain: 'y', ex: sideEx(-1) });
  box(ctx, g, { id: m.body, part: 'side', x0: W - T, y0: ph, z0: 0, w: T, h: carcTop - ph, d: cD, grain: 'y', ex: sideEx(1) });
  box(ctx, g, { id: m.body, part: 'bottom', x0: T, y0: ph, z0: 0, w: W - 2 * T, h: T, d: cD, grain: 'x', ex: [0, -0.22, 0] });
  box(ctx, g, { id: m.body, part: 'top', x0: T, y0: carcTop - T, z0: 0, w: W - 2 * T, h: T, d: cD, grain: 'x', ex: [0, 0.26, 0] });
  const yb0 = ph + T, yb1 = carcTop - T;
  if (island) box(ctx, g, { id: m.front, part: 'back', x0: T, y0: yb0, z0: 0, w: W - 2 * T, h: yb1 - yb0, d: F, grain: 'y', ex: [0, 0, -0.2] });
  else box(ctx, g, { id: m.body, part: 'back', x0: T, y0: yb0, z0: 0, w: W - 2 * T, h: yb1 - yb0, d: BACK, grain: 'y', ex: [0, 0, -0.2] });

  const n = L.n;
  const bw = (W - 2 * T - (n - 1) * T) / n;
  const bx = (k) => T + k * (bw + T);
  const edge = (k) => (k === 0 ? 0 : k === n ? W : bx(k) - T / 2);
  for (let k = 1; k < n; k++) {
    box(ctx, g, { id: m.body, part: 'divider', x0: bx(k) - T, y0: yb0, z0: zS, w: T, h: yb1 - yb0, d: cD - zS, grain: 'y', ex: [0, 0, 0.12] });
  }

  const yF0 = ph + 0.0015, yF1 = carcTop - 0.0015;
  const dh = L.dH / 100;
  const maxStack = Math.max(0, ...L.bays.map((b) => b.drawers * dh + Math.max(0, b.drawers - 1) * GAP));
  const doorBays = [];

  for (let k = 0; k < n; k++) {
    const bay = L.bays[k];
    const nD = bay.drawers;
    const stack = nD ? nD * dh + (nD - 1) * GAP : 0;
    const fx0 = edge(k) + 0.0015, fx1 = edge(k + 1) - 0.0015;
    let dz0 = yF0, dz1 = yF1;
    for (let j = 0; j < nD; j++) {
      const y0 = drawersTop ? yF1 - (j + 1) * dh - j * GAP : yF0 + j * (dh + GAP);
      drawer(ctx, { x0: fx0, w: fx1 - fx0, y0, h: dh, zf, cD, bayX: bx(k), bayW: bw });
    }
    if (nD) {
      if (drawersTop) dz1 = yF1 - stack - GAP; else dz0 = yF0 + stack + GAP;
    }
    // interior zone
    let ia = yb0, ib = yb1;
    if (nD) { if (drawersTop) ib = Math.min(yb1, dz1); else ia = Math.max(yb0, dz0); }
    interior(ctx, { bay, k, x0: bx(k), bw, ia, ib, cD, zS, D: Df });
    doorBays.push({ k, dz0, dz1, fx0, fx1 });
  }

  // fronts
  if (hingeLike) {
    doorBays.forEach(({ k, dz0, dz1, fx0, fx1 }) => {
      if (dz1 - dz0 < 0.08) return;
      const per = (W / n) * 100 <= 65 ? 1 : 2;
      const full = fx1 - fx0;
      if (per === 1) {
        const hinge = n === 1 ? 'left' : (k < n / 2 ? 'left' : 'right');
        hingedDoor(ctx, { hinge, hx: hinge === 'left' ? fx0 : fx1, dw: full, y0: dz0, y1: dz1, zf });
      } else {
        const dw = (full - GAP) / 2;
        hingedDoor(ctx, { hinge: 'left', hx: fx0, dw, y0: dz0, y1: dz1, zf });
        hingedDoor(ctx, { hinge: 'right', hx: fx1, dw, y0: dz0, y1: dz1, zf });
      }
    });
  } else if (sliding) {
    const dz0 = maxStack ? yF0 + maxStack + GAP : yF0;
    slidingDoors(ctx, { W, D: Df, y0: dz0 + 0.0, y1: yF1, });
  }

  // plinth (kick board, set back)
  if (ph > 0) box(ctx, g, { id: m.body, part: 'plinth', x0: 0.002, y0: 0, z0: Math.max(0, cD - 0.06), w: W - 0.004, h: ph, d: T, grain: 'x', ex: [0, -0.34, 0] });

  // top
  if (hasWt) {
    box(ctx, g, { id: m.worktop || m.front, part: 'worktop', x0: 0, y0: carcTop, z0: 0, w: W, h: wtT, d: D, grain: 'x', ex: [0, 0.48, 0] });
  }
  if (seat) {
    const geo = new RoundedBoxGeometry(W - 0.006, cushionH, D - 0.03, 4, 0.03);
    const mesh = addMesh(ctx, g, geo, lib.plain('#d6cdbd', 0.95), 'cushion', [W / 2, carcTop + cushionH / 2, (D - 0.03) / 2 + 0.01], [0, 0.5, 0]);
    mesh.castShadow = true;
  }

  // LED
  if (m.led) {
    if (m.elevation > 0) {
      led(ctx, g, 0.04, -0.008, Df - 0.07, W - 0.08, [W / 2, -0.012, Df - 0.06], W - 0.08, 0.05);
    } else {
      for (let k = 0; k < n; k++) led(ctx, g, bx(k) + 0.02, yb1 - 0.007, Math.max(0.05, cD - 0.06), bw - 0.04, k === 0 ? [W / 2, yb1 - 0.012, cD * 0.55] : null, W - 0.1, cD * 0.6);
    }
  }
}

function interior(ctx, o) {
  const { g, m, lib, rnd } = ctx;
  const { bay, x0, bw, ia, ib, cD, zS } = o;
  const span = ib - ia;
  if (span < 0.1) return;
  const depth = cD - zS - 0.02;
  const shelfAt = (y, ex = [0, 0, 0.22]) => box(ctx, g, { id: m.body, part: 'shelf', x0, y0: y - T / 2, z0: zS, w: bw, h: T, d: depth, grain: 'x', ex });
  const shelves = [];
  if (bay.interior === 'rail') {
    const railY = ib - 0.1;
    const rail = lib.plain('#b9b9b3', 0.3, 0.9);
    const mesh = addMesh(ctx, g, new ctx.THREE.CylinderGeometry(0.0125, 0.0125, bw, 12), rail, 'rail', [x0 + bw / 2, railY, zS + depth / 2], [0, 0.1, 0.15], [0, 0, Math.PI / 2]);
    mesh.castShadow = false;
    if (span > 0.9) shelves.push(shelfAt(ia + 0.34));
    // hanging garments
    const count = Math.min(9, Math.floor(bw / 0.065));
    const gw = Math.min(0.04, bw / (count + 1));
    for (let i = 0; i < count; i++) {
      const gh = Math.min(0.5 + rnd() * 0.45, railY - ia - 0.45);
      if (gh < 0.2) continue;
      const gx = x0 + (i + 0.5) * (bw / count);
      const gd = Math.min(0.4, depth * 0.7);
      box(ctx, g, { material: lib.plain(DECOR[Math.floor(rnd() * DECOR.length)], 0.95), part: 'clothes', x0: gx - gw / 2, y0: railY - 0.03 - gh, z0: zS + depth / 2 - gd / 2, w: gw, h: gh, d: gd, ex: [0, 0.1, 0.15] });
    }
  } else {
    const c = Math.max(1, bay.shelves);
    const sp = span / (c + 1);
    for (let j = 1; j <= c; j++) shelves.push(shelfAt(ia + j * sp));
    if (m.type === 'shelving') {
      for (let j = 0; j <= c; j++) {
        const yBase = j === 0 ? ia : ia + j * sp + T / 2;
        const yTop = j === c ? ib : ia + (j + 1) * sp - T / 2;
        const room = yTop - yBase;
        let x = x0 + 0.02 + rnd() * 0.06;
        const count = Math.floor(rnd() * 3) + 3;
        for (let i = 0; i < count && x < x0 + bw - 0.1; i++) {
          const bwid = 0.025 + rnd() * 0.025, bh = Math.min(room - 0.04, 0.17 + rnd() * 0.12);
          if (bh < 0.1) break;
          box(ctx, g, { material: lib.plain(DECOR[Math.floor(rnd() * DECOR.length)], 0.8), part: 'book', x0: x, y0: yBase, z0: zS + 0.03, w: bwid, h: bh, d: Math.min(0.22, depth - 0.06), ex: [0, 0.1, 0.25] });
          x += bwid + 0.002;
        }
      }
    }
  }
}

// ---------- desk ----------
function buildDesk(ctx) {
  const { THREE, g, m } = ctx;
  const W = m.width / 100, H = m.height / 100, D = m.depth / 100;
  const topT = 0.038;
  const yTop = H - topT;
  box(ctx, g, { id: m.worktop || m.front, part: 'worktop', x0: 0, y0: yTop, z0: 0, w: W, h: topT, d: D, grain: 'x', ex: [0, 0.45, 0] });
  const inset = 0.015, z0 = 0.03, zd = D - 0.06;
  box(ctx, g, { id: m.body, part: 'side', x0: inset, y0: 0, z0, w: T, h: yTop, d: zd, grain: 'y', ex: [-0.3, 0, 0] });
  const hasPed = m.drawers > 0 || m.doors === 'hinged';
  const pw = hasPed ? Math.min(0.45, W * 0.38) : 0;
  const rightX = W - inset - T;
  const pd = hasPed ? zd - F - 0.002 : zd; // pedestal carcass stops short of its drawer fronts
  box(ctx, g, { id: m.body, part: 'side', x0: rightX, y0: 0, z0, w: T, h: yTop, d: pd, grain: 'y', ex: [0.3, 0, 0] });
  const midX0 = inset + T, midX1 = hasPed ? W - inset - pw : rightX;
  box(ctx, g, { id: m.body, part: 'back', x0: midX0, y0: yTop - 0.34, z0: z0 + 0.04, w: midX1 - midX0, h: 0.33, d: T, grain: 'x', ex: [0, 0, -0.2] });
  if (!hasPed) return;
  const px0 = W - inset - pw;
  const cD = pd;
  box(ctx, g, { id: m.body, part: 'side', x0: px0, y0: 0, z0, w: T, h: yTop, d: pd, grain: 'y', ex: [0, 0, 0.05] });
  box(ctx, g, { id: m.body, part: 'bottom', x0: px0 + T, y0: 0, z0, w: pw - 2 * T, h: T, d: pd, ex: [0, -0.2, 0] });
  box(ctx, g, { id: m.body, part: 'back', x0: px0 + T, y0: T, z0, w: pw - 2 * T, h: yTop - T, d: BACK, grain: 'y', ex: [0, 0, -0.2] });
  const zf = z0 + zd - F;
  const fx0 = px0 + 0.0015, fx1 = W - inset - 0.0015 + 0.0;
  const y0 = 0.003, y1 = yTop - 0.003;
  const nd = Math.min(m.drawers, 6);
  if (nd > 0) {
    const dhh = (y1 - y0 - (nd - 1) * GAP) / nd;
    for (let j = 0; j < nd; j++) drawer(ctx, { x0: fx0, w: fx1 - fx0, y0: y0 + j * (dhh + GAP), h: dhh, zf, cD, bayX: px0 + T, bayW: pw - 2 * T });
  } else {
    hingedDoor(ctx, { hinge: 'right', hx: fx1, dw: fx1 - fx0, y0, y1, zf });
  }
  if (nd === 0 && m.doors !== 'hinged') return;
}

// ---------- table ----------
function buildTable(ctx) {
  const { g, m } = ctx;
  const W = m.width / 100, H = m.height / 100, D = m.depth / 100;
  const topT = 0.035, yTop = H - topT;
  box(ctx, g, { id: m.worktop || m.front, part: 'worktop', x0: 0, y0: yTop, z0: 0, w: W, h: topT, d: D, grain: 'x', ex: [0, 0.42, 0] });
  const s = 0.06, ins = 0.04;
  const xs = [ins, W - ins - s], zs = [ins, D - ins - s];
  xs.forEach((x, i) => zs.forEach((z, j) => {
    box(ctx, g, { id: m.front, part: 'leg', x0: x, y0: 0, z0: z, w: s, h: yTop, d: s, grain: 'y', ex: [(i ? 1 : -1) * 0.25, 0, (j ? 1 : -1) * 0.25] }); }));
  const ah = 0.09, ay = yTop - ah, at = 0.02;
  [ins + 0.02, D - ins - 0.02 - at].forEach((z, j) => {
    box(ctx, g, { id: m.front, part: 'rail', x0: ins + s, y0: ay, z0: z, w: W - 2 * (ins + s), h: ah, d: at, grain: 'x', ex: [0, 0.1, (j ? 1 : -1) * 0.2] });
  });
  [ins + 0.02, W - ins - 0.02 - at].forEach((x, i) => {
    box(ctx, g, { id: m.front, part: 'rail', x0: x, y0: ay, z0: ins + s, w: at, h: ah, d: D - 2 * (ins + s), grain: 'z', ex: [(i ? 1 : -1) * 0.2, 0.1, 0] });
  });
}
