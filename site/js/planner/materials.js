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

export const FAMILIES = {
  wood: { label: 'Wood veneer' },
  painted: { label: 'Painted' },
  ply: { label: 'Plywood' },
  stone: { label: 'Stone and terrazzo' },
  metal: { label: 'Metal' },
  glass: { label: 'Glass' },
  insert: { label: 'Cane' },
  handle: { label: 'Handle finish' }
};

const FRONT_BODY = ['front', 'carcass', 'interior'];
const wood = (label, color, price, o = {}) => ({
  label, family: 'wood', kind: 'wood', color, roughness: 0.62, metalness: 0, grain: true, pricePerM2: price,
  finishes: ['matte', 'satin'], satinPlus: 18, uses: FRONT_BODY, ...o
});
const paint = (label, color, price, o = {}) => ({
  label, family: 'painted', kind: 'lacquer', color, roughness: 0.4, metalness: 0, grain: false, pricePerM2: price,
  finishes: ['matte', 'satin'], satinPlus: 12, uses: ['front', 'carcass', 'interior'], ...o
});
const handle = (label, color, rough, metal, factor, note, o = {}) => ({
  label, family: 'handle', kind: 'handle', color, roughness: rough, metalness: metal, grain: false, pricePerM2: 0,
  factor, uses: ['handle'], note, ...o
});

export const LIBRARY = {
  // ----- wood veneers (ids oak, walnut, ash are the original ones and stay valid) -----
  oak:            wood('Oak', '#c19a6b', 220, { roughness: 0.62, grainStyle: 'oak', tex: 'oak', note: 'Warm, open grain. The classic choice.' }),
  'oak-white':    wood('White-oiled oak', '#dccbaa', 235, { roughness: 0.66, grainStyle: 'oak', tex: 'ash', note: 'Oak with a white oil. Pale and calm, still clearly wood.' }),
  'oak-smoked':   wood('Smoked oak', '#6e5440', 250, { roughness: 0.6, grainStyle: 'oak', tex: 'oak', note: 'Oak darkened with ammonia fumes. Deep brown, grain still visible.' }),
  walnut:         wood('Walnut', '#6b4a36', 290, { roughness: 0.58, grainStyle: 'walnut', tex: 'walnut', note: 'Rich chocolate brown with a lively grain.' }),
  ash:            wood('Ash', '#d9c7a3', 180, { roughness: 0.65, grainStyle: 'ash', tex: 'ash', note: 'Pale and straight-grained. Bright, Scandinavian feel.' }),
  // ----- plywood -----
  'birch-ply':    { label: 'Birch plywood', family: 'ply', kind: 'ply', color: '#e3cfa6', roughness: 0.7, metalness: 0, grain: true, grainStyle: 'birch-ply', tex: 'birch', pricePerM2: 70, finishes: ['matte'], satinPlus: 0, uses: FRONT_BODY, note: 'Light, strong and honest. Our standard inside.' },
  // ----- painted (ids lacquer-white, -sage, -charcoal, -clay are the original ones) -----
  'lacquer-white':    paint('Warm white', '#f1eee8', 150, { note: 'A soft white that is not cold.' }),
  'lacquer-greige':   paint('Greige', '#c9c0b3', 150, { note: 'Between grey and beige. Goes with almost anything.' }),
  'lacquer-sage':     paint('Sage', '#8fa38b', 160, { note: 'Muted green-grey. Calm in bedrooms and kitchens.' }),
  'lacquer-olive':    paint('Olive', '#6f7550', 160, { note: 'Deeper, earthier green.' }),
  'lacquer-blue':     paint('Dusty blue', '#8da2b3', 160, { note: 'Soft, grey-leaning blue.' }),
  'lacquer-navy':     paint('Navy', '#26354d', 165, { note: 'Dark and confident. Lovely with oak.' }),
  'lacquer-clay':     paint('Clay', '#b8715a', 160, { note: 'Warm terracotta.' }),
  'lacquer-charcoal': paint('Charcoal', '#34383c', 160, { note: 'Soft black. Less harsh than pure black.' }),
  // ----- worktops and tops (oak, walnut above also have the 'top' use below) -----
  terrazzo:       { label: 'Terrazzo', family: 'stone', kind: 'stone', color: '#cfc8bd', roughness: 0.45, metalness: 0, grain: false, pricePerM2: 600, thickness: 3, finishes: ['matte'], uses: ['top'], note: 'Chips of marble set in resin. Each slab is a little different.' },
  'quartz-white': { label: 'White quartz', family: 'stone', kind: 'stone', color: '#e9e7e2', roughness: 0.3, metalness: 0, grain: false, pricePerM2: 520, thickness: 2, finishes: ['matte'], uses: ['top'], note: 'Hard-wearing and stain-resistant. Easy to live with.' },
  // ----- glass (door inserts) -----
  'glass-clear':   { label: 'Clear glass', family: 'glass', kind: 'glass', color: '#d7e9ee', roughness: 0.04, metalness: 0, opacity: 0.2, grain: false, pricePerM2: 140, uses: ['glass'], note: 'See straight through. Good for display shelves.' },
  'glass-frosted': { label: 'Frosted glass', family: 'glass', kind: 'glass', color: '#e4eceb', roughness: 0.55, metalness: 0, opacity: 0.78, grain: false, pricePerM2: 185, uses: ['glass'], note: 'Hides what is inside, lets the light through.' },
  'glass-reeded':  { label: 'Reeded glass', family: 'glass', kind: 'glass', color: '#d3e4e8', roughness: 0.12, metalness: 0, opacity: 0.35, ribbed: true, grain: false, pricePerM2: 235, uses: ['glass'], note: 'Fine vertical ribs blur the view. Very current.' },
  // ----- cane insert -----
  cane:           { label: 'Natural cane', family: 'insert', kind: 'insert', color: '#d6b37a', roughness: 0.8, metalness: 0, grain: false, pricePerM2: 190, uses: ['insert'], note: 'Woven cane in a frame. Airy, with a hand-made look.' },
  // ----- handle finishes -----
  black:          handle('Black steel', '#1c1d1f', 0.4, 0.8, 1, 'Matte black. Strong contrast, never fussy.'),
  brushed:        handle('Brushed steel', '#b9b9b3', 0.35, 0.9, 1.15, 'Quiet, neutral metal.'),
  brass:          handle('Brass', '#b88a3e', 0.3, 1, 1.9, 'Warm gold that ages gracefully.'),
  bronze:         handle('Bronze', '#6e4f33', 0.38, 0.9, 1.8, 'Dark, warm metal.'),
  'leather-tan':  handle('Tan leather', '#9a5f36', 0.75, 0, 1, 'Soft leather. Used for tab handles.', { leather: true })
};
// Oak and walnut also make good tops.
LIBRARY.oak.uses = [...FRONT_BODY, 'top'];
LIBRARY.walnut.uses = [...FRONT_BODY, 'top'];
// Legacy handle id that old code used for the black steel handle: still resolvable, never offered.
LIBRARY['steel-black'] = { label: 'Black steel', family: 'handle', kind: 'lacquer', color: '#1c1d1f', roughness: 0.4, metalness: 0.8, grain: false, pricePerM2: 0, uses: [], pickable: false, note: '' };

export const MATERIALS = LIBRARY;
export const USES = ['front', 'carcass', 'interior', 'top', 'glass', 'insert', 'handle'];

const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

export const isMaterial = (id) => has(LIBRARY, id);
export const isUsable = (id, use) => has(LIBRARY, id) && LIBRARY[id].pickable !== false && (!use || LIBRARY[id].uses.includes(use));
// Ids offered for a use, in library order.
export const materialsFor = (use) => Object.keys(LIBRARY).filter((id) => isUsable(id, use));
// The first id offered for a use (what to fall back to when a saved id is not in the table any more).
export const firstFor = (use) => materialsFor(use)[0] || null;
// `id` if it is on offer for `use`, otherwise the first of `prefer` that is, otherwise the first id offered.
export function resolveMaterial(id, use, ...prefer) {
  if (isUsable(id, use)) return id;
  for (const p of prefer) if (isUsable(p, use)) return p;
  return firstFor(use);
}

export function familiesFor(use) {
  const seen = [];
  for (const id of materialsFor(use)) if (!seen.includes(LIBRARY[id].family)) seen.push(LIBRARY[id].family);
  return seen.map((f) => ({ id: f, label: FAMILIES[f] ? FAMILIES[f].label : f }));
}

export const finishesOf = (id) => (has(LIBRARY, id) && LIBRARY[id].finishes) || [];
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
  const id = spec && has(LIBRARY, spec.material) ? spec.material : 'oak';
  const def = LIBRARY[id];
  const finish = resolveFinish(id, spec && spec.finish);
  const rough = Math.min(1, def.roughness * (FINISHES[finish] ? FINISHES[finish].roughMul : 1));
  return { id, ...def, finish, roughness: rough };
}

export function pricePerM2(spec) {
  const id = spec && has(LIBRARY, spec.material) ? spec.material : null;
  if (!id) return 0;
  const def = LIBRARY[id];
  return def.pricePerM2 + (resolveFinish(id, spec.finish) === 'satin' ? def.satinPlus || 0 : 0);
}

// Worktop or slab thickness (cm) for a material id.
export const thicknessOf = (id) => (has(LIBRARY, id) && LIBRARY[id].thickness) || 3.8;
export const isStone = (id) => has(LIBRARY, id) && LIBRARY[id].kind === 'stone';

// Handle finishes.
export const handleFinishes = (type) => {
  const all = materialsFor('handle');
  return type === 'leather' ? all.filter((id) => LIBRARY[id].leather) : all.filter((id) => !LIBRARY[id].leather);
};
export function resolveHandleFinish(finish, type) {
  const list = handleFinishes(type);
  return list.includes(finish) ? finish : list[0] || 'black';
}
export const glassTypes = () => materialsFor('glass');
export const insertTypes = () => materialsFor('insert');
