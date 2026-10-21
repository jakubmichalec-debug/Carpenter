// Configurator UI: owns the design state, history, panel controls, quote and keyboard, and drives scene.js.
import { createConfiguratorScene } from './scene.js';
import {
  MODULE_TYPES, MATERIALS, FLOORS, WALL_COLORS, ROOM_LIMITS, HANDLES,
  createDesign, addModule, updateModule, removeModule, moveModule, updateRoom,
  validate, findCollisions, cloneDesign
} from './model.js';
import { quoteDesign } from './pricing.js';
import { encodeDesign, decodeDesign, saveLocal, loadLocal } from './share.js';

const $ = (s, r = document) => r.querySelector(s);
const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
  return el;
}

// ---------- icons (48x48 line drawings) ----------
const ICON_PATHS = {
  wardrobe: '<rect x="9" y="5" width="30" height="38" rx="1.5"/><path d="M24 5v38M20 24v4M28 24v4M9 38h30"/>',
  'kitchen-base': '<path d="M7 17h34M9 17v24h30V17M9 41v2M39 41v2M9 25h30M24 25v16M20 33v2M28 33v2M18 21h12"/>',
  'kitchen-wall': '<path d="M4 6h40"/><rect x="9" y="10" width="30" height="20" rx="1.5"/><path d="M24 10v20M21 24v3M27 24v3"/>',
  'tall-cabinet': '<rect x="15" y="4" width="18" height="40" rx="1.5"/><path d="M24 4v40M21 22v4M27 22v4M15 38h18"/>',
  island: '<path d="M5 18h38v3H5zM9 21v20h30V21M9 29h30M19 21v20M29 21v20M24 25h0M14 25h0M34 25h0"/>',
  shelving: '<path d="M10 5v38M38 5v38M10 5h28M10 17h28M10 29h28M10 43h28M16 29v-8M20 29v-10M25 17v-8"/>',
  desk: '<path d="M5 17h38M8 17v26M27 17v26M27 24h16M27 31h16M27 38h16M43 17v26M31 27.5h8M31 34.5h8"/>',
  table: '<path d="M6 16h36v3H6zM10 19v24M38 19v24M14 22h20"/>',
  bench: '<path d="M7 24h34v4H7zM10 28v14M38 28v14M10 36h28"/>',
  'window-seat': '<rect x="10" y="5" width="28" height="15" rx="1"/><path d="M24 5v15M10 12.5h28M7 27c0-3 2-4 5-4h24c3 0 5 1 5 4v3H7zM9 30v12h30V30M24 30v12"/>'
};
const icon = (key, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[key] || ICON_PATHS.wardrobe}</svg>`;
const ICON_WINDOW = '<svg class="ico" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="9" y="8" width="30" height="32" rx="1.5"/><path d="M24 8v32M9 24h30"/></svg>';
const ICON_DOOR = '<svg class="ico" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="12" y="5" width="24" height="38" rx="1.5"/><circle cx="31" cy="25" r="1.4" fill="currentColor"/></svg>';

const LABELS = {
  doors: { hinged: 'Hinged', sliding: 'Sliding', open: 'Open', glass: 'Glass', none: 'None' },
  interior: { shelves: 'Shelves', rail: 'Rail', mixed: 'Mixed', shoe: 'Shoes' },
  handle: { bar: 'Bar', knob: 'Knob', push: 'Push', groove: 'Groove' }
};
const PART_LABELS = {
  side: 'Side', top: 'Top', bottom: 'Bottom', back: 'Back', shelf: 'Shelf', divider: 'Divider', door: 'Door',
  'drawer-front': 'Drawer front', worktop: 'Worktop', plinth: 'Plinth', leg: 'Leg'
};

// ---------- scene (with graceful fallback) ----------
const canvas = $('#cfg-canvas');
const stage = $('.cfg__stage');
const root = $('#main');
const dimEl = $('#cfg-dim');
const mobileQ = window.matchMedia('(max-width: 819px)');
const lowQuality = mobileQ.matches || window.matchMedia('(pointer: coarse)').matches || ((window.devicePixelRatio || 1) < 1.25 && innerWidth < 1000);
const noop = () => {};
let scene;
try {
  scene = createConfiguratorScene(canvas, { quality: lowQuality ? 'low' : 'high', label: dimEl });
} catch (err) {
  console.warn('WebGL unavailable', err);
  scene = new Proxy({ screenshot: () => '', getView: () => 'free' }, { get: (t, k) => (k in t ? t[k] : noop) });
  $('#cfg-fallback').hidden = false;
  canvas.hidden = true;
  $('#cfg-loading').hidden = true;
}

// ---------- state ----------
const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const fromHash = params.get('design') ? decodeDesign(params.get('design')) : null;
const state = {
  design: fromHash || loadLocal() || createDesign(),
  selectedId: null,
  vat: true,
  tab: 'furniture'
};
if (fromHash) { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ } }
state.selectedId = state.design.modules[0] ? state.design.modules[0].id : null;

const past = [], future = [];
let lastKey = null, lastT = 0;
let saveTimer = 0;

function commit(next, key) {
  const now = performance.now();
  if (!(key && key === lastKey && now - lastT < 700)) {
    past.push(state.design);
    if (past.length > 120) past.shift();
  }
  lastKey = key || null; lastT = now;
  future.length = 0;
  apply(next);
}
function undo() { if (!past.length) return; future.push(state.design); lastKey = null; apply(past.pop()); toast('Undone'); }
function redo() { if (!future.length) return; past.push(state.design); lastKey = null; apply(future.pop()); toast('Redone'); }

let rafPending = false;
const schedule = (fn) => { fns.add(fn); if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; const f = [...fns]; fns.clear(); f.forEach((x) => x()); }); } };
const fns = new Set();

function apply(next) {
  state.design = next;
  if (state.selectedId && !next.modules.some((m) => m.id === state.selectedId)) state.selectedId = null;
  scene.setDesign(next);
  scene.select(state.selectedId);
  schedule(refresh);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveLocal(state.design), 400);
}

function select(id, { scroll = false } = {}) {
  state.selectedId = id;
  scene.select(id);
  schedule(refresh);
  if (id && scroll) setTimeout(() => $('#editor') && $('#editor').scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }), 60);
}

const selected = () => state.design.modules.find((m) => m.id === state.selectedId) || null;
const typeLabel = (m) => MODULE_TYPES[m.type].label;
function nameOf(m) {
  const same = state.design.modules.filter((q) => q.type === m.type);
  return same.length > 1 ? `${typeLabel(m)} ${same.indexOf(m) + 1}` : typeLabel(m);
}

// ---------- toast ----------
let toastTimer = 0;
function toast(msg, ms = 1800) {
  const t = $('#cfg-toast');
  t.textContent = msg; t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), ms);
}


// Add a piece; when the wall has no gap wide enough, shrink it to fit, or say so plainly.
function wallGaps(design, probe) {
  const blockers = design.modules
    .filter((m) => !MODULE_TYPES[m.type].freestanding && m.elevation < probe.elevation + probe.height && probe.elevation < m.elevation + m.height)
    .map((m) => [m.x, m.x + m.width]).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = 0;
  blockers.forEach(([s, e]) => { if (s > cursor) gaps.push([cursor, s]); cursor = Math.max(cursor, e); });
  if (design.room.width > cursor) gaps.push([cursor, design.room.width]);
  return gaps.map(([s, e]) => ({ x: s, w: e - s }));
}
function addPiece(type) {
  const T = MODULE_TYPES[type];
  let next = addModule(state.design, type);
  let added = next.modules[next.modules.length - 1];
  let msg = `${T.label} added`, ms = 1800;
  if (!T.freestanding && findCollisions(next).some((pair) => pair.includes(added.id))) {
    const gap = wallGaps(state.design, added).find((g) => g.w >= T.limits.width[0]);
    if (gap) {
      const w = Math.min(added.width, gap.w);
      next = addModule(state.design, type, { x: gap.x, width: w });
      added = next.modules[next.modules.length - 1];
      msg = `${T.label} added, narrowed to ${added.width} cm to fit`; ms = 3200;
    } else {
      msg = 'No free space on the wall: the piece was placed at the start, so drag it or make the room wider';
      ms = 5200;
    }
  }
  state.selectedId = added.id;
  commit(next);
  toast(msg, ms);
  select(added.id, { scroll: true });
}

// ---------- field components ----------
let uid = 0;
function numField({ label, unit = 'cm', min, max, get, set, step = 1, hint }) {
  const id = `f${++uid}`;
  const range = h('input', { type: 'range', id, step, class: 'rng' });
  const num = h('input', { type: 'number', inputmode: 'numeric', step, class: 'num__in', 'aria-label': `${label} in ${unit}` });
  const row = h('div', { class: 'fld' },
    h('label', { for: id, class: 'fld__l' }, label, hint ? h('small', {}, hint) : null),
    h('div', { class: 'fld__row' }, range, h('span', { class: 'num' }, num, h('em', {}, unit))));
  const paint = () => {
    const lo = min(), hi = max(), v = get();
    range.min = lo; range.max = Math.max(lo, hi); range.value = v;
    num.min = lo; num.max = Math.max(lo, hi);
    if (document.activeElement !== num || Number(num.value) !== v) num.value = v;
    const frac = hi > lo ? ((v - lo) / (hi - lo)) * 100 : 0;
    range.style.setProperty('--p', `${frac}%`);
    row.classList.toggle('is-fixed', hi <= lo);
    range.disabled = num.disabled = hi <= lo;
  };
  range.addEventListener('input', () => { set(Number(range.value)); });
  num.addEventListener('input', () => {
    const v = Number(num.value);
    if (num.value !== '' && Number.isFinite(v) && v >= min() && v <= max()) set(Math.round(v));
  });
  num.addEventListener('change', () => { const v = Number(num.value); set(Number.isFinite(v) ? Math.round(clamp(v, min(), Math.max(min(), max()))) : get()); paint(); });
  return { el: row, sync: paint };
}

function segField({ label, name, options, get, set }) {
  const fs = h('fieldset', { class: 'fld fld--seg' }, h('legend', { class: 'fld__l' }, label));
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const inputs = options.map((o) => {
    const input = h('input', { type: 'radio', name, value: o.value });
    input.addEventListener('change', () => { if (input.checked) set(o.value); });
    wrap.append(h('label', { class: 'seg__opt' }, input, h('span', {}, o.label)));
    return input;
  });
  fs.append(wrap);
  return { el: fs, sync() { const v = get(); inputs.forEach((i) => { i.checked = i.value === v; }); } };
}

function stepper({ label, min, max, get, set }) {
  const out = h('output', { class: 'stp__v' });
  const dec = h('button', { type: 'button', class: 'stp__b', 'aria-label': `Fewer ${label.toLowerCase()}` }, '−');
  const inc = h('button', { type: 'button', class: 'stp__b', 'aria-label': `More ${label.toLowerCase()}` }, '+');
  dec.addEventListener('click', () => set(get() - 1));
  inc.addEventListener('click', () => set(get() + 1));
  const el = h('div', { class: 'fld fld--stp' }, h('span', { class: 'fld__l' }, label), h('div', { class: 'stp', role: 'group', 'aria-label': label }, dec, out, inc));
  return { el, sync() { const v = get(); out.textContent = v; dec.disabled = v <= min(); inc.disabled = v >= max(); } };
}

function toggle({ label, desc, get, set }) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.addEventListener('change', () => set(input.checked));
  const el = h('label', { class: 'sw' }, input, h('i', { class: 'sw__track', 'aria-hidden': 'true' }),
    h('span', { class: 'sw__t' }, label, desc ? h('small', {}, desc) : null));
  return { el, sync() { input.checked = !!get(); } };
}

function swatches({ label, name, items, get, set }) {
  const fs = h('fieldset', { class: 'fld fld--sw' }, h('legend', { class: 'fld__l' }, label, ' ', h('span', { class: 'fld__cur', 'data-cur': '' })));
  const wrap = h('div', { class: 'sws' });
  const inputs = items.map((it) => {
    const input = h('input', { type: 'radio', name, value: it.id });
    input.addEventListener('change', () => { if (input.checked) set(it.id); });
    const dot = h('i', { class: `sw-dot sw-dot--${it.kind || 'plain'}`, style: `--c:${it.color}` });
    wrap.append(h('label', { class: 'sw-opt', title: it.label }, input, dot, h('span', { class: 'visually-hidden' }, it.label)));
    return input;
  });
  fs.append(wrap);
  const cur = $('[data-cur]', fs);
  return {
    el: fs,
    sync() { const v = get(); inputs.forEach((i) => { i.checked = i.value === v; }); const it = items.find((q) => q.id === v); cur.textContent = it ? it.label : ''; }
  };
}

const pickMaterials = (kinds) => Object.entries(MATERIALS)
  .filter(([, m]) => m.pickable !== false && kinds.includes(m.kind))
  .map(([id, m]) => ({ id, label: m.label, color: m.color, kind: m.kind }));
const BODY_MATS = pickMaterials(['wood', 'ply', 'lacquer']);
const FRONT_MATS = pickMaterials(['wood', 'ply', 'lacquer']);
const TOP_MATS = pickMaterials(['stone', 'wood']);

// ---------- ROOM tab ----------
const paneRoom = $('#pane-room');
const roomSync = [];
let openingsKey = '';

function buildRoomPane() {
  const room = () => state.design.room;
  const setRoom = (patch, key) => commit(updateRoom(state.design, patch), key);
  const dims = h('section', { class: 'blk' }, h('h2', { class: 'blk__h' }, 'Room size'));
  [['width', 'Wall width'], ['height', 'Ceiling height'], ['depth', 'Depth']].forEach(([k, label]) => {
    const f = numField({ label, min: () => ROOM_LIMITS[k][0], max: () => ROOM_LIMITS[k][1], get: () => room()[k], set: (v) => setRoom({ [k]: v }, `room:${k}`) });
    roomSync.push(f.sync); dims.append(f.el);
  });
  const floors = swatches({
    label: 'Floor', name: 'floor',
    items: Object.entries(FLOORS).map(([id, f]) => ({ id, label: f.label, color: f.color, kind: 'floor' })),
    get: () => room().floor, set: (v) => setRoom({ floor: v })
  });
  const walls = swatches({
    label: 'Wall colour', name: 'wall',
    items: Object.entries(WALL_COLORS).map(([id, f]) => ({ id, label: f.label, color: f.color })),
    get: () => room().wall, set: (v) => setRoom({ wall: v })
  });
  roomSync.push(floors.sync, walls.sync);
  const fin = h('section', { class: 'blk' }, h('h2', { class: 'blk__h' }, 'Finish'), floors.el, walls.el);

  const openWrap = h('section', { class: 'blk' }, h('h2', { class: 'blk__h' }, 'Windows & doors'));
  const list = h('div', { class: 'ops', id: 'ops-list' });
  const add = h('div', { class: 'ops__add' },
    h('button', { type: 'button', class: 'chip', onclick: () => addOpening('window') }, h('span', { html: ICON_WINDOW }), 'Add window'),
    h('button', { type: 'button', class: 'chip', onclick: () => addOpening('door') }, h('span', { html: ICON_DOOR }), 'Add door'));
  openWrap.append(list, add, h('p', { class: 'note' }, 'Openings are cut into the back wall. Windows let daylight in, and furniture that covers one gets flagged.'));
  paneRoom.append(dims, fin, openWrap);
  roomSync.push(() => renderOpenings(list));
}

function addOpening(type) {
  const room = state.design.room;
  const w = type === 'door' ? 90 : 120, hh = type === 'door' ? 210 : 130;
  const taken = room.openings.map((o) => [o.x, o.x + o.w]).sort((a, b) => a[0] - b[0]);
  let x = 20;
  for (const [s, e] of taken) { if (s - x >= w + 10) break; x = Math.max(x, e + 20); }
  x = clamp(x, 0, room.width - w);
  let n = room.openings.length + 1;
  const ids = new Set(room.openings.map((o) => o.id));
  while (ids.has(`o${n}`)) n++;
  const o = { id: `o${n}`, type, x, y: type === 'door' ? 0 : 90, w, h: hh };
  commit(updateRoom(state.design, { openings: [...room.openings, o] }));
  toast(type === 'door' ? 'Door added' : 'Window added');
}

function patchOpening(id, patch) {
  const room = state.design.room;
  commit(updateRoom(state.design, { openings: room.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }), `op:${id}:${Object.keys(patch)[0]}`);
}

let openingFields = [];
function renderOpenings(list) {
  const room = state.design.room;
  const key = room.openings.map((o) => `${o.id}:${o.type}`).join('|');
  if (key !== openingsKey) {
    openingsKey = key;
    list.textContent = '';
    openingFields = [];
    if (!room.openings.length) list.append(h('p', { class: 'empty' }, 'No openings yet. The back wall is solid.'));
    room.openings.forEach((o, i) => {
      const get = () => state.design.room.openings.find((q) => q.id === o.id) || o;
      const kind = o.type === 'door' ? 'Door' : 'Window';
      const sameKind = room.openings.filter((q) => q.type === o.type);
      const title = sameKind.length > 1 ? `${kind} ${sameKind.indexOf(o) + 1}` : kind;
      const grid = h('div', { class: 'op__grid' });
      const mk = (k, label, lo, hi) => {
        const f = numField({ label, min: () => lo(get()), max: () => hi(get()), get: () => get()[k], set: (v) => patchOpening(o.id, { [k]: v }) });
        openingFields.push(f.sync); grid.append(f.el);
      };
      const R = () => state.design.room;
      mk('x', 'From left', () => 0, (q) => R().width - q.w);
      if (o.type === 'window') mk('y', 'Sill height', () => 0, (q) => R().height - q.h);
      mk('w', 'Width', () => (o.type === 'door' ? 70 : 30), (q) => Math.min(o.type === 'door' ? 130 : 400, R().width - q.x));
      mk('h', 'Height', () => (o.type === 'door' ? 190 : 30), (q) => Math.min(o.type === 'door' ? 240 : 300, R().height - q.y));
      list.append(h('details', { class: 'op', open: i === room.openings.length - 1 && room.openings.length > 1 ? true : (i === 0) },
        h('summary', {}, h('span', { html: o.type === 'door' ? ICON_DOOR : ICON_WINDOW }), h('b', {}, title),
          h('button', { type: 'button', class: 'link-btn', 'aria-label': `Remove ${title}`, onclick: (e) => { e.preventDefault(); commit(updateRoom(state.design, { openings: state.design.room.openings.filter((q) => q.id !== o.id) })); toast(`${title} removed`); } }, 'Remove')),
        grid));
    });
  }
  openingFields.forEach((f) => f());
}

// ---------- FURNITURE tab ----------
const paneFurn = $('#pane-furniture');
let editorKey = '', editorSync = [];

function buildFurniturePane() {
  const palette = h('section', { class: 'blk' }, h('h2', { class: 'blk__h' }, 'Add to your room'));
  const grid = h('div', { class: 'pal' });
  Object.entries(MODULE_TYPES).forEach(([type, t]) => {
    grid.append(h('button', { type: 'button', class: 'pal__c', 'aria-label': `Add ${t.label}`, onclick: () => addPiece(type) },
      h('span', { html: icon(t.icon || type) }), h('span', { class: 'pal__t' }, t.label)));
  });
  palette.append(grid);
  const listBlk = h('section', { class: 'blk' }, h('h2', { class: 'blk__h' }, 'Your pieces', h('span', { class: 'blk__n', id: 'mod-count' })), h('div', { class: 'mods', id: 'mod-list' }),
    h('div', { id: 'warn-furn', class: 'warns' }));
  const editor = h('section', { class: 'blk blk--editor', id: 'editor', 'aria-live': 'off' });
  paneFurn.append(palette, listBlk, editor);
}

function renderList() {
  const list = $('#mod-list');
  const mods = state.design.modules;
  $('#mod-count').textContent = mods.length ? String(mods.length) : '';
  const errIds = errorIdSet();
  const sig = JSON.stringify([mods.map((m) => [m.id, m.type, m.width, m.height, m.depth]), state.selectedId, [...errIds]]);
  if (list.dataset.sig === sig) return;
  list.dataset.sig = sig;
  list.textContent = '';
  if (!mods.length) { list.append(h('p', { class: 'empty' }, 'Nothing here yet. Pick a piece above to start your design.')); return; }
  mods.forEach((m) => {
    const sel = m.id === state.selectedId;
    list.append(h('div', { class: `mod${sel ? ' is-sel' : ''}${errIds.has(m.id) ? ' is-err' : ''}` },
      h('button', { type: 'button', class: 'mod__main', 'aria-pressed': sel ? 'true' : 'false', onclick: () => select(m.id, { scroll: true }) },
        h('span', { html: icon(MODULE_TYPES[m.type].icon || m.type), class: 'mod__ico' }),
        h('span', { class: 'mod__t' }, h('b', {}, nameOf(m)), h('small', {}, `${m.width} × ${m.height} × ${m.depth} cm`)),
        errIds.has(m.id) ? h('span', { class: 'mod__warn', title: 'Needs attention' }, '!') : null),
      h('button', { type: 'button', class: 'mod__x', 'aria-label': `Remove ${nameOf(m)}`, title: 'Remove', onclick: () => removeSelected(m.id) },
        h('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', html: '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' }))));
  });
}

function removeSelected(id = state.selectedId) {
  const m = state.design.modules.find((q) => q.id === id);
  if (!m) return;
  const name = nameOf(m);
  commit(removeModule(state.design, id));
  toast(`${name} removed`);
}

function renderEditor() {
  const host = $('#editor');
  const m = selected();
  const key = m ? `${m.id}:${m.type}` : 'none';
  if (key !== editorKey) {
    editorKey = key;
    editorSync = [];
    host.textContent = '';
    if (!m) {
      host.append(h('div', { class: 'edit-empty' }, h('p', {}, h('b', {}, 'Select a piece to edit it.')), h('p', { class: 'note' }, 'Click it in the 3D view or in the list above. You can drag a selected piece along the wall, or nudge it with the arrow keys.')));
      return;
    }
    const T = MODULE_TYPES[m.type];
    const cur = () => state.design.modules.find((q) => q.id === m.id) || m;
    const room = () => state.design.room;
    const patch = (p, k) => commit(updateModule(state.design, m.id, p), k ? `${m.id}:${k}` : null);
    const add = (f) => { editorSync.push(f.sync); host.append(f.el); return f; };

    host.append(h('div', { class: 'edit-head' },
      h('span', { html: icon(T.icon || m.type), class: 'edit-head__ico' }),
      h('div', {}, h('h2', { class: 'blk__h blk__h--sm', id: 'edit-title' }), h('p', { class: 'edit-head__sub', id: 'edit-price' })),
      h('div', { class: 'edit-head__btns' },
        h('button', { type: 'button', class: 'chip chip--s', onclick: () => {
          const c = cur();
          const next = addModule(state.design, c.type, { ...c, id: undefined, x: undefined });
          const added = next.modules[next.modules.length - 1];
          state.selectedId = added.id; commit(next); toast('Duplicated'); select(added.id);
        } }, 'Duplicate'),
        h('button', { type: 'button', class: 'chip chip--s chip--danger', onclick: () => removeSelected() }, 'Remove'))));

    const dimsBlk = h('div', { class: 'edit-grp' }, h('h3', { class: 'edit-grp__h' }, 'Size & position'));
    host.append(dimsBlk);
    const addTo = (parent) => (f) => { editorSync.push(f.sync); parent.append(f.el); };
    const dAdd = addTo(dimsBlk);
    [['width', 'Width'], ['height', 'Height'], ['depth', 'Depth']].forEach(([k, label]) => {
      dAdd(numField({ label, min: () => T.limits[k][0], max: () => Math.min(T.limits[k][1], k === 'width' ? room().width : k === 'height' ? room().height - cur().elevation : T.limits[k][1]), get: () => cur()[k], set: (v) => patch({ [k]: v }, k) }));
    });
    if (T.limits.elevation[1] > T.limits.elevation[0]) {
      dAdd(numField({ label: 'Height off floor', min: () => T.limits.elevation[0], max: () => Math.min(T.limits.elevation[1], room().height - T.limits.height[0]), get: () => cur().elevation, set: (v) => patch({ elevation: v }, 'elevation') }));
    }
    dAdd(numField({ label: 'Position along wall', min: () => 0, max: () => room().width - cur().width, get: () => cur().x, set: (v) => patch({ x: v }, 'x'), hint: 'from left' }));
    if (T.freestanding) dAdd(numField({ label: 'Distance from wall', min: () => 0, max: () => room().depth - cur().depth, get: () => cur().z || 0, set: (v) => patch({ z: v }, 'z') }));

    const style = h('div', { class: 'edit-grp' }, h('h3', { class: 'edit-grp__h' }, 'Construction'));
    host.append(style);
    const sAdd = addTo(style);
    const opt = (k, list) => list.map((v) => ({ value: v, label: LABELS[k][v] || v }));
    if (T.allowed.doors.length > 1) sAdd(segField({ label: 'Doors', name: `doors-${m.id}`, options: opt('doors', T.allowed.doors), get: () => cur().doors, set: (v) => patch({ doors: v }) }));
    if (T.allowed.interior.length > 1) sAdd(segField({ label: 'Interior', name: `interior-${m.id}`, options: opt('interior', T.allowed.interior), get: () => cur().interior, set: (v) => patch({ interior: v }) }));
    if (m.type !== 'table') sAdd(segField({ label: 'Handles', name: `handle-${m.id}`, options: opt('handle', HANDLES), get: () => cur().handle, set: (v) => patch({ handle: v }) }));
    const steps = h('div', { class: 'stps' });
    style.append(steps);
    const stAdd = addTo(steps);
    if (!['table', 'bench', 'kitchen-wall'].includes(m.type) || m.type !== 'table') {
      if (!['table', 'bench'].includes(m.type)) stAdd(stepper({ label: 'Sections', min: () => 1, max: () => 8, get: () => cur().sections, set: (v) => patch({ sections: v }) }));
    }
    if (T.allowed.maxDrawers > 0) stAdd(stepper({ label: 'Drawers', min: () => 0, max: () => T.allowed.maxDrawers, get: () => cur().drawers, set: (v) => patch({ drawers: v }) }));
    const tg = h('div', { class: 'tgs' });
    style.append(tg);
    const tAdd = addTo(tg);
    if (!['kitchen-wall', 'table', 'bench', 'desk'].includes(m.type)) tAdd(toggle({ label: 'Plinth', desc: 'Recessed kick board', get: () => cur().plinth, set: (v) => patch({ plinth: v }) }));
    if (m.type !== 'table') tAdd(toggle({ label: 'LED strip', desc: 'Warm light, glows at night', get: () => cur().led, set: (v) => patch({ led: v }) }));

    const mat = h('div', { class: 'edit-grp' }, h('h3', { class: 'edit-grp__h' }, 'Materials'));
    host.append(mat);
    const mAdd = addTo(mat);
    if (m.type !== 'table') mAdd(swatches({ label: 'Body', name: `body-${m.id}`, items: BODY_MATS, get: () => cur().body, set: (v) => patch({ body: v }) }));
    mAdd(swatches({ label: m.type === 'table' ? 'Frame' : 'Fronts', name: `front-${m.id}`, items: FRONT_MATS, get: () => cur().front, set: (v) => patch({ front: v }) }));
    if (T.allowed.worktop) mAdd(swatches({ label: m.type === 'kitchen-base' || m.type === 'island' ? 'Worktop' : 'Top', name: `top-${m.id}`, items: TOP_MATS, get: () => cur().worktop || '', set: (v) => patch({ worktop: v }) }));
  }
  if (m) {
    const q = lastQuote && lastQuote.modules.find((r) => r.id === m.id);
    $('#edit-title').textContent = nameOf(m);
    $('#edit-price').textContent = q ? `${eur0.format(q.total)} incl. fitting` : '';
    editorSync.forEach((f) => f());
  }
}

// ---------- validation ----------
let lastValidation = { ok: true, errors: [] };
function errorIdSet() {
  const s = new Set();
  lastValidation.errors.forEach((e) => e.moduleId && s.add(e.moduleId));
  findCollisions(state.design).forEach(([a, b]) => { s.add(a); s.add(b); });
  return s;
}
const friendly = (e) => e.message.replace(/\s*\([A-Za-z0-9_-]+\)/g, '');
function warnHtml(compact) {
  if (lastValidation.ok) return '';
  return lastValidation.errors.map((e) => `<div class="warn" role="note"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3l8 14H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 8v4M10 14.2v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>${esc(friendly(e))}</span>${e.moduleId && !compact ? `<button type="button" class="link-btn" data-focus="${esc(e.moduleId)}">Show</button>` : ''}</div>`).join('');
}

// ---------- QUOTE tab ----------
const paneQuote = $('#pane-quote');
let lastQuote = null;
let shownTotal = 0, countRaf = 0, liveTimer = 0;

function buildQuotePane() {
  paneQuote.innerHTML = `
    <section class="blk qt">
      <p class="qt__label">Estimated total</p>
      <p class="qt__total"><span id="qt-total">€ 0</span></p>
      <p class="qt__sub" id="qt-sub"></p>
      <div class="qt__meta"><span class="pill" id="qt-lead"></span><label class="sw sw--inline"><input type="checkbox" role="switch" id="qt-vat" checked><i class="sw__track" aria-hidden="true"></i><span class="sw__t">Include 21% VAT</span></label></div>
    </section>
    <div id="warn-quote" class="warns"></div>
    <section class="blk"><h2 class="blk__h">What it covers</h2><dl class="lines" id="qt-lines"></dl></section>
    <section class="blk"><h2 class="blk__h">Per piece</h2><div class="bd-legend" aria-hidden="true"><span class="k k--m">Materials</span><span class="k k--h">Hardware</span><span class="k k--l">Labour</span><span class="k k--i">Fitting</span></div><div class="bd" id="qt-mods"></div></section>
    <section class="blk"><details class="cut"><summary><span>Cut list</span><small id="cut-count"></small></summary><div class="cut__wrap"><table class="cut__t"><thead><tr><th scope="col">Part</th><th scope="col">Size, cm</th><th scope="col" class="r">Qty</th></tr></thead><tbody id="cut-body"></tbody></table><p class="note" id="cut-board"></p></div></details></section>
    <section class="blk qt__actions">
      <a class="btn btn--wide" id="qt-request" href="contact.html">Request a quote <span aria-hidden="true">→</span></a>
      <div class="qt__two"><button type="button" class="btn btn--ghost" id="qt-copy">Copy share link</button><button type="button" class="btn btn--ghost" id="qt-print">Print summary</button></div>
      <p class="note">An estimate for planning, based on your design. The workshop confirms the final price after a site visit. Nothing is sent from this page.</p>
    </section>`;
  $('#qt-vat').addEventListener('change', (e) => { state.vat = e.target.checked; refreshQuote(); });
  $('#qt-copy').addEventListener('click', copyLink);
  $('#qt-print').addEventListener('click', () => window.print());
}

function countTo(target) {
  const tot = $('#qt-total'), strip = $('#cfg-strip-total');
  cancelAnimationFrame(countRaf);
  const from = shownTotal, t0 = performance.now(), dur = reduced ? 0 : clamp(Math.abs(target - from) * 0.6, 250, 800);
  const paint = (v) => { const s = eur0.format(Math.round(v)).replace(/ /g, ' ').replace('€', '€ '); tot.textContent = s; strip.textContent = s; };
  if (!dur) { shownTotal = target; paint(target); return; }
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    shownTotal = from + (target - from) * e; paint(shownTotal);
    if (k < 1) countRaf = requestAnimationFrame(step); else shownTotal = target;
  };
  countRaf = requestAnimationFrame(step);
}

function refreshQuote() {
  const d = state.design;
  const q = quoteDesign(d, { vat: state.vat });
  lastQuote = q;
  countTo(q.total);
  $('#qt-sub').textContent = state.vat ? `Includes ${eur0.format(q.vat)} VAT (21%)` : `Excluding VAT. Subtotal ${eur0.format(q.subtotal)}`;
  $('#qt-lead').textContent = d.modules.length ? `About ${q.leadTimeWeeks} weeks from approval` : 'Add a piece to see the lead time';
  const rows = q.lines.filter((l) => l.amount > 0).map((l) => `<div><dt>${esc(l.label)}</dt><dd>${eur2.format(l.amount)}</dd></div>`);
  rows.push(`<div class="sub"><dt>Subtotal</dt><dd>${eur2.format(q.subtotal)}</dd></div>`);
  if (state.vat) rows.push(`<div><dt>VAT 21%</dt><dd>${eur2.format(q.vat)}</dd></div>`);
  rows.push(`<div class="tot"><dt>Total</dt><dd>${eur2.format(q.total)}</dd></div>`);
  $('#qt-lines').innerHTML = rows.join('');
  const mods = d.modules.map((m) => ({ m, r: q.modules.find((x) => x.id === m.id) })).filter((x) => x.r);
  $('#qt-mods').innerHTML = mods.length ? mods.map(({ m, r }) => {
    const sum = r.materials + r.hardware + r.labour + r.install || 1;
    const pc = (v) => ((v / sum) * 100).toFixed(1);
    return `<button type="button" class="bd__row" data-focus="${esc(m.id)}"><span class="bd__ico">${icon(MODULE_TYPES[m.type].icon || m.type)}</span><span class="bd__t"><b>${esc(nameOf(m))}</b><small>${m.width} × ${m.height} × ${m.depth} cm</small></span><span class="bd__p">${eur0.format(r.total)}</span><span class="bd__bar" aria-hidden="true"><i class="k--m" style="width:${pc(r.materials)}%"></i><i class="k--h" style="width:${pc(r.hardware)}%"></i><i class="k--l" style="width:${pc(r.labour)}%"></i><i class="k--i" style="width:${pc(r.install)}%"></i></span></button>`;
  }).join('') : '<p class="empty">No pieces yet.</p>';
  // cut list
  let last = '';
  const parts = q.cutList.map((c) => {
    let head = '';
    if (c.material !== last) { last = c.material; const m = MATERIALS[c.material]; head = `<tr class="cut__g"><th colspan="3" scope="colgroup"><i style="--c:${m ? m.color : 'transparent'}"></i>${esc(m ? m.label : c.material)}<small>${(q.boardM2ByMaterial[c.material] || 0).toFixed(2)} m²</small></th></tr>`; }
    return `${head}<tr><td>${esc(PART_LABELS[c.part] || c.part)}</td><td>${c.w} × ${c.h} × ${c.t}</td><td class="r">${c.qty}</td></tr>`;
  });
  $('#cut-body').innerHTML = parts.join('');
  const pieces = q.cutList.reduce((s, c) => s + c.qty, 0);
  $('#cut-count').textContent = `${pieces} parts`;
  const m2 = Object.values(q.boardM2ByMaterial).reduce((s, v) => s + v, 0);
  $('#cut-board').textContent = m2 ? `${m2.toFixed(2)} m² of board, before the offcut allowance.` : '';
  $('#qt-request').href = `contact.html#design=${encodeDesign(d)}`;
  // live region and print summary
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { $('#cfg-live').textContent = `Estimated total ${eur0.format(q.total)} ${state.vat ? 'including' : 'excluding'} VAT. Lead time about ${q.leadTimeWeeks} weeks.`; }, 900);
  buildPrintSummary(q);
}

function copyLink() {
  const url = `${location.origin}${location.pathname}#design=${encodeDesign(state.design)}`;
  const done = () => toast('Share link copied');
  const fallback = () => {
    const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' }, url);
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { toast('Copy failed. Select the address bar instead.'); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback); else fallback();
}

function buildPrintSummary(q) {
  const d = state.design, r = d.room;
  const mods = d.modules.map((m) => `<tr><td>${esc(nameOf(m))}</td><td>${m.width} × ${m.height} × ${m.depth}</td><td>${esc(MATERIALS[m.body].label)} / ${esc(MATERIALS[m.front].label)}${m.worktop ? ' / ' + esc(MATERIALS[m.worktop].label) : ''}</td><td class="r">${eur0.format((q.modules.find((x) => x.id === m.id) || { total: 0 }).total)}</td></tr>`).join('');
  const lines = q.lines.filter((l) => l.amount > 0).map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${eur2.format(l.amount)}</td></tr>`).join('');
  const cuts = q.cutList.map((c) => `<tr><td>${esc((MATERIALS[c.material] || { label: c.material }).label)}</td><td>${esc(PART_LABELS[c.part] || c.part)}</td><td>${c.w} × ${c.h} × ${c.t}</td><td class="r">${c.qty}</td></tr>`).join('');
  $('#print-summary').innerHTML = `
    <header><p>Grain &amp; Joint · concept studio</p><h1>Design summary</h1><p>${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}</p></header>
    <img id="print-shot" alt="Your design in 3D" />
    <h2>Room</h2><p>${r.width} cm wide, ${r.height} cm high, ${r.depth} cm deep. Floor: ${esc(FLOORS[r.floor].label)}. Walls: ${esc(WALL_COLORS[r.wall].label)}. ${r.openings.length} opening(s).</p>
    <h2>Pieces</h2><table><thead><tr><th>Piece</th><th>W × H × D, cm</th><th>Materials</th><th class="r">Price</th></tr></thead><tbody>${mods}</tbody></table>
    <h2>Quote</h2><table><tbody>${lines}<tr><td>Subtotal</td><td class="r">${eur2.format(q.subtotal)}</td></tr>${state.vat ? `<tr><td>VAT 21%</td><td class="r">${eur2.format(q.vat)}</td></tr>` : ''}<tr class="tot"><td>Total ${state.vat ? '(incl. VAT)' : '(excl. VAT)'}</td><td class="r">${eur2.format(q.total)}</td></tr></tbody></table>
    <p>Lead time about ${q.leadTimeWeeks} weeks from approval.</p>
    <h2>Cut list</h2><table><thead><tr><th>Material</th><th>Part</th><th>Size, cm</th><th class="r">Qty</th></tr></thead><tbody>${cuts}</tbody></table>
    <p class="fine">An estimate for planning only. Grain &amp; Joint is a concept studio and this page sends nothing anywhere.</p>`;
}
window.addEventListener('beforeprint', () => { const img = $('#print-shot'); if (img) img.src = scene.screenshot(); });

// ---------- refresh ----------
function refresh() {
  lastValidation = validate(state.design);
  const ids = errorIdSet();
  scene.setErrors([...ids]);
  roomSync.forEach((f) => f());
  renderList();
  refreshQuote();
  renderEditor();
  const wh = warnHtml(false);
  $('#warn-furn').innerHTML = wh; $('#warn-quote').innerHTML = wh;
  const chip = $('#cfg-issues');
  const n = lastValidation.errors.length;
  chip.hidden = n === 0;
  chip.textContent = n ? `${n} ${n === 1 ? 'issue' : 'issues'} to check` : '';
  $('#cfg-undo').disabled = !past.length;
  $('#cfg-redo').disabled = !future.length;
}

// ---------- tabs ----------
const tabs = ['room', 'furniture', 'quote'];
function showTab(name, focus = false) {
  state.tab = name;
  tabs.forEach((t) => {
    const btn = $(`#tab-${t}`), pane = $(`#pane-${t}`);
    const on = t === name;
    btn.setAttribute('aria-selected', on); btn.tabIndex = on ? 0 : -1;
    pane.hidden = !on;
    if (on && focus) btn.focus();
  });
  $('#cfg-body').scrollTop = 0;
  if (mobileQ.matches && sheetState === 0) setSheet(1);
}
$('[role=tablist]').addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) showTab(b.id.replace('tab-', '')); });
$('[role=tablist]').addEventListener('keydown', (e) => {
  const i = tabs.indexOf(state.tab);
  let n = null;
  if (e.key === 'ArrowRight') n = (i + 1) % 3; else if (e.key === 'ArrowLeft') n = (i + 2) % 3;
  else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = 2;
  if (n !== null) { e.preventDefault(); showTab(tabs[n], true); }
});
$('#cfg-strip-btn').addEventListener('click', () => showTab('quote'));
document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-focus]');
  if (f) { select(f.dataset.focus); showTab('furniture'); }
});
$('#cfg-issues').addEventListener('click', () => showTab('furniture'));

// ---------- top bar wiring ----------
document.querySelectorAll('input[name=view]').forEach((r) => r.addEventListener('change', () => { if (r.checked) scene.setView(r.value); }));
scene.onViewChange((v) => { const r = document.querySelector(`input[name=view][value=${v}]`); if (r) r.checked = true; });
const explodeIn = $('#cfg-explode'), explodeBtn = $('#cfg-explode-btn');
explodeIn.addEventListener('input', (e) => { scene.setExplode(Number(e.target.value) / 100); explodeBtn.setAttribute('aria-pressed', Number(e.target.value) > 0); });
explodeBtn.addEventListener('click', () => {
  const on = explodeBtn.getAttribute('aria-pressed') !== 'true';
  explodeBtn.setAttribute('aria-pressed', on); explodeIn.value = on ? 100 : 0; scene.setExplode(on ? 1 : 0);
});
const doorsBtn = $('#cfg-doors');
doorsBtn.addEventListener('click', () => { const on = doorsBtn.getAttribute('aria-pressed') !== 'true'; doorsBtn.setAttribute('aria-pressed', on); scene.setDoors(on ? 1 : 0); });
const lightBtn = $('#cfg-light');
lightBtn.addEventListener('click', () => {
  const night = lightBtn.getAttribute('aria-pressed') !== 'true';
  lightBtn.setAttribute('aria-pressed', night);
  root.dataset.lighting = night ? 'night' : 'day';
  $('[data-light-text]').textContent = night ? 'Night' : 'Day';
  scene.setLighting(night ? 'night' : 'day');
});
$('#cfg-shot').addEventListener('click', () => {
  const url = scene.screenshot();
  if (!url) { toast('Screenshot needs 3D support'); return; }
  const a = h('a', { href: url, download: 'grain-and-joint-design.png' });
  document.body.append(a); a.click(); a.remove();
  const fl = $('#cfg-flash'); fl.classList.remove('is-on'); void fl.offsetWidth; fl.classList.add('is-on');
  toast('Screenshot saved');
});
$('#cfg-undo').addEventListener('click', undo);
$('#cfg-redo').addEventListener('click', redo);

scene.onSelect((id) => { state.selectedId = id; schedule(refresh); if (id) showPanelFor(); });
function showPanelFor() { if (state.tab !== 'furniture') showTab('furniture'); }
scene.onDrag(({ id, x, z, done }) => {
  if (done) { lastKey = null; return; }
  const m = state.design.modules.find((q) => q.id === id);
  if (!m) return;
  const free = MODULE_TYPES[m.type].freestanding;
  const next = free ? updateModule(state.design, id, { x, z }) : moveModule(state.design, id, x);
  const after = next.modules.find((q) => q.id === id);
  if (after.x === m.x && (after.z || 0) === (m.z || 0)) return;
  commit(next, `drag:${id}`);
});
canvas.addEventListener('pointerdown', () => { $('#cfg-hint').classList.add('is-gone'); }, { once: true });

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const inField = t.closest && t.closest('input, textarea, select, [contenteditable=true], [role=tablist], [role=slider]');
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    if (inField && t.matches('input[type=text], input[type=number], textarea')) return;
    e.preventDefault(); e.shiftKey ? redo() : undo(); return;
  }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (inField || mod || e.altKey) return;
  const m = selected();
  if (!m) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
  const step = e.shiftKey ? 10 : 1;
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const a = arrows[e.key];
  if (!a) return;
  e.preventDefault();
  const free = MODULE_TYPES[m.type].freestanding;
  let next = state.design;
  if (a[0]) next = updateModule(next, m.id, { x: m.x + a[0] * step });
  else if (free) next = updateModule(next, m.id, { z: (m.z || 0) - a[1] * step });
  else if (MODULE_TYPES[m.type].limits.elevation[1] > 0) next = updateModule(next, m.id, { elevation: m.elevation + a[1] * step });
  if (next !== state.design) commit(next, `nudge:${m.id}`);
});

// ---------- bottom sheet (phones) ----------
const panel = $('#cfg-panel'), grab = $('#cfg-grab'), cfgEl = root;
let sheetState = 0;
function sheetHeights() {
  const H = cfgEl.clientHeight;
  const peek = grab.offsetHeight + $('.cfg__tabs').offsetHeight + $('.cfg__strip').offsetHeight;
  return [peek, Math.round(H * 0.5), Math.round(H * 0.88)];
}
function setSheet(s, animate = true) {
  sheetState = s;
  if (!mobileQ.matches) { panel.style.transform = ''; grab.setAttribute('aria-expanded', 'true'); scene.setViewInset({ top: $('.cfg__bar').getBoundingClientRect().height + 20, bottom: 0 }); return; }
  const vis = sheetHeights()[s];
  panel.style.transition = animate && !reduced ? '' : 'none';
  panel.style.setProperty('--sheet-vis', `${vis}px`);
  panel.style.transform = '';
  grab.setAttribute('aria-expanded', s > 0);
  panel.dataset.sheet = s;
  const barH = $('.cfg__bar').getBoundingClientRect().height + 12;
  scene.setViewInset({ top: barH, bottom: Math.min(vis, cfgEl.clientHeight * 0.55) });
}
grab.addEventListener('click', () => { if (grab.dataset.dragged) { delete grab.dataset.dragged; return; } setSheet((sheetState + 1) % 3); });
let drag = null;
grab.addEventListener('pointerdown', (e) => {
  if (!mobileQ.matches) return;
  const hs = sheetHeights();
  drag = { y: e.clientY, vis: hs[sheetState], hs, t: performance.now(), last: e.clientY, moved: false };
  grab.setPointerCapture(e.pointerId);
  panel.style.transition = 'none';
});
grab.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
  const vis = clamp(drag.vis + (drag.y - e.clientY), drag.hs[0], drag.hs[2]);
  panel.style.setProperty('--sheet-vis', `${vis}px`);
  drag.cur = vis; drag.v = (drag.last - e.clientY); drag.last = e.clientY;
});
const endDrag = () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.moved) return;
  grab.dataset.dragged = '1'; setTimeout(() => delete grab.dataset.dragged, 50);
  const target = (d.cur || d.vis) + d.v * 8;
  let best = 0;
  d.hs.forEach((v, i) => { if (Math.abs(v - target) < Math.abs(d.hs[best] - target)) best = i; });
  panel.style.transition = '';
  setSheet(best);
};
grab.addEventListener('pointerup', endDrag);
grab.addEventListener('pointercancel', endDrag);
mobileQ.addEventListener('change', () => setSheet(mobileQ.matches ? 1 : 0, false));
window.addEventListener('resize', () => setSheet(sheetState, false));

// ---------- go ----------
buildRoomPane();
buildFurniturePane();
buildQuotePane();
showTab('furniture');
setSheet(mobileQ.matches ? 1 : 0, false);
scene.setDesign(state.design);
scene.select(state.selectedId);
refresh();
requestAnimationFrame(() => requestAnimationFrame(() => { const l = $('#cfg-loading'); if (l) l.classList.add('is-done'); }));
window.__cfg = { state, scene, commit, select };
