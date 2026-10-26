// Planner v2 store: a pure reducer over { project, ui, history } plus a small createStore() wrapper that adds
// subscriptions and persistence. The reducer has no DOM, so Node can test it. Actions are listed in CONTRACTS.md.
import {
  TYPES, createProject, clampProject, addPiece, updatePiece, removePiece, setBays, addItem, moveItem, updateItem, removeItem, applyPreset
} from './model.js';
import { encodeProject, decodeProject, saveLocal, loadLocal } from './share.js';

export const HISTORY_LIMIT = 100;   // undo steps kept
export const COALESCE_MS = 1200;    // edits with the same `coalesce` key closer together than this form one undo step
export const STEP_IDS = ['furniture', 'interior', 'review'];

// ---------- state ----------
function sanitizeUi(ui, project) {
  // the piece being edited: its id, the selected bay and the selected item (an index into that bay)
  const piece = project.pieces.find((p) => p.id === ui.pieceId) || project.pieces[0] || null;
  const pieceId = piece ? piece.id : null;
  const bay = piece ? Math.max(0, Math.min(piece.bays.length - 1, Math.round(Number(ui.bay) || 0))) : 0;
  const item = piece && Number.isInteger(ui.item) && piece.bays[bay] && piece.bays[bay].items[ui.item] ? ui.item : null;
  // a piece stays "fresh" (a new type may replace it) until something else is done to it
  const fresh = ui.fresh && ui.fresh === pieceId ? ui.fresh : null;
  return pieceId === ui.pieceId && bay === ui.bay && item === ui.item && fresh === (ui.fresh || null)
    ? ui : { ...ui, pieceId, bay, item, fresh };
}

export function initialState(project) {
  const p = project || createProject();
  return {
    project: p,
    past: [], future: [],
    key: null, keyAt: 0,
    // UI state lives beside the project and is never part of undo, saving or sharing
    ui: sanitizeUi({ step: 0, pieceId: null, bay: 0, item: null, fresh: null, starting: false, pane: 'plan' }, p)
  };
}

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

// Piece actions (the Furniture and Interior steps). `id` defaults to the piece being edited. Returns null for an unknown action.
function pieceAction(project, action, ui) {
  const pid = action.id === undefined ? ui.pieceId : action.id;
  switch (action.type) {
    case 'piece/add': {
      if (!TYPES[action.pieceType]) return project;
      let base = project;
      // the piece just added and still untouched is swapped for the new type, so browsing types does not pile up pieces
      if (ui.fresh && ui.fresh === ui.pieceId) base = removePiece(base, ui.fresh);
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
  const out = { ...ui, fresh: null, starting: false };
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
const projectAction = pieceAction;

export function reduce(state, action) {
  if (!action || typeof action.type !== 'string') return state;
  const { project, ui } = state;
  switch (action.type) {
    case 'ui/step': {
      const step = Math.max(0, Math.min(STEP_IDS.length - 1, Math.round(Number(action.step))));
      return Number.isFinite(step) && step !== ui.step ? { ...state, ui: { ...ui, step, fresh: null, starting: false } } : state;
    }
    case 'ui/new-piece':
      // Furniture step with nothing chosen yet: the next type picked adds a new piece
      return ui.step === 0 && ui.starting && !ui.fresh ? state : { ...state, ui: { ...ui, step: 0, fresh: null, starting: true } };
    case 'ui/piece': {
      if (!project.pieces.some((p) => p.id === action.id)) return state;
      return ui.pieceId === action.id && ui.item === null && !ui.fresh && !ui.starting ? state : { ...state, ui: { ...ui, pieceId: action.id, bay: 0, item: null, fresh: null, starting: false } };
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
    case 'ui/pane':
      return ['plan', '3d'].includes(action.pane) ? (ui.pane === action.pane ? state : { ...state, ui: { ...ui, pane: action.pane } }) : state;
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
      return { ...initialState(p), ui: sanitizeUi({ ...ui }, p) };
    }
    default: {
      const next = projectAction(project, action, ui);
      if (next === null || same(next, project)) return state;
      const at = Number.isFinite(action.at) ? action.at : 0;
      const merge = !!action.coalesce && state.key === action.coalesce && at - state.keyAt <= COALESCE_MS && state.past.length > 0;
      const past = merge ? state.past : [...state.past, project].slice(-HISTORY_LIMIT);
      let nextUi = ui;
      if (action.type.startsWith('piece/')) nextUi = pieceUi(action, project, next, ui);
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
  pieceCount: (s) => s.project.pieces.length
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

// Where the planner starts: a design in the URL hash first, then the one saved in this browser. With neither it is a
// first visit (kind 'new') and the project is the example one, which the start screen only uses if it is picked.
export async function loadStart({ hash = typeof location !== 'undefined' ? location.hash : '', load = loadLocal } = {}) {
  if (hash && /^#?(p|design)=/.test(hash)) { // #p= is this planner's link, #design= an old configurator link
    const fromUrl = await decodeProject(hash);
    if (fromUrl) return { project: fromUrl, kind: 'link' };
  }
  const saved = load();
  return saved ? { project: saved, kind: 'saved' } : { project: createProject(), kind: 'new' };
}

// Same order as loadStart, for callers that only want the project.
export async function loadInitialProject(opts) {
  return (await loadStart(opts)).project;
}
