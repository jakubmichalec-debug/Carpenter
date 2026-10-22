// Planner v2 store: a pure reducer over { project, ui, history } plus a small createStore() wrapper that adds
// subscriptions and persistence. The reducer has no DOM, so Node can test it. Actions are listed in CONTRACTS.md.
import {
  OPENING_TYPES, TYPES, createProject, clampProject, setTemplate, updateRoom, addOpening, updateOpening, removeOpening, wallsOf,
  addPiece, updatePiece, removePiece, setBays, addItem, moveItem, updateItem, removeItem, applyPreset
} from './model.js';
import { ceilingProfile, minCeiling } from './plan-geom.js';
import { encodeProject, decodeProject, saveLocal, loadLocal } from './share.js';

export const HISTORY_LIMIT = 100;   // undo steps kept
export const COALESCE_MS = 1200;    // edits with the same `coalesce` key closer together than this form one undo step
export const STEP_IDS = ['room', 'furniture', 'interior', 'place', 'review'];

// ---------- state ----------
function sanitizeUi(ui, project) {
  const walls = project.room.walls;
  const wallId = walls.some((w) => w.id === ui.wallId) ? ui.wallId : (walls[0] ? walls[0].id : null);
  const openingId = project.room.openings.some((o) => o.id === ui.openingId) ? ui.openingId : null;
  // the piece being edited: its id, the selected bay and the selected item (an index into that bay)
  const piece = project.pieces.find((p) => p.id === ui.pieceId) || project.pieces[0] || null;
  const pieceId = piece ? piece.id : null;
  const bay = piece ? Math.max(0, Math.min(piece.bays.length - 1, Math.round(Number(ui.bay) || 0))) : 0;
  const item = piece && Number.isInteger(ui.item) && piece.bays[bay] && piece.bays[bay].items[ui.item] ? ui.item : null;
  // a piece stays "fresh" (a new type may replace it) until something else is done to it or it is placed
  const fresh = ui.fresh && ui.fresh === pieceId && !project.placements.some((pl) => pl.pieceId === pieceId) ? ui.fresh : null;
  return wallId === ui.wallId && openingId === ui.openingId && pieceId === ui.pieceId && bay === ui.bay && item === ui.item && fresh === (ui.fresh || null)
    ? ui : { ...ui, wallId, openingId, pieceId, bay, item, fresh };
}

export function initialState(project) {
  const p = project || createProject();
  return {
    project: p,
    past: [], future: [],
    key: null, keyAt: 0,
    // UI state lives beside the project and is never part of undo, saving or sharing
    ui: sanitizeUi({ step: 0, wallId: null, openingId: null, pieceId: null, bay: 0, item: null, fresh: null, pane: 'plan' }, p)
  };
}

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

// Free horizontal gaps on a wall for something that spans [bottom, bottom + height]. Openings that do not share
// that height band do not get in the way (a socket under a window is fine).
function gapsOn(room, wall, bottom, height, skipId) {
  const busy = room.openings
    .filter((o) => o.wallId === wall.id && o.id !== skipId && bottom < o.bottom + o.height && o.bottom < bottom + height)
    .map((o) => [Math.max(0, o.offset), Math.min(wall.length, o.offset + o.width)])
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let at = 0;
  for (const [a, b] of busy) {
    if (a > at) gaps.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < wall.length) gaps.push([at, wall.length]);
  return gaps;
}

// True when something spanning bottom..bottom+height stays under the ceiling along [off, off + width] of the wall
// (an attic slope lowers the ceiling toward its knee wall).
export function fitsUnderCeiling(room, wall, spec, off, width) {
  const top = (spec.bottom || 0) + spec.height;
  return minCeiling(ceilingProfile(room, wall), off, off + width) >= top - 0.5;
}

// Offset (multiple of 5 where it fits) that centres `width` in the largest free gap where the opening also fits under
// the ceiling, or null when there is no such place.
export function freeOffset(room, wall, spec, width, skipId) {
  const gaps = gapsOn(room, wall, spec.bottom, spec.height, skipId).filter(([a, b]) => b - a >= width - 1e-6);
  gaps.sort((g, h) => (h[1] - h[0]) - (g[1] - g[0]));
  for (const [a, b] of gaps) {
    const lo = Math.ceil(a), hi = Math.floor(b - width);
    const mid = Math.min(Math.max(Math.round((a + (b - a - width) / 2) / 5) * 5, lo), hi);
    const cand = [];
    for (let off = lo; off <= hi; off += off === lo && lo % 5 ? 5 - (lo % 5) : 5) cand.push(off);
    cand.push(mid);
    cand.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid));
    const ok = cand.find((off) => fitsUnderCeiling(room, wall, spec, off, width));
    if (ok !== undefined) return Math.max(0, ok);
  }
  return null;
}

function newOpening(project, spec, ui) {
  const room = project.room;
  const defs = OPENING_TYPES[spec && spec.type];
  if (!defs) return { error: null, opening: null };
  const walls = wallsOf(room);
  const wall = walls.find((w) => w.id === (spec.wallId || ui.wallId)) || walls[0];
  if (!wall) return { error: null, opening: null };
  const o = { ...defs.defaults, ...spec, type: spec.type, wallId: wall.id };
  if (!Number.isFinite(o.offset)) {
    const off = freeOffset(room, wall, o, o.width);
    if (off === null) return { error: `No room on this wall for a ${o.width} cm ${defs.label.toLowerCase()}.`, opening: null };
    o.offset = off;
  }
  return { error: null, opening: o };
}

// After a template or measurement change, gives every opening that no longer fits a free spot: first on its own
// wall, then on the longest other walls. Only if nothing fits does it stay flagged (validation then reports it).
function rehome(project) {
  const bad = (room, o) => {
    const w = room.walls.find((x) => x.id === o.wallId);
    return !w || o.flagged || o.offset < 0 || o.offset + o.width > wallsOf(room).find((x) => x.id === o.wallId).length + 0.5;
  };
  let next = project;
  for (const o of project.room.openings) {
    const cur = next.room.openings.find((x) => x.id === o.id);
    if (!cur || !bad(next.room, cur)) continue;
    const walls = wallsOf(next.room);
    const own = walls.find((w) => w.id === cur.wallId);
    const full = (w) => minCeiling(ceilingProfile(next.room, w), 0, w.length) >= next.room.height - 0.5;
    const others = walls.filter((w) => w !== own).sort((a, b) => (full(b) - full(a)) || (b.length - a.length));
    const order = [...(own ? [own] : []), ...others];
    const rest = { ...next.room, openings: next.room.openings.filter((x) => x.id !== cur.id) };
    for (const w of order) {
      const width = Math.min(cur.width, Math.floor(w.length));
      if (width < OPENING_TYPES[cur.type].width[0]) continue;
      const off = freeOffset(rest, w, { ...cur, width }, width);
      if (off === null) continue;
      next = updateOpening(next, cur.id, { wallId: w.id, width, offset: off });
      break;
    }
  }
  return next;
}

// Piece actions (steps 2 and 3). `id` defaults to the piece being edited. Returns null for an unknown action.
function pieceAction(project, action, ui) {
  const pid = action.id === undefined ? ui.pieceId : action.id;
  switch (action.type) {
    case 'piece/add': {
      if (!TYPES[action.pieceType]) return project;
      let base = project;
      // the piece just added and still untouched is swapped for the new type, so browsing types does not pile up pieces
      if (ui.fresh && ui.fresh === ui.pieceId && !project.placements.some((pl) => pl.pieceId === ui.fresh)) base = removePiece(base, ui.fresh);
      return addPiece(base, action.pieceType, action.style, action.overrides);
    }
    case 'piece/update': return updatePiece(project, pid, action.patch);
    case 'piece/remove': return removePiece(project, pid);
    case 'piece/bays': return setBays(project, pid, action.bays);
    case 'piece/item/add': return addItem(project, pid, action.bay, action.item);
    case 'piece/item/move': return moveItem(project, pid, action.bay, action.index, { y: action.y, bay: action.toBay });
    case 'piece/item/update': return updateItem(project, pid, action.bay, action.index, action.patch);
    case 'piece/item/remove': return removeItem(project, pid, action.bay, action.index);
    case 'piece/preset': return applyPreset(project, pid, action.bay, action.preset);
    default: return null;
  }
}

// What the selection becomes after a piece action has changed the project.
function pieceUi(action, before, next, ui) {
  const pid = action.id === undefined ? ui.pieceId : action.id;
  const out = { ...ui, fresh: null };
  const piece = next.pieces.find((p) => p.id === pid);
  switch (action.type) {
    case 'piece/add': {
      const added = next.pieces[next.pieces.length - 1]; // addPiece appends
      return added ? { ...out, pieceId: added.id, bay: 0, item: null, fresh: added.id } : out;
    }
    case 'piece/remove': {
      if (pid !== ui.pieceId) return out;
      const i = before.pieces.findIndex((p) => p.id === pid);
      const rest = next.pieces;
      const pick = rest[Math.max(0, i - 1)] || rest[0] || null;
      return { ...out, pieceId: pick ? pick.id : null, bay: 0, item: null };
    }
    case 'piece/item/add': {
      if (!piece || !piece.bays[action.bay]) return out;
      const was = before.pieces.find((p) => p.id === pid);
      const grew = was && piece.bays[action.bay].items.length > was.bays[action.bay].items.length;
      return grew ? { ...out, pieceId: pid, bay: action.bay, item: piece.bays[action.bay].items.length - 1 } : out;
    }
    case 'piece/item/move': {
      if (!piece) return out;
      const dest = Number.isInteger(action.toBay) && piece.bays[action.toBay] ? action.toBay : action.bay;
      const idx = dest === action.bay ? action.index : piece.bays[dest].items.length - 1;
      return { ...out, pieceId: pid, bay: dest, item: idx };
    }
    case 'piece/item/update': return { ...out, pieceId: pid, bay: action.bay, item: action.index };
    case 'piece/item/remove': return { ...out, item: null };
    case 'piece/preset': return { ...out, pieceId: pid, bay: action.bay, item: null };
    default: return out;
  }
}

// Applies a project action. Returns the new project, or the same object when nothing applies.
function projectAction(project, action, ui) {
  switch (action.type) {
    case 'room/template':
      return rehome(setTemplate(project, action.id, action.params));
    case 'room/params': {
      const t = project.room.template;
      return t ? rehome(setTemplate(project, t.id, action.params)) : project;
    }
    case 'room/update':
      return updateRoom(project, action.patch);
    case 'room/opening/add': {
      const { opening } = newOpening(project, action.opening || {}, ui);
      return opening ? addOpening(project, opening) : project;
    }
    case 'room/opening/update':
      return updateOpening(project, action.id, action.patch);
    case 'room/opening/move': {
      // puts an opening on another wall (default: the selected one) at a free spot
      const o = project.room.openings.find((x) => x.id === action.id);
      if (!o) return project;
      const wall = wallsOf(project.room).find((w) => w.id === (action.wallId || ui.wallId));
      if (!wall) return project;
      const rest = { ...project.room, openings: project.room.openings.filter((x) => x.id !== o.id) };
      const width = Math.min(o.width, Math.floor(wall.length));
      const off = freeOffset(rest, wall, { ...o, width }, width);
      return updateOpening(project, o.id, { wallId: wall.id, width, offset: off === null ? 0 : off });
    }
    case 'room/opening/remove':
      return removeOpening(project, action.id);
    default:
      return pieceAction(project, action, ui);
  }
}

export function reduce(state, action) {
  if (!action || typeof action.type !== 'string') return state;
  const { project, ui } = state;
  switch (action.type) {
    case 'ui/step': {
      const step = Math.max(0, Math.min(STEP_IDS.length - 1, Math.round(Number(action.step))));
      return Number.isFinite(step) && step !== ui.step ? { ...state, ui: { ...ui, step, fresh: null } } : state;
    }
    case 'ui/piece': {
      if (!project.pieces.some((p) => p.id === action.id)) return state;
      return ui.pieceId === action.id && ui.item === null && !ui.fresh ? state : { ...state, ui: { ...ui, pieceId: action.id, bay: 0, item: null, fresh: null } };
    }
    case 'ui/bay': {
      const piece = project.pieces.find((p) => p.id === ui.pieceId);
      if (!piece) return state;
      const bay = Math.max(0, Math.min(piece.bays.length - 1, Math.round(Number(action.bay) || 0)));
      return bay === ui.bay && ui.item === null ? state : { ...state, ui: { ...ui, bay, item: null } };
    }
    case 'ui/item': {
      const piece = project.pieces.find((p) => p.id === ui.pieceId);
      const bay = piece && piece.bays[action.bay] ? action.bay : null;
      if (bay === null) return state;
      const item = Number.isInteger(action.index) && piece.bays[bay].items[action.index] ? action.index : null;
      return bay === ui.bay && item === ui.item ? state : { ...state, ui: { ...ui, bay, item } };
    }
    case 'ui/wall': {
      if (!project.room.walls.some((w) => w.id === action.wallId)) return state;
      if (ui.wallId === action.wallId && ui.openingId === null) return state;
      return { ...state, ui: { ...ui, wallId: action.wallId, openingId: null } };
    }
    case 'ui/opening': {
      const o = project.room.openings.find((x) => x.id === action.id);
      if (!o) return ui.openingId === null ? state : { ...state, ui: { ...ui, openingId: null } };
      return { ...state, ui: { ...ui, wallId: o.wallId, openingId: o.id } };
    }
    case 'ui/pane':
      return ['plan', 'wall', '3d'].includes(action.pane) ? (ui.pane === action.pane ? state : { ...state, ui: { ...ui, pane: action.pane } }) : state;
    case 'history/seal':
      return state.key === null ? state : { ...state, key: null };
    case 'history/undo': {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      const next = { ...state, project: prev, past: state.past.slice(0, -1), future: [project, ...state.future].slice(0, HISTORY_LIMIT), key: null };
      return { ...next, ui: sanitizeUi(ui, prev) };
    }
    case 'history/redo': {
      if (!state.future.length) return state;
      const nextProject = state.future[0];
      const next = { ...state, project: nextProject, past: [...state.past, project].slice(-HISTORY_LIMIT), future: state.future.slice(1), key: null };
      return { ...next, ui: sanitizeUi(ui, nextProject) };
    }
    case 'project/load': {
      const p = clampProject(action.project);
      return { ...initialState(p), ui: sanitizeUi({ ...ui, openingId: null }, p) };
    }
    default: {
      const next = projectAction(project, action, ui);
      if (action.type === 'room/opening/add' && same(next, project)) {
        const { error } = newOpening(project, action.opening || {}, ui);
        if (error) return { ...state, ui: { ...ui, notice: { id: (ui.notice ? ui.notice.id : 0) + 1, text: error } } };
      }
      if (next === null || same(next, project)) return state;
      const at = Number.isFinite(action.at) ? action.at : 0;
      const merge = !!action.coalesce && state.key === action.coalesce && at - state.keyAt <= COALESCE_MS && state.past.length > 0;
      const past = merge ? state.past : [...state.past, project].slice(-HISTORY_LIMIT);
      let nextUi = ui;
      if (action.type === 'room/opening/add') {
        const added = next.room.openings.find((o) => !project.room.openings.some((x) => x.id === o.id));
        if (added) nextUi = { ...ui, wallId: added.wallId, openingId: added.id };
      } else if (action.type === 'room/opening/remove' && ui.openingId === action.id) {
        nextUi = { ...ui, openingId: null };
      } else if (action.type.startsWith('piece/')) {
        nextUi = pieceUi(action, project, next, ui);
      }
      return {
        ...state, project: next, past, future: [], ui: sanitizeUi(nextUi, next),
        key: action.coalesce || null, keyAt: at
      };
    }
  }
}

export const selectors = {
  canUndo: (s) => s.past.length > 0,
  canRedo: (s) => s.future.length > 0,
  placedCount: (s) => s.project.placements.length
};

// ---------- store ----------
// createStore(initialProject, { persist, delay, now, save, setHash })
//   persist: save to localStorage and keep #p= in the URL, both debounced (default false so tests stay pure)
export function createStore(initialProject, opts = {}) {
  let state = initialState(initialProject);
  const subs = new Set();
  const now = opts.now || (() => Date.now());
  const delay = opts.delay ?? 400;
  const save = opts.save || saveLocal;
  const setHash = opts.setHash || ((code) => {
    if (typeof history !== 'undefined' && typeof location !== 'undefined') {
      try { history.replaceState(null, '', `${location.pathname}${location.search}#p=${code}`); } catch { /* sandboxed frame */ }
    }
  });
  let timer = null;
  let lastHash = '';

  async function persistNow() {
    timer = null;
    const p = state.project;
    save(p);
    try {
      const code = await encodeProject(p);
      if (p !== state.project) return; // a newer edit is on its way
      lastHash = `#p=${code}`;
      setHash(code);
    } catch { /* leave the URL alone */ }
  }
  const schedule = () => {
    if (!opts.persist) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(persistNow, delay);
  };

  const store = {
    getState: () => state,
    dispatch(action) {
      const a = action && action.at === undefined ? { ...action, at: now() } : action;
      const before = state;
      state = reduce(state, a);
      if (state === before) return state;
      if (state.project !== before.project) schedule();
      for (const fn of [...subs]) fn(state, before, a);
      return state;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    // Writes the pending save immediately (used before the page unloads).
    flush() { if (timer) { clearTimeout(timer); return persistNow(); } return Promise.resolve(); },
    get lastHash() { return lastHash; }
  };
  return store;
}

// URL hash first, then local storage, then a fresh project.
export async function loadInitialProject({ hash = typeof location !== 'undefined' ? location.hash : '', load = loadLocal } = {}) {
  if (hash && /^#?p=/.test(hash)) {
    const fromUrl = await decodeProject(hash);
    if (fromUrl) return fromUrl;
  }
  return load() || createProject();
}
