// Planner v2 store: a pure reducer over { project, ui, history } plus a small createStore() wrapper that adds
// subscriptions and persistence. The reducer has no DOM, so Node can test it. Actions are listed in CONTRACTS.md.
import {
  OPENING_TYPES, createProject, clampProject, setTemplate, updateRoom, addOpening, updateOpening, removeOpening, wallsOf
} from './model.js';
import { encodeProject, decodeProject, saveLocal, loadLocal } from './share.js';

export const HISTORY_LIMIT = 100;   // undo steps kept
export const COALESCE_MS = 1200;    // edits with the same `coalesce` key closer together than this form one undo step
export const STEP_IDS = ['room', 'furniture', 'interior', 'place', 'review'];

// ---------- state ----------
function sanitizeUi(ui, project) {
  const walls = project.room.walls;
  const wallId = walls.some((w) => w.id === ui.wallId) ? ui.wallId : (walls[0] ? walls[0].id : null);
  const openingId = project.room.openings.some((o) => o.id === ui.openingId) ? ui.openingId : null;
  return wallId === ui.wallId && openingId === ui.openingId ? ui : { ...ui, wallId, openingId };
}

export function initialState(project) {
  const p = project || createProject();
  return {
    project: p,
    past: [], future: [],
    key: null, keyAt: 0,
    // UI state lives beside the project and is never part of undo, saving or sharing
    ui: sanitizeUi({ step: 0, wallId: null, openingId: null, pane: 'plan' }, p)
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

// Offset (multiple of 5 where it fits) that centres `width` in the largest free gap, or null when no gap is big enough.
export function freeOffset(room, wall, spec, width, skipId) {
  const gaps = gapsOn(room, wall, spec.bottom, spec.height, skipId).filter(([a, b]) => b - a >= width - 1e-6);
  if (!gaps.length) return null;
  gaps.sort((g, h) => (h[1] - h[0]) - (g[1] - g[0]));
  const [a, b] = gaps[0];
  let off = Math.round((a + (b - a - width) / 2) / 5) * 5;
  off = Math.min(Math.max(off, Math.ceil(a)), Math.floor(b - width));
  return Math.max(0, off);
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
    const order = [...(own ? [own] : []), ...walls.filter((w) => w !== own).sort((a, b) => b.length - a.length)];
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
      return null;
  }
}

export function reduce(state, action) {
  if (!action || typeof action.type !== 'string') return state;
  const { project, ui } = state;
  switch (action.type) {
    case 'ui/step': {
      const step = Math.max(0, Math.min(STEP_IDS.length - 1, Math.round(Number(action.step))));
      return Number.isFinite(step) && step !== ui.step ? { ...state, ui: { ...ui, step } } : state;
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
