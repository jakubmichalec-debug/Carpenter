// Planner v2 room geometry: turns room data into Three.js meshes. THREE and the material lib are passed in, so this
// file imports no Three.js and Node can load it. Scene units are metres, the model's are cm. Plan x and z map to
// scene x and z, y is up. Every wall is a Group in wall space: x along the wall from its start corner, y up, z into
// the room, with the inner face of the wall at z = 0 and the wall body at z in [-thickness, 0].
import { wallsOf, FLOORS, WALL_COLORS } from './model.js';
import { WALL_T, cornerOffsets, ceilingProfile, minCeiling } from './plan-geom.js';

export { buildPiece, pieceSignature, FRONT_MODES } from './piece-geometry.js';

const M = 0.01;
const T = WALL_T * M;
const AJAR = 0.72; // radians a door leaf stands open

// ---------- signatures: what a rebuild depends on ----------
export function floorSignature(room) {
  return JSON.stringify([room.walls.map((c) => [c.x, c.z]), room.floor]);
}
export function wallSignature(room, index) {
  const n = room.walls.length;
  const c = (k) => { const w = room.walls[((k % n) + n) % n]; return [w.x, w.z]; };
  const id = room.walls[index].id;
  return JSON.stringify([
    c(index - 1), c(index), c(index + 1), c(index + 2), room.height, room.slope,
    room.openings.filter((o) => o.wallId === id), room.skirting, room.wall
  ]);
}

// ---------- materials owned by one wall group, so a wall can fade on its own ----------
function ownMaterials(group) {
  const list = [];
  const own = (m) => {
    const c = m.clone();
    c.userData = { ...c.userData, baseOpacity: c.opacity, baseTransparent: c.transparent, baseDepthWrite: c.depthWrite };
    list.push(c);
    return c;
  };
  group.userData.materials = list;
  return own;
}

function shade(THREE, hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c;
}

const box = (THREE, w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};

// ---------- floor ----------
export function buildFloor(room, THREE, lib) {
  const shape = new THREE.Shape(room.walls.map((c) => new THREE.Vector2(c.x * M, -c.z * M)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const tile = lib.floorTileMetres(room.floor);
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  const def = FLOORS[room.floor] || FLOORS['oak-floor'];
  const mat = new THREE.MeshStandardMaterial({
    map: lib.floorTexture(room.floor, def.color), roughness: /tile|concrete/.test(room.floor) ? 0.72 : 0.58, metalness: 0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'floor';
  mesh.receiveShadow = true;
  mesh.userData.part = 'floor';
  return mesh;
}

// ---------- walls ----------
function openingSpans(room, wall, profile) {
  // Accepts only openings that fit, do not overlap an earlier one and can be cut without touching the wall's edges.
  const doors = [], windows = [], extras = [];
  const taken = [];
  const L = wall.length;
  const list = room.openings.filter((o) => o.wallId === wall.id).sort((a, b) => a.offset - b.offset);
  for (const o of list) {
    if (o.type === 'radiator' || o.type === 'socket') { extras.push(o); continue; }
    let u0 = o.offset, u1 = o.offset + o.width;
    if (u0 < 1 || u1 > L - 1) { u0 = Math.max(1, u0); u1 = Math.min(L - 1, u1); }
    if (u1 - u0 < 10) continue;
    const ceil = minCeiling(profile, u0, u1);
    let b = o.type === 'door' ? 0 : Math.max(3, o.bottom);
    let top = Math.min(o.bottom + o.height, ceil - 3);
    if (o.type === 'door') top = Math.min(o.height, ceil - 3);
    if (top - b < 20) continue;
    if (taken.some(([a, c]) => u0 < c + 0.5 && a < u1 + 0.5)) continue;
    taken.push([u0, u1]);
    const span = { o, u0, u1, b, top };
    (o.type === 'door' ? doors : windows).push(span);
  }
  return { doors, windows, extras };
}

export function buildWall(room, index, THREE, lib) {
  const walls = wallsOf(room);
  const w = walls[index];
  const L = w.length;
  const profile = ceilingProfile(room, w);
  const { doors, windows, extras } = openingSpans(room, w, profile);

  const group = new THREE.Group();
  group.name = `wall:${w.id}`;
  group.userData = { wallId: w.id, index };
  const own = ownMaterials(group);
  const tint = (WALL_COLORS[room.wall] || WALL_COLORS.chalk).color;

  // wall space -> world
  group.matrixAutoUpdate = false;
  group.matrix.makeBasis(new THREE.Vector3(w.dir.x, 0, w.dir.z), new THREE.Vector3(0, 1, 0), new THREE.Vector3(w.normal.x, 0, w.normal.z));
  group.matrix.setPosition(w.start.x * M, 0, w.start.z * M);
  group.matrixWorldNeedsUpdate = true;

  // outline in wall space (metres): along the floor with notches for doors, then back along the ceiling profile
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (const d of doors) {
    shape.lineTo(d.u0 * M, 0); shape.lineTo(d.u0 * M, d.top * M); shape.lineTo(d.u1 * M, d.top * M); shape.lineTo(d.u1 * M, 0);
  }
  shape.lineTo(L * M, 0);
  for (let i = profile.length - 1; i >= 0; i--) shape.lineTo(profile[i][0] * M, profile[i][1] * M);
  shape.closePath();
  for (const s of windows) {
    const hole = new THREE.Path();
    hole.moveTo(s.u0 * M, s.b * M); hole.lineTo(s.u1 * M, s.b * M); hole.lineTo(s.u1 * M, s.top * M); hole.lineTo(s.u0 * M, s.top * M); hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geo.translate(0, 0, -T);
  // mitre the outer face so neighbouring walls meet in a clean corner
  const offs = cornerOffsets(room);
  const n = walls.length;
  const e0 = (offs[index].x * w.dir.x + offs[index].z * w.dir.z) * M;
  const e1 = (offs[(index + 1) % n].x * w.dir.x + offs[(index + 1) % n].z * w.dir.z) * M;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i) + T) > 1e-6) continue;
    if (Math.abs(pos.getX(i)) < 1e-6) pos.setX(i, e0);
    else if (Math.abs(pos.getX(i) - L * M) < 1e-6) pos.setX(i, L * M + e1);
  }
  geo.computeVertexNormals();

  const face = own(new THREE.MeshStandardMaterial({ color: tint, roughness: 0.93, metalness: 0 }));
  const edge = own(new THREE.MeshStandardMaterial({ color: shade(THREE, tint, 0.8), roughness: 0.95, metalness: 0 }));
  const body = new THREE.Mesh(geo, [face, edge]);
  body.name = 'body';
  body.castShadow = true; body.receiveShadow = true;
  body.userData = { wallId: w.id, part: 'wall' };
  group.add(body);
  face.userData.baseColor = face.color.clone();
  edge.userData.baseColor = edge.color.clone();
  group.userData.face = face;
  group.userData.edge = edge;
  group.userData.body = body;

  const frameMat = own(lib.plain('#f4f1ea', 0.5));
  const sillMat = own(lib.plain('#ebe6dc', 0.55));
  const glassMat = own(lib.glass());

  // windows: frame, glass and an inner sill
  for (const s of windows) {
    const ww = (s.u1 - s.u0) * M, hh = (s.top - s.b) * M, fw = 0.045, fd = T * 0.78;
    const cx = ((s.u0 + s.u1) / 2) * M, cy = ((s.b + s.top) / 2) * M, zc = -T * 0.5;
    const g = new THREE.Group();
    g.name = `window:${s.o.id}`;
    g.add(box(THREE, ww, fw, fd, frameMat, cx, s.b * M + fw / 2, zc));
    g.add(box(THREE, ww, fw, fd, frameMat, cx, s.top * M - fw / 2, zc));
    g.add(box(THREE, fw, hh - 2 * fw, fd, frameMat, s.u0 * M + fw / 2, cy, zc));
    g.add(box(THREE, fw, hh - 2 * fw, fd, frameMat, s.u1 * M - fw / 2, cy, zc));
    if (ww > 1.05) g.add(box(THREE, 0.035, hh - 2 * fw, fd * 0.8, frameMat, cx, cy, zc));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(ww - 2 * fw, hh - 2 * fw, 0.008), glassMat);
    glass.position.set(cx, cy, zc);
    g.add(glass);
    g.add(box(THREE, ww + 0.06, 0.028, T + 0.045, sillMat, cx, s.b * M - 0.004, -T / 2 + 0.0225));
    group.add(g);
  }

  // doors: casing and a leaf standing ajar
  const leafMat = own(lib.get('oak'));
  const steel = own(lib.handle());
  for (const s of doors) {
    const o = s.o;
    const ww = (s.u1 - s.u0) * M, hh = s.top * M, cb = 0.045;
    const g = new THREE.Group();
    g.name = `door:${o.id}`;
    const zc = -T / 2;
    g.add(box(THREE, cb, hh, T + 0.03, frameMat, s.u0 * M + cb / 2, hh / 2, zc + 0.015));
    g.add(box(THREE, cb, hh, T + 0.03, frameMat, s.u1 * M - cb / 2, hh / 2, zc + 0.015));
    g.add(box(THREE, ww, cb, T + 0.03, frameMat, (s.u0 + s.u1) / 2 * M, hh - cb / 2, zc + 0.015));
    const swing = o.swing || 'in-left';
    const hingeLeft = swing.endsWith('left');
    const inward = swing.startsWith('in');
    const lw = ww - 2 * cb - 0.006;
    const pivot = new THREE.Group();
    pivot.position.set(hingeLeft ? s.u0 * M + cb : s.u1 * M - cb, 0, zc);
    pivot.rotation.y = (hingeLeft ? -1 : 1) * (inward ? 1 : -1) * AJAR;
    const leaf = box(THREE, lw, hh - cb - 0.004, 0.04, leafMat, hingeLeft ? lw / 2 : -lw / 2, (hh - cb) / 2, 0);
    pivot.add(leaf);
    const hx = hingeLeft ? lw - 0.07 : -lw + 0.07;
    for (const side of [-1, 1]) pivot.add(box(THREE, 0.12, 0.022, 0.012, steel, hx - (hingeLeft ? 0.03 : -0.03), 1.0, side * 0.028));
    g.add(pivot);
    group.add(g);
  }

  // radiators (a column radiator on the inner face) and sockets
  const radMat = own(lib.plain('#f3f2ee', 0.42));
  const pipeMat = own(lib.plain('#d9d7d0', 0.5));
  for (const o of extras) {
    const ww = Math.min(o.width, L - o.offset) * M;
    if (ww <= 0) continue;
    const cx = (o.offset * M) + ww / 2;
    if (o.type === 'radiator') {
      const d = (o.depth || 10) * M, hh = o.height * M, y0 = o.bottom * M;
      const g = new THREE.Group();
      g.name = `radiator:${o.id}`;
      const bars = Math.max(2, Math.min(5, Math.round(hh / 0.12)));
      const bh = hh / (bars * 2 - 1);
      for (let i = 0; i < bars; i++) g.add(box(THREE, ww, bh, d, radMat, cx, y0 + bh / 2 + i * bh * 2, d / 2 + 0.012));
      g.add(box(THREE, 0.025, hh + 0.04, 0.025, pipeMat, cx - ww / 2 + 0.05, y0 + hh / 2 - 0.02, 0.012));
      g.add(box(THREE, 0.025, hh + 0.04, 0.025, pipeMat, cx + ww / 2 - 0.05, y0 + hh / 2 - 0.02, 0.012));
      for (const x of [cx - ww / 2 + 0.05, cx + ww / 2 - 0.05]) g.add(box(THREE, 0.03, 0.03, 0.03, pipeMat, x, y0 - 0.02, 0.02));
      group.add(g);
    } else {
      const g = new THREE.Group();
      g.name = `socket:${o.id}`;
      g.add(box(THREE, ww, o.height * M, 0.012, frameMat, cx, (o.bottom + o.height / 2) * M, 0.006));
      group.add(g);
    }
  }

  // skirting along the inner face, interrupted by doors
  const sk = room.skirting * M;
  if (sk > 0) {
    const prev = walls[(index - 1 + n) % n];
    const cross = prev.dir.x * w.dir.z - prev.dir.z * w.dir.x;
    let from = cross > 0 ? 0.015 : 0;
    const cuts = doors.map((d) => [d.u0 * M, d.u1 * M]);
    const skMat = own(lib.plain('#f4f1ea', 0.5));
    let cursor = from;
    const lay = (a, b) => {
      if (b - a < 0.02) return;
      const m = box(THREE, b - a, sk, 0.016, skMat, (a + b) / 2, sk / 2, 0.008 + (index % 2) * 0.0002);
      m.name = 'skirting';
      group.add(m);
    };
    for (const [a, b] of cuts) { lay(cursor, a); cursor = b; }
    lay(cursor, L * M);
  }

  // an attic's sloping ceiling, drawn as a plane that only shows from below, so the room stays open from above
  if (room.slope && room.slope.wallId === w.id) {
    const low = room.slope.lowHeight * M, hi = room.height * M, dep = room.slope.depth * M;
    const verts = new Float32Array([0, low, 0, L * M, low, 0, L * M, hi, dep, 0, low, 0, L * M, hi, dep, 0, hi, dep]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.computeVertexNormals();
    const slopeMat = own(lib.plain('#efece5', 0.95));
    slopeMat.emissive.set('#d8d3c8'); slopeMat.emissiveIntensity = 0.45; // it faces down, away from the sun, so lift it a little
    const plane = new THREE.Mesh(g, slopeMat);
    plane.name = 'slope';
    plane.castShadow = true;
    plane.userData = { wallId: w.id, part: 'slope' };
    group.add(plane);
  }

  return group;
}

// A whole room in one group: the floor and every wall. Rooms never get a ceiling, so you can look in from above.
export function buildRoom(room, THREE, lib) {
  const g = new THREE.Group();
  g.name = 'room';
  g.add(buildFloor(room, THREE, lib));
  const walls = new Map();
  for (let i = 0; i < room.walls.length; i++) {
    const wg = buildWall(room, i, THREE, lib);
    walls.set(wg.userData.wallId, wg);
    g.add(wg);
  }
  g.userData = { walls };
  return g;
}

// Frees the geometry and the materials a group owns. Textures belong to the material lib and are left alone.
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  if (group.userData && group.userData.materials) group.userData.materials.forEach((m) => m.dispose());
  if (group.isMesh && group.material && group.name === 'floor') group.material.dispose();
}

// Fades a wall group (0 to 1). At 0 the group is hidden.
export function setWallFade(group, f) {
  const mats = group.userData.materials || [];
  const solid = f >= 0.999;
  for (const m of mats) {
    const u = m.userData;
    m.transparent = !solid || u.baseTransparent;
    m.opacity = solid ? u.baseOpacity : u.baseOpacity * f;
    m.depthWrite = solid ? u.baseDepthWrite : false;
  }
  group.visible = f > 0.01;
}

export function setWallHighlight(group, color, on) {
  const { face, edge } = group.userData;
  if (!face) return;
  face.color.copy(face.userData.baseColor); edge.color.copy(edge.userData.baseColor);
  if (on) { face.color.lerp(color, 0.2); edge.color.copy(color); }
  face.emissive.set(on ? color : 0x000000); face.emissiveIntensity = on ? 0.08 : 0;
  edge.emissive.set(on ? color : 0x000000); edge.emissiveIntensity = on ? 0.5 : 0;
}
