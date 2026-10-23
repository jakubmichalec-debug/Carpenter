// The material library of the planner's 3D: the old procedural library plus a surface for every entry of the stock
// range (planner/materials.js). Browser only; THREE is passed in. Everything is cached, so changing a colour or a
// handle rebuilds nothing but the pieces that use it.
import { createMaterialLib, veneerCanvas, vnoise, hexToRgb, clamp255, makeCanvas } from '../configurator/materials.js';
import { MATERIALS, canonicalId, surfaceInfo, resolveHandleFinish } from './materials.js';

function veinedCanvas(hex) {
  const S = 256, c = makeCanvas(S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const [br, bg, bb] = hexToRgb(hex);
  let i = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const a = vnoise(u, v, 4, 4, 5) * 0.6 + vnoise(u, v, 8, 8, 6) * 0.4;
    const vein = Math.pow(1 - Math.abs(a - 0.5) * 2, 18) * 0.16;           // thin grey veins
    const speck = (vnoise(u, v, 90, 90, 9) - 0.5) * 0.04;
    const k = 1 - vein + speck;
    img.data[i] = clamp255(br * k); img.data[i + 1] = clamp255(bg * k); img.data[i + 2] = clamp255(bb * k + vein * 8); img.data[i + 3] = 255;
    i += 4;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function speckCanvas(hex) {
  const S = 256, c = makeCanvas(S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const [br, bg, bb] = hexToRgb(hex);
  let i = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const k = 0.92 + vnoise(u, v, 3, 3, 2) * 0.1 + (vnoise(u, v, 110, 110, 4) - 0.5) * 0.16;
    img.data[i] = clamp255(br * k); img.data[i + 1] = clamp255(bg * k); img.data[i + 2] = clamp255(bb * k); img.data[i + 3] = 255;
    i += 4;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
// Layers of plywood seen on the edge: u runs along the edge, v across the thickness (nine layers).
function plyEdgeCanvas(hex) {
  const W = 128, H = 72, c = makeCanvas(W);
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const [br, bg, bb] = hexToRgb(hex);
  const layers = 9, lh = H / layers;
  for (let k = 0; k < layers; k++) {
    const dark = k % 2 === 0 ? 0.86 : 1.02;
    ctx.fillStyle = `rgb(${clamp255(br * dark) | 0},${clamp255(bg * dark) | 0},${clamp255(bb * dark) | 0})`;
    ctx.fillRect(0, k * lh, W, lh);
    ctx.fillStyle = 'rgba(70,45,20,.35)';
    ctx.fillRect(0, k * lh, W, 1);
    for (let n = 0; n < 6; n++) { ctx.fillStyle = 'rgba(80,55,30,.12)'; ctx.fillRect((n * 23 + k * 11) % W, k * lh + 2, 14, 1); }
  }
  return c;
}

export function createPlannerLib(THREE) {
  const base = createMaterialLib(THREE);
  const cache = new Map();
  const own = [];
  const keep = (m) => { own.push(m); return m; };
  const canvasTex = (key, make, repeat = true) => {
    if (cache.has(key)) return cache.get(key);
    const t = new THREE.CanvasTexture(make());
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    cache.set(key, t); own.push(t);
    return t;
  };
  const lib = Object.create(base);

  lib.textured = (id) => { const d = MATERIALS[canonicalId(id)]; return !!(d && (d.grain || d.veined || d.speckled)); };
  lib.surfaceTextured = (spec) => lib.textured(spec && spec.material);

  // A material for { material, finish }.
  lib.surface = (spec) => {
    const info = surfaceInfo(spec);
    const key = `s:${info.id}:${info.finish}`;
    if (cache.has(key)) return cache.get(key);
    const o = { color: info.color, roughness: info.roughness, metalness: info.metalness };
    if (info.grain) {
      const map = canvasTex(`veneer:${info.id}`, () => veneerCanvas({ color: info.color }, info.grainStyle || 'oak'));
      Object.assign(o, { color: 0xffffff, map, bumpMap: map, bumpScale: 0.25 });
    } else if (info.veined) {
      Object.assign(o, { color: 0xffffff, map: canvasTex(`veined:${info.id}`, () => veinedCanvas(info.color)) });
    } else if (info.kind === 'stone') {
      Object.assign(o, { color: 0xffffff, map: canvasTex(`speck:${info.id}`, () => speckCanvas(info.color)) });
    }
    const m = keep(new THREE.MeshStandardMaterial(o));
    cache.set(key, m);
    return m;
  };
  lib.get = (id) => lib.surface({ material: id });
  lib.veneer = (id) => lib.surface({ material: id });

  // The visible layers of plywood on a panel's edge.
  lib.plyEdge = (spec) => {
    const info = surfaceInfo(spec);
    const key = `ply-edge:${info.id}`;
    if (cache.has(key)) return cache.get(key);
    const map = canvasTex(key + ':t', () => plyEdgeCanvas(info.color), false);
    map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.ClampToEdgeWrapping;
    const m = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.75 }));
    cache.set(key, m);
    return m;
  };

  // Glass of a given type id: tint and opacity come from the table.
  lib.glassOf = (id) => {
    const info = surfaceInfo({ material: id });
    const key = `glass:${info.id}`;
    if (cache.has(key)) return cache.get(key);
    const m = keep(new THREE.MeshStandardMaterial({
      color: info.color, roughness: info.roughness, metalness: 0, transparent: true, opacity: info.opacity ?? 0.2,
      envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide
    }));
    cache.set(key, m);
    return m;
  };

  // A handle in a finish id from the table. `woodSpec` is what "Oak" follows (the fronts, when they are wood).
  lib.handleOf = (finishId) => {
    const id = resolveHandleFinish(finishId);
    const info = surfaceInfo({ material: id });
    const key = `handle:${id}`;
    if (cache.has(key)) return cache.get(key);
    const m = keep(new THREE.MeshStandardMaterial({ color: info.color, roughness: info.roughness, metalness: info.metalness }));
    cache.set(key, m);
    return m;
  };
  lib.handle = () => lib.handleOf('handle-black');

  lib.dispose = () => { own.forEach((o) => o.dispose()); own.length = 0; cache.clear(); base.dispose(); };
  return lib;
}
