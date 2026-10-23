// Planner v2 model: pure data and helpers, no DOM, no Three.js. All lengths in cm.
// Shapes are specified in CONTRACTS.md, section "Planner v2".
import { FLOORS, WALL_COLORS, clampDesign } from '../configurator/model.js';
import {
  MATERIALS, isUsable, resolveMaterial, cleanSurface, thicknessOf, resolveHandleFinish, HANDLE_ALIASES, DESIGN_ALIASES
} from './materials.js';

export { MATERIALS, FLOORS, WALL_COLORS };

// ---------- the look of a piece: option lists (the materials themselves live in materials.js) ----------
export const HANDLES = ['bar', 'knob', 'cup', 'edge', 'push'];
export const HANDLE_SIZES = ['short', 'medium', 'long'];
export const DOOR_HANDLE_POS = ['auto', 'top', 'middle', 'bottom', 'full'];
export const DRAWER_HANDLE_POS = ['centre', 'top'];
export const DESIGNS = ['slab', 'shaker', 'glass', 'ribbed'];
export const EDGES = ['square', 'chamfer', 'round'];
export const BASES = ['none', 'recessed', 'flush', 'legs'];
export const TOPS = ['flush', 'overhang', 'cornice'];
export const GAPS = [2, 3, 4];            // mm between fronts
export const TOP_CAP = { flush: 0, overhang: 2.5, cornice: 5 };   // cm of height the top treatment takes
export const SCRIBE = { top: 2.5, side: 1.5 };                    // cm of filler strip when scribing is on
export const legCount = (width) => (width <= 120 ? 4 : width <= 240 ? 6 : 8);

// ---------- constants ----------
export const LAYOUT_T = 2;          // layout thickness of a side or divider (18 mm board + 2 mm reveal, rounded up)
export const GRID = 3.2;            // 32 mm system
export const MIN_BAY = 20;
export const FRONT_KINDS = ['hinged', 'sliding', 'open', 'glass', 'none'];
export const DOOR_SIDES = ['left', 'right', 'double', 'none'];
export const SWINGS = ['in-left', 'in-right', 'out-left', 'out-right'];
export const LIMITS = { height: [220, 400], skirting: [0, 20], pieces: 40, openings: 30, bays: 12, itemsPerBay: 24, walls: 24, coord: 5000 };

export const OPENING_TYPES = {
  door:     { label: 'Door',     width: [60, 200], height: [180, 260], bottom: [0, 0],   defaults: { width: 90,  height: 210, bottom: 0,  swing: 'in-left' } },
  window:   { label: 'Window',   width: [30, 600], height: [30, 300],  bottom: [0, 250], defaults: { width: 120, height: 130, bottom: 90 } },
  radiator: { label: 'Radiator', width: [20, 300], height: [20, 200],  bottom: [0, 150], defaults: { width: 80,  height: 60,  bottom: 15, depth: 10 } },
  socket:   { label: 'Socket',   width: [4, 20],   height: [4, 20],    bottom: [0, 200], defaults: { width: 8,   height: 8,   bottom: 30 } }
};

// ---------- small helpers ----------
const EPS = 1e-6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (n) => Math.round(n * 10) / 10 + 0; // + 0 turns -0 into 0
const toInt = (v, fallback) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
const toNum = (v, fallback) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const has = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
const safeId = (v, fallback) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : fallback);
const pickable = (id) => isUsable(id);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function cloneProject(p) {
  return JSON.parse(JSON.stringify(p));
}

// 32 mm system: multiples of 3.2 cm from the bay floor, rounded to 0.1 cm.
export const snapY = (y) => r1(Math.round(y / GRID) * GRID);
export const snapUp = (y) => r1(Math.ceil(y / GRID - 1e-9) * GRID);
export const snapDown = (y) => r1(Math.floor(y / GRID + 1e-9) * GRID);

// ---------- interior catalogue ----------
const pInt = (min, max, def) => ({ type: 'int', min, max, default: def });
const pEnum = (values, def) => ({ type: 'enum', values, default: def });
const pBool = (def) => ({ type: 'bool', default: def });

const FRONT_T = 1.9, BOX_T = 1.2, BOXBASE_T = 0.8, BOARD_T = 1.8;
const drawerBoxes = (c, h, count) => [
  { part: 'drawer-side', w: c.depth - 6, h: h - 5, t: BOX_T, qty: 2 * count, use: 'body' },
  { part: 'drawer-back', w: c.bayW - 5, h: h - 5, t: BOX_T, qty: count, use: 'body' },
  { part: 'drawer-bottom', w: c.bayW - 5, h: c.depth - 6, t: BOXBASE_T, qty: count, use: 'body' }
];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function def(label, o) {
  return {
    label, params: {},
    body: () => [0, 0], zone: () => null,
    needsDoor: () => false, minBay: { width: 0, height: 0 }, minDepth: 0,
    hardware: () => [], boards: () => [], handles: () => 0, minutes: () => 15,
    describe: () => label,
    ...o
  };
}

const stackOf = (it) => it.count * it.front;

export const ITEMS = {
  shelf: def('Shelf', {
    params: { material: pEnum(['body', 'glass'], 'body'), adjustable: pBool(true) },
    body: () => [0, BOARD_T], zone: () => [0, 18], minutes: () => 8,
    hardware: (it, c) => [
      ...(it.adjustable ? [{ key: 'shelfPin', qty: 4 }] : []),
      ...(it.material === 'glass' ? [{ key: 'glassM2', qty: (c.bayW * (c.depth - 3)) / 10000 }] : [])
    ],
    boards: (it, c) => (it.material === 'glass' ? [] : [{ part: 'shelf', w: c.bayW - 0.2, h: c.depth - 3, t: BOARD_T, qty: 1, use: 'body' }]),
    describe: (it) => (it.material === 'glass' ? 'Glass shelf' : 'Shelf')
  }),
  'rail-long': def('Long hanging rail', {
    body: () => [0, 4], zone: () => [-150, 4], minutes: () => 18,
    hardware: (it, c) => [{ key: 'railTube', qty: c.bayW / 100 }, { key: 'railSocket', qty: 2 }]
  }),
  'rail-short': def('Short hanging rail', {
    body: () => [0, 4], zone: () => [-95, 4], minutes: () => 18,
    hardware: (it, c) => [{ key: 'railTube', qty: c.bayW / 100 }, { key: 'railSocket', qty: 2 }]
  }),
  'double-hang': def('Double hanging', {
    body: () => [-95, 4], zone: () => [-190, 4], minutes: () => 32,
    hardware: (it, c) => [{ key: 'railTube', qty: (2 * c.bayW) / 100 }, { key: 'railSocket', qty: 4 }]
  }),
  'pull-down-rail': def('Pull-down rail', {
    body: () => [0, 10], zone: () => [-100, 10], minBay: { width: 0, height: 210 }, minutes: () => 35,
    hardware: () => [{ key: 'wardrobeLift', qty: 1 }]
  }),
  drawers: def('Drawer stack', {
    params: { count: pInt(1, 6, 3), front: pInt(12, 30, 20) },
    body: (it) => [0, stackOf(it)], zone: (it) => [0, stackOf(it)], minDepth: 35, minutes: (it) => it.count * 40,
    hardware: (it) => [{ key: 'runner', qty: it.count }],
    boards: (it, c) => [{ part: 'drawer-front', w: c.outerW - 0.3, h: it.front - 0.3, t: FRONT_T, qty: it.count, use: 'front' }, ...drawerBoxes(c, it.front, it.count)],
    handles: (it) => it.count,
    describe: (it) => plural(it.count, 'drawer')
  }),
  'inner-drawers': def('Drawers behind the door', {
    params: { count: pInt(1, 4, 2), front: pInt(12, 30, 18) },
    body: (it) => [0, stackOf(it)], zone: (it) => [0, stackOf(it)], needsDoor: () => true, minDepth: 35, minutes: (it) => it.count * 40,
    hardware: (it) => [{ key: 'runner', qty: it.count }],
    boards: (it, c) => [{ part: 'drawer-front', w: c.bayW - 5, h: it.front - 0.3, t: BOX_T, qty: it.count, use: 'body' }, ...drawerBoxes(c, it.front, it.count)],
    describe: (it) => `${plural(it.count, 'drawer')} behind the door`
  }),
  jewellery: def('Jewellery drawer', {
    params: { lining: pEnum(['grey', 'navy', 'sand', 'black'], 'grey') },
    body: () => [0, 8], zone: () => [0, 8], minDepth: 35, minutes: () => 55,
    hardware: () => [{ key: 'runner', qty: 1 }, { key: 'velvetTray', qty: 1 }],
    boards: (it, c) => [{ part: 'drawer-front', w: c.bayW - 5, h: 7.7, t: BOX_T, qty: 1, use: 'body' }, ...drawerBoxes(c, 8, 1)]
  }),
  'divided-drawer': def('Socks and underwear drawer', {
    params: { grid: pEnum(['3x4', '4x5'], '3x4') },
    body: () => [0, 15], zone: () => [0, 15], minDepth: 35, minutes: () => 60,
    hardware: () => [{ key: 'runner', qty: 1 }, { key: 'dividerGrid', qty: 1 }],
    boards: (it, c) => [{ part: 'drawer-front', w: c.outerW - 0.3, h: 14.7, t: FRONT_T, qty: 1, use: 'front' }, ...drawerBoxes(c, 15, 1)],
    handles: () => 1
  }),
  shoes: def('Shoe rack', {
    params: { rows: pInt(1, 4, 2), angled: pBool(true) },
    body: (it) => [0, 20 * it.rows], zone: (it) => [0, 20 * it.rows], minutes: (it) => 10 * it.rows,
    hardware: (it) => [{ key: 'shoeRail', qty: it.rows }],
    describe: (it) => `Shoe rack, ${plural(it.rows, 'row')}`
  }),
  'shoe-pullout': def('Pull-out shoe rack', {
    params: { rows: pInt(2, 4, 3) },
    body: (it) => [0, 22 * it.rows], zone: (it) => [0, 22 * it.rows], minDepth: 35, minutes: (it) => 30 + 8 * it.rows,
    hardware: (it) => [{ key: 'runner', qty: 1 }, { key: 'shoeRail', qty: it.rows }],
    boards: (it, c) => [{ part: 'rack-side', w: c.depth - 6, h: 22 * it.rows - 2, t: BOX_T, qty: 2, use: 'body' }],
    describe: (it) => `Pull-out shoe rack, ${it.rows} rows`
  }),
  'trouser-rack': def('Pull-out trouser rack', {
    body: () => [0, 70], zone: () => [0, 70], minBay: { width: 35, height: 0 }, minDepth: 35, minutes: () => 35,
    hardware: () => [{ key: 'sideRunner', qty: 1 }, { key: 'trouserRack', qty: 1 }]
  }),
  'tie-belt': def('Tie and belt rack', {
    params: { side: pEnum(['left', 'right'], 'left') },
    body: () => [0, 50], zone: () => [0, 50], minBay: { width: 25, height: 0 }, minutes: () => 25,
    hardware: () => [{ key: 'tieRack', qty: 1 }]
  }),
  'valet-rod': def('Valet rod', {
    params: { side: pEnum(['left', 'right'], 'left') },
    body: () => [0, 5], zone: () => [0, 5], minutes: () => 10,
    hardware: () => [{ key: 'valetRod', qty: 1 }]
  }),
  basket: def('Pull-out basket', {
    params: { material: pEnum(['wood', 'wire'], 'wood'), depth: pInt(15, 30, 20) },
    body: (it) => [0, it.depth], zone: (it) => [0, it.depth + 3], minDepth: 35, minutes: (it) => (it.material === 'wood' ? 40 : 25),
    hardware: (it) => [{ key: 'runner', qty: 1 }, ...(it.material === 'wire' ? [{ key: 'wireBasket', qty: 1 }] : [])],
    boards: (it, c) => (it.material === 'wood' ? drawerBoxes(c, it.depth, 1) : [])
  }),
  hamper: def('Laundry pull-out', {
    params: { bags: pInt(1, 2, 1) },
    body: () => [0, 60], zone: () => [0, 60], minBay: { width: 35, height: 0 }, minDepth: 35, minutes: () => 40,
    hardware: (it) => [{ key: 'runner', qty: 1 }, { key: 'hamperBag', qty: it.bags }],
    boards: (it, c) => [{ part: 'hamper-front', w: c.outerW - 0.3, h: 59.7, t: FRONT_T, qty: 1, use: 'front' }],
    handles: () => 1
  }),
  ironing: def('Fold-out ironing board', {
    body: () => [0, 110], zone: () => [0, 110], minBay: { width: 40, height: 0 }, minutes: () => 45,
    hardware: () => [{ key: 'ironingFitting', qty: 1 }]
  }),
  mirror: def('Mirror', {
    params: { mode: pEnum(['door', 'pull-out'], 'door') },
    body: (it) => (it.mode === 'pull-out' ? [0, 120] : [0, 0]),
    zone: (it) => (it.mode === 'pull-out' ? [0, 120] : null),
    needsDoor: (it) => it.mode === 'door', minutes: (it) => (it.mode === 'pull-out' ? 40 : 20),
    hardware: (it, c) => [
      { key: 'mirrorM2', qty: it.mode === 'pull-out' ? (c.bayW * 120) / 10000 : (c.bayW * Math.min(170, c.innerH)) / 10000 },
      ...(it.mode === 'pull-out' ? [{ key: 'runner', qty: 1 }] : [])
    ],
    describe: (it) => (it.mode === 'pull-out' ? 'Pull-out mirror' : 'Mirror inside the door')
  }),
  divider: def('Vertical divider', {
    params: { height: pInt(10, 300, 60), position: pInt(5, 400, null) },
    body: (it) => [0, it.height], minutes: () => 12,
    boards: (it, c) => [{ part: 'divider', w: c.depth - 3, h: it.height, t: BOARD_T, qty: 1, use: 'body' }]
  }),
  cubbies: def('Cubby grid', {
    params: { columns: pInt(1, 6, 3), rows: pInt(1, 6, 2) },
    body: (it) => [0, 30 * it.rows], zone: (it) => [0, 30 * it.rows], minutes: (it) => 10 * (it.rows + it.columns),
    boards: (it, c) => [
      { part: 'cubby-shelf', w: c.bayW - 0.2, h: c.depth - 3, t: BOARD_T, qty: it.rows - 1, use: 'body' },
      { part: 'cubby-divider', w: c.depth - 3, h: 28.2, t: BOARD_T, qty: (it.columns - 1) * it.rows, use: 'body' }
    ],
    describe: (it) => `Cubby grid ${it.columns} x ${it.rows}`
  }),
  hooks: def('Accessory hooks', {
    params: { count: pInt(3, 8, 4) },
    body: () => [0, 10], zone: () => [0, 10], minutes: () => 10,
    hardware: (it) => [{ key: 'hook', qty: it.count }],
    describe: (it) => `${it.count} hooks`
  }),
  led: def('LED strip', {
    params: { tone: pEnum(['warm', 'neutral'], 'warm'), sensor: pBool(false) },
    body: () => [0, 2], minutes: () => 14,
    hardware: (it, c) => [
      { key: 'ledM', qty: c.bayW / 100 }, { key: 'ledDriver', qty: 1 }, ...(it.sensor ? [{ key: 'ledSensor', qty: 1 }] : [])
    ]
  }),
  // Kitchen, desk and wall-unit palettes
  'cutlery-insert': def('Cutlery drawer', {
    params: { front: pInt(12, 20, 14) },
    body: (it) => [0, it.front], zone: (it) => [0, it.front], minDepth: 40, minutes: () => 50,
    hardware: () => [{ key: 'runner', qty: 1 }, { key: 'cutleryInsert', qty: 1 }],
    boards: (it, c) => [{ part: 'drawer-front', w: c.outerW - 0.3, h: it.front - 0.3, t: FRONT_T, qty: 1, use: 'front' }, ...drawerBoxes(c, it.front, 1)],
    handles: () => 1
  }),
  'pan-drawer': def('Pan drawer', {
    params: { count: pInt(1, 3, 2), front: pInt(22, 32, 26) },
    body: (it) => [0, stackOf(it)], zone: (it) => [0, stackOf(it)], minDepth: 40, minutes: (it) => it.count * 50,
    hardware: (it) => [{ key: 'runnerHeavy', qty: it.count }],
    boards: (it, c) => [{ part: 'drawer-front', w: c.outerW - 0.3, h: it.front - 0.3, t: FRONT_T, qty: it.count, use: 'front' }, ...drawerBoxes(c, it.front, it.count)],
    handles: (it) => it.count,
    describe: (it) => plural(it.count, 'pan drawer')
  }),
  'bin-pullout': def('Bin pull-out', {
    params: { bins: pInt(1, 2, 2) },
    body: () => [0, 45], zone: () => [0, 45], minBay: { width: 30, height: 0 }, minDepth: 40, minutes: () => 40,
    hardware: (it) => [{ key: 'runnerHeavy', qty: 1 }, { key: 'binSet', qty: it.bins }],
    describe: (it) => `Bin pull-out, ${plural(it.bins, 'bin')}`
  }),
  carousel: def('Corner carousel', {
    body: () => [0, 60], zone: () => [0, 60], minBay: { width: 60, height: 0 }, minutes: () => 45,
    hardware: () => [{ key: 'carousel', qty: 1 }]
  }),
  'cable-tray': def('Cable tray', {
    body: () => [0, 6], zone: () => [0, 6], minutes: () => 15,
    hardware: () => [{ key: 'cableTray', qty: 1 }]
  }),
  'keyboard-drawer': def('Keyboard drawer', {
    body: () => [0, 8], zone: () => [0, 8], minBay: { width: 60, height: 0 }, minDepth: 40, minutes: () => 40,
    hardware: () => [{ key: 'keyboardRunner', qty: 1 }],
    boards: (it, c) => [{ part: 'drawer-front', w: c.bayW - 0.2, h: 7.7, t: FRONT_T, qty: 1, use: 'front' }]
  }),
  'book-shelf': def('Book shelf', {
    body: () => [0, BOARD_T], zone: () => [0, 25], minutes: () => 8,
    boards: (it, c) => [{ part: 'shelf', w: c.bayW - 0.2, h: c.depth - 1, t: BOARD_T, qty: 1, use: 'body' }]
  }),
  'media-niche': def('Media niche', {
    body: () => [0, 45], zone: () => [0, 45], minutes: () => 30,
    boards: (it, c) => [{ part: 'shelf', w: c.bayW - 0.2, h: c.depth - 1, t: BOARD_T, qty: 2, use: 'body' }]
  })
};

// ---------- item normalising ----------
export function itemBody(item) {
  const d = ITEMS[item && item.kind];
  return d ? d.body(item) : [0, 0];
}
export function itemZone(item) {
  const d = ITEMS[item && item.kind];
  return d ? d.zone(item) : null;
}
export function describeItem(item) {
  const d = ITEMS[item && item.kind];
  return d ? d.describe(item) : 'Unknown item';
}

function normParam(spec, v) {
  if (spec.type === 'int') return clamp(toInt(v, spec.default), spec.min, spec.max);
  if (spec.type === 'enum') return spec.values.includes(v) ? v : spec.default;
  return v === undefined ? spec.default : !!v;
}

// ctx: { bayWidth, innerH }. Returns null for an unknown kind.
export function normalizeItem(raw, ctx = {}) {
  if (!isObj(raw) || !has(ITEMS, raw.kind)) return null;
  const d = ITEMS[raw.kind];
  const out = { kind: raw.kind, y: 0 };
  const bayW = Number.isFinite(ctx.bayWidth) ? ctx.bayWidth : 80;
  const innerH = Number.isFinite(ctx.innerH) ? ctx.innerH : 226;
  for (const [name, spec] of Object.entries(d.params)) {
    if (name === 'position') {
      const p = raw.position === undefined || raw.position === null ? Math.round(bayW / 2) : toInt(raw.position, Math.round(bayW / 2));
      out.position = clamp(p, 5, Math.max(5, Math.round(bayW) - 5));
    } else {
      out[name] = normParam(spec, raw[name]);
    }
  }
  const [blo, bhi] = d.body(out);
  const lo = Math.max(0, -blo);
  const hi = Math.max(lo, innerH - bhi);
  const sLo = snapUp(lo), sHi = snapDown(hi);
  const y = snapY(toNum(raw.y, 0));
  out.y = sLo <= sHi ? clamp(y, sLo, sHi) : r1(clamp(y, lo, hi));
  return out;
}

// Height of the drawer and pull-out fronts that sit in front of a bay (they carry handles); a door is cut around them.
export function visibleFrontHeight(items) {
  let h = 0;
  for (const it of items || []) {
    const d = ITEMS[it && it.kind];
    if (d && d.handles(it) > 0) h += d.body(it)[1];
  }
  return h;
}

// ---------- presets ----------
// build(ctx) returns raw items. ctx: { innerH, bayW, from, type }; `from` is where free space starts.
const shelvesFrom = (ctx, from, pitch = 35.2) => {
  const out = [];
  let y = from > 0 ? snapUp(from) : snapY(pitch);
  while (y + 18 <= ctx.innerH + EPS) {
    out.push({ kind: 'shelf', y });
    y = r1(y + pitch);
  }
  return out;
};
const drawerFront = (type) => (type === 'desk' ? 14 : type === 'window-seat' ? 18 : 20);

export const PRESETS = {
  'hanging-shelf': {
    label: 'Hanging + shelf', types: ['wardrobe', 'tall-cabinet', 'under-stairs'],
    build(c) {
      const from = c.from || 0;
      const shelfY = snapDown(c.innerH - 25);
      const railY = snapDown(shelfY - 6);
      const items = [{ kind: 'shelf', y: shelfY }];
      let lo;
      if (railY - 150 >= from) { items.push({ kind: 'rail-long', y: railY }); lo = railY - 150; }
      else if (railY - 95 >= from) { items.push({ kind: 'rail-short', y: railY }); lo = railY - 95; }
      else return shelvesFrom(c, from);
      const shoeY = snapUp(from);
      if (lo - shoeY >= 40) items.push({ kind: 'shoes', y: shoeY, rows: 2 });
      return items;
    }
  },
  'double-hanging': {
    label: 'Double hanging', types: ['wardrobe', 'tall-cabinet'],
    build(c) {
      const from = c.from || 0;
      const y = snapDown(c.innerH - 12);
      if (y - 190 >= from) return [{ kind: 'double-hang', y }, { kind: 'led', y: snapDown(c.innerH - 2) }];
      return PRESETS['hanging-shelf'].build(c);
    }
  },
  shelves: {
    label: 'Shelves', types: ['wardrobe', 'tall-cabinet', 'kitchen-base', 'kitchen-wall', 'wall-unit', 'desk', 'window-seat', 'under-stairs', 'island'],
    build: (c) => shelvesFrom(c, c.from || 0)
  },
  'drawers-shelves': {
    label: 'Drawers + shelves', types: ['wardrobe', 'tall-cabinet', 'wall-unit', 'under-stairs', 'window-seat'],
    build(c) {
      const front = drawerFront(c.type);
      const count = clamp(Math.floor((c.innerH * 0.35) / front), 1, 4);
      const stack = count * front;
      return [{ kind: 'drawers', y: 0, count, front }, ...shelvesFrom(c, stack)];
    }
  },
  shoes: {
    label: 'Shoes', types: ['wardrobe', 'tall-cabinet', 'under-stairs'],
    build(c) {
      const items = [];
      let y = snapUp(c.from || 0);
      for (;;) {
        const room = c.innerH - y;
        const rows = Math.min(4, Math.floor(room / 20));
        if (rows < 1) break;
        items.push({ kind: 'shoes', y, rows });
        y = snapUp(y + rows * 20);
        if (items.length >= 4) break;
      }
      return items;
    }
  },
  dressing: {
    label: 'Dressing', types: ['wardrobe', 'tall-cabinet'],
    build(c) {
      let y = snapUp(c.from || 0);
      const items = [{ kind: 'jewellery', y }];
      y = snapUp(y + 8);
      items.push({ kind: 'divided-drawer', y });
      y = snapUp(y + 15);
      if (y + 70 <= c.innerH) { items.push({ kind: 'trouser-rack', y }); }
      items.push({ kind: 'mirror', y: 0, mode: 'door' });
      return items;
    }
  },
  'kitchen-drawers': {
    label: 'Cutlery and pan drawers', types: ['kitchen-base', 'island'],
    build(c) {
      const items = [{ kind: 'cutlery-insert', y: 0, front: 14 }];
      const y = snapUp(14);
      const front = 26;
      const count = Math.max(1, Math.min(3, Math.floor((c.innerH - y) / front)));
      items.push({ kind: 'pan-drawer', y, count, front });
      return items;
    }
  },
  'kitchen-bin': {
    label: 'Bin pull-out', types: ['kitchen-base', 'island'],
    build: (c) => [{ kind: 'bin-pullout', y: 0, bins: 2 }, { kind: 'shelf', y: snapUp(50) }]
  },
  'desk-drawers': {
    label: 'Desk drawers', types: ['desk'],
    build(c) {
      const front = 18;
      const count = clamp(Math.floor(c.innerH / front), 1, 4);
      return [{ kind: 'drawers', y: 0, count, front }];
    }
  },
  'desk-open': {
    label: 'Open desk bay', types: ['desk'],
    build: (c) => [{ kind: 'cable-tray', y: snapDown(c.innerH - 6) }, { kind: 'book-shelf', y: snapY(35.2) }]
  },
  'seat-baskets': {
    label: 'Seat baskets', types: ['window-seat'],
    build: (c) => [{ kind: 'basket', y: 0, depth: Math.max(15, Math.min(30, Math.floor(c.innerH - 6))) }]
  }
};

export function presetsFor(type) {
  return Object.entries(PRESETS).filter(([, p]) => p.types.includes(type)).map(([id, p]) => ({ id, label: p.label }));
}

const DEFAULT_PRESETS = {
  wardrobe: ['hanging-shelf', 'drawers-shelves', 'double-hanging', 'shelves'],
  'tall-cabinet': ['shelves', 'drawers-shelves'],
  'kitchen-base': ['kitchen-drawers'],
  island: ['kitchen-drawers', 'kitchen-bin'],
  'kitchen-wall': ['shelves'],
  'wall-unit': ['shelves'],
  desk: ['desk-drawers', 'desk-open'],
  table: [],
  'window-seat': ['seat-baskets'],
  'under-stairs': ['drawers-shelves']
};

// ---------- types and styles ----------
const ALL_FRONTS = FRONT_KINDS;
const WARDROBE_PALETTE = ['shelf', 'rail-long', 'rail-short', 'double-hang', 'pull-down-rail', 'drawers', 'inner-drawers', 'jewellery', 'divided-drawer', 'shoes', 'shoe-pullout', 'trouser-rack', 'tie-belt', 'valet-rod', 'basket', 'hamper', 'ironing', 'mirror', 'divider', 'cubbies', 'hooks', 'led'];
const KITCHEN_PALETTE = ['shelf', 'drawers', 'inner-drawers', 'pan-drawer', 'cutlery-insert', 'bin-pullout', 'carousel', 'basket', 'divider', 'led'];

export const TYPES = {
  wardrobe: {
    label: 'Wardrobe', icon: 'wardrobe', freestanding: false, defaultStyle: 'flat-oak',
    defaults: { width: 240, height: 240, depth: 60, elevation: 0, plinth: 10, worktop: null, fronts: 'hinged', bays: 3 },
    limits: { width: [60, 500], height: [180, 300], depth: [35, 70], elevation: [0, 0], bays: [1, 8] },
    allowedFronts: ALL_FRONTS, allowPlinth: true, allowWorktop: false, palette: WARDROBE_PALETTE
  },
  'kitchen-base': {
    label: 'Base cabinet', icon: 'kitchen-base', freestanding: false, defaultStyle: 'sage-kitchen',
    defaults: { width: 60, height: 90, depth: 60, elevation: 0, plinth: 10, worktop: 'oak', fronts: 'hinged', bays: 1 },
    limits: { width: [30, 120], height: [80, 95], depth: [50, 70], elevation: [0, 0], bays: [1, 3] },
    allowedFronts: ['hinged', 'open', 'none'], allowPlinth: true, allowWorktop: true, palette: KITCHEN_PALETTE
  },
  'kitchen-wall': {
    label: 'Wall cabinet', icon: 'kitchen-wall', freestanding: false, defaultStyle: 'sage-kitchen',
    defaults: { width: 60, height: 70, depth: 35, elevation: 140, plinth: 0, worktop: null, fronts: 'hinged', bays: 1 },
    limits: { width: [30, 120], height: [30, 100], depth: [25, 45], elevation: [100, 180], bays: [1, 3] },
    allowedFronts: ['hinged', 'glass', 'open', 'none'], allowPlinth: false, allowWorktop: false, palette: ['shelf', 'divider', 'led', 'hooks']
  },
  'tall-cabinet': {
    label: 'Tall cabinet', icon: 'tall-cabinet', freestanding: false, defaultStyle: 'white-minimal',
    defaults: { width: 60, height: 220, depth: 60, elevation: 0, plinth: 10, worktop: null, fronts: 'hinged', bays: 1 },
    limits: { width: [40, 120], height: [180, 300], depth: [40, 70], elevation: [0, 0], bays: [1, 3] },
    allowedFronts: ['hinged', 'glass', 'open', 'none'], allowPlinth: true, allowWorktop: false,
    palette: ['shelf', 'rail-short', 'drawers', 'inner-drawers', 'pan-drawer', 'bin-pullout', 'shoes', 'basket', 'hamper', 'ironing', 'mirror', 'divider', 'cubbies', 'hooks', 'led']
  },
  'wall-unit': {
    label: 'Wall unit', icon: 'wall-unit', freestanding: false, defaultStyle: 'open-ash',
    defaults: { width: 100, height: 200, depth: 30, elevation: 0, plinth: 0, worktop: null, fronts: 'open', bays: 2 },
    limits: { width: [40, 400], height: [60, 300], depth: [20, 45], elevation: [0, 150], bays: [1, 8] },
    allowedFronts: ['open', 'none', 'glass', 'hinged'], allowPlinth: false, allowWorktop: false,
    palette: ['shelf', 'book-shelf', 'media-niche', 'divider', 'cubbies', 'drawers', 'inner-drawers', 'cable-tray', 'led']
  },
  desk: {
    label: 'Desk', icon: 'desk', freestanding: false, defaultStyle: 'walnut-grooved',
    defaults: { width: 140, height: 75, depth: 65, elevation: 0, plinth: 0, worktop: null, fronts: 'none', bays: 2 },
    limits: { width: [80, 300], height: [70, 80], depth: [50, 90], elevation: [0, 0], bays: [1, 4] },
    allowedFronts: ['none', 'open', 'hinged'], allowPlinth: false, allowWorktop: true,
    palette: ['shelf', 'book-shelf', 'drawers', 'keyboard-drawer', 'cable-tray', 'divider', 'cubbies', 'basket', 'led']
  },
  table: {
    label: 'Table', icon: 'table', freestanding: true, defaultStyle: 'flat-oak',
    defaults: { width: 180, height: 75, depth: 90, elevation: 0, plinth: 0, worktop: null, fronts: 'none', bays: 1 },
    limits: { width: [80, 300], height: [70, 78], depth: [60, 120], elevation: [0, 0], bays: [1, 1] },
    allowedFronts: ['none'], allowPlinth: false, allowWorktop: true, palette: []
  },
  'window-seat': {
    label: 'Window seat', icon: 'window-seat', freestanding: false, defaultStyle: 'flat-oak',
    defaults: { width: 160, height: 45, depth: 45, elevation: 0, plinth: 0, worktop: null, fronts: 'hinged', bays: 2 },
    limits: { width: [80, 350], height: [35, 55], depth: [35, 60], elevation: [0, 0], bays: [1, 6] },
    allowedFronts: ['hinged', 'open', 'none'], allowPlinth: false, allowWorktop: false,
    palette: ['shelf', 'drawers', 'basket', 'hamper', 'divider', 'cubbies', 'led']
  },
  'under-stairs': {
    label: 'Under-stairs storage', icon: 'under-stairs', freestanding: false, defaultStyle: 'white-minimal',
    defaults: { width: 120, height: 120, depth: 60, elevation: 0, plinth: 10, worktop: null, fronts: 'hinged', bays: 2 },
    limits: { width: [50, 300], height: [50, 250], depth: [40, 90], elevation: [0, 0], bays: [1, 5] },
    allowedFronts: ['hinged', 'sliding', 'open', 'none'], allowPlinth: true, allowWorktop: false,
    palette: ['shelf', 'drawers', 'inner-drawers', 'basket', 'shoes', 'shoe-pullout', 'hamper', 'bin-pullout', 'divider', 'cubbies', 'hooks', 'led']
  },
  island: {
    label: 'Island', icon: 'island', freestanding: true, defaultStyle: 'sage-kitchen',
    defaults: { width: 180, height: 90, depth: 90, elevation: 0, plinth: 10, worktop: 'oak', fronts: 'hinged', bays: 3 },
    limits: { width: [80, 400], height: [80, 100], depth: [60, 140], elevation: [0, 0], bays: [1, 6] },
    allowedFronts: ['hinged', 'open', 'none'], allowPlinth: true, allowWorktop: true, palette: KITCHEN_PALETTE
  }
};

// ---------- sizes: standard presets per type ----------
const SP = (label, width, height, depth) => ({ label, width, height, depth });
export const SIZE_PRESETS = {
  wardrobe: [SP('Slim, 100 cm', 100, 240, 55), SP('Standard, 150 cm', 150, 240, 60), SP('Wide, 240 cm', 240, 240, 60), SP('Wall to wall, 300 cm', 300, 260, 60)],
  'kitchen-base': [SP('Narrow, 40 cm', 40, 90, 60), SP('Standard, 60 cm', 60, 90, 60), SP('Wide, 90 cm', 90, 90, 60), SP('Extra wide, 120 cm', 120, 90, 60)],
  'kitchen-wall': [SP('Narrow, 40 cm', 40, 70, 35), SP('Standard, 60 cm', 60, 70, 35), SP('Tall, 60 x 90 cm', 60, 90, 35), SP('Wide, 90 cm', 90, 70, 35)],
  'tall-cabinet': [SP('Slim, 40 cm', 40, 220, 55), SP('Standard, 60 cm', 60, 220, 60), SP('Wide, 90 cm', 90, 220, 60)],
  'wall-unit': [SP('Small, 80 cm', 80, 120, 28), SP('Standard, 160 cm', 160, 200, 30), SP('Full wall, 300 cm', 300, 240, 35)],
  desk: [SP('Compact, 100 cm', 100, 75, 55), SP('Standard, 140 cm', 140, 75, 65), SP('Wide, 200 cm', 200, 75, 70)],
  table: [SP('Four seats, 140 cm', 140, 75, 80), SP('Six seats, 180 cm', 180, 75, 90), SP('Eight seats, 240 cm', 240, 75, 100)],
  'window-seat': [SP('Small, 120 cm', 120, 45, 40), SP('Standard, 160 cm', 160, 45, 45), SP('Long, 240 cm', 240, 45, 50)],
  'under-stairs': [SP('Small, 90 cm', 90, 100, 55), SP('Standard, 120 cm', 120, 120, 60), SP('Large, 180 cm', 180, 150, 70)],
  island: [SP('Small, 120 cm', 120, 90, 80), SP('Standard, 180 cm', 180, 90, 90), SP('Large, 240 cm', 240, 90, 100)]
};
for (const [id, t] of Object.entries(TYPES)) {
  t.sizePresets = SIZE_PRESETS[id];
  t.allowTop = ['wardrobe', 'tall-cabinet', 'kitchen-wall', 'wall-unit', 'under-stairs'].includes(id);
}

// ---------- styles: one click sets the whole look ----------
const LOOK0 = { design: 'slab', edge: 'square', glass: 'glass-clear', base: 'recessed', legs: 'wood', top: 'flush', gables: false, gap: 3, scribe: false, upper: null, split: null };
const FRONT0 = { kind: 'hinged', grainVertical: false, finish: 'matte', handleFinish: 'handle-black', handleSize: 'medium', doorHandle: 'auto', drawerHandle: 'centre' };
function style(label, blurb, o) {
  return {
    label, blurb, legacy: !!o.legacy,
    fronts: { ...FRONT0, ...o.fronts },
    carcass: o.carcass || 'birch-ply', carcassFinish: o.carcassFinish || 'matte',
    interior: o.interior || null,
    plinth: o.plinth === undefined ? 10 : o.plinth,
    worktop: o.worktop === undefined ? null : o.worktop,
    look: { ...LOOK0, ...o.look }
  };
}
const S = (material, handle, extra = {}) => ({ material, handle, ...extra });

export const STYLES = {
  // the twelve on offer
  'flat-oak':        style('Natural oak slab', 'Plain oak doors with bar handles.', { fronts: S('oak', 'bar', { grainVertical: true, handleFinish: 'handle-black' }) }),
  'shaker-sage':     style('Shaker sage and brass', 'Framed sage doors, brass knobs, a crown on top.', {
    fronts: S('sage', 'knob', { handleFinish: 'brass' }), worktop: 'oak', look: { design: 'shaker', top: 'cornice', scribe: true } }),
  'smoked-black':    style('Smoked oak and black', 'Deep brown oak, chamfered edges, black bars.', {
    fronts: S('oak-smoked', 'bar', { grainVertical: true, handleFinish: 'handle-black' }), carcass: 'black', look: { edge: 'chamfer' } }),
  'midcentury-walnut': style('Walnut mid-century', 'Walnut on slim legs with round knobs.', {
    fronts: S('walnut', 'knob', { grainVertical: true, handleFinish: 'brass' }), carcass: 'oak', plinth: 18, look: { base: 'legs', legs: 'wood', edge: 'round' } }),
  'white-minimal':   style('Chalk white handleless', 'Chalk white, tight gaps, push to open.', { fronts: S('chalk-white', 'push'), look: { gap: 2, scribe: true } }),
  'ink-oak':         style('Ink blue and oak', 'Ink blue below, oak above, brass bars.', {
    fronts: S('ink-blue', 'bar', { handleFinish: 'brass' }), look: { upper: { material: 'oak', finish: 'matte' } } }),
  'green-shaker':    style('Dark green shaker and brass', 'Dark green frames with brass cup pulls.', {
    fronts: S('dark-green', 'cup', { handleFinish: 'brass' }), look: { design: 'shaker' } }),
  'clay-oak':        style('Clay and oak', 'Clay doors with an oak inside and top.', {
    fronts: S('clay', 'bar', { handleFinish: 'wood' }), interior: { material: 'oak' }, worktop: 'oak', look: { edge: 'round' } }),
  'black-steel':     style('Black and brushed steel', 'Soft black on steel legs with steel bars.', {
    fronts: S('black', 'bar', { handleFinish: 'brushed' }), carcass: 'black', plinth: 15, look: { base: 'legs', legs: 'brushed' } }),
  'ribbed-oak':      style('Ribbed oak', 'Vertical ribs in oak with routed finger pulls.', {
    fronts: S('oak', 'edge', { grainVertical: true }), look: { design: 'ribbed' } }),
  'glass-oak':       style('Glass-front oak display', 'Slim oak frames with clear glass.', { fronts: S('oak', 'bar', { kind: 'glass', grainVertical: true, handleFinish: 'brass' }), look: { design: 'glass' } }),
  'birch-ply-edge':  style('Birch ply, exposed edge', 'Oiled birch plywood, layers showing on the edges.', {
    fronts: S('birch-ply', 'edge', { grainVertical: true }), look: { edge: 'square' } }),
  // earlier ids: still valid, shown only when a piece already uses one
  'walnut-grooved':  style('Walnut, finger pulls', 'Walnut with routed finger pulls.', { legacy: true, fronts: S('walnut', 'edge', { grainVertical: true }) }),
  'sage-kitchen':    style('Sage kitchen', 'Sage doors with an oak top.', { legacy: true, fronts: S('sage', 'bar'), worktop: 'oak' }),
  'charcoal-sliding':style('Black sliding', 'Sliding doors in soft black.', { legacy: true, fronts: S('black', 'edge', { kind: 'sliding' }) }),
  'open-ash':        style('Open ash', 'Open shelves in pale ash.', { legacy: true, fronts: S('ash', 'knob', { kind: 'open', grainVertical: true }), carcass: 'oak', plinth: 0, look: { base: 'none' } })
};

// The default split height for a two-tone piece: a bit above the middle.
export const defaultSplit = (height, plinth = 0) => Math.round(plinth + (height - plinth) * 0.6);

// Everything a style sets, made valid for a type: ids that are not in the material table fall back, so a style survives
// a change of stock.
export function styleBundle(type, styleId) {
  const T = TYPES[type];
  const st = STYLES[has(STYLES, styleId) ? styleId : T.defaultStyle];
  const f = st.fronts;
  const kind = T.defaults.fronts !== 'none' && T.allowedFronts.includes(f.kind) ? f.kind : T.defaults.fronts;
  const front = cleanSurface(f, 'front', { material: 'oak' });
  const handle = HANDLES.includes(HANDLE_ALIASES[f.handle] || f.handle) ? HANDLE_ALIASES[f.handle] || f.handle : 'bar';
  const look = { ...st.look };
  look.glass = resolveMaterial(look.glass, 'glass');
  look.upper = look.upper ? cleanSurface(look.upper, 'front', front) : null;
  look.legs = look.legs === 'wood' || isUsable(look.legs, 'handle') ? look.legs : 'wood';
  const plinth = T.allowPlinth && T.defaults.plinth > 0 ? st.plinth : 0;
  if (!T.allowPlinth || plinth === 0) look.base = 'none';
  else if (look.base === 'none') look.base = 'recessed';
  if (!T.allowTop) look.top = 'flush';
  return {
    fronts: {
      kind, material: front.material, finish: front.finish, handle,
      grainVertical: f.grainVertical,
      handleFinish: resolveHandleFinish(f.handleFinish, handle), handleSize: f.handleSize, doorHandle: f.doorHandle, drawerHandle: f.drawerHandle
    },
    carcass: cleanSurface({ material: st.carcass, finish: st.carcassFinish }, 'carcass', { material: 'birch-ply' }),
    interior: st.interior ? (st.interior.material === 'front' ? { material: 'front', finish: 'matte' } : isUsable(st.interior.material, 'interior') ? cleanSurface(st.interior, 'interior') : null) : null,
    plinth,
    worktop: T.allowWorktop ? (st.worktop !== null && isUsable(st.worktop, 'top') ? st.worktop : T.defaults.worktop) : null,
    look
  };
}

// ---------- piece geometry and clamping ----------
export function pieceGeometry(p, bays) {
  const T = TYPES[p.type];
  const n = Math.max(1, bays || (Array.isArray(p.bays) && p.bays.length) || 1);
  const wt = p.worktop ? thicknessOf(p.worktop) : 0;
  let slab = 0;
  if (p.type === 'desk' || p.type === 'table') slab = p.worktop ? wt : 3.8;
  else if (p.type === 'window-seat') slab = 3.2;
  else if (p.type === 'kitchen-base' || p.type === 'island') slab = wt;
  const plinth = T.allowPlinth ? p.plinth || 0 : 0;
  const cap = T.allowTop && p.look ? TOP_CAP[p.look.top] || 0 : 0;
  const Hc = Math.max(0, p.height - plinth - slab - cap);
  return {
    slab, plinth, cap, Hc,
    innerH: Math.max(0, r1(Hc - 2 * LAYOUT_T)),
    innerW: Math.max(0, p.width - 2 * LAYOUT_T - (n - 1) * LAYOUT_T),
    outerBayW: p.width / n
  };
}

// Where a wall-hung piece goes when it is first placed: its own elevation, which the Furniture step sets.
export const defaultElevation = (piece) => (piece && Number.isFinite(piece.elevation) ? piece.elevation : TYPES[piece.type].defaults.elevation);

export const maxBaysFor = (type, width) => {
  const L = TYPES[type].limits.bays;
  return clamp(Math.floor((width - LAYOUT_T) / (MIN_BAY + LAYOUT_T)), 1, L[1]);
};

function equalWidths(total, n) {
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

// Scale widths to integers that sum exactly to `total` (largest remainder).
function fitWidths(ws, total) {
  const n = ws.length;
  const clean = ws.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  if (!sum) return equalWidths(total, n);
  const raw = clean.map((w) => (w * total) / sum);
  const fl = raw.map(Math.floor);
  let rest = total - fl.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) fl[order[k][1]]++;
  return fl.some((w) => w < MIN_BAY) ? equalWidths(total, n) : fl;
}

const defaultDoor = (kind, outerW, i) => {
  if (kind !== 'hinged' && kind !== 'glass') return 'none';
  return outerW > 65 ? 'double' : i % 2 === 0 ? 'left' : 'right';
};

function defaultItems(type, i, g, bayW) {
  const list = DEFAULT_PRESETS[type] || [];
  if (!list.length) return [];
  const pre = PRESETS[list[i % list.length]];
  return pre ? pre.build({ innerH: g.innerH, bayW, from: 0, type }) : [];
}

// The look of a piece (design, edges, base, top, gap, two-tone, handles) from any object; missing or unknown values fall
// back to the style's, so every project saved before these options existed loads with its old look.
function clampLook(raw, T, bundle, plinth, height) {
  const lk = isObj(raw.look) ? raw.look : {};
  const b = bundle.look;
  const pick = (list, v, d) => (list.includes(v) ? v : d);
  let base = pick(BASES, lk.base, b.base);
  if (!T.allowPlinth || plinth === 0) base = 'none';
  else if (base === 'none') base = 'recessed';
  const legsOk = (v) => v === 'wood' || isUsable(v, 'handle');
  const upper = isObj(lk.upper) ? cleanSurface(lk.upper, 'front', bundle.fronts) : lk.upper === null ? null : b.upper;
  const lo = Math.min(height - 20, plinth + 20), hi = Math.max(lo, height - 20);
  const split = clamp(toInt(lk.split, b.split === null || b.split === undefined ? defaultSplit(height, plinth) : b.split), lo, hi);
  return {
    design: pick(DESIGNS, DESIGN_ALIASES[lk.design] || lk.design, b.design),
    edge: pick(EDGES, lk.edge, b.edge),
    glass: resolveMaterial(lk.glass, 'glass', b.glass),
    base,
    legs: legsOk(lk.legs) ? lk.legs : b.legs,
    top: T.allowTop ? pick(TOPS, lk.top, b.top) : 'flush',
    gables: lk.gables === undefined ? b.gables : !!lk.gables,
    gap: pick(GAPS, toInt(lk.gap, b.gap), b.gap),
    scribe: lk.scribe === undefined ? b.scribe : !!lk.scribe,
    upper,
    split
  };
}

// Takes any object, returns a valid piece or null (unknown type).
export function clampPiece(raw, fallbackId = 'p0') {
  if (!isObj(raw) || !has(TYPES, raw.type)) return null;
  const T = TYPES[raw.type], D = T.defaults, L = T.limits;
  const fr = isObj(raw.fronts) ? raw.fronts : {};
  const bundle = styleBundle(raw.type, raw.style);
  const front = cleanSurface(fr, 'front', bundle.fronts);
  const handleRaw = HANDLE_ALIASES[fr.handle] || fr.handle;
  const handle = HANDLES.includes(handleRaw) ? handleRaw : bundle.fronts.handle;
  const plinth = T.allowPlinth ? clamp(toInt(raw.plinth, bundle.plinth), 0, 30) : 0;
  const height = clamp(toInt(raw.height, D.height), L.height[0], L.height[1]);
  const look = clampLook(raw, T, bundle, plinth, height);
  let kind = T.allowedFronts.includes(fr.kind) ? fr.kind : bundle.fronts.kind;
  if (kind === 'glass') look.design = 'glass';
  else if (look.design === 'glass') look.design = 'slab';
  const interior = isObj(raw.interior) ? (raw.interior.material === 'front' ? { material: 'front', finish: 'matte' } : isUsable(raw.interior.material, 'interior') ? cleanSurface(raw.interior, 'interior') : null)
    : raw.interior === undefined ? bundle.interior : null;
  const piece = {
    id: safeId(raw.id, fallbackId),
    type: raw.type,
    style: has(STYLES, raw.style) || raw.style === 'custom' ? raw.style : T.defaultStyle,
    width: clamp(toInt(raw.width, D.width), L.width[0], L.width[1]),
    height,
    depth: clamp(toInt(raw.depth, D.depth), L.depth[0], L.depth[1]),
    elevation: clamp(toInt(raw.elevation, D.elevation), L.elevation[0], L.elevation[1]),
    carcass: cleanSurface(raw.carcass, 'carcass', bundle.carcass),
    interior,
    fronts: {
      kind,
      material: front.material,
      finish: front.finish,
      handle,
      grainVertical: fr.grainVertical === undefined ? bundle.fronts.grainVertical : !!fr.grainVertical,
      handleFinish: resolveHandleFinish(fr.handleFinish !== undefined ? fr.handleFinish : bundle.fronts.handleFinish, handle),
      handleSize: HANDLE_SIZES.includes(fr.handleSize) ? fr.handleSize : bundle.fronts.handleSize,
      doorHandle: DOOR_HANDLE_POS.includes(fr.doorHandle) ? fr.doorHandle : bundle.fronts.doorHandle,
      drawerHandle: DRAWER_HANDLE_POS.includes(fr.drawerHandle) ? fr.drawerHandle : bundle.fronts.drawerHandle
    },
    look,
    plinth,
    worktop: T.allowWorktop ? (isUsable(raw.worktop, 'top') ? resolveMaterial(raw.worktop, 'top') : raw.worktop === null ? null : bundle.worktop) : null,
    radiatorCutout: !!raw.radiatorCutout,
    bays: []
  };
  const srcBays = Array.isArray(raw.bays) ? raw.bays.filter(isObj) : [];
  const wanted = srcBays.length ? srcBays.length : D.bays;
  const n = clamp(Math.min(wanted, LIMITS.bays), L.bays[0], maxBaysFor(raw.type, piece.width));
  const g = pieceGeometry(piece, n);
  const widths = srcBays.length
    ? fitWidths(srcBays.slice(0, n).map((b) => Number(b.width)), g.innerW)
    : equalWidths(g.innerW, n);
  piece.bays = widths.map((w, i) => {
    const b = srcBays[i];
    const door = b && DOOR_SIDES.includes(b.door) ? b.door : defaultDoor(piece.fronts.kind, g.outerBayW, i);
    const rawItems = b ? (Array.isArray(b.items) ? b.items : []) : defaultItems(raw.type, i, g, w);
    const items = rawItems.slice(0, LIMITS.itemsPerBay).map((it) => normalizeItem(it, { bayWidth: w, innerH: g.innerH })).filter(Boolean);
    return { width: w, door, items };
  });
  return piece;
}

// ---------- room templates ----------
export const TEMPLATES = {
  rect: { label: 'Rectangle' },
  'l-shape': { label: 'L-shape' },
  alcoves: { label: 'Chimney breast with alcoves' },
  attic: { label: 'Attic with sloping ceiling' },
  hallway: { label: 'Hallway' },
  bay: { label: 'Bay window' }
};

const P = (label, min, max, def) => ({ label, min, max, default: def });
export const TEMPLATE_PARAMS = {
  rect: { width: P('Width', 200, 900, 420), depth: P('Depth', 200, 800, 380) },
  'l-shape': {
    lengthA: P('Top bar length', 200, 900, 500), widthA: P('Top bar width', 100, 700, 300),
    lengthB: P('Left arm length', 200, 900, 450), widthB: P('Left arm width', 100, 700, 250)
  },
  alcoves: {
    width: P('Wall length', 300, 900, 460), depth: P('Depth', 250, 800, 380),
    breastWidth: P('Chimney breast width', 60, 300, 100), breastDepth: P('Chimney breast depth', 10, 80, 40),
    breastOffset: P('Breast from the left', 60, 700, 170)
  },
  attic: {
    width: P('Width', 250, 900, 480), depth: P('Depth', 250, 800, 400),
    kneeHeight: P('Knee wall height', 40, 200, 120), slopeAngle: P('Slope angle (degrees)', 15, 65, 40), slopeWall: P('Sloping wall (1 to 4)', 1, 4, 1)
  },
  hallway: { length: P('Length', 250, 1200, 500), width: P('Width', 90, 200, 120) },
  bay: {
    width: P('Width', 300, 900, 420), depth: P('Depth', 250, 800, 360),
    bayWidth: P('Bay opening width', 150, 500, 240), bayDepth: P('Bay depth', 20, 120, 50)
  }
};

export function clampTemplateParams(id, params) {
  if (!has(TEMPLATE_PARAMS, id)) return {};
  const spec = TEMPLATE_PARAMS[id];
  const src = isObj(params) ? params : {};
  const o = {};
  for (const [k, s] of Object.entries(spec)) o[k] = clamp(toInt(src[k], s.default), s.min, s.max);
  if (id === 'l-shape') {
    o.widthB = Math.min(o.widthB, o.lengthA - 60);
    o.widthA = Math.min(o.widthA, o.lengthB - 60);
  } else if (id === 'alcoves') {
    o.breastWidth = Math.min(o.breastWidth, o.width - 120);
    o.breastOffset = clamp(o.breastOffset, 60, Math.max(60, o.width - o.breastWidth - 60));
    o.breastDepth = Math.min(o.breastDepth, o.depth - 120);
  } else if (id === 'bay') {
    o.bayWidth = Math.min(o.bayWidth, o.width - 60);
    o.bayDepth = Math.min(o.bayDepth, Math.floor((o.bayWidth - 40) / 2));
  }
  return o;
}

const withIds = (pts) => pts.map(([x, z], i) => ({ id: `w${i + 1}`, x, z }));

function cornersFor(id, p) {
  switch (id) {
    case 'rect': case 'attic':
      return [[0, 0], [p.width, 0], [p.width, p.depth], [0, p.depth]];
    case 'hallway':
      return [[0, 0], [p.length, 0], [p.length, p.width], [0, p.width]];
    case 'l-shape':
      return [[0, 0], [p.lengthA, 0], [p.lengthA, p.widthA], [p.widthB, p.widthA], [p.widthB, p.lengthB], [0, p.lengthB]];
    case 'alcoves': {
      const a = p.breastOffset, b = p.breastOffset + p.breastWidth;
      return [[0, 0], [a, 0], [a, p.breastDepth], [b, p.breastDepth], [b, 0], [p.width, 0], [p.width, p.depth], [0, p.depth]];
    }
    case 'bay': {
      const x0 = Math.round((p.width - p.bayWidth) / 2), d = p.bayDepth, x1 = x0 + p.bayWidth;
      return [[0, d], [x0, d], [x0 + d, 0], [x1 - d, 0], [x1, d], [p.width, d], [p.width, p.depth + d], [0, p.depth + d]];
    }
    default:
      return null;
  }
}

// Returns a room for a template. `base` may carry height, floor, wall, skirting, openings.
export function roomFromTemplate(id, params, base = {}) {
  if (!has(TEMPLATE_PARAMS, id)) throw new Error(`Unknown room template: ${id}`);
  const p = clampTemplateParams(id, params);
  const walls = withIds(cornersFor(id, p));
  const b = isObj(base) ? base : {};
  const height = clamp(toInt(b.height, id === 'attic' ? 250 : 260), LIMITS.height[0], LIMITS.height[1]);
  let slope = null;
  if (id === 'attic') {
    const knee = Math.min(p.kneeHeight, height - 20);
    const perp = p.slopeWall % 2 === 1 ? p.depth : p.width;
    const run = Math.round((height - knee) / Math.tan((p.slopeAngle * Math.PI) / 180));
    slope = { wallId: `w${p.slopeWall}`, lowHeight: knee, depth: clamp(run, 20, perp - 50) };
  }
  let openings = Array.isArray(b.openings) ? b.openings : null;
  if (!openings) {
    openings = [];
    if (id === 'hallway') {
      const dw = Math.min(90, p.width - 20);
      const off = Math.round((p.width - dw) / 2);
      openings = [
        { id: 'o1', wallId: 'w2', type: 'door', offset: off, bottom: 0, width: dw, height: 210, swing: 'in-left' },
        { id: 'o2', wallId: 'w4', type: 'door', offset: off, bottom: 0, width: dw, height: 210, swing: 'in-left' }
      ];
    }
  }
  return {
    walls, height, slope, openings,
    floor: has(FLOORS, b.floor) ? b.floor : 'oak-floor',
    wall: has(WALL_COLORS, b.wall) ? b.wall : 'chalk',
    skirting: clamp(toInt(b.skirting, 7), LIMITS.skirting[0], LIMITS.skirting[1]),
    template: { id, params: p }
  };
}

// ---------- room helpers ----------
export function wallsOf(room) {
  const c = room.walls;
  return c.map((s, i) => {
    const e = c[(i + 1) % c.length];
    const dx = e.x - s.x, dz = e.z - s.z;
    const length = Math.hypot(dx, dz);
    const dir = length ? { x: dx / length, z: dz / length } : { x: 1, z: 0 };
    return {
      id: s.id, index: i, start: { x: s.x, z: s.z }, end: { x: e.x, z: e.z }, length,
      angle: (Math.atan2(dz, dx) * 180) / Math.PI, dir,
      normal: length ? { x: -dir.z, z: dir.x } : { x: 0, z: 1 }
    };
  });
}
export const perimeter = (room) => wallsOf(room).reduce((s, w) => s + w.length, 0);
export function signedArea(room) {
  const c = room.walls;
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}
export const area = (room) => Math.abs(signedArea(room));
export const wallById = (room, id) => wallsOf(room).find((w) => w.id === id) || null;

export function ceilingHeightAt(room, x, z) {
  if (!room.slope) return room.height;
  const w = wallById(room, room.slope.wallId);
  if (!w) return room.height;
  const t = (x - w.start.x) * w.normal.x + (z - w.start.z) * w.normal.z;
  const f = clamp(t / Math.max(1, room.slope.depth), 0, 1);
  return room.slope.lowHeight + (room.height - room.slope.lowHeight) * f;
}

// Footprint of a placed piece: four corners in plan coordinates (back-left, back-right, front-right, front-left).
export function footprintOf(project, placement) {
  if (!isObj(placement)) return null;
  const piece = (project.pieces || []).find((p) => p.id === placement.pieceId);
  if (!piece) return null;
  const w = piece.width, d = piece.depth;
  if (placement.mode === 'wall') {
    const wall = wallById(project.room, placement.wallId);
    if (!wall) return null;
    const u = wall.dir, n = wall.normal;
    const bx = wall.start.x + u.x * placement.offset, bz = wall.start.z + u.z * placement.offset;
    const corners = [[0, 0], [w, 0], [w, d], [0, d]].map(([a, b]) => ({ x: bx + u.x * a + n.x * b, z: bz + u.z * a + n.z * b }));
    return { corners, cx: (corners[0].x + corners[2].x) / 2, cz: (corners[0].z + corners[2].z) / 2, rotation: wall.angle, wall };
  }
  const r = ((placement.rotation || 0) * Math.PI) / 180;
  const u = { x: Math.cos(r), z: Math.sin(r) }, f = { x: -Math.sin(r), z: Math.cos(r) };
  const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => ({
    x: placement.x + u.x * a + f.x * b, z: placement.z + u.z * a + f.z * b
  }));
  return { corners, cx: placement.x, cz: placement.z, rotation: placement.rotation || 0 };
}

export function pieceLabel(project, pieceId) {
  const pieces = project.pieces || [];
  const p = pieces.find((x) => x.id === pieceId);
  if (!p) return String(pieceId);
  const n = pieces.filter((x) => x.type === p.type).findIndex((x) => x.id === pieceId) + 1;
  return `${TYPES[p.type] ? TYPES[p.type].label : p.type} ${n}`;
}

// ---------- room clamping ----------
function clampWalls(raw) {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > LIMITS.walls) return null;
  const out = [];
  const ids = new Set();
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (!isObj(c) || !Number.isFinite(Number(c.x)) || !Number.isFinite(Number(c.z))) return null;
    let id = safeId(c.id, `w${i + 1}`);
    if (ids.has(id)) id = `w${i + 1}`;
    if (ids.has(id)) return null;
    ids.add(id);
    out.push({ id, x: clamp(Math.round(Number(c.x)), -LIMITS.coord, LIMITS.coord), z: clamp(Math.round(Number(c.z)), -LIMITS.coord, LIMITS.coord) });
  }
  return out;
}

function clampOpening(raw, i, ids, roomHeight) {
  if (!isObj(raw) || !has(OPENING_TYPES, raw.type)) return null;
  const S = OPENING_TYPES[raw.type], D = S.defaults;
  let id = safeId(raw.id, `o${i + 1}`);
  for (let n = 1; ids.has(id); n++) id = `o${i + 1}_${n}`;
  ids.add(id);
  const o = {
    id, wallId: typeof raw.wallId === 'string' ? raw.wallId.slice(0, 24) : '', type: raw.type,
    offset: clamp(toInt(raw.offset, 0), -LIMITS.coord, LIMITS.coord),
    bottom: clamp(toInt(raw.bottom, D.bottom), S.bottom[0], S.bottom[1]),
    width: clamp(toInt(raw.width, D.width), S.width[0], S.width[1]),
    height: clamp(toInt(raw.height, D.height), S.height[0], S.height[1])
  };
  if (raw.type === 'door') o.swing = SWINGS.includes(raw.swing) ? raw.swing : D.swing;
  if (raw.type === 'radiator') o.depth = clamp(toInt(raw.depth, D.depth), 3, 30);
  if (raw.flagged === true) o.flagged = true;
  return o;
}

export function clampRoom(raw) {
  const r = isObj(raw) ? raw : {};
  let tmpl = null;
  if (isObj(r.template) && has(TEMPLATE_PARAMS, r.template.id)) {
    tmpl = { id: r.template.id, params: clampTemplateParams(r.template.id, r.template.params) };
  }
  let walls = clampWalls(r.walls);
  if (!walls) {
    if (!tmpl) tmpl = { id: 'rect', params: clampTemplateParams('rect', {}) };
    walls = roomFromTemplate(tmpl.id, tmpl.params, { height: r.height }).walls;
  }
  const height = clamp(toInt(r.height, tmpl && tmpl.id === 'attic' ? 250 : 260), LIMITS.height[0], LIMITS.height[1]);
  let slope = null;
  if (isObj(r.slope) && typeof r.slope.wallId === 'string') {
    slope = {
      wallId: r.slope.wallId.slice(0, 24),
      lowHeight: clamp(toInt(r.slope.lowHeight, 120), 30, height),
      depth: clamp(toInt(r.slope.depth, 150), 10, 900)
    };
  } else if (tmpl && tmpl.id === 'attic' && r.slope === undefined) {
    slope = roomFromTemplate('attic', tmpl.params, { height }).slope;
  }
  const ids = new Set();
  const src = Array.isArray(r.openings) ? r.openings.slice(0, LIMITS.openings) : [];
  const openings = src.map((o, i) => clampOpening(o, i, ids, height)).filter(Boolean);
  return {
    walls, height, slope, openings,
    floor: has(FLOORS, r.floor) ? r.floor : 'oak-floor',
    wall: has(WALL_COLORS, r.wall) ? r.wall : 'chalk',
    skirting: clamp(toInt(r.skirting, 7), LIMITS.skirting[0], LIMITS.skirting[1]),
    template: tmpl
  };
}

// ---------- placement clamping ----------
function clampPlacement(raw, project) {
  if (!isObj(raw)) return null;
  const piece = project.pieces.find((p) => p.id === raw.pieceId);
  if (!piece) return null;
  const T = TYPES[piece.type];
  const elevation = clamp(toInt(raw.elevation, T.defaults.elevation), T.limits.elevation[0], T.limits.elevation[1]);
  if (raw.mode === 'wall') {
    return { pieceId: piece.id, mode: 'wall', wallId: typeof raw.wallId === 'string' ? raw.wallId.slice(0, 24) : '', offset: clamp(toInt(raw.offset, 0), -LIMITS.coord, LIMITS.coord), elevation };
  }
  if (raw.mode === 'free') {
    const rot = ((toInt(raw.rotation, 0) % 360) + 360) % 360;
    return { pieceId: piece.id, mode: 'free', x: clamp(toInt(raw.x, 0), -LIMITS.coord, LIMITS.coord), z: clamp(toInt(raw.z, 0), -LIMITS.coord, LIMITS.coord), rotation: rot, elevation };
  }
  return null;
}

export function clampProject(raw) {
  const r = isObj(raw) ? raw : {};
  const room = clampRoom(r.room);
  const pieces = [];
  const ids = new Set();
  for (const src of (Array.isArray(r.pieces) ? r.pieces : []).slice(0, LIMITS.pieces)) {
    const probe = clampPiece(src, 'p0');
    if (!probe) continue;
    let id = probe.id;
    if (id === 'p0' || ids.has(id)) { let n = 1; while (ids.has(`p${n}`)) n++; id = `p${n}`; }
    ids.add(id);
    pieces.push({ ...probe, id });
  }
  const project = { v: 2, room, pieces, placements: [] };
  const seen = new Set();
  for (const pl of Array.isArray(r.placements) ? r.placements : []) {
    const c = clampPlacement(pl, project);
    if (c && !seen.has(c.pieceId)) { seen.add(c.pieceId); project.placements.push(c); }
  }
  return project;
}

// ---------- edits ----------
const nextId = (prefix, list) => {
  const ids = new Set(list.map((x) => x.id));
  let n = 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};
const pieceIndex = (p, id) => p.pieces.findIndex((x) => x.id === id);

export function createPiece(type, style, overrides = {}) {
  if (!has(TYPES, type)) throw new Error(`Unknown piece type: ${type}`);
  const T = TYPES[type];
  const o = isObj(overrides) ? overrides : {};
  const styleId = has(STYLES, style) ? style : T.defaultStyle;
  const b = styleBundle(type, styleId);
  const raw = {
    id: safeId(o.id, 'p0'), type, style: styleId,
    width: o.width ?? T.defaults.width, height: o.height ?? T.defaults.height, depth: o.depth ?? T.defaults.depth,
    carcass: { ...b.carcass, ...(isObj(o.carcass) ? o.carcass : {}) },
    fronts: { ...b.fronts, ...(isObj(o.fronts) ? o.fronts : {}) },
    interior: o.interior,
    look: isObj(o.look) ? o.look : undefined,
    elevation: o.elevation,
    plinth: o.plinth ?? b.plinth,
    worktop: o.worktop === undefined ? b.worktop : o.worktop,
    radiatorCutout: !!o.radiatorCutout
  };
  const probe = clampPiece({ ...raw, bays: [{ width: 1, items: [] }] }); // size and fronts clamped first
  let count = T.defaults.bays;
  if (Array.isArray(o.bays)) {
    raw.bays = o.bays;
  } else {
    if (Number.isFinite(Number(o.bays))) count = toInt(o.bays, count);
    count = clamp(count, T.limits.bays[0], maxBaysFor(type, probe.width));
    const g = pieceGeometry(probe, count);
    const widths = equalWidths(g.innerW, count);
    raw.bays = widths.map((w, i) => {
      const items = defaultItems(type, i, g, w);
      const full = visibleFrontHeight(items.map((it) => normalizeItem(it, { bayWidth: w, innerH: g.innerH }))) >= 0.75 * g.Hc;
      return { width: w, door: full ? 'none' : defaultDoor(probe.fronts.kind, g.outerBayW, i), items };
    });
  }
  return clampPiece(raw, raw.id);
}

export function createProject() {
  const room = roomFromTemplate('alcoves', {}, {
    openings: [
      { id: 'o1', wallId: 'w5', type: 'window', offset: 40, bottom: 90, width: 110, height: 130 },
      { id: 'o2', wallId: 'w6', type: 'door', offset: 250, bottom: 0, width: 90, height: 210, swing: 'in-left' }
    ]
  });
  const wardrobe = createPiece('wardrobe', 'flat-oak', { id: 'p1', width: 170, bays: 2 });
  const desk = createPiece('desk', 'walnut-grooved', { id: 'p2', width: 140 });
  return clampProject({
    v: 2, room, pieces: [wardrobe, desk],
    placements: [
      { pieceId: 'p1', mode: 'wall', wallId: 'w1', offset: 0, elevation: 0 },
      { pieceId: 'p2', mode: 'wall', wallId: 'w5', offset: 25, elevation: 0 }
    ]
  });
}

export function updateRoom(project, patch) {
  const next = cloneProject(project);
  const p = isObj(patch) ? patch : {};
  const room = next.room;
  if (p.height !== undefined) room.height = clamp(toInt(p.height, room.height), LIMITS.height[0], LIMITS.height[1]);
  if (has(FLOORS, p.floor)) room.floor = p.floor;
  if (has(WALL_COLORS, p.wall)) room.wall = p.wall;
  if (p.skirting !== undefined) room.skirting = clamp(toInt(p.skirting, room.skirting), LIMITS.skirting[0], LIMITS.skirting[1]);
  if (room.template && room.template.id === 'attic') {
    room.slope = roomFromTemplate('attic', room.template.params, { height: room.height }).slope;
  } else if (room.slope) {
    room.slope.lowHeight = Math.min(room.slope.lowHeight, room.height);
  }
  return next;
}

export function setTemplate(project, id, params) {
  if (!has(TEMPLATE_PARAMS, id)) return project;
  const next = cloneProject(project);
  const old = next.room;
  const same = old.template && old.template.id === id;
  const merged = same ? { ...old.template.params, ...(isObj(params) ? params : {}) } : params;
  const fresh = roomFromTemplate(id, merged, { height: old.height, floor: old.floor, wall: old.wall, skirting: old.skirting, openings: [] });
  const oldWalls = wallsOf(old);
  const newWalls = wallsOf(fresh);
  const kept = [];
  for (const o of old.openings) {
    const idx = oldWalls.findIndex((w) => w.id === o.wallId);
    const wall = idx >= 0 ? newWalls[idx] : null;
    if (wall && o.offset >= 0 && o.offset + o.width <= wall.length + 0.5) {
      const { flagged, ...rest } = o;
      kept.push({ ...rest, wallId: wall.id });
    } else {
      kept.push({ ...o, wallId: wall ? wall.id : o.wallId, flagged: true });
    }
  }
  if (!kept.length && id === 'hallway' && !old.openings.length) kept.push(...roomFromTemplate('hallway', fresh.template.params).openings);
  fresh.openings = kept;
  next.room = fresh;
  return next;
}

function fitOpening(room, o) {
  const wall = wallById(room, o.wallId);
  const S = OPENING_TYPES[o.type];
  if (!wall) return o;
  const width = Math.min(o.width, Math.max(S.width[0], Math.floor(wall.length)));
  const height = Math.min(o.height, Math.max(S.height[0], room.height));
  const offset = clamp(o.offset, 0, Math.max(0, Math.floor(wall.length - width)));
  const bottom = Math.min(o.bottom, Math.max(0, room.height - height));
  const out = { ...o, width, height, offset, bottom };
  if (offset + width <= wall.length + 0.5) delete out.flagged;
  return out;
}

export function addOpening(project, opening) {
  const next = cloneProject(project);
  if (next.room.openings.length >= LIMITS.openings || !isObj(opening) || !has(OPENING_TYPES, opening.type)) return next;
  const o = clampOpening({ ...opening, id: undefined }, next.room.openings.length, new Set(next.room.openings.map((x) => x.id)), next.room.height);
  const id = isObj(opening) && safeId(opening.id, null) && !next.room.openings.some((x) => x.id === opening.id) ? opening.id : nextId('o', next.room.openings);
  if (!o) return next;
  next.room.openings.push(fitOpening(next.room, { ...o, id }));
  return next;
}

export function updateOpening(project, id, patch) {
  const next = cloneProject(project);
  const i = next.room.openings.findIndex((o) => o.id === id);
  if (i < 0) return next;
  const merged = { ...next.room.openings[i], ...(isObj(patch) ? patch : {}), id };
  const c = clampOpening(merged, i, new Set(), next.room.height);
  if (!c) return next;
  next.room.openings[i] = fitOpening(next.room, c);
  return next;
}

export function removeOpening(project, id) {
  const next = cloneProject(project);
  next.room.openings = next.room.openings.filter((o) => o.id !== id);
  return next;
}

export function addPiece(project, type, style, overrides = {}) {
  const next = cloneProject(project);
  if (next.pieces.length >= LIMITS.pieces || !has(TYPES, type)) return next;
  const wanted = isObj(overrides) ? overrides.id : undefined;
  const id = wanted && safeId(wanted, null) && wanted !== 'p0' && !next.pieces.some((p) => p.id === wanted) ? wanted : nextId('p', next.pieces);
  next.pieces.push(createPiece(type, style, { ...overrides, id }));
  return next;
}

export function updatePiece(project, id, patch) {
  const next = cloneProject(project);
  const i = pieceIndex(next, id);
  if (i < 0) return next;
  const cur = next.pieces[i];
  const pt = isObj(patch) ? { ...patch } : {};
  for (const k of ['width', 'height', 'depth', 'plinth']) {
    if (k in pt && !Number.isFinite(Number(pt[k]))) delete pt[k];
  }
  let base = cur;
  if (has(STYLES, pt.style) && pt.style !== cur.style) {
    const b = styleBundle(cur.type, pt.style);
    base = { ...cur, style: pt.style, fronts: { ...b.fronts }, carcass: { ...b.carcass }, interior: b.interior, look: { ...b.look, split: null }, plinth: b.plinth, worktop: b.worktop };
  }
  const T = TYPES[cur.type];
  const look = isObj(pt.look) ? { ...pt.look } : null;
  const fr = isObj(pt.fronts) ? { ...pt.fronts } : {};
  // glass fronts and the glass design go together
  if (look && look.design === 'glass' && !fr.kind && T.allowedFronts.includes('glass')) fr.kind = 'glass';
  else if (look && look.design && look.design !== 'glass' && base.fronts.kind === 'glass' && !fr.kind) fr.kind = T.allowedFronts.includes('hinged') ? 'hinged' : 'none';
  const merged = {
    ...base, ...pt, id,
    fronts: { ...base.fronts, ...fr },
    carcass: { ...base.carcass, ...(isObj(pt.carcass) ? pt.carcass : {}) },
    interior: 'interior' in pt ? (isObj(pt.interior) ? { ...(base.interior || {}), ...pt.interior } : null) : base.interior,
    look: { ...base.look, ...(look || {}) }
  };
  if (!merged.style || (!has(STYLES, merged.style) && merged.style !== 'custom')) merged.style = cur.style;
  let c = clampPiece(merged, id);
  if (!c) return next;
  if (c.fronts.kind !== cur.fronts.kind && !pt.bays) {
    // New front kind: reset which bays have doors.
    const g = pieceGeometry(c);
    c = clampPiece({ ...c, bays: c.bays.map((b, k) => ({ ...b, door: defaultDoor(c.fronts.kind, g.outerBayW, k) })) }, id);
  }
  next.pieces[i] = c;
  return next;
}

export function removePiece(project, id) {
  const next = cloneProject(project);
  next.pieces = next.pieces.filter((p) => p.id !== id);
  next.placements = next.placements.filter((pl) => pl.pieceId !== id);
  return next;
}

// countOrWidths: a number (equal bays) or an array of widths (scaled to fit). Items are kept by bay index.
export function setBays(project, id, countOrWidths) {
  const next = cloneProject(project);
  const i = pieceIndex(next, id);
  if (i < 0) return next;
  const p = next.pieces[i];
  const max = maxBaysFor(p.type, p.width);
  const min = TYPES[p.type].limits.bays[0];
  const n = Array.isArray(countOrWidths) ? countOrWidths.length : toInt(countOrWidths, p.bays.length);
  const count = clamp(n, min, max);
  const g = pieceGeometry(p, count);
  const widths = Array.isArray(countOrWidths) ? fitWidths(countOrWidths.slice(0, count).map(Number), g.innerW) : equalWidths(g.innerW, count);
  const bays = widths.map((w, k) => {
    const old = p.bays[k];
    return { width: w, door: old ? old.door : defaultDoor(p.fronts.kind, g.outerBayW, k), items: old ? old.items : [] };
  });
  next.pieces[i] = clampPiece({ ...p, bays }, id);
  return next;
}

function bayCtx(piece, bayIndex) {
  const g = pieceGeometry(piece);
  const bay = piece.bays[bayIndex];
  return { bay, ctx: { bayWidth: bay ? bay.width : 80, innerH: g.innerH } };
}

export function addItem(project, pieceId, bayIndex, item) {
  const next = cloneProject(project);
  const piece = next.pieces[pieceIndex(next, pieceId)];
  if (!piece || !piece.bays[bayIndex]) return next;
  const { bay, ctx } = bayCtx(piece, bayIndex);
  if (bay.items.length >= LIMITS.itemsPerBay) return next;
  const it = normalizeItem(item, ctx);
  if (it) bay.items.push(it);
  return next;
}

export function moveItem(project, pieceId, bayIndex, index, to = {}) {
  const next = cloneProject(project);
  const piece = next.pieces[pieceIndex(next, pieceId)];
  if (!piece || !piece.bays[bayIndex] || !piece.bays[bayIndex].items[index]) return next;
  const t = isObj(to) ? to : {};
  const dest = Number.isInteger(t.bay) && piece.bays[t.bay] ? t.bay : bayIndex;
  const [it] = piece.bays[bayIndex].items.splice(index, 1);
  const { bay, ctx } = bayCtx(piece, dest);
  const moved = normalizeItem({ ...it, position: dest === bayIndex ? it.position : undefined, y: t.y === undefined ? it.y : t.y }, ctx);
  if (dest === bayIndex) bay.items.splice(index, 0, moved);
  else bay.items.push(moved);
  return next;
}

export function updateItem(project, pieceId, bayIndex, index, patch) {
  const next = cloneProject(project);
  const piece = next.pieces[pieceIndex(next, pieceId)];
  if (!piece || !piece.bays[bayIndex] || !piece.bays[bayIndex].items[index]) return next;
  const { bay, ctx } = bayCtx(piece, bayIndex);
  const cur = bay.items[index];
  const merged = normalizeItem({ ...cur, ...(isObj(patch) ? patch : {}), kind: cur.kind }, ctx);
  if (merged) bay.items[index] = merged;
  return next;
}

export function removeItem(project, pieceId, bayIndex, index) {
  const next = cloneProject(project);
  const piece = next.pieces[pieceIndex(next, pieceId)];
  if (!piece || !piece.bays[bayIndex] || !piece.bays[bayIndex].items[index]) return next;
  piece.bays[bayIndex].items.splice(index, 1);
  return next;
}

export function applyPreset(project, pieceId, bayIndex, presetId) {
  const next = cloneProject(project);
  const piece = next.pieces[pieceIndex(next, pieceId)];
  const pre = has(PRESETS, presetId) ? PRESETS[presetId] : null;
  if (!piece || !piece.bays[bayIndex] || !pre || !pre.types.includes(piece.type)) return next;
  const g = pieceGeometry(piece);
  const bay = piece.bays[bayIndex];
  const raw = pre.build({ innerH: g.innerH, bayW: bay.width, from: 0, type: piece.type });
  bay.items = raw.map((it) => normalizeItem(it, { bayWidth: bay.width, innerH: g.innerH })).filter(Boolean);
  return next;
}

// ---------- placement ----------
const SNAP = 5;
const vOverlap = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

function snapOffset(project, piece, wall, wallId, offset, elevation) {
  const max = Math.max(0, Math.floor(wall.length - piece.width + EPS));
  const cands = [0, wall.length - piece.width];
  for (const pl of project.placements) {
    if (pl.pieceId === piece.id || pl.mode !== 'wall' || pl.wallId !== wallId) continue;
    const other = project.pieces.find((x) => x.id === pl.pieceId);
    if (!other || !vOverlap(elevation, elevation + piece.height, pl.elevation, pl.elevation + other.height)) continue;
    cands.push(pl.offset + other.width, pl.offset - piece.width);
  }
  let best = null;
  for (const c of cands) {
    const d = Math.abs(c - offset);
    if (d <= SNAP && (best === null || d < Math.abs(best - offset))) best = c;
  }
  const v = best === null ? offset : best;
  return clamp(Math.round(v), 0, max);
}

function resolvePlacement(project, pieceId, spec) {
  const piece = project.pieces.find((p) => p.id === pieceId);
  if (!piece || !isObj(spec)) return null;
  const T = TYPES[piece.type];
  const elevation = clamp(toInt(spec.elevation, defaultElevation(piece)), T.limits.elevation[0], T.limits.elevation[1]);
  if (spec.mode === 'wall') {
    const wall = wallById(project.room, spec.wallId);
    if (!wall) return { pieceId, mode: 'wall', wallId: String(spec.wallId || ''), offset: toInt(spec.offset, 0), elevation };
    // `snap: false` keeps the offset as given (clamped to the wall): arrow keys and typed numbers must be able to move 1 cm
    const offset = spec.snap === false
      ? clamp(toInt(spec.offset, 0), 0, Math.max(0, Math.floor(wall.length - piece.width + EPS)))
      : snapOffset(project, piece, wall, wall.id, toInt(spec.offset, 0), elevation);
    return { pieceId, mode: 'wall', wallId: wall.id, offset, elevation };
  }
  if (spec.mode === 'free') {
    let rot = ((toInt(spec.rotation, 0) % 360) + 360) % 360;
    const near = Math.round(rot / 90) * 90;
    if (spec.snap !== false && Math.abs(rot - near) <= SNAP) rot = near % 360;
    return { pieceId, mode: 'free', x: toInt(spec.x, 0), z: toInt(spec.z, 0), rotation: rot, elevation };
  }
  return null;
}

export function placePiece(project, pieceId, spec) {
  const next = cloneProject(project);
  const pl = resolvePlacement(next, pieceId, spec);
  if (!pl) return next;
  next.placements = next.placements.filter((x) => x.pieceId !== pieceId);
  next.placements.push(pl);
  return next;
}

export function movePlacement(project, pieceId, patch) {
  const cur = project.placements.find((x) => x.pieceId === pieceId);
  if (!cur) return cloneProject(project);
  return placePiece(project, pieceId, { ...cur, ...(isObj(patch) ? patch : {}) });
}

export function unplace(project, pieceId) {
  const next = cloneProject(project);
  next.placements = next.placements.filter((x) => x.pieceId !== pieceId);
  return next;
}

// ---------- migration from v1 ----------
const V1_TYPE = {
  wardrobe: 'wardrobe', 'kitchen-base': 'kitchen-base', 'kitchen-wall': 'kitchen-wall', 'tall-cabinet': 'tall-cabinet',
  island: 'island', shelving: 'wall-unit', desk: 'desk', table: 'table', bench: 'window-seat', 'window-seat': 'window-seat'
};
const V1_DRAWER_H = { wardrobe: 22, 'tall-cabinet': 20, 'kitchen-base': 24, island: 24, 'window-seat': 28, desk: 14, shelving: 22 };

// Expand a v1 module into a v2 piece. The v1 interior enum becomes a list of items per bay.
function migrateModule(m, id) {
  const type = V1_TYPE[m.type];
  const T = TYPES[type];
  const piece = createPiece(type, undefined, {
    id, width: m.width, height: m.height, depth: m.depth,
    carcass: { material: m.body }, fronts: { kind: m.doors, material: m.front, handle: m.handle },
    plinth: T.allowPlinth ? (m.plinth ? 10 : 0) : 0, worktop: m.worktop, bays: m.sections
  });
  const g = pieceGeometry(piece);
  const n = piece.bays.length;
  const dFront = V1_DRAWER_H[m.type] || 20;
  const maxPer = Math.max(0, Math.floor((0.6 * g.innerH) / dFront));
  const hasDrawers = !['table', 'bench'].includes(m.type);
  const D = hasDrawers ? m.drawers : 0;
  piece.bays = piece.bays.map((bay, i) => {
    const count = Math.min(maxPer, 6, Math.floor(D / n) + (i < D % n ? 1 : 0));
    const stack = count * dFront;
    let interior = 'shelves';
    if (m.type === 'wardrobe' || m.type === 'tall-cabinet') {
      if (m.interior === 'rail') interior = 'hanging-shelf';
      else if (m.interior === 'shoe') interior = 'shoes';
      else if (m.interior === 'mixed') interior = i % 2 === 0 ? 'shelves' : 'hanging-shelf';
    }
    const raw = [];
    if (count) raw.push({ kind: 'drawers', y: 0, count, front: Math.min(30, Math.max(12, dFront)) });
    if (m.type !== 'table' && m.type !== 'bench') {
      raw.push(...PRESETS[interior].build({ innerH: g.innerH, bayW: bay.width, from: stack, type }));
    }
    if (m.led && type !== 'table') raw.push({ kind: 'led', y: Math.max(0, g.innerH - 2) });
    const items = raw.map((it) => normalizeItem(it, { bayWidth: bay.width, innerH: g.innerH })).filter(Boolean);
    return { ...bay, items };
  });
  return clampPiece(piece, id);
}

export function migrate(v1) {
  const d = clampDesign(v1);
  const room = roomFromTemplate('rect', { width: d.room.width, depth: d.room.depth }, {
    height: d.room.height, floor: d.room.floor, wall: d.room.wall,
    openings: d.room.openings.map((o, i) => ({
      id: o.id || `o${i + 1}`, wallId: 'w1', type: o.type, offset: o.x, bottom: o.type === 'door' ? 0 : o.y, width: o.w, height: o.h,
      ...(o.type === 'door' ? { swing: 'in-left' } : {})
    }))
  });
  const pieces = [], placements = [];
  d.modules.forEach((m, i) => {
    if (!V1_TYPE[m.type]) return;
    const id = `p${i + 1}`;
    const piece = migrateModule(m, id);
    pieces.push(piece);
    if (TYPES[piece.type].freestanding) {
      placements.push({
        pieceId: id, mode: 'free', x: Math.round(m.x + m.width / 2), z: Math.round((m.z === undefined ? 100 : m.z) + m.depth / 2), rotation: 0, elevation: 0
      });
    } else {
      placements.push({ pieceId: id, mode: 'wall', wallId: 'w1', offset: m.x, elevation: m.elevation || 0 });
    }
  });
  return clampProject({ v: 2, room, pieces, placements });
}

// ---------- surfaces: which material each part of a piece uses ----------
// front: the doors and drawer fronts; upper: the fronts above the split height when two-tone; carcass: sides, top, bottom;
// interior: back, dividers, shelves and drawer boxes (the sides' inner faces too). `interior.material === 'front'` means
// "same as the fronts"; no interior means "same as the sides".
export function surfacesOf(piece) {
  const front = { material: piece.fronts.material, finish: piece.fronts.finish || 'matte' };
  const carcass = { material: piece.carcass.material, finish: piece.carcass.finish || 'matte' };
  const it = piece.interior;
  const interior = it ? (it.material === 'front' ? front : { material: it.material, finish: it.finish || 'matte' }) : carcass;
  const lk = piece.look || {};
  const upper = lk.upper ? { material: lk.upper.material, finish: lk.upper.finish || 'matte' } : null;
  return { front, carcass, interior, upper };
}

// Splits a stretch of front [lo, hi] (cm from the floor) at the two-tone split: [{ lo, hi, role: 'front' | 'upper' }].
// The two parts are separate doors, a gap apart. A part under 6 cm is merged into the other.
export function roleSegments(lo, hi, piece) {
  const lk = piece.look || {};
  if (!lk.upper) return [{ lo, hi, role: 'front' }];
  const g = (lk.gap || 3) / 20;       // half the gap between two fronts, in cm
  const sp = lk.split;
  if (hi <= sp + 0.01) return [{ lo, hi, role: 'front' }];
  if (lo >= sp - 0.01) return [{ lo, hi, role: 'upper' }];
  const a = { lo, hi: sp - g, role: 'front' }, b = { lo: sp + g, hi, role: 'upper' };
  if (a.hi - a.lo < 6) return [{ lo, hi, role: 'upper' }];
  if (b.hi - b.lo < 6) return [{ lo, hi, role: 'front' }];
  return [a, b];
}
