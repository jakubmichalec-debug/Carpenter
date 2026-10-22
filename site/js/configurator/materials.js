// Procedural materials for the configurator. Every texture is drawn once on a canvas and cached,
// so the page never downloads an image. Wood grain runs along the canvas x axis; geometry.js maps
// UVs so the grain follows the board's long side (or its height for doors).
import { MATERIALS } from './model.js';

const N = 512;

const hash = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// Tileable value noise: u,v in [0,1), fx,fy integer lattice frequencies.
function vnoise(u, v, fx, fy, s) {
  const x = u * fx, y = v * fy;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const x1 = (x0 + 1) % fx, y1 = (y0 + 1) % fy;
  const xa = x0 % fx, ya = y0 % fy;
  const a = hash(xa, ya, s), b = hash(x1, ya, s), c = hash(xa, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

const WOOD = {
  oak:         { K: 16, arch: 0.30, bump: 1.5, rc: 0.075, fine: 0.07, pore: 0.24, tone: 0.04, seed: 11 },
  walnut:      { K: 12, arch: 0.36, bump: 1.4, rc: 0.105, fine: 0.08, pore: 0.20, tone: 0.055, seed: 23 },
  ash:         { K: 17, arch: 0.30, bump: 1.6, rc: 0.065, fine: 0.065, pore: 0.18, tone: 0.035, seed: 37 },
  'birch-ply': { K: 34, arch: 0.15, bump: 0, rc: 0.05, fine: 0.04, pore: 0.035, tone: 0.025, seed: 51 }
};

const fbm = (u, v, fx, fy, s) =>
  vnoise(u, v, fx, fy, s) * 0.55 + vnoise(u, v, fx * 2, fy * 2, s + 1) * 0.28 + vnoise(u, v, fx * 4, fy * 4, s + 2) * 0.17;

function makeCanvas(size = N) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Veneer-like grain: dark growth lines are contours of a stretched, layered noise field, so they bend into
// arches and ovals instead of running as parallel stripes. Contrast stays low; every board drifts in tone.
function woodCanvas(mat, id, baseHex = mat.color, seedOffset = 0, over = null) {
  const p = { ...(WOOD[id] || WOOD.oak), ...(over || {}) };
  const s = p.seed + seedOffset;
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const [br, bg, bb] = hexToRgb(baseHex);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const h = v * p.K + (fbm(u, v, 2, 4, s) - 0.5) * p.arch * 2.2 + (fbm(u, v, 3, 9, s + 7) - 0.5) * p.arch * 0.5;
      // one large, soft cathedral arch per tile (fronts only)
      const bu = (u - 0.5) / 0.26, bv = (v - 0.45) / 0.2;
      const hh = h + p.bump * Math.exp(-(bu * bu + bv * bv));
      const f = hh - Math.floor(hh);
      const e = 7 + 12 * vnoise(u, v, 3, 7, s + 11);
      const dark = Math.pow(Math.abs(Math.cos(f * Math.PI)), e);
      const lineAmp = 0.55 + 0.9 * vnoise(u, v, 2, 4, s + 30);
      const streak = (vnoise(u, v, 6, 220, s + 2) - 0.5) * p.fine + (vnoise(u, v, 24, 400, s + 3) - 0.5) * p.fine * 0.7;
      const tone = (fbm(u, v, 1, 2, s + 20) - 0.5) * p.tone * 2;
      let k = 1 - dark * p.rc * lineAmp + streak + tone;
      const pv = vnoise(u, v, 128, 512, s + 4);
      if (pv > 0.8) k -= p.pore * (pv - 0.8) * 5;
      const dk = k - 1;
      d[i] = clamp255(br * (1 + dk));
      d[i + 1] = clamp255(bg * (1 + dk * 1.1));
      d[i + 2] = clamp255(bb * (1 + dk * 1.3));
      d[i + 3] = 255;
      i += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Straight veneer for planner furniture: fine, nearly parallel growth lines along the canvas x axis, long soft tone
// drift and short pores. No arches, so doors and boards read as sliced veneer. It is meant to be mapped with about
// 1.6 m of texture along the grain and 0.6 m across (see planner/piece-geometry.js).
const VENEER = {
  oak:         { K: 44, rc: 0.10, e: 9,  fine: 0.06, pore: 0.20, tone: 0.035, seed: 101 },
  walnut:      { K: 34, rc: 0.14, e: 8,  fine: 0.07, pore: 0.14, tone: 0.05,  seed: 113 },
  ash:         { K: 50, rc: 0.08, e: 10, fine: 0.05, pore: 0.16, tone: 0.03,  seed: 127 },
  'birch-ply': { K: 90, rc: 0.05, e: 12, fine: 0.035, pore: 0.03, tone: 0.025, seed: 141 }
};
function veneerCanvas(mat, id) {
  const p = VENEER[id] || VENEER.oak;
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const [br, bg, bb] = hexToRgb(mat.color);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const h = v * p.K + (vnoise(u, v, 2, 5, p.seed) - 0.5) * 0.9 + (vnoise(u, v, 4, 24, p.seed + 3) - 0.5) * 0.35;
      const f = h - Math.floor(h);
      const dark = Math.pow(Math.abs(Math.cos(f * Math.PI)), p.e + 6 * vnoise(u, v, 2, 6, p.seed + 5));
      const amp = 0.5 + 0.9 * vnoise(u, v, 2, 8, p.seed + 7);
      const streak = (vnoise(u, v, 3, 260, p.seed + 2) - 0.5) * p.fine + (vnoise(u, v, 10, 420, p.seed + 9) - 0.5) * p.fine * 0.6;
      const tone = (vnoise(u, v, 1, 3, p.seed + 20) - 0.5) * p.tone * 2;
      let k = 1 - dark * p.rc * amp + streak + tone;
      const pv = vnoise(u, v, 48, 460, p.seed + 4);
      if (pv > 0.82) k -= p.pore * (pv - 0.82) * 5;
      const dk = k - 1;
      d[i] = clamp255(br * (1 + dk));
      d[i + 1] = clamp255(bg * (1 + dk * 1.08));
      d[i + 2] = clamp255(bb * (1 + dk * 1.25));
      d[i + 3] = 255;
      i += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function terrazzoCanvas(mat) {
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  const M = 256;
  const img = ctx.createImageData(M, M);
  const [br, bg, bb] = hexToRgb(mat.color);
  const chips = [[120, 112, 104], [196, 150, 120], [86, 92, 84], [232, 224, 210]];
  let i = 0;
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < M; x++) {
      const u = x / M, v = y / M;
      const base = 0.94 + vnoise(u, v, 32, 32, 3) * 0.1;
      let r = br * base, g = bg * base, b = bb * base;
      if (vnoise(u, v, 22, 22, 7) > 0.7 && vnoise(u, v, 90, 90, 9) > 0.35) {
        const pick = chips[Math.floor(vnoise(u, v, 5, 5, 13) * 3.99)];
        r = pick[0]; g = pick[1]; b = pick[2];
      }
      img.data[i] = clamp255(r); img.data[i + 1] = clamp255(g); img.data[i + 2] = clamp255(b); img.data[i + 3] = 255;
      i += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Floor textures. One tile covers TILE_M metres.
export const FLOOR_TILE_M = 1.12;

function plankCanvas(woodSource) {
  const S = 1024;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const rows = 8, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const seam = Math.floor(hash(r, 3, 5) * (S - 400)) + 200;
    [[0, seam], [seam, S]].forEach(([a, b], j) => {
      // every board starts at its own random place in the source, so no two look alike
      const sy = Math.floor(hash(r, j, 8) * (N - rh));
      const sx = Math.floor(hash(r, j, 9) * N);
      ctx.save();
      ctx.beginPath(); ctx.rect(a, r * rh, b - a, rh); ctx.clip();
      for (let x = a - sx; x < b; x += N) ctx.drawImage(woodSource, 0, sy, N, rh, x, r * rh, N, rh);
      const shade = (hash(r, j, 12) - 0.5) * 0.24;
      ctx.fillStyle = shade > 0 ? `rgba(255,236,205,${shade})` : `rgba(60,34,14,${-shade})`;
      ctx.fillRect(a, r * rh, b - a, rh);
      const warm = hash(r, j, 15);
      ctx.fillStyle = `rgba(${warm > 0.5 ? '190,120,60' : '120,110,95'},${0.05 + 0.06 * Math.abs(warm - 0.5)})`;
      ctx.fillRect(a, r * rh, b - a, rh);
      const g = ctx.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      g.addColorStop(0, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(0,0,0,.07)');
      ctx.fillStyle = g; ctx.fillRect(a, r * rh, b - a, rh);
      ctx.restore();
      ctx.fillStyle = 'rgba(40,26,12,.6)';
      ctx.fillRect(a, r * rh, 2.2, rh);
    });
    ctx.fillStyle = 'rgba(40,26,12,.62)';
    ctx.fillRect(0, r * rh, S, 2.6);
  }
  return c;
}

function concreteCanvas(hex) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  const [br, bg, bb] = hexToRgb(hex);
  let i = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const k = 0.9 + vnoise(u, v, 3, 3, 2) * 0.16 + vnoise(u, v, 12, 12, 4) * 0.07 + vnoise(u, v, 96, 96, 6) * 0.05;
    img.data[i] = clamp255(br * k); img.data[i + 1] = clamp255(bg * k); img.data[i + 2] = clamp255(bb * k); img.data[i + 3] = 255;
    i += 4;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tileCanvas(hex) {
  const S = 768;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const [br, bg, bb] = hexToRgb(hex);
  const n = 3, ts = S / n;
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
    const k = 0.93 + hash(r, q, 41) * 0.12;
    ctx.fillStyle = `rgb(${clamp255(br * k) | 0},${clamp255(bg * k) | 0},${clamp255(bb * k) | 0})`;
    ctx.fillRect(q * ts, r * ts, ts, ts);
    const g = ctx.createLinearGradient(q * ts, r * ts, (q + 1) * ts, (r + 1) * ts);
    g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,.08)');
    ctx.fillStyle = g; ctx.fillRect(q * ts, r * ts, ts, ts);
  }
  ctx.fillStyle = 'rgba(70,58,46,.75)';
  for (let r = 0; r <= n; r++) ctx.fillRect(0, r * ts - 2, S, 4);
  for (let q = 0; q <= n; q++) ctx.fillRect(q * ts - 2, 0, 4, S);
  return c;
}

function skyCanvas() {
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#9fcaf0'); g.addColorStop(0.55, '#dcecf6'); g.addColorStop(0.78, '#fbf3e0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#9db88a';
  ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(0, 205);
  ctx.bezierCurveTo(60, 180, 120, 215, 180, 190); ctx.bezierCurveTo(215, 178, 240, 192, 256, 188);
  ctx.lineTo(256, 256); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7ea06f';
  ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(0, 232);
  ctx.bezierCurveTo(80, 214, 150, 244, 256, 218); ctx.lineTo(256, 256); ctx.closePath(); ctx.fill();
  return c;
}

function hallCanvas() {
  const c = makeCanvas(128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#f2e7d3'); g.addColorStop(1, '#d8c5a6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return c;
}

export function createMaterialLib(THREE) {
  const cache = new Map();
  const texCache = new Map();
  const disposables = [];
  const aniso = 8;

  const tex = (key, make, { repeat = true, srgb = true } = {}) => {
    if (texCache.has(key)) return texCache.get(key);
    const t = new THREE.CanvasTexture(make());
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    texCache.set(key, t);
    disposables.push(t);
    return t;
  };

  const lib = {
    tileSize: 0.75,

    textured(id) {
      const m = MATERIALS[id];
      return !!(m && (m.grain || m.kind === 'stone'));
    },

    get(id) {
      if (cache.has(id)) return cache.get(id);
      const def = MATERIALS[id] || MATERIALS.oak;
      const opts = { color: def.color, roughness: def.roughness, metalness: def.metalness };
      if (def.grain) {
        const map = tex(`wood:${id}`, () => woodCanvas(def, id));
        opts.map = map; opts.color = 0xffffff;
        opts.bumpMap = map; opts.bumpScale = 0.9;
      } else if (def.kind === 'stone') {
        const map = tex(`stone:${id}`, () => terrazzoCanvas(def));
        opts.map = map; opts.color = 0xffffff;
      }
      const mat = new THREE.MeshStandardMaterial(opts);
      cache.set(id, mat); disposables.push(mat);
      return mat;
    },

    // Straight-grain veneer for furniture fronts and boards (falls back to get() for plain materials).
    veneer(id) {
      const def = MATERIALS[id];
      if (!def || !def.grain) return lib.get(id);
      const key = `veneer:${id}`;
      if (cache.has(key)) return cache.get(key);
      const map = tex(`veneer:${id}`, () => veneerCanvas(def, id));
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: def.roughness, metalness: def.metalness, bumpMap: map, bumpScale: 0.25 });
      cache.set(key, mat); disposables.push(mat);
      return mat;
    },

    // Matte or satin plain colour (decor, frames).
    plain(hex, roughness = 0.7, metalness = 0) {
      const key = `plain:${hex}:${roughness}:${metalness}`;
      if (cache.has(key)) return cache.get(key);
      const mat = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
      cache.set(key, mat); disposables.push(mat);
      return mat;
    },

    handle() { return lib.get('steel-black'); },

    glass() {
      if (cache.has('glass')) return cache.get('glass');
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd7e9ee, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2,
        envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide
      });
      cache.set('glass', mat); disposables.push(mat);
      return mat;
    },

    led() {
      if (cache.has('led')) return cache.get('led');
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a2620, emissive: 0xffd7a0, emissiveIntensity: 2.2, roughness: 0.5
      });
      cache.set('led', mat); disposables.push(mat);
      return mat;
    },

    // Soft warm halo that sits under each LED strip, so the light reads as a glow even in day mode.
    ledGlow() {
      if (cache.has('ledGlow')) return cache.get('ledGlow');
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,198,124,1)'); gr.addColorStop(0.3, 'rgba(255,178,92,.55)'); gr.addColorStop(0.65, 'rgba(255,160,70,.16)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map, color: 0xffb45a, transparent: true, opacity: 0.6, depthWrite: false });
      cache.set('ledGlow', mat); disposables.push(mat, map);
      return mat;
    },

    floorTexture(id, colorHex) {
      return tex(`floor:${id}:${colorHex}`, () => {
        if (/concrete/.test(id)) return concreteCanvas(colorHex);
        if (/tile/.test(id)) return tileCanvas(colorHex);
        return plankCanvas(woodCanvas(MATERIALS.oak, 'oak', colorHex, 100, { K: 14, arch: 0.8, bump: 0, rc: 0.12, fine: 0.07, pore: 0.14, tone: 0.06 }));
      });
    },
    floorTileMetres(id) { return /tile/.test(id) ? 0.9 : FLOOR_TILE_M; },

    skyTexture() { return tex('sky', skyCanvas, { repeat: false }); },
    hallTexture() { return tex('hall', hallCanvas, { repeat: false }); },

    dispose() {
      disposables.forEach((d) => d.dispose());
      cache.clear(); texCache.clear();
    }
  };
  return lib;
}
