// Planner v2 piece geometry: turns one piece (bays, items, fronts) into Three.js meshes. THREE and the material lib
// are passed in, so this file imports no Three.js and Node can load it. The model is in cm: everything here is built
// in cm inside a group scaled by 0.01, so the result is in metres. Origin: the piece's left end, bottom and back;
// +x right, +y up, +z out of the wall.
import { ITEMS, LAYOUT_T, TYPES, pieceGeometry, surfacesOf, roleSegments, legCount, SCRIBE } from './model.js';
import { surfaceInfo, railInfo, liningInfo } from './materials.js';
import { fieldGeometry, CORNICE_PROFILE } from './front-geometry.js';
import { bayLayout } from './interior-geom.js';

const T = LAYOUT_T;       // sides and dividers fill their 2 cm layout slot
const BOARD = 1.8;        // shelves and loose boards
const F = 1.9;            // front board
const shadeHex = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};
const DECOR = ['#d8d0c0', '#8d96a1', '#4a525c', '#c4a98a', '#7a8b78', '#bfb8ae', '#a8694f', '#e6dccb'];

export const FRONT_MODES = ['closed', 'ajar', 'hidden'];

export function pieceSignature(piece, fronts = 'closed') {
  return `${fronts}|${JSON.stringify(piece)}`;
}

function rngFor(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; };
}

// Face order of BoxGeometry: +x, -x, +y, -y, +z, -z. Each face's two axes (u, v). Sizes are in metres here so the
// wood grain keeps the same scale as in the room and in the old configurator.
const FACE_AXES = [['z', 'y'], ['z', 'y'], ['x', 'z'], ['x', 'z'], ['x', 'y'], ['x', 'y']];
// Veneer scale: 1.6 m of texture along the grain, 0.6 m across, so grain is never stretched whatever the board's shape.
const TILE_ALONG = 1.6, TILE_ACROSS = 0.6;
function mapUV(geo, size, grain, offU, offV) {
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    let [a, b] = FACE_AXES[f];
    const swap = b === grain && a !== grain;
    if (swap) [a, b] = [b, a];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u0 = uv.getX(i), v0 = uv.getY(i);
      const ua = swap ? v0 : u0, vb = swap ? u0 : v0;
      uv.setXY(i, (ua * size[a]) / TILE_ALONG + offU, (vb * size[b]) / TILE_ACROSS + offV);
    }
  }
  uv.needsUpdate = true;
}

export function buildPiece(piece, THREE, lib, opts = {}) {
  const mode = FRONT_MODES.includes(opts.fronts) ? opts.fronts : 'closed';
  const root = new THREE.Group();
  root.name = piece.id;
  const g = new THREE.Group();
  g.scale.setScalar(0.01);
  root.add(g);
  const rnd = rngFor(`${piece.id}${piece.type}`);
  const W = piece.width, H = piece.height, D = piece.depth;
  root.userData = { pieceId: piece.id, width: W / 100, height: H / 100, depth: D / 100 };

  // ----- primitives -----
  const look = piece.look || {};
  const fr = piece.fronts;
  const S = surfacesOf(piece);
  const GAP = (look.gap || 3) / 20;                 // half the gap between two fronts, cm
  const surf = (spec) => (lib.surface ? lib.surface(spec) : lib.veneer(spec.material));
  const grained = (spec) => (lib.surfaceTextured ? lib.surfaceTextured(spec) : lib.textured(spec.material));
  const shadow = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
  // box from its low corner. `spec` is a surface { material, finish } (grain follows `grain`), `material` a ready material,
  // `materials` six ready materials (+x, -x, +y, -y, +z, -z)
  const box = (parent, x0, y0, z0, w, h, d, o = {}) => {
    const geo = new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d));
    const spec = o.spec || S.carcass;
    const m = o.materials || o.material || surf(spec);
    if (!o.material && (o.materials || grained(spec))) {
      mapUV(geo, { x: w / 100, y: h / 100, z: d / 100 }, o.grain || 'x', rnd(), rnd());
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    mesh.userData.part = o.part || 'panel';
    parent.add(shadow(mesh, o.cast !== false));
    return mesh;
  };
  const cyl = (parent, x, y, z, r, len, axis, material, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), material);
    m.position.set(x, y, z);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    else if (axis === 'z') m.rotation.x = Math.PI / 2;
    parent.add(shadow(m, false));
    return m;
  };
  const steel = lib.plain('#b9b9b3', 0.3, 0.9);
  const dark = lib.plain('#3a3d40', 0.6, 0.1);
  const handleMat = lib.handleOf ? lib.handleOf(fr.handleFinish) : lib.handle();
  const glassMat = lib.glassOf ? lib.glassOf(look.glass) : lib.glass();

  const topSpec = piece.worktop ? { material: piece.worktop, finish: 'matte' } : S.front;
  // ----- table: a top, four legs and aprons -----
  if (piece.type === 'table') {
    const topT = 3.8, yTop = H - topT;
    box(g, 0, yTop, 0, W, topT, D, { spec: topSpec, part: 'worktop' });
    const s = 6, ins = 4;
    for (const x of [ins, W - ins - s]) for (const z of [ins, D - ins - s]) box(g, x, 0, z, s, yTop, s, { spec: S.front, grain: 'y', part: 'leg' });
    const ah = 9, ay = yTop - ah;
    for (const z of [ins + 2, D - ins - 4]) box(g, ins + s, ay, z, W - 2 * (ins + s), ah, 2, { spec: S.front, part: 'rail' });
    for (const x of [ins + 2, W - ins - 4]) box(g, x, ay, ins + s, 2, ah, D - 2 * (ins + s), { spec: S.front, grain: 'z', part: 'rail' });
    return root;
  }

  // ----- carcass -----
  const geo = pieceGeometry(piece);
  const ph = geo.plinth, top = ph + geo.Hc, innerH = geo.innerH;
  const kind = fr.kind;
  const sliding = kind === 'sliding';
  const hinged = kind === 'hinged' || kind === 'glass';
  const cD = sliding ? D - 2 * F - 1 : hinged ? D - F - 0.2 : D;   // carcass depth: fronts sit in front of it
  const zFront = cD + 0.2;
  const yf = ph + T;                                                // floor of every bay
  const outerSide = look.gables ? S.front : S.carcass;
  const same = (a, b2) => a.material === b2.material && a.finish === b2.finish;
  // A bay may have its own colour and its own back (closed, open to the wall, or a mirror).
  const baySpec = (bi) => (piece.bays[bi] && piece.bays[bi].colour ? { material: piece.bays[bi].colour, finish: 'matte' } : S.interior);
  const lastBay = piece.bays.length - 1;
  const bayOptions = piece.bays.some((b2) => b2.colour || (b2.back && b2.back !== 'closed'));
  const allSame = piece.bays.every((b2, bi) => same(baySpec(bi), baySpec(0)));
  const roofSpec = allSame ? baySpec(0) : S.interior;   // the top and bottom board show one inside colour
  // Sides, top, bottom and back: the inside faces take the inside material, the outer faces the carcass (or, with end panels, the front).
  const sidesM = (innerFace, inSpec) => {
    if (same(inSpec, S.carcass) && !look.gables) return {};
    const c = surf(S.carcass), i = surf(inSpec), o = surf(outerSide);
    const arr = [c, c, c, c, c, c];
    arr[innerFace] = i; arr[innerFace === 0 ? 1 : 0] = o;
    return { materials: arr };
  };
  const faceM = (face) => {
    if (same(roofSpec, S.carcass)) return {};
    const c = surf(S.carcass), arr = [c, c, c, c, c, c];
    arr[face] = surf(roofSpec);
    return { materials: arr };
  };
  box(g, 0, ph, 0, T, geo.Hc, cD, { ...sidesM(0, baySpec(0)), grain: 'y', part: 'side' });
  box(g, W - T, ph, 0, T, geo.Hc, cD, { ...sidesM(1, baySpec(lastBay)), grain: 'y', part: 'side' });
  box(g, T, ph, 0, W - 2 * T, T, cD, { ...faceM(2), part: 'bottom' });
  box(g, T, top - T, 0, W - 2 * T, T, cD, { ...faceM(3), part: 'top' });
  const layout = bayLayout(piece);
  const mirrorMat = lib.plain('#cfdadf', 0.04, 0.9);
  if (!bayOptions) {
    box(g, T, yf, 0, W - 2 * T, innerH, 0.8, { spec: S.interior, grain: 'y', part: 'back' });
    layout.slice(0, -1).forEach((b) => box(g, b.x1, yf, 0.8, T, innerH, cD - 0.8, { spec: S.interior, grain: 'y', part: 'divider' }));
  } else {
    layout.forEach((b, bi) => {
      const back = piece.bays[bi].back || 'closed';
      const xb = bi === lastBay ? W - T : b.x1 + T;
      if (back === 'closed') box(g, b.x0, yf, 0, xb - b.x0, innerH, 0.8, { spec: baySpec(bi), grain: 'y', part: 'back' });
      else if (back === 'mirror') box(g, b.x0, yf, 0, xb - b.x0, innerH, 0.8, { material: mirrorMat, part: 'mirror-back', cast: false });
      // open: nothing behind the bay, the wall shows
      if (bi < lastBay) {
        const left = surf(baySpec(bi)), right = surf(baySpec(bi + 1)), edge = surf(S.interior);
        box(g, b.x1, yf, 0.8, T, innerH, cD - 0.8, { materials: [right, left, edge, edge, edge, edge], grain: 'y', part: 'divider' });
      }
    });
  }
  if (geo.slab > 0) {
    const wt = piece.worktop && piece.type !== 'window-seat';
    box(g, 0, top, 0, W, geo.slab, D + (wt ? 1.5 : 0), { spec: wt ? topSpec : piece.type === 'window-seat' ? S.carcass : topSpec, part: 'worktop' });
  }

  // ----- base: recessed or flush plinth, or legs -----
  const base = look.base || 'recessed';
  if (ph > 0 && base === 'legs') {
    const metal = look.legs && look.legs !== 'wood';
    const wood = surf(surfaceInfo(S.front).grain ? S.front : { material: 'oak' });
    const lm = metal && lib.handleOf ? lib.handleOf(look.legs) : steel;
    const count = legCount(W), cols = count / 2, inset = 6;
    for (let r = 0; r < 2; r++) {
      const zc = r === 0 ? 6 : Math.max(10, cD - 6);
      for (let c = 0; c < cols; c++) {
        const xc = inset + (c * (W - 2 * inset)) / (cols - 1);
        const leg = metal
          ? new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, ph, 14), lm)
          : new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.3, ph, 16), wood);
        leg.position.set(xc, ph / 2, zc);
        leg.userData.part = 'leg';
        g.add(shadow(leg));
        box(g, xc - 2.6, ph - 0.4, zc - 2.6, 5.2, 0.4, 5.2, { material: dark, part: 'leg', cast: false });
      }
    }
  } else if (ph > 0 && base === 'flush') {
    box(g, 0.15, 0, D - BOARD, W - 0.3, ph, BOARD, { spec: S.carcass, part: 'plinth' });
  } else if (ph > 0) {
    box(g, 1, 0, Math.max(0, cD - 8), W - 2, ph, BOARD, { spec: S.carcass, part: 'plinth' });
  }

  // ----- top treatment and scribe strips -----
  if (geo.cap > 0 && look.top === 'overhang') {
    box(g, 0, top, 0, W, geo.cap, D + 2, { spec: S.front, part: 'top-cap' });
  } else if (geo.cap > 0 && look.top === 'cornice') {
    const shape = new THREE.Shape();
    CORNICE_PROFILE.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
    shape.closePath();
    const cg = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, steps: 1 });
    cg.rotateY(-Math.PI / 2);
    cg.translate(W, top, D - 1.9);
    const uv = cg.attributes.uv, ps = cg.attributes.position;
    for (let i = 0; i < ps.count; i++) uv.setXY(i, ps.getX(i) / 160, (ps.getY(i) + ps.getZ(i)) / 60);
    const cm = new THREE.Mesh(cg, surf(S.front));
    cm.userData.part = 'cornice';
    g.add(shadow(cm));
  }
  const scribing = !!look.scribe && piece.type !== 'desk';
  if (scribing) {
    box(g, 0, top - SCRIBE.top, zFront, W, SCRIBE.top, F, { spec: S.front, grain: 'x', part: 'scribe' });
    for (const x of [0, W - SCRIBE.side]) box(g, x, ph, zFront, SCRIBE.side, geo.Hc, F, { spec: S.front, grain: 'y', part: 'scribe' });
  }
  const scribeTop = scribing ? SCRIBE.top : 0, scribeSide = scribing ? SCRIBE.side : 0;

  // ----- fronts: one routine for every door and drawer front -----
  const frontSpec = (role) => (role === 'upper' && S.upper ? S.upper : S.front);
  const grainDir = fr.grainVertical ? 'y' : 'x';
  // `design` is slab, shaker, ribbed or glass; a panel is built with its low left back corner at (x0, y0, 0) in `parent`
  function frontPanel(parent, x0, y0, w, h, role, design, part, specOverride) {
    const spec = specOverride || frontSpec(role);
    const faceMat = surf(spec);
    const edgeMat = surfaceInfo(spec).edgeGrain && lib.plyEdge ? lib.plyEdge(spec) : faceMat;
    const d = design === 'shaker' && Math.min(w, h) < 14 ? 'slab' : design === 'ribbed' && w < 8 ? 'slab' : design;
    if (d === 'glass' && h > 12 && w > 16) {
      const st = Math.min(4.5, 0.2 * Math.min(w, h));
      const mk = (xa, ya0, ww, hh, grain) => box(parent, x0 + xa, y0 + ya0, 0, ww, hh, F, { spec, grain, part });
      mk(0, 0, st, h, 'y'); mk(w - st, 0, st, h, 'y'); mk(st, 0, w - 2 * st, st, 'x'); mk(st, h - st, w - 2 * st, st, 'x');
      box(parent, x0 + st, y0 + st, F / 2 - 0.25, w - 2 * st, h - 2 * st, 0.5, { material: glassMat, part: 'glass', cast: false });
      return;
    }
    const dd = d === 'glass' ? 'slab' : d;
    if (dd === 'slab' && (!look.edge || look.edge === 'square')) {
      const m = box(parent, x0, y0, 0, w, h, F, { spec, grain: grainDir, part });
      if (edgeMat !== faceMat && Array.isArray(m.material) === false) {
        // plywood with its layers showing on the edges: +x, -x, +y, -y are edges
        m.material = [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, faceMat];
      }
      return;
    }
    const geoF = fieldGeometry(THREE, { w, h, t: F, design: dd, edge: look.edge, grain: grainDir, offU: rnd(), offV: rnd() });
    const mesh = new THREE.Mesh(geoF, [faceMat, edgeMat]);
    mesh.position.set(x0, y0, 0);
    mesh.userData.part = part;
    parent.add(shadow(mesh));
  }
  const designFor = (isDoor) => (kind === 'glass' && isDoor ? 'glass' : look.design === 'glass' ? 'slab' : look.design || 'slab');

  // ----- handles (origin: the front face of the panel; z grows outwards) -----
  const SIZE = { short: 0.6, medium: 1, long: 1.6 }[fr.handleSize] || 1;
  // `f` describes the front the handle belongs to: { what: 'door' | 'drawer' | 'slide', x, lo, hi, w, side }
  const handle = (parent, f) => {
    const h = fr.handle;
    if (h === 'push') return;
    const z = f.z;
    const door = f.what !== 'drawer';
    const height = f.hi - f.lo;
    if (door) {
      // length of a bar and where it sits
      let len = Math.min(24, height * 0.4) * SIZE;
      let y;
      const pos = fr.doorHandle || 'auto';
      if (pos === 'full') { len = Math.max(8, height - 12); y = (f.lo + f.hi) / 2; }
      else if (pos === 'top') y = f.hi - 6 - len / 2;
      else if (pos === 'bottom') y = f.lo + 6 + len / 2;
      else if (pos === 'middle') y = (f.lo + f.hi) / 2;
      else if (piece.type === 'kitchen-wall') y = f.lo + 8 + len / 2 - 4;
      else if (piece.type === 'kitchen-base' || piece.type === 'island' || piece.type === 'desk') y = f.hi - 8 - len / 2 + 4;
      else y = Math.min(f.hi - 8, Math.max(f.lo + 8, 100));
      y = Math.min(f.hi - 3, Math.max(f.lo + 3, y));
      drawHandle(parent, h, 'v', len, f.x, y, z, f);
    } else {
      const len = Math.min(30 * SIZE, f.w * 0.5);
      const y = fr.drawerHandle === 'top' ? f.hi - 3.2 : f.lo + height * 0.55;
      drawHandle(parent, h, 'h', len, f.x, y, z, f);
    }
  };
  function drawHandle(parent, h, orient, len, x, y, z, f) {
    if (h === 'bar') {
      const vert = orient === 'v';
      box(parent, x - (vert ? 0.6 : len / 2), y - (vert ? len / 2 : 0.6), z + 1.6, vert ? 1.2 : len, vert ? len : 1.2, 1.2, { material: handleMat, part: 'handle' });
      const off = Math.max(1, len / 2 - 3);
      for (const s of [-1, 1]) box(parent, x + (vert ? -0.4 : s * off - 0.4), y + (vert ? s * off - 0.4 : -0.4), z, 0.8, 0.8, 1.6, { material: handleMat, part: 'handle' });
    } else if (h === 'knob') {
      const r = 1.6 * (0.8 + 0.2 * SIZE + (SIZE > 1 ? 0.1 : 0));
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), handleMat);
      m.position.set(x, y, z + r + 0.8);
      parent.add(shadow(m));
      cyl(parent, x, y, z + 0.5, 0.45, 1.2, 'z', handleMat, 8);
    } else if (h === 'cup') {
      // a half-round scoop with its open side up, mounted on the front
      const r = 2.2 * (0.8 + 0.2 * SIZE), L = 7 + 3 * SIZE;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 18, 1, true, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: handleMat.color, roughness: handleMat.roughness, metalness: handleMat.metalness, side: THREE.DoubleSide }));
      m.rotation.z = Math.PI / 2;
      m.position.set(x, y + r * 0.5, z + r);
      parent.add(shadow(m));
      box(parent, x - L / 2, y + r * 0.5 - 0.15, z, L, 0.3, r, { material: handleMat, part: 'handle', cast: false });
    } else if (h === 'edge') {
      // routed finger pull: a dark recess along the edge
      const vert = orient === 'v';
      const L = Math.min(Math.max(len * 2.2, 12), 50);
      box(parent, x - (vert ? 0.55 : Math.min(L, 40) / 2), y - (vert ? L / 2 : 0.55), z + 0.05, vert ? 1.1 : Math.min(L, 40), vert ? L : 1.1, 0.2, { material: dark, part: 'handle', cast: false });
    }
  }

  // ----- items -----
  const fronts = []; // panels that stand in front of a bay: { bay, lo, hi } in absolute y, so doors can be cut around them
  const drawerBox = (parent, x0, w, y0, h, zFrontOf, depth, material) => {
    const dd = Math.max(15, depth), z0 = zFrontOf - dd;
    const bh = Math.max(4, h - 4);
    box(parent, x0, y0 + 1.5, z0, w, 0.8, dd, { material, part: 'drawer-box' });
    box(parent, x0, y0 + 1.5, z0, 1.2, bh, dd, { material, part: 'drawer-box' });
    box(parent, x0 + w - 1.2, y0 + 1.5, z0, 1.2, bh, dd, { material, part: 'drawer-box' });
    box(parent, x0, y0 + 1.5, z0, w, bh, 1.2, { material, part: 'drawer-box' });
  };
  // Dividers and a felt lining inside a drawer box: sock grid, cutlery compartments, jewellery tray or plain felt.
  const drawerInsert = (parent, kindOfInsert, x0, w, y0, h, zFrontOf, depth, lining) => {
    const dd = Math.max(15, depth), z0 = zFrontOf - dd + 1.4;
    const inW = w - 2.4, inD = dd - 2.6, y1 = y0 + 2.3, x1 = x0 + 1.2;
    const info = liningInfo(lining);
    const mat = lib.plain(info.color, 0.95);
    const dv = lib.plain(shadeHex(info.color, 0.82), 0.9);
    if (kindOfInsert === 'cutlery') {
      box(parent, x1, y1 - 0.2, z0, inW, 0.4, inD, { material: lib.plain('#3b3e42', 0.8), part: 'insert', cast: false });
      for (let i = 1; i < 4; i++) box(parent, x1 + (i * inW) / 4 - 0.2, y1, z0, 0.4, Math.min(3, h - 5), inD, { material: lib.plain('#2a2c2f', 0.8), part: 'insert', cast: false });
      box(parent, x1, y1, z0 + inD * 0.55, inW, Math.min(3, h - 5), 0.4, { material: lib.plain('#2a2c2f', 0.8), part: 'insert', cast: false });
      return;
    }
    box(parent, x1, y1 - 0.2, z0, inW, 0.5, inD, { material: mat, part: 'insert', cast: false });
    const cols = kindOfInsert === 'socks' ? Math.max(3, Math.round(inW / 9)) : kindOfInsert === 'jewellery' ? 3 : 0;
    const rows = kindOfInsert === 'socks' ? 3 : kindOfInsert === 'jewellery' ? 2 : 0;
    const dh = Math.min(kindOfInsert === 'socks' ? 9 : 3.5, h - 5);
    for (let i = 1; i < cols; i++) box(parent, x1 + (i * inW) / cols - 0.2, y1, z0, 0.4, dh, inD, { material: dv, part: 'insert', cast: false });
    for (let j = 1; j < rows; j++) box(parent, x1, y1, z0 + (j * inD) / rows - 0.2, inW, dh, 0.4, { material: dv, part: 'insert', cast: false });
  };
  const DRAWERS = {
    drawers: (it) => ({ count: it.count, h: it.front, outer: true }),
    'inner-drawers': (it) => ({ count: it.count, h: it.front, outer: false }),
    jewellery: () => ({ count: 1, h: 8, outer: false }),
    tray: () => ({ count: 1, h: 6, outer: false }),
    'cutlery-insert': (it) => ({ count: 1, h: it.front, outer: true }),
    'pan-drawer': (it) => ({ count: it.count, h: it.front, outer: true }),
    'keyboard-drawer': () => ({ count: 1, h: 8, outer: true }),
    hamper: () => ({ count: 1, h: 60, outer: true }),
    basket: (it) => ({ count: 1, h: it.depth, outer: false, open: true })
  };
  const pull = mode === 'ajar' ? 9 : 0;

  function item(bi, b, it) {
    const def = ITEMS[it.kind];
    if (!def) return;
    const bx = b.x0, bw = b.width, ya = yf + it.y;
    const bodyMat = surf(baySpec(bi));
    const zi0 = 0.8, zi1 = cD - 1, dz = zi1 - zi0;
    const edge0 = bi === 0 ? GAP + scribeSide : bx - T / 2 + GAP, edge1 = bi === piece.bays.length - 1 ? W - GAP - scribeSide : bx + bw + T / 2 - GAP;
    const spec = DRAWERS[it.kind] ? DRAWERS[it.kind](it) : null;
    if (spec) {
      const grp = new THREE.Group();
      grp.position.z = pull;
      g.add(grp);
      for (let i = 0; i < spec.count; i++) {
        const y0 = ya + i * spec.h;
        const outer = spec.outer && !sliding;
        const zf = outer ? zFront : cD - 3.7;
        const fx0 = outer ? edge0 : bx + 0.3, fx1 = outer ? edge1 : bx + bw - 0.3;
        if (!spec.open) {
          if (outer) {
            const fg = new THREE.Group();
            fg.position.z = zf;
            grp.add(fg);
            const role = S.upper && y0 + spec.h / 2 >= look.split ? 'upper' : 'front';
            const glassFace = it.face === 'glass', oakFace = it.face === 'wood';
            frontPanel(fg, fx0, y0 + GAP, fx1 - fx0, spec.h - 2 * GAP, role, glassFace ? 'glass' : designFor(false), 'drawer-front', oakFace ? { material: 'oak', finish: 'matte' } : undefined);
            if (def.handles(it)) handle(fg, { what: 'drawer', x: (fx0 + fx1) / 2, lo: y0 + GAP, hi: y0 + spec.h - GAP, w: fx1 - fx0, z: F });
          } else {
            box(grp, fx0, y0 + GAP, zf, fx1 - fx0, spec.h - 2 * GAP, 1.2, { spec: baySpec(bi), grain: grainDir, part: 'drawer-front' });
          }
        }
        const boxD = Math.min(dz - 4, 45), zBox = spec.open ? cD - 3 : zf;
        drawerBox(grp, bx + 0.6, bw - 1.2, y0, spec.h, zBox, boxD, it.material === 'wire' ? steel : bodyMat);
        const ins = it.kind === 'jewellery' ? 'jewellery' : it.kind === 'tray' ? (it.insert === 'felt' ? 'felt' : null) : it.kind === 'cutlery-insert' ? 'cutlery' : it.insert && it.insert !== 'none' ? it.insert : null;
        if (ins) drawerInsert(grp, ins, bx + 0.6, bw - 1.2, y0, spec.h, zBox, boxD, it.lining || 'grey');
      }
      if (spec.outer && it.kind !== 'basket') fronts.push({ bay: bi, lo: ya, hi: ya + spec.count * spec.h });
      return;
    }
    switch (it.kind) {
      case 'shelf':
      case 'book-shelf': {
        box(g, bx, ya, zi0, bw, BOARD, dz, { material: it.material === 'glass' ? lib.glass() : bodyMat, part: 'shelf', cast: it.material !== 'glass' });
        if (it.kind === 'book-shelf') {
          let x = bx + 2;
          for (let i = 0; i < 6 && x < bx + bw - 6; i++) {
            const w = 2 + rnd() * 2.5, h = 17 + rnd() * 6;
            box(g, x, ya + BOARD, zi0 + 3, w, h, Math.min(20, dz - 6), { material: lib.plain(DECOR[Math.floor(rnd() * DECOR.length)], 0.8), part: 'book' });
            x += w + 0.2;
          }
        }
        return;
      }
      case 'rail': case 'pull-down-rail': {
        const rails = [ya];
        const drop = it.kind === 'rail' && it.length !== 'short' ? 115 : it.kind === 'pull-down-rail' ? 85 : 80;
        const ri = it.kind === 'rail' ? railInfo(it.finish) : null;
        const railMat = ri ? lib.plain(ri.color, ri.roughness, ri.metalness) : steel;
        rails.forEach((ry) => {
          cyl(g, bx + bw / 2, ry + 2, zi0 + dz / 2, 1.25, bw, 'x', railMat);
          const n = Math.min(9, Math.floor(bw / 7));
          const gw = Math.min(4.5, bw / (n + 1));
          for (let i = 0; i < n; i++) {
            const gh = Math.min(drop, 40 + rnd() * (drop - 40));
            const gd = Math.min(36, dz * 0.7);
            box(g, bx + (i + 0.5) * (bw / n) - gw / 2, ry - 1 - gh, zi0 + dz / 2 - gd / 2, gw, gh, gd, { material: lib.plain(DECOR[Math.floor(rnd() * DECOR.length)], 0.95), part: 'clothes', cast: false });
          }
        });
        if (it.kind === 'pull-down-rail') for (const x of [bx + 1, bx + bw - 2]) box(g, x, ya + 2, zi0 + dz / 2 - 1, 1, 12, 2, { material: steel, part: 'rail' });
        return;
      }
      case 'shoes': case 'shoe-pullout': {
        const rows = it.rows, pitch = it.kind === 'shoes' ? 20 : 22;
        const grp = new THREE.Group();
        if (it.kind === 'shoe-pullout') { grp.position.z = pull; for (const x of [bx + 1, bx + bw - 2.2]) box(grp, x, ya, zi0 + 4, 1.2, rows * pitch - 2, dz - 8, { material: bodyMat, part: 'rack' }); }
        g.add(grp);
        for (let r = 0; r < rows; r++) {
          const s = box(grp, bx + 1.2, ya + r * pitch + 3, zi0 + 4, bw - 2.4, 1.2, dz * 0.82, { material: bodyMat, part: 'rack' });
          if (it.kind === 'shoes' && it.angled) s.rotation.x = 0.28;
          if (it.kind === 'shoes' && it.lip) box(grp, bx + 1.2, ya + r * pitch + (it.angled ? 4.2 : 4.2), zi0 + 4 + dz * 0.82 * (it.angled ? 0.96 : 1) - 1.2, bw - 2.4, 2.6, 1.2, { material: bodyMat, part: 'lip' });
          for (let k = 0; k < 2 && bw > 40; k++) box(grp, bx + 5 + k * ((bw - 20) / 1.4), ya + r * pitch + 5, zi0 + dz * 0.3, 8, 6, 22, { material: lib.plain(DECOR[Math.floor(rnd() * DECOR.length)], 0.8), part: 'shoe', cast: false });
        }
        return;
      }
      case 'trouser-rack': {
        const grp = new THREE.Group(); grp.position.z = pull; g.add(grp);
        const x1 = bx + bw - 4;
        for (const x of [bx + 2, x1]) box(grp, x, ya, zi0 + 3, 1.2, 70, dz - 8, { material: bodyMat, part: 'rack' });
        for (let i = 0; i < 9; i++) cyl(grp, (bx + x1 + 1.2) / 2, ya + 6 + i * 7, zi0 + (dz - 8) / 2 + 3, 0.5, x1 - bx - 2, 'x', steel, 6);
        return;
      }
      case 'tie-belt': {
        const x = it.side === 'left' ? bx + 1 : bx + bw - 4;
        box(g, x, ya, zi0 + 3, 3, 50, dz * 0.8, { material: bodyMat, part: 'rack' });
        for (let i = 0; i < 6; i++) cyl(g, x + 1.5, ya + 5 + i * 8, zi0 + 3 + dz * 0.4, 0.4, 3.2, 'z', steel, 6).position.z = zi0 + 3 + dz * 0.8 + 0.5;
        return;
      }
      case 'valet-rod': {
        const x = it.side === 'left' ? bx + 3 : bx + bw - 3;
        const vi = railInfo(it.finish);
        cyl(g, x, ya + 2.5, zi0 + dz * 0.5, 0.6, dz * 0.8, 'z', lib.plain(vi.color, vi.roughness, vi.metalness), 8);
        return;
      }
      case 'bin-pullout': {
        const grp = new THREE.Group(); grp.position.z = pull; g.add(grp);
        const n = it.bins, w = (bw - 4) / n;
        for (let i = 0; i < n; i++) box(grp, bx + 2 + i * w + 0.5, ya + 2, zi0 + 6, w - 1, 38, Math.min(38, dz - 12), { material: dark, part: 'bin' });
        return;
      }
      case 'mirror': {
        const mm = lib.plain('#cfdadf', 0.04, 0.9);
        if (it.mode === 'swivel') {
          // a mirror on a pivot at the side of the bay; ajar, it swings out
          const pv = new THREE.Group();
          pv.position.set(it.side === 'right' ? bx + bw - 2 : bx + 2, ya, zi0 + 6);
          pv.rotation.y = mode === 'ajar' ? 0.9 : 0;
          box(pv, -0.25, 0, 0, 0.5, 120, 30, { material: mm, part: 'mirror' });
          box(pv, -0.7, -0.5, -0.5, 1.4, 121, 1, { material: steel, part: 'rail', cast: false });
          g.add(pv);
          return;
        }
        const pullOut = it.mode === 'pull-out';
        const h = pullOut ? 120 : Math.min(170, yf + innerH - ya);
        box(g, bx + 2, ya, pullOut ? zi1 - 3 + pull : cD - 1, bw - 4, h, 0.5, { material: mm, part: 'mirror' });
        return;
      }
      case 'larder': {
        // a full-height pull-out: a front, two side frames and wire baskets
        const H = 35 * it.baskets;
        const grp = new THREE.Group();
        grp.position.z = mode === 'ajar' ? 28 : 0;
        g.add(grp);
        const outer = !sliding;
        const zf = outer ? zFront : cD - 3.7;
        const fx0 = outer ? edge0 : bx + 0.3, fx1 = outer ? edge1 : bx + bw - 0.3;
        if (outer) {
          const fg = new THREE.Group();
          fg.position.z = zf;
          grp.add(fg);
          frontPanel(fg, fx0, ya + GAP, fx1 - fx0, H - 2 * GAP, S.upper && ya >= look.split ? 'upper' : 'front', designFor(false), 'drawer-front');
          handle(fg, { what: 'door', x: fx1 - 4.5, lo: ya, hi: ya + H, w: fx1 - fx0, z: F });
          fronts.push({ bay: bi, lo: ya, hi: ya + H });
        }
        const bd = Math.min(dz - 4, 48), z0 = zf - bd;
        for (const x of [bx + 1, bx + bw - 2.2]) box(grp, x, ya, z0, 1.2, H, bd, { material: steel, part: 'larder-frame' });
        for (let i = 0; i < it.baskets; i++) {
          const y0 = ya + i * 35 + 3;
          box(grp, bx + 2.4, y0, z0, bw - 4.8, 0.5, bd, { material: steel, part: 'basket' });
          box(grp, bx + 2.4, y0, zf - 1, bw - 4.8, 9, 0.5, { material: steel, part: 'basket' });
          box(grp, bx + 2.4, y0, z0, bw - 4.8, 6, 0.5, { material: steel, part: 'basket' });
          // a few jars and packets
          for (let k = 0; k < 3 && bw > 30; k++) box(grp, bx + 5 + k * ((bw - 14) / 3), y0 + 0.5, z0 + bd * 0.3, Math.min(8, (bw - 14) / 3 - 2), 10 + rnd() * 8, 8, { material: lib.plain(DECOR[Math.floor(rnd() * DECOR.length)], 0.8), part: 'jar', cast: false });
        }
        return;
      }
      case 'spice': {
        // a narrow pull-out with tiers of spice jars
        const H = 18 * it.tiers + 8;
        const grp = new THREE.Group();
        grp.position.z = mode === 'ajar' ? 28 : 0;
        g.add(grp);
        const outer = !sliding;
        const zf = outer ? zFront : cD - 3.7;
        const fx0 = outer ? edge0 : bx + 0.3, fx1 = outer ? edge1 : bx + bw - 0.3;
        if (outer) {
          const fg = new THREE.Group();
          fg.position.z = zf;
          grp.add(fg);
          frontPanel(fg, fx0, ya + GAP, fx1 - fx0, H - 2 * GAP - 0.3, S.upper && ya >= look.split ? 'upper' : 'front', designFor(false), 'drawer-front');
          handle(fg, { what: 'door', x: fx1 - 3.5, lo: ya, hi: ya + H, w: fx1 - fx0, z: F });
          fronts.push({ bay: bi, lo: ya, hi: ya + H });
        }
        const bd = Math.min(dz - 4, 45), z0 = zf - bd;
        for (const x of [bx + 0.6, bx + bw - 1.8]) box(grp, x, ya, z0, 1.2, H, bd, { material: bodyMat, part: 'spice-side' });
        for (let i = 0; i < it.tiers; i++) {
          const y0 = ya + 2 + i * 18;
          box(grp, bx + 1.8, y0, z0, bw - 3.6, 1, bd, { material: bodyMat, part: 'spice-shelf' });
          box(grp, bx + 1.8, y0, zf - 1.5, bw - 3.6, 3, 0.8, { material: bodyMat, part: 'spice-lip' });
          const jars = Math.max(2, Math.floor((bw - 4) / 5.4));
          for (let k = 0; k < 2; k++) for (let j = 0; j < jars; j++) {
            const jar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 8.5, 12), lib.plain(DECOR[(i + j + k) % DECOR.length], 0.7));
            jar.position.set(bx + 2 + 2.7 + j * ((bw - 4 - 5.4) / Math.max(1, jars - 1)), y0 + 1 + 4.25, z0 + 5 + k * (bd * 0.45));
            grp.add(jar);
          }
        }
        return;
      }
      case 'divider':
        box(g, bx + it.position - BOARD / 2, ya, zi0, BOARD, it.height, dz, { material: bodyMat, part: 'divider' });
        return;
      case 'hooks': {
        box(g, bx + 2, ya + 3, zi0, bw - 4, 4, 1.5, { material: bodyMat, part: 'hooks' });
        for (let i = 0; i < it.count; i++) cyl(g, bx + 2 + ((i + 0.5) * (bw - 4)) / it.count, ya + 5, zi0 + 3.5, 0.5, 4, 'z', steel, 6);
        return;
      }
      case 'led':
        box(g, bx + 2, ya, zi1 - 3, bw - 4, 1, 1.4, { material: lib.led(), part: 'led', cast: false });
        return;
      case 'cable-tray':
        box(g, bx + 2, ya, zi0 + 2, bw - 4, 0.6, 12, { material: dark, part: 'tray' });
        box(g, bx + 2, ya, zi0 + 2, bw - 4, 6, 0.6, { material: dark, part: 'tray' });
        return;
      case 'carousel': {
        const r = Math.max(8, Math.min(bw / 2 - 2, 28));
        for (const dy of [8, 38]) {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.5, 28), bodyMat);
          if (it.shape === 'kidney') m.scale.set(1.25, 1, 0.8);
          m.position.set(bx + bw / 2, ya + dy, zi0 + r + 3);
          g.add(shadow(m));
        }
        cyl(g, bx + bw / 2, ya + 30, zi0 + r + 3, 1, 60, 'y', steel, 8);
        return;
      }
      case 'media-niche':
        for (const dy of [0, 43.2]) box(g, bx, ya + dy, zi0, bw, BOARD, dz, { material: bodyMat, part: 'shelf' });
        return;
      default:
    }
  }
  piece.bays.forEach((bay, bi) => bay.items.forEach((it) => item(bi, layout[bi], it)));

  // ----- fronts -----
  if (hinged && mode !== 'hidden') {
    const leaf = (hx, side, w, lo, hi, role) => {
      const grp = new THREE.Group();
      grp.position.set(hx, 0, zFront);
      grp.rotation.y = mode === 'ajar' ? (side === 'left' ? -1.1 : 1.1) : 0;
      const x0 = side === 'left' ? 0 : -w;
      frontPanel(grp, x0, lo, w, hi - lo, role, designFor(true), 'door');
      handle(grp, { what: 'door', x: side === 'left' ? w - 3.5 : -w + 3.5, lo, hi, w, z: F });
      g.add(grp);
    };
    piece.bays.forEach((bay, bi) => {
      if (bay.door === 'none') return;
      const b = layout[bi];
      const fx0 = (bi === 0 ? GAP + scribeSide : b.x0 - T / 2 + GAP), fx1 = (bi === piece.bays.length - 1 ? W - GAP - scribeSide : b.x1 + T / 2 - GAP);
      // free stretches of the front, cut around drawer fronts, then split at the two-tone line
      let segs = [[ph + GAP, top - GAP - scribeTop]];
      for (const f of fronts.filter((x) => x.bay === bi)) {
        segs = segs.flatMap(([a, c]) => {
          const out = [];
          if (f.lo - 0.3 > a) out.push([a, Math.min(c, f.lo - 0.3)]);
          if (f.hi + 0.3 < c) out.push([Math.max(a, f.hi + 0.3), c]);
          return out;
        });
      }
      for (const [lo0, hi0] of segs) {
        if (hi0 - lo0 < 6) continue;
        for (const seg of roleSegments(lo0, hi0, piece)) {
          if (seg.hi - seg.lo < 6) continue;
          if (bay.door === 'double' || fx1 - fx0 > 90) {
            const w = (fx1 - fx0 - 0.3) / 2;
            leaf(fx0, 'left', w, seg.lo, seg.hi, seg.role); leaf(fx1, 'right', w, seg.lo, seg.hi, seg.role);
          } else leaf(bay.door === 'right' ? fx1 : fx0, bay.door === 'right' ? 'right' : 'left', fx1 - fx0, seg.lo, seg.hi, seg.role);
        }
      }
    });
  } else if (sliding && mode !== 'hidden') {
    const n = Math.max(2, Math.ceil(W / 100)), ov = 3;
    const pw = (W + (n - 1) * ov) / n, lo = ph + GAP, hi = top - GAP - scribeTop;
    for (let i = 0; i < n; i++) {
      const grp = new THREE.Group();
      const frontRow = i % 2 === 0;
      grp.position.set(i * (pw - ov) + (mode === 'ajar' && i % 2 ? -pw * 0.55 : 0), 0, frontRow ? D - F : D - 2 * F - 0.6);
      frontPanel(grp, 0, lo, pw, hi - lo, 'front', designFor(false), 'door');
      handle(grp, { what: 'slide', x: i % 2 ? 4 : pw - 4, lo, hi, w: pw, z: F });
      g.add(grp);
    }
    box(g, 0, top - 0.5, cD, W, 1.2, 2 * F + 1, { material: steel, part: 'rail' });
  }
  return root;
}
