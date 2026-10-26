// The scene the path tracer renders. It is made from the same builders as the live viewer (buildStudio, buildPiece) and the
// same layout (studio.js), so the two cannot disagree about what stands where. On top of that it adds what a photograph
// needs: a soft key light and a fill like a product shot, the HDRI for reflections and the LED strips as emissive surfaces.
// Browser only (three is passed in). Loaded on demand by render.js.
import { buildStudio, buildPiece, disposeGroup, STUDIO_COLOR } from './geometry.js';
import { layoutStudio } from './studio.js';
import { MATERIALS, canonicalId, surfaceInfo, resolveHandleFinish } from './materials.js';
import { surfacesOf } from './model.js';

const M = 0.01;

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
// Which texture set a material id uses comes from the material table (`tex`); smoked oak is the oak texture tinted darker.
export const WOOD_TEX = new Proxy({}, { get: (_, id) => (MATERIALS[canonicalId(id)] && MATERIALS[canonicalId(id)].tex) || undefined });
const TEX_MEAN = { oak: [0xa1, 0x7e, 0x58], walnut: [0x8a, 0x69, 0x51], ash: [0xac, 0x94, 0x7d], birch: [0xb8, 0xa0, 0x88] };
const TEX_METRES = { oak: 0.9, walnut: 0.9, ash: 0.9, birch: 0.9 };
const PLASTER_METRES = 1.0;

// Which texture sets the project needs, so render.js loads only those (names are file prefixes: <name>_diff.jpg, _rough, _nor).
export function neededTextures(project) {
  const need = new Set(['plaster']);
  const wood = (id) => { if (WOOD_TEX[id]) need.add(WOOD_TEX[id]); };
  for (const p of project.pieces || []) {
    const S = surfacesOf(p);
    for (const sp of [S.front, S.carcass, S.interior, S.upper]) if (sp) wood(sp.material);
    if (p.worktop) wood(p.worktop);
  }
  return [...need];
}

// A material library for the render: the veneers, floors and handles get real PBR textures and metal; anything else
// (lacquers, terrazzo, the plain painted parts) keeps what the live viewer uses. `transmissive`: glass in furniture
// doors lets light through.
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
    const cid = canonicalId(id);
    const name = WOOD_TEX[cid];
    if (!name || !tex[name]) return null;
    if (!cache.has(cid)) {
      const m = set(name, new THREE.MeshStandardMaterial());
      const def = MATERIALS[cid];
      if (def && def.tinted && TEX_MEAN[name]) { // the same texture, darkened towards the table's colour
        const want = new THREE.Color(def.color).convertLinearToSRGB();
        const mean = TEX_MEAN[name].map((v) => v / 255);
        const r = [want.r / mean[0], want.g / mean[1], want.b / mean[2]].map((v) => Math.min(1.35, Math.max(0.25, v)));
        m.color.setRGB(r[0], r[1], r[2], THREE.SRGBColorSpace);
      }
      cache.set(cid, m);
    }
    return cache.get(cid);
  };
  const glassOf = (id) => {
    if (!transmissive) return lib.glassOf(id);
    const info = surfaceInfo({ material: id });
    const key = `glass:${info.id}`;
    if (!cache.has(key)) {
      cache.set(key, new THREE.MeshPhysicalMaterial({
        color: info.opacity > 0.3 ? info.color : 0xeaf4f6, roughness: info.roughness, metalness: 0, transmission: 1, ior: 1.45, thickness: 0.01,
        attenuationColor: new THREE.Color(info.color), attenuationDistance: info.opacity > 0.3 ? 0.05 : 1e3, side: THREE.DoubleSide
      }));
    }
    return cache.get(key);
  };
  const out = Object.create(lib);
  out.surface = (spec) => {
    const m = spec && wood(spec.material);
    return m || lib.surface(spec);
  };
  out.veneer = (id) => out.surface({ material: id });
  out.get = (id) => out.surface({ material: id });
  out.handle = () => lib.handleOf('handle-black');
  out.handleOf = (finish) => lib.handleOf(resolveHandleFinish(finish));
  out.glass = () => glassOf('glass-clear');
  out.glassOf = glassOf;
  out.dispose = () => { cache.forEach((m) => m.dispose()); };
  return out;
}

export function buildRenderScene({ project, THREE, lib: libIn, fronts = 'closed', camera, hdr = null, background = '#f6f6f3', tex = {} }) {
  const baseLib = libIn;
  const lib = pbrLib(THREE, baseLib, tex, { transmissive: true });
  const layout = layoutStudio(project);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'render-root';
  scene.add(root);

  // ----- the studio: one smooth floor and wall, with a fine plaster roughness and normal when the texture is there -----
  const studioMat = new THREE.MeshStandardMaterial({ color: STUDIO_COLOR, roughness: 0.92, metalness: 0 });
  const pl = tex.plaster;
  if (pl) {
    const lin = (src) => { const c = src.clone(); c.colorSpace = THREE.NoColorSpace; c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(1 / PLASTER_METRES, 1 / PLASTER_METRES); c.needsUpdate = true; return c; };
    if (pl.rough) { studioMat.roughnessMap = lin(pl.rough); studioMat.roughness = 1; }
    if (pl.nor) { studioMat.normalMap = lin(pl.nor); studioMat.normalScale = new THREE.Vector2(0.35, 0.35); }
  }
  if (!layout.empty) {
    const studio = buildStudio(layout, THREE, studioMat);
    root.add(studio);
  }

  // ----- pieces -----
  const ledMeshes = [];
  for (const it of layout.items) {
    const piece = (project.pieces || []).find((p) => p.id === it.pieceId);
    if (!piece) continue;
    const wrapper = new THREE.Group();
    wrapper.name = `piece:${piece.id}`;
    wrapper.position.set(it.x * M, it.lift * M, it.z * M);
    const inner = buildPiece(piece, THREE, lib, { fronts });
    wrapper.add(inner);
    root.add(wrapper);
    inner.traverse((o) => { if (o.isMesh && o.userData.part === 'led') ledMeshes.push(o); });
  }
  scene.updateMatrixWorld(true);

  // ----- light -----
  // A product shot: a big soft key from the front left and above, a smaller fill from the right, and the HDRI for the
  // reflections in glass, handles and the finish of the fronts. The LED strips are thin warm area lights that glow themselves.
  // The earlier patchy RectAreaLight look was the mesh order bug that flattenByMaterial removes, not the lights.
  const lights = [];
  const addLight = (l) => { scene.add(l); lights.push(l); return l; };
  const ledMat = lib.led();
  ledMat.emissiveIntensity = 6;
  const b = layout.bounds;
  const cx = ((b.minX + b.maxX) / 2) * M;
  const depthM = (layout.items.length ? Math.max(...layout.items.map((i) => i.z + i.d)) : 100) * M;
  const topM = layout.wall.height * M;
  const spread = Math.max(2.4, (layout.extent * M) / 2 + 1.2);
  const { flat, geos } = flattenByMaterial(THREE, root);
  scene.remove(root);
  scene.add(flat);
  const aim = new THREE.Vector3(cx, Math.min(1.1, topM * 0.35), depthM * 0.35);
  {
    const keyLight = new THREE.RectAreaLight(0xfff0dc, 22, Math.max(2.6, spread), 2.2);
    keyLight.position.set(cx - spread * 0.9, topM * 0.9 + 1.2, depthM + spread * 0.9 + 1.4);
    keyLight.lookAt(aim);
    addLight(keyLight);
    const fillLight = new THREE.RectAreaLight(0xdce8f5, 5.5, 2.4, 1.8);
    fillLight.position.set(cx + spread * 1.1, topM * 0.55 + 0.4, depthM + spread * 0.8 + 1.0);
    fillLight.lookAt(aim);
    addLight(fillLight);
  }

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

  // ----- environment -----
  // The HDRI is an indoor photograph: here it only gives the surfaces something to reflect and a little ambient light.
  if (hdr) {
    scene.environment = hdr;
    scene.environmentIntensity = 0.55;
  }
  scene.background = new THREE.Color(background);
  scene.backgroundIntensity = 1.3;

  return {
    scene, ledCount: ledMeshes.length, lightCount: lights.length,
    dispose() {
      disposeGroup(root);
      geos.forEach((g) => g.dispose());
      lights.forEach((l) => { scene.remove(l); l.dispose && l.dispose(); });
      studioMat.dispose();
      lib.dispose(); baseLib.dispose();
      scene.clear();
    }
  };
}
