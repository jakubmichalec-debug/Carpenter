// Design model: pure data and helpers, no DOM, no Three.js. All lengths in cm.
// Shapes are specified in CONTRACTS.md.

export const MATERIALS = {
  oak:               { label: 'Oak',              kind: 'wood',    color: '#c19a6b', roughness: 0.62, metalness: 0,   pricePerM2: 220, grain: true },
  walnut:            { label: 'Walnut',           kind: 'wood',    color: '#6b4a36', roughness: 0.58, metalness: 0,   pricePerM2: 290, grain: true },
  ash:               { label: 'Ash',              kind: 'wood',    color: '#d9c7a3', roughness: 0.65, metalness: 0,   pricePerM2: 180, grain: true },
  'birch-ply':       { label: 'Birch plywood',    kind: 'ply',     color: '#e3cfa6', roughness: 0.7,  metalness: 0,   pricePerM2: 70,  grain: true },
  'lacquer-white':   { label: 'Lacquer, white',   kind: 'lacquer', color: '#f1eee8', roughness: 0.35, metalness: 0,   pricePerM2: 150, grain: false },
  'lacquer-sage':    { label: 'Lacquer, sage',    kind: 'lacquer', color: '#8fa38b', roughness: 0.35, metalness: 0,   pricePerM2: 160, grain: false },
  'lacquer-charcoal':{ label: 'Lacquer, charcoal',kind: 'lacquer', color: '#34383c', roughness: 0.35, metalness: 0,   pricePerM2: 160, grain: false },
  'lacquer-clay':    { label: 'Lacquer, clay',    kind: 'lacquer', color: '#b8715a', roughness: 0.35, metalness: 0,   pricePerM2: 160, grain: false },
  terrazzo:          { label: 'Terrazzo',         kind: 'stone',   color: '#cfc8bd', roughness: 0.45, metalness: 0,   pricePerM2: 600, grain: false },
  // Handles only: pickable:false keeps it out of the material pickers.
  'steel-black':     { label: 'Black steel',      kind: 'lacquer', color: '#1c1d1f', roughness: 0.4,  metalness: 0.8, pricePerM2: 0,   grain: false, pickable: false }
};

export const FLOORS = {
  'oak-floor':      { label: 'Oak boards',    color: '#b98f60' },
  'ash-floor':      { label: 'Pale ash',      color: '#d8c4a0' },
  'concrete-floor': { label: 'Polished concrete', color: '#9a9a96' },
  'tile-floor':     { label: 'Warm tile',     color: '#c9b9a4' }
};

export const WALL_COLORS = {
  chalk: { label: 'Chalk',  color: '#eeeae2' },
  sage:  { label: 'Sage',   color: '#c5cdbd' },
  clay:  { label: 'Clay',   color: '#d9b6a2' },
  stone: { label: 'Stone',  color: '#c9c4ba' },
  ink:   { label: 'Ink',    color: '#3b4450' }
};

export const HANDLES = ['bar', 'knob', 'push', 'groove'];
export const DOOR_MODES = ['hinged', 'sliding', 'open', 'glass', 'none'];
export const INTERIORS = ['shelves', 'rail', 'mixed', 'shoe'];

const ALL_DOORS = DOOR_MODES;
const SHELVES = ['shelves'];

const base = (o) => ({
  x: 0, elevation: 0, sections: 1, doors: 'hinged', drawers: 0, interior: 'shelves',
  handle: 'bar', plinth: true, led: false, body: 'birch-ply', front: 'oak', worktop: null, ...o
});

export const MODULE_TYPES = {
  wardrobe: {
    label: 'Wardrobe', icon: 'wardrobe', freestanding: false,
    defaults: base({ width: 200, height: 240, depth: 60, sections: 2, drawers: 2, front: 'oak' }),
    limits: { width: [60, 400], height: [180, 300], depth: [40, 70], elevation: [0, 0] },
    allowed: { doors: ALL_DOORS, interior: INTERIORS, worktop: false, maxDrawers: 12 }
  },
  'kitchen-base': {
    label: 'Base cabinet', icon: 'kitchen-base', freestanding: false,
    defaults: base({ width: 60, height: 87, depth: 60, drawers: 1, front: 'lacquer-sage', worktop: 'terrazzo' }),
    limits: { width: [30, 120], height: [80, 95], depth: [50, 70], elevation: [0, 0] },
    allowed: { doors: ['hinged', 'open', 'none'], interior: SHELVES, worktop: true, maxDrawers: 6 }
  },
  'kitchen-wall': {
    label: 'Wall cabinet', icon: 'kitchen-wall', freestanding: false,
    defaults: base({ width: 60, height: 70, depth: 35, elevation: 140, plinth: false, front: 'lacquer-sage' }),
    limits: { width: [30, 120], height: [30, 100], depth: [25, 45], elevation: [100, 180] },
    allowed: { doors: ['hinged', 'glass', 'open', 'none'], interior: SHELVES, worktop: false, maxDrawers: 0 }
  },
  'tall-cabinet': {
    label: 'Tall cabinet', icon: 'tall-cabinet', freestanding: false,
    defaults: base({ width: 60, height: 220, depth: 60, front: 'lacquer-white' }),
    limits: { width: [40, 120], height: [180, 300], depth: [40, 70], elevation: [0, 0] },
    allowed: { doors: ['hinged', 'glass', 'open', 'none'], interior: ['shelves', 'rail', 'mixed'], worktop: false, maxDrawers: 6 }
  },
  island: {
    label: 'Island', icon: 'island', freestanding: true,
    defaults: base({ width: 180, height: 90, depth: 90, sections: 3, drawers: 3, front: 'lacquer-charcoal', worktop: 'terrazzo', z: 150 }),
    limits: { width: [80, 300], height: [80, 100], depth: [60, 120], elevation: [0, 0] },
    allowed: { doors: ['hinged', 'open', 'none'], interior: SHELVES, worktop: true, maxDrawers: 8 }
  },
  shelving: {
    label: 'Shelving', icon: 'shelving', freestanding: false,
    defaults: base({ width: 100, height: 200, depth: 30, sections: 2, doors: 'open', plinth: false, body: 'ash', front: 'ash' }),
    limits: { width: [40, 400], height: [60, 300], depth: [20, 45], elevation: [0, 120] },
    allowed: { doors: ['open', 'none', 'glass', 'hinged'], interior: SHELVES, worktop: false, maxDrawers: 0 }
  },
  desk: {
    label: 'Desk', icon: 'desk', freestanding: false,
    defaults: base({ width: 140, height: 75, depth: 65, doors: 'none', drawers: 2, plinth: false, front: 'walnut' }),
    limits: { width: [80, 260], height: [70, 80], depth: [50, 90], elevation: [0, 0] },
    allowed: { doors: ['none', 'open', 'hinged'], interior: SHELVES, worktop: true, maxDrawers: 4 }
  },
  table: {
    label: 'Table', icon: 'table', freestanding: true,
    defaults: base({ width: 180, height: 75, depth: 90, doors: 'none', plinth: false, front: 'oak', z: 120 }),
    limits: { width: [80, 300], height: [70, 78], depth: [60, 120], elevation: [0, 0] },
    allowed: { doors: ['none'], interior: SHELVES, worktop: true, maxDrawers: 0 }
  },
  bench: {
    label: 'Bench', icon: 'bench', freestanding: false,
    defaults: base({ width: 120, height: 45, depth: 40, doors: 'none', plinth: false, front: 'oak' }),
    limits: { width: [60, 260], height: [38, 55], depth: [30, 50], elevation: [0, 0] },
    allowed: { doors: ['none', 'open'], interior: SHELVES, worktop: true, maxDrawers: 0 }
  },
  'window-seat': {
    label: 'Window seat', icon: 'window-seat', freestanding: false,
    defaults: base({ width: 160, height: 45, depth: 45, sections: 2, plinth: false, body: 'birch-ply', front: 'ash' }),
    limits: { width: [80, 300], height: [35, 55], depth: [35, 60], elevation: [0, 0] },
    allowed: { doors: ['hinged', 'open', 'none'], interior: SHELVES, worktop: false, maxDrawers: 4 }
  }
};

export const ROOM_LIMITS = { width: [200, 900], height: [220, 400], depth: [250, 800] };
const MAX_MODULES = 60;
const MAX_OPENINGS = 10;
const BIG_ROOM = { width: 900, height: 400, depth: 800 };

// ---------- helpers ----------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toInt = (v, fallback) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
const pickable = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(MATERIALS, id) && MATERIALS[id].pickable !== false;
const has = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
const safeId = (v, fallback) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : fallback);

export function cloneDesign(d) {
  return JSON.parse(JSON.stringify(d));
}

const DEFAULT_ROOM = {
  width: 420, height: 260, depth: 380, floor: 'oak-floor', wall: 'chalk',
  openings: [{ id: 'o1', type: 'window', x: 260, y: 90, w: 120, h: 130 }]
};

function clampOpening(o, room, i) {
  const type = o && o.type === 'door' ? 'door' : 'window';
  const [wMin, wMax] = type === 'door' ? [70, 130] : [30, 400];
  const [hMin, hMax] = type === 'door' ? [190, 240] : [30, 300];
  const w = clamp(toInt(o && o.w, type === 'door' ? 90 : 120), wMin, Math.min(wMax, room.width));
  const h = clamp(toInt(o && o.h, type === 'door' ? 210 : 130), hMin, Math.min(hMax, room.height));
  const x = clamp(toInt(o && o.x, 0), 0, room.width - w);
  const y = type === 'door' ? 0 : clamp(toInt(o && o.y, 90), 0, room.height - h);
  return { id: safeId(o && o.id, `o${i + 1}`), type, x, y, w, h };
}

export function clampRoom(room) {
  const r = room && typeof room === 'object' ? room : {};
  const width = clamp(toInt(r.width, DEFAULT_ROOM.width), ...ROOM_LIMITS.width);
  const height = clamp(toInt(r.height, DEFAULT_ROOM.height), ...ROOM_LIMITS.height);
  const depth = clamp(toInt(r.depth, DEFAULT_ROOM.depth), ...ROOM_LIMITS.depth);
  const out = {
    width, height, depth,
    floor: has(FLOORS, r.floor) ? r.floor : DEFAULT_ROOM.floor,
    wall: has(WALL_COLORS, r.wall) ? r.wall : DEFAULT_ROOM.wall,
    openings: []
  };
  const src = Array.isArray(r.openings) ? r.openings : (r.openings === undefined ? DEFAULT_ROOM.openings : []);
  const seen = new Set();
  src.slice(0, MAX_OPENINGS).forEach((o, i) => {
    if (!o || typeof o !== 'object') return;
    const c = clampOpening(o, out, i);
    let id = c.id;
    for (let n = 1; seen.has(id); n++) id = `o${i + 1}_${n}`;
    seen.add(id);
    out.openings.push({ ...c, id });
  });
  return out;
}

export function clampModule(module, room) {
  const rm = { ...BIG_ROOM, ...(room || {}) };
  const m = module && typeof module === 'object' ? module : {};
  const type = has(MODULE_TYPES, m.type) ? m.type : 'wardrobe';
  const T = MODULE_TYPES[type];
  const d = T.defaults;
  const L = T.limits;

  const elevation = clamp(toInt(m.elevation, d.elevation), L.elevation[0], Math.max(L.elevation[0], Math.min(L.elevation[1], rm.height - L.height[0])));
  const width = clamp(toInt(m.width, d.width), L.width[0], Math.max(L.width[0], Math.min(L.width[1], rm.width)));
  const height = clamp(toInt(m.height, d.height), L.height[0], Math.max(L.height[0], Math.min(L.height[1], rm.height - elevation)));
  const depth = clamp(toInt(m.depth, d.depth), L.depth[0], L.depth[1]);
  const x = clamp(toInt(m.x, d.x), 0, Math.max(0, rm.width - width));

  const out = {
    id: safeId(m.id, 'm0'),
    type, x, width, height, depth, elevation,
    sections: clamp(toInt(m.sections, d.sections), 1, 8),
    doors: T.allowed.doors.includes(m.doors) ? m.doors : (T.allowed.doors.includes(d.doors) ? d.doors : T.allowed.doors[0]),
    drawers: clamp(toInt(m.drawers, d.drawers), 0, T.allowed.maxDrawers),
    interior: T.allowed.interior.includes(m.interior) ? m.interior : T.allowed.interior[0],
    handle: HANDLES.includes(m.handle) ? m.handle : d.handle,
    plinth: m.plinth === undefined ? !!d.plinth : !!m.plinth,
    led: m.led === undefined ? !!d.led : !!m.led,
    body: pickable(m.body) ? m.body : d.body,
    front: pickable(m.front) ? m.front : d.front,
    worktop: T.allowed.worktop ? (pickable(m.worktop) ? m.worktop : (m.worktop === undefined ? d.worktop : null)) : null
  };
  if (T.freestanding) {
    const dz = d.z === undefined ? 100 : d.z;
    out.z = clamp(toInt(m.z, dz), 0, Math.max(0, rm.depth - depth));
  }
  return out;
}

export function createModule(type, overrides = {}) {
  if (!has(MODULE_TYPES, type)) throw new Error(`Unknown module type: ${type}`);
  createModule.counter = (createModule.counter || 0) + 1;
  const id = overrides.id ?? `m${createModule.counter}`;
  return clampModule({ ...MODULE_TYPES[type].defaults, ...overrides, id, type }, BIG_ROOM);
}

export function clampDesign(design) {
  const d = design && typeof design === 'object' ? design : {};
  const room = clampRoom(d.room);
  const modules = [];
  const seen = new Set();
  const src = Array.isArray(d.modules) ? d.modules : [];
  for (const raw of src.slice(0, MAX_MODULES)) {
    if (!raw || typeof raw !== 'object' || !has(MODULE_TYPES, raw.type)) continue;
    const m = clampModule(raw, room);
    let id = typeof raw.id === 'string' && safeId(raw.id, null) ? raw.id : null;
    if (!id || seen.has(id)) { let n = 1; while (seen.has(`m${n}`)) n++; id = `m${n}`; }
    seen.add(id);
    modules.push({ ...m, id });
  }
  return { v: 1, room, modules };
}

export function createDesign() {
  const room = clampRoom(DEFAULT_ROOM);
  return {
    v: 1,
    room,
    modules: [
      createModule('wardrobe', { id: 'm1', x: 0, width: 200, height: 240, sections: 2, doors: 'hinged', drawers: 2, interior: 'shelves', body: 'birch-ply', front: 'oak' }),
      // 140 cm walnut desk under the window: top at 75 cm, window sill at 90 cm.
      createModule('desk', { id: 'm2', x: 250, width: 140, front: 'walnut', worktop: null })
    ]
  };
}

// ---------- geometry ----------
const isWall = (m) => !MODULE_TYPES[m.type].freestanding;
const vOverlap = (a, b) => a.elevation < b.elevation + b.height && b.elevation < a.elevation + a.height;
const xOverlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width;

export function findCollisions(design) {
  const wall = design.modules.filter(isWall);
  const out = [];
  for (let i = 0; i < wall.length; i++) {
    for (let j = i + 1; j < wall.length; j++) {
      if (xOverlap(wall[i], wall[j]) && vOverlap(wall[i], wall[j])) out.push([wall[i].id, wall[j].id]);
    }
  }
  return out;
}

export function validate(design) {
  const errors = [];
  const byId = Object.fromEntries(design.modules.map((m) => [m.id, m]));
  const name = (m) => MODULE_TYPES[m.type].label;
  for (const [a, b] of findCollisions(design)) {
    errors.push({ moduleId: a, code: 'overlap', message: `${name(byId[a])} overlaps ${name(byId[b]).toLowerCase()} (${b}).` });
  }
  for (const m of design.modules) {
    if (m.elevation + m.height > design.room.height) {
      errors.push({ moduleId: m.id, code: 'too-tall', message: `${name(m)} is taller than the ${design.room.height} cm ceiling.` });
    }
    if (!isWall(m)) continue;
    for (const o of design.room.openings) {
      const hit = m.x < o.x + o.w && o.x < m.x + m.width && m.elevation < o.y + o.h && o.y < m.elevation + m.height;
      if (hit) errors.push({ moduleId: m.id, code: 'blocks-opening', message: `${name(m)} covers the ${o.type}.` });
    }
  }
  return { ok: errors.length === 0, errors };
}

// ---------- edits ----------
const nextId = (design) => {
  const ids = new Set(design.modules.map((m) => m.id));
  let n = 1;
  while (ids.has(`m${n}`)) n++;
  return `m${n}`;
};

function firstFreeX(design, cand) {
  const blockers = design.modules
    .filter((m) => isWall(m) && vOverlap(m, cand))
    .map((m) => [m.x, m.x + m.width])
    .sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [s, e] of blockers) {
    if (s - cursor >= cand.width) return cursor;
    cursor = Math.max(cursor, e);
  }
  return design.room.width - cursor >= cand.width ? cursor : 0;
}

export function addModule(design, type, overrides = {}) {
  const next = cloneDesign(design);
  const id = overrides.id && !next.modules.some((m) => m.id === overrides.id) ? overrides.id : nextId(next);
  let m = createModule(type, { ...overrides, id });
  m = clampModule(m, next.room);
  if (overrides.x === undefined) {
    if (MODULE_TYPES[type].freestanding) m.x = Math.round((next.room.width - m.width) / 2);
    else m.x = firstFreeX(next, m);
    m = clampModule(m, next.room);
  }
  next.modules.push(m);
  return next;
}

export function updateModule(design, id, patch) {
  const next = cloneDesign(design);
  const i = next.modules.findIndex((m) => m.id === id);
  if (i < 0) return next;
  next.modules[i] = clampModule({ ...next.modules[i], ...patch, id }, next.room);
  return next;
}

export function removeModule(design, id) {
  const next = cloneDesign(design);
  next.modules = next.modules.filter((m) => m.id !== id);
  return next;
}

export function moveModule(design, id, x) {
  const next = cloneDesign(design);
  const i = next.modules.findIndex((m) => m.id === id);
  if (i < 0) return next;
  const m = next.modules[i];
  let nx = toInt(x, m.x);
  if (isWall(m)) {
    const cands = [0, next.room.width - m.width];
    for (const o of next.modules) {
      if (o.id === id || !isWall(o) || !vOverlap(m, o)) continue;
      cands.push(o.x + o.width, o.x - m.width);
    }
    let best = null;
    for (const c of cands) {
      const dist = Math.abs(c - nx);
      if (dist <= 5 && (best === null || dist < Math.abs(best - nx))) best = c;
    }
    if (best !== null) nx = best;
  }
  next.modules[i] = clampModule({ ...m, x: nx }, next.room);
  return next;
}

export function updateRoom(design, patch) {
  const next = cloneDesign(design);
  next.room = clampRoom({ ...next.room, ...patch });
  next.modules = next.modules.map((m) => clampModule(m, next.room));
  return next;
}
