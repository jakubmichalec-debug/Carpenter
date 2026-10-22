// The scene the path tracer renders. It is made from the same builders as the live viewer (buildFloor, buildWall,
// buildPiece), so the two cannot disagree about what the room holds. On top of that it adds what a photograph needs:
// a ceiling when the camera stands inside the room, the HDRI for daylight, a glowing ceiling panel and the LED strips
// as emissive surfaces.
// Browser only (three is passed in). Loaded on demand by render.js.
import { buildFloor, buildWall, buildPiece, disposeGroup } from './geometry.js';
import { wallsOf, ceilingHeightAt } from './model.js';
import { ceilingPolygons, placedTransform, insideRoom } from './review-logic.js';

const M = 0.01;
const SUN_ELEVATION = (38 * Math.PI) / 180;

// Everything is merged into one mesh per material before the path tracer sees it. Why: the tracer merges all meshes into
// one geometry itself, in the order of their uuids, which is random on every page load, and with this scene (indexed and
// non-indexed geometries, multi-material walls, a 0.01 scale on the furniture groups) some orders rendered whole surfaces
// dark or too bright, and which ones changed from one render to the next. One plain, non-indexed mesh per material, with
// the world transform (and so the cm to metre scale and the normals) already baked in, leaves nothing to go wrong.
function flattenByMaterial(THREE, root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(); // material -> { pos: [], nrm: [], uv: [] }
  const take = (mat) => { if (!buckets.has(mat)) buckets.set(mat, { pos: [], nrm: [], uv: [] }); return buckets.get(mat); };
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
  for (const m of meshes) {
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld); // positions and normals (renormalised)
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array;
    const uv = geo.attributes.uv ? geo.attributes.uv.array : null;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = geo.groups && geo.groups.length ? geo.groups : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }];
    for (const g of groups) {
      const mat = mats[g.materialIndex] || mats[0];
      const b = take(mat);
      const v0 = g.start, v1 = Math.min(geo.attributes.position.count, g.start + g.count);
      for (let i = v0; i < v1; i++) {
        b.pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        b.nrm.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
        if (uv) b.uv.push(uv[i * 2], uv[i * 2 + 1]); else b.uv.push(0, 0);
      }
    }
    geo.dispose();
  }
  const flat = new THREE.Group();
  flat.name = 'render-flat';
  const geos = [];
  for (const [mat, b] of buckets) {
    if (!b.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `flat:${mat.name || mat.uuid.slice(0, 6)}`;
    flat.add(mesh);
    geos.push(geo);
  }
  return { flat, geos };
}

// ---------- PBR textures (Poly Haven, CC0, site/assets/planner-tex/) ----------
// Grain of the wood textures runs along the image x axis, like the canvases of the live viewer, so the piece UVs
// (piece-geometry.js: 1.6 m along the grain, 0.6 m across) apply unchanged. `m` is how many metres one texture tile covers.
export const WOOD_TEX = { oak: 'oak', walnut: 'walnut', ash: 'ash', 'birch-ply': 'birch' };
const FLOOR_TEX = { 'oak-floor': ['floor-oak', 1.3], 'ash-floor': ['birch', 1.0], 'concrete-floor': ['concrete', 1.6], 'tile-floor': ['tile', 1.2] };
const TEX_METRES = { oak: 0.9, walnut: 0.9, ash: 0.9, birch: 0.9 };
const PLASTER_METRES = 1.0;

// Which texture sets the project needs, so render.js loads only those (names are file prefixes: <name>_diff.jpg, _rough, _nor).
export function neededTextures(project) {
  const need = new Set(['plaster']);
  const wood = (id) => { if (WOOD_TEX[id]) need.add(WOOD_TEX[id]); };
  for (const pl of project.placements || []) {
    const p = (project.pieces || []).find((x) => x.id === pl.pieceId);
    if (!p) continue;
    wood(p.carcass.material); wood(p.fronts.material); if (p.worktop) wood(p.worktop);
  }
  wood('oak'); // room doors
  const f = FLOOR_TEX[project.room.floor];
  if (f) need.add(f[0]);
  return [...need];
}

// A material library for the render: the veneers, floors and handles get real PBR textures and metal; anything else
// (lacquers, terrazzo, the plain painted parts) keeps what the live viewer uses. `transmissive`: glass in furniture
// doors lets light through; glass in the walls stays a thin pane so the sun can reach the room.
function pbrLib(THREE, lib, tex, { transmissive }) {
  const cache = new Map();
  const set = (name, m) => {
    const t = tex[name];
    const size = TEX_METRES[name] || 1;
    const make = (src, srgb, rx, ry) => {
      if (!src) return null;
      const c = src.clone();
      c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(rx, ry);
      c.needsUpdate = true;
      return c;
    };
    // piece UVs: 1.6 m along the grain (u), 0.6 m across (v)
    m.map = make(t.diff, true, 1.6 / size, 0.6 / size);
    m.roughnessMap = make(t.rough, false, 1.6 / size, 0.6 / size);
    m.normalMap = make(t.nor, false, 1.6 / size, 0.6 / size);
    m.normalScale = new THREE.Vector2(0.8, 0.8);
    m.color = new THREE.Color(0xffffff);
    m.roughness = 1; m.metalness = 0;
    return m;
  };
  const wood = (id) => {
    const name = WOOD_TEX[id];
    if (!name || !tex[name]) return null;
    if (!cache.has(id)) cache.set(id, set(name, new THREE.MeshStandardMaterial()));
    return cache.get(id);
  };
  const metal = () => {
    if (!cache.has('metal')) cache.set('metal', new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.3, metalness: 1 }));
    return cache.get('metal');
  };
  const glass = () => {
    if (!transmissive) return lib.glass();
    if (!cache.has('glass')) cache.set('glass', new THREE.MeshPhysicalMaterial({ color: 0xeaf4f6, roughness: 0.03, metalness: 0, transmission: 1, ior: 1.45, thickness: 0.01, side: THREE.DoubleSide }));
    return cache.get('glass');
  };
  const out = Object.create(lib);
  out.veneer = (id) => wood(id) || lib.veneer(id);
  out.get = (id) => (id === 'steel-black' ? metal() : wood(id) || lib.get(id));
  out.handle = () => metal();
  out.glass = glass;
  out.dispose = () => { cache.forEach((m) => m.dispose()); };
  return out;
}

export function buildRenderScene({ project, THREE, lib: libIn, fronts = 'closed', camera, hiddenWalls = [], hdr = null, background = '#f6f6f3', tex = {} }) {
  let lib = libIn;
  const baseLib = libIn;
  const wallLib = pbrLib(THREE, baseLib, tex, { transmissive: false });
  lib = pbrLib(THREE, baseLib, tex, { transmissive: true });
  const room = project.room;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'render-root';
  scene.add(root);

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const ceilingY = ceilingHeightAt(room, camPos.x / M, camPos.z / M) * M;
  const interior = !!camera.isPerspectiveCamera && insideRoom(room, camPos.x / M, camPos.z / M) && camPos.y < ceilingY - 0.05;
  const hide = new Set(hiddenWalls);

  // ----- room -----
  const floorTex = FLOOR_TEX[room.floor];
  const floorLib = Object.create(baseLib);
  if (floorTex) {
    floorLib.floorTileMetres = () => floorTex[1];
    floorLib.floorTexture = () => { const t = tex[floorTex[0]]; return t && t.diff ? t.diff.clone() : baseLib.floorTexture(room.floor, '#b98f60'); };
  }
  const floor = buildFloor(room, THREE, floorLib);
  if (floorTex && tex[floorTex[0]] && tex[floorTex[0]].diff) {
    const t = tex[floorTex[0]], m = floor.material;
    const lin = (src) => { if (!src) return null; const c = src.clone(); c.colorSpace = THREE.NoColorSpace; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; return c; };
    const d = m.map; d.colorSpace = THREE.SRGBColorSpace; d.wrapS = d.wrapT = THREE.RepeatWrapping; d.needsUpdate = true;
    m.color = new THREE.Color(0xffffff);
    m.roughnessMap = lin(t.rough); m.normalMap = lin(t.nor); m.roughness = 1;
  }
  root.add(floor);
  const wallGroups = [];
  room.walls.forEach((c, i) => {
    if (hide.has(c.id)) return;
    const g = buildWall(room, i, THREE, wallLib);
    const pl = tex.plaster;
    if (pl && g.userData.face) { // plaster: a little roughness variation and a fine normal on the wall faces (UVs there are metres)
      for (const fm of [g.userData.face, g.userData.edge]) {
        const lin = (src) => { const c = src.clone(); c.colorSpace = THREE.NoColorSpace; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(1 / PLASTER_METRES, 1 / PLASTER_METRES); c.needsUpdate = true; return c; };
        if (pl.rough) fm.roughnessMap = lin(pl.rough);
        if (pl.nor) { fm.normalMap = lin(pl.nor); fm.normalScale = new THREE.Vector2(0.5, 0.5); }
        fm.roughness = 1;
      }
    }
    g.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.transparent && m.opacity < 0.5) { m.opacity = 0.1; m.depthWrite = true; } // window glass: clear enough for the sun
        if (o.name === 'slope') { m.emissiveIntensity = 0; }                         // the viewer lifts it with a glow; light does that here
      }
    });
    wallGroups.push(g);
    root.add(g);
  });

  // ----- ceiling (inside views only; the slope plane of an attic is replaced by it) -----
  const extras = []; // geometries and materials made here
  if (interior) {
    for (const g of wallGroups) g.traverse((o) => { if (o.name === 'slope') o.visible = false; });
    const mat = lib.plain('#f3f1ec', 0.96);
    for (const poly of ceilingPolygons(room)) {
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x * M, -p.z * M)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, ceilingHeightAt(room, pos.getX(i) / M, pos.getZ(i) / M) * M);
      const idx = geo.index;
      for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); } // face down
      idx.needsUpdate = true;
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'ceiling';
      root.add(mesh);
      extras.push(geo);
    }
  }
  // looking in from outside there is no ground: the room floats on the page colour, like the live view

  // ----- pieces -----
  const ledMeshes = [];
  for (const pl of project.placements || []) {
    const piece = (project.pieces || []).find((p) => p.id === pl.pieceId);
    const tr = piece && placedTransform(project, pl);
    if (!tr) continue;
    const wrapper = new THREE.Group();
    wrapper.name = `placed:${piece.id}`;
    wrapper.position.set(tr.x, 0, tr.z);
    wrapper.rotation.y = tr.rotY;
    const lift = new THREE.Group();
    lift.position.y = tr.lift;
    const inner = buildPiece(piece, THREE, lib, { fronts });
    lift.add(inner);
    wrapper.add(lift);
    root.add(wrapper);
    inner.traverse((o) => { if (o.isMesh && o.userData.part === 'led') ledMeshes.push(o); });
  }
  scene.updateMatrixWorld(true);

  // ----- light -----
  // The sun and the LED strips are RectAreaLights (soft shadows, no noise from hoping a random ray finds them). The first
  // attempt at these looked patchy, but that was the mesh order bug that flattenByMaterial now removes. A glowing panel is the
  // ceiling lamp, and the HDRI is the sky. The LED strips also glow themselves.
  const glowers = [];
  const lights = [];
  const addLight = (l) => { scene.add(l); lights.push(l); return l; };
  const ledMat = lib.led();
  ledMat.emissiveIntensity = 6;
  let cx = 0, cz = 0;
  for (const c of room.walls) { cx += c.x; cz += c.z; }
  cx /= room.walls.length; cz /= room.walls.length;
  if (interior) {
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0dc, emissiveIntensity: 2, roughness: 1, side: THREE.FrontSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), panelMat);
    panel.rotation.x = Math.PI / 2; // faces down
    panel.position.set(cx * M, ceilingHeightAt(room, cx, cz) * M - 0.02, cz * M);
    panel.name = 'ceiling-lamp';
    root.add(panel);
    glowers.push(panel.geometry, panelMat);
  }
  const { flat, geos } = flattenByMaterial(THREE, root);
  scene.remove(root);
  scene.add(flat);

  // LED strips: a thin warm area light under each
  {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    for (const mesh of ledMeshes) {
      mesh.matrixWorld.decompose(p, q, sc);
      const par = mesh.geometry.parameters || { width: 20, height: 1, depth: 1.4 };
      const len = Math.max(0.05, par.width * sc.x), wid = Math.max(0.02, par.depth * sc.z);
      const light = new THREE.RectAreaLight(0xffc98a, 14, len, wid * 2);
      light.position.copy(p).add(new THREE.Vector3(0, -(par.height * sc.y) / 2 - 0.004, 0).applyQuaternion(q));
      light.quaternion.copy(q).multiply(flip);
      addLight(light);
    }
  }

  // the sun: a soft-edged warm area light far away. Inside it aims at the biggest window from outside the wall, so the walls
  // keep it out everywhere except through the opening; looking in from outside it stands on the camera's side, high up.
  {
    const walls = wallsOf(room);
    let target = null, dir = null;
    const wins = (room.openings || []).filter((o) => o.type === 'window' && walls.some((w) => w.id === o.wallId));
    if (interior && wins.length) {
      wins.sort((a, b) => b.width * b.height - a.width * a.height);
      const o = wins[0], w = walls.find((x) => x.id === o.wallId);
      const u = o.offset + o.width / 2;
      target = new THREE.Vector3((w.start.x + w.dir.x * u) * M, (o.bottom + o.height / 2) * M, (w.start.z + w.dir.z * u) * M);
      // slightly to one side of straight on, so the patch of sun falls across the floor
      const side = new THREE.Vector3(w.dir.x, 0, w.dir.z);
      dir = new THREE.Vector3(-w.normal.x * Math.cos(SUN_ELEVATION), Math.sin(SUN_ELEVATION), -w.normal.z * Math.cos(SUN_ELEVATION)).addScaledVector(side, 0.25).normalize();
    } else if (!interior) {
      target = new THREE.Vector3(cx * M, 0.6, cz * M);
      let hx = camPos.x - cx * M, hz = camPos.z - cz * M;
      const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      const rot = (-30 * Math.PI) / 180, rx = hx * Math.cos(rot) - hz * Math.sin(rot), rz = hx * Math.sin(rot) + hz * Math.cos(rot);
      dir = new THREE.Vector3(rx * Math.cos(1), Math.sin(1), rz * Math.cos(1));
    }
    if (target) {
      const sun = new THREE.RectAreaLight(0xffe2b8, 350, 1.6, 1.6);
      sun.position.copy(target).addScaledVector(dir, 14);
      sun.lookAt(target);
      addLight(sun);
    }
  }

  // ----- sky -----
  // The HDRI is an indoor photograph: it is the daylight at the windows, so it lights the room from inside and is what you
  // see out of a window. Looking in from outside it is turned up.
  if (hdr) {
    scene.environment = hdr;
    scene.environmentIntensity = interior ? 0.7 : 1.6;
    if (interior) { scene.background = hdr; scene.backgroundIntensity = 1; scene.backgroundBlurriness = 0.02; }
  }
  if (!scene.background) { scene.background = new THREE.Color(background); scene.backgroundIntensity = 1.3; }

  return {
    scene, interior, ledCount: ledMeshes.length, lightCount: lights.length,
    dispose() {
      disposeGroup(root); // the original meshes: their wall materials and floor material (the flat meshes share them)
      geos.forEach((g) => g.dispose());
      lights.forEach((l) => { scene.remove(l); l.dispose && l.dispose(); });
      root.traverse((o) => { if (o.isMesh && o.userData && o.userData.part === 'floor' && o.material) o.material.dispose(); });
      extras.forEach((e) => e.dispose());
      glowers.forEach((e) => e.dispose());
      lib.dispose(); wallLib.dispose(); baseLib.dispose();
      scene.clear();
    }
  };
}
