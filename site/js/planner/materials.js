// Planner material library: ONE data table (LIBRARY) that the picker UI, the 3D scene, the path tracer and the pricing all
// read. A workshop cannot stock everything, so the range is small and curated; swap the table to change what is on offer
// and nothing else needs to change. Pure: no DOM, no Three.js.
//
// Entry fields
//   label, family          what people see; `family` groups the picker (keys of FAMILIES)
//   kind                   'wood' | 'ply' | 'lacquer' | 'stone' | 'metal' | 'glass' | 'insert' | 'handle' (old code reads this)
//   color                  base colour (hex): swatches, the live viewer, the plan
//   roughness, metalness   PBR values for the matte finish
//   grain                  true for veneers: the live viewer draws a grain and the grain direction matters
//   grainStyle             which procedural grain recipe to use (see planner/material-lib.js)
//   tex                    optional render texture set in assets/planner-tex/ (tinted towards `color`)
//   pricePerM2             board price in EUR per m2 for the matte finish
//   finishes               ['matte', 'satin'] ...; `satinPlus` is the extra EUR per m2 for satin
//   uses                   where it may be picked: 'front' | 'carcass' | 'interior' | 'top' | 'glass' | 'insert' | 'handle'
//   thickness              worktop thickness in cm (default 3.8)
//   note                   one plain-language sentence
//   pickable: false        legacy id that old projects may still hold but is not offered
export const FINISHES = {
  matte: { label: 'Matte', note: 'Soft, low sheen. Hides fingerprints best.', roughMul: 1 },
  satin: { label: 'Satin', note: 'A gentle sheen. A little easier to wipe clean.', roughMul: 0.62 }
};

// The picker groups swatches by family, in this order.
export const FAMILIES = {
  wood: { label: 'Wood veneer' },
  painted: { label: 'Painted' },
  laminate: { label: 'Supermatte laminate' },
  ply: { label: 'Plywood' },
  stone: { label: 'Worktops' },
  glass: { label: 'Glass' },
  handle: { label: 'Handle finish' }
};

const ONE = ['matte'];
const wood = (label, color, price, o = {}) => ({
  label, family: 'wood', kind: 'wood', color, roughness: 0.62, metalness: 0, grain: true, pricePerM2: price,
  finishes: ONE, satinPlus: 0, uses: ['front'], ...o
});
const paint = (label, color, o = {}) => ({
  label, family: 'painted', kind: 'lacquer', color, roughness: 0.42, metalness: 0, grain: false, pricePerM2: 155,
  finishes: ONE, satinPlus: 0, uses: ['front'], ...o
});
const handle = (label, color, rough, metal, factor, note, o = {}) => ({
  label, family: 'handle', kind: 'handle', color, roughness: rough, metalness: metal, grain: false, pricePerM2: 0,
  factor, uses: ['handle'], note, ...o
});

export const LIBRARY = {
  // ----- painted (matte lacquer) -----
  'chalk-white':  paint('Chalk white',  '#EDE9E0', { pricePerM2: 150, note: 'A soft white that is not cold.' }),
  'pebble-grey':  paint('Pebble grey',  '#C4C3BD', { note: 'Light, warm grey.' }),
  sand:           paint('Sand',         '#CDBFAD', { note: 'Pale, warm neutral.' }),
  sage:           paint('Sage',         '#A9B49C', { pricePerM2: 160, note: 'Muted green-grey. Calm in bedrooms and kitchens.' }),
  'dark-green':   paint('Dark green',   '#2F4A3A', { pricePerM2: 165, note: 'Deep and leafy. Lovely with brass.' }),
  'ink-blue':     paint('Ink blue',     '#26344A', { pricePerM2: 165, note: 'Dark and confident. Pairs well with oak.' }),
  clay:           paint('Clay',         '#B5654A', { pricePerM2: 160, note: 'Warm terracotta.' }),
  black:          paint('Black',        '#1F1F20', { pricePerM2: 160, note: 'Soft black, matte.' }),
  // ----- wood veneer, hard-wax oiled -----
  oak:            wood('Natural oak', '#c19a6b', 220, { grainStyle: 'oak', tex: 'oak', uses: ['front', 'top'], note: 'Warm, open grain. The classic choice.' }),
  'oak-smoked':   wood('Smoked oak',  '#6e5440', 250, { tinted: true, roughness: 0.6, grainStyle: 'oak', tex: 'oak', note: 'Oak darkened with ammonia fumes. Deep brown, grain still visible.' }),
  walnut:         wood('Walnut',      '#6b4a36', 290, { roughness: 0.58, grainStyle: 'walnut', tex: 'walnut', note: 'Rich chocolate brown with a lively grain.' }),
  ash:            wood('Pale ash',    '#d9c7a3', 180, { roughness: 0.65, grainStyle: 'ash', tex: 'ash', note: 'Pale and straight-grained. Bright, Scandinavian feel.' }),
  // ----- plywood -----
  'birch-ply':    { label: 'Birch plywood', family: 'ply', kind: 'ply', color: '#e3cfa6', roughness: 0.7, metalness: 0, grain: true, edgeGrain: true, grainStyle: 'birch-ply', tex: 'birch', pricePerM2: 70, finishes: ONE, satinPlus: 0, uses: ['front', 'carcass', 'interior'], note: 'Oiled birch plywood with the layers left showing on the edges.' },
  // ----- laminate -----
  'laminate-black': { label: 'Black laminate', family: 'laminate', kind: 'laminate', color: '#232325', roughness: 0.78, metalness: 0, grain: false, pricePerM2: 130, finishes: ONE, satinPlus: 0, uses: ['front'], note: 'Supermatte and fingerprint-resistant.' },
  'laminate-grey':  { label: 'Light grey laminate', family: 'laminate', kind: 'laminate', color: '#b9b9b6', roughness: 0.78, metalness: 0, grain: false, pricePerM2: 130, finishes: ONE, satinPlus: 0, uses: ['front'], note: 'Supermatte and fingerprint-resistant.' },
  // ----- worktops (solid oak is the oak above) -----
  'quartz-white':   { label: 'White quartz', family: 'stone', kind: 'stone', color: '#e6e4df', roughness: 0.3, metalness: 0, grain: false, veined: true, pricePerM2: 520, thickness: 3, finishes: ONE, satinPlus: 0, uses: ['top'], note: 'Marble look, but harder and stain-resistant.' },
  'stone-black':    { label: 'Honed black stone', family: 'stone', kind: 'stone', color: '#2b2b2c', roughness: 0.55, metalness: 0, grain: false, pricePerM2: 560, thickness: 3, finishes: ONE, satinPlus: 0, uses: ['top'], note: 'Matte black stone. Shows no fingerprints.' },
  'laminate-worktop': { label: 'Matt laminate (grey)', family: 'stone', kind: 'laminate', color: '#8d8e8c', roughness: 0.7, metalness: 0, grain: false, pricePerM2: 140, thickness: 3.8, finishes: ONE, satinPlus: 0, uses: ['top'], note: 'The budget-friendly top. Tough and matt.' },
  // ----- glass (door inserts) -----
  'glass-clear':    { label: 'Clear glass', family: 'glass', kind: 'glass', color: '#d7e9ee', roughness: 0.04, metalness: 0, opacity: 0.2, grain: false, pricePerM2: 95, uses: ['glass'], note: 'See straight through. Good for display shelves.' },
  'glass-smoked':   { label: 'Grey-tinted glass', family: 'glass', kind: 'glass', color: '#6f777b', roughness: 0.05, metalness: 0, opacity: 0.45, grain: false, pricePerM2: 120, uses: ['glass'], note: 'Smoked glass: you see shapes, not detail.' },
  // ----- handle finishes (id wood = the oak of the fronts) -----
  brass:          handle('Brass', '#b88a3e', 0.3, 1, 1.9, 'Warm gold that ages gracefully.'),
  'handle-black': handle('Black', '#1c1d1f', 0.4, 0.8, 1, 'Matte black steel. Strong contrast, never fussy.'),
  brushed:        handle('Brushed steel', '#b9b9b3', 0.35, 0.9, 1.15, 'Quiet, neutral metal.'),
  wood:           handle('Oak', '#c19a6b', 0.6, 0, 1.1, 'Turned from oak, to sit well with oak fronts.', { wood: true })
};
// Legacy: old code used this id for the black steel handle. Still resolvable, never offered.
LIBRARY['steel-black'] = { label: 'Black steel', family: 'handle', kind: 'lacquer', color: '#1c1d1f', roughness: 0.4, metalness: 0.8, grain: false, pricePerM2: 0, uses: [], pickable: false, finishes: ONE, satinPlus: 0, note: '' };

// Ids from earlier versions of the range, and what they become now. Old saves and share links keep loading.
export const ALIASES = {
  'lacquer-white': 'chalk-white', 'lacquer-sage': 'sage', 'lacquer-charcoal': 'black', 'lacquer-clay': 'clay',
  terrazzo: 'quartz-white', 'steel-black': 'handle-black'
};
// Older handle styles and designs.
export const HANDLE_ALIASES = { groove: 'edge', 'long-bar': 'bar', leather: 'bar' };
export const DESIGN_ALIASES = { fluted: 'ribbed', vgroove: 'ribbed', cane: 'shaker' };

export const MATERIALS = LIBRARY;
export const USES = ['front', 'carcass', 'interior', 'top', 'glass', 'handle'];
// Carcass and inside options: the only boards we offer for the box itself.
for (const id of ['birch-ply', 'chalk-white', 'oak', 'black']) {
  const u = LIBRARY[id].uses;
  for (const k of ['carcass', 'interior']) if (!u.includes(k)) u.push(k);
}

const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
// An id from any version of the range, as an id in this one (unknown ids stay unknown).
export const canonicalId = (id) => (has(ALIASES, id) ? ALIASES[id] : id);

export const isMaterial = (id) => has(LIBRARY, id);
export const isUsable = (id, use) => {
  const c = canonicalId(id);
  return has(LIBRARY, c) && LIBRARY[c].pickable !== false && (!use || LIBRARY[c].uses.includes(use));
};
// Ids offered for a use, in library order.
export const materialsFor = (use) => Object.keys(LIBRARY).filter((id) => LIBRARY[id].pickable !== false && (!use || LIBRARY[id].uses.includes(use)));
export const firstFor = (use) => materialsFor(use)[0] || null;
// `id` (old ids are mapped) if it is on offer for `use`, otherwise the first of `prefer` that is, otherwise the first id offered.
export function resolveMaterial(id, use, ...prefer) {
  const c = canonicalId(id);
  if (isUsable(c, use)) return c;
  for (const p of prefer) { const q = canonicalId(p); if (isUsable(q, use)) return q; }
  return firstFor(use);
}

export function familiesFor(use) {
  const seen = [];
  for (const id of materialsFor(use)) if (!seen.includes(LIBRARY[id].family)) seen.push(LIBRARY[id].family);
  return seen.map((f) => ({ id: f, label: FAMILIES[f] ? FAMILIES[f].label : f }));
}

export const finishesOf = (id) => (has(LIBRARY, canonicalId(id)) && LIBRARY[canonicalId(id)].finishes) || [];
export const defaultFinish = (id) => finishesOf(id)[0] || 'matte';
export function resolveFinish(id, finish) {
  const list = finishesOf(id);
  return list.includes(finish) ? finish : list[0] || 'matte';
}

// A surface is { material, finish }. Returns a clean one for a use; anything unknown falls back.
export function cleanSurface(raw, use, fallback = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const material = resolveMaterial(r.material, use, fallback.material);
  const finish = resolveFinish(material, r.finish !== undefined ? r.finish : fallback.finish);
  return { material, finish };
}

// Merged view of a surface for drawing: colour, roughness after the finish, and so on.
export function surfaceInfo(spec) {
  const id = spec && has(LIBRARY, canonicalId(spec.material)) ? canonicalId(spec.material) : 'oak';
  const def = LIBRARY[id];
  const finish = resolveFinish(id, spec && spec.finish);
  const rough = Math.min(1, def.roughness * (FINISHES[finish] ? FINISHES[finish].roughMul : 1));
  return { id, ...def, finish, roughness: rough };
}

export function pricePerM2(spec) {
  const id = spec && has(LIBRARY, canonicalId(spec.material)) ? canonicalId(spec.material) : null;
  if (!id) return 0;
  const def = LIBRARY[id];
  return def.pricePerM2 + (resolveFinish(id, spec.finish) === 'satin' ? def.satinPlus || 0 : 0);
}

// Worktop or slab thickness (cm) for a material id.
export const thicknessOf = (id) => (has(LIBRARY, canonicalId(id)) && LIBRARY[canonicalId(id)].thickness) || 3.8;
export const isStone = (id) => has(LIBRARY, canonicalId(id)) && LIBRARY[canonicalId(id)].kind === 'stone';

// Handle finishes. Old finishes that are no longer offered fall back to the first one.
export const handleFinishes = () => materialsFor('handle');
export function resolveHandleFinish(finish) {
  const list = handleFinishes();
  if (finish === 'black') return list.includes('handle-black') ? 'handle-black' : list[0];
  const c = canonicalId(finish);
  return list.includes(c) ? c : list.includes('handle-black') ? 'handle-black' : list[0] || 'handle-black';
}
export const glassTypes = () => materialsFor('glass');
