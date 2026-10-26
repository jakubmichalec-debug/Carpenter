import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { reduce, initialState, createStore, loadInitialProject, HISTORY_LIMIT, COALESCE_MS, STEP_IDS } from '../site/js/planner/store.js';

const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const bare = () => M.createBlankProject();
const one = () => M.addPiece(bare(), 'wardrobe', 'flat-oak', { id: 'a', width: 200 });
let t = 1000;
const act = (s, a) => reduce(s, { at: (t += 5000), ...a });
const width = (s, id = 'a') => s.project.pieces.find((p) => p.id === id).width;

test('the planner has three steps: furniture, interior, review', () => {
  assert.deepEqual(STEP_IDS, ['furniture', 'interior', 'review']);
  const s = initialState(one());
  assert.deepEqual(Object.keys(s.ui).sort(), ['bay', 'fresh', 'item', 'pane', 'pieceId', 'starting', 'step']);
  assert.equal(reduce(s, { type: 'ui/step', step: 9 }).ui.step, 2);
  assert.equal(reduce(s, { type: 'ui/step', step: -4 }).ui.step, 0);
  for (const gone of ['room/template', 'room/params', 'room/update', 'room/opening/add', 'place/set', 'place/move', 'place/remove', 'ui/wall', 'ui/opening']) {
    assert.equal(reduce(s, { type: gone, id: 'rect', wallId: 'w1', spec: { mode: 'free', x: 1, z: 1 } }), s, `${gone} is not an action any more`);
  }
});

test('reducer is pure: frozen state in, no mutation', () => {
  let s = deepFreeze(initialState(one()));
  s = reduce(s, { type: 'piece/update', patch: { width: 220 }, at: 1 });
  assert.equal(width(s), 220);
  s = reduce(s, { type: 'piece/update', patch: { space: { width: 230, height: 250 } }, at: 2 });
  assert.deepEqual(s.project.pieces[0].space, { width: 230, height: 250 });
});

test('undo and redo walk the history; a new edit clears redo', () => {
  let s = initialState(one());
  const p0 = s.project;
  s = act(s, { type: 'piece/update', patch: { width: 210 } });
  s = act(s, { type: 'piece/update', patch: { width: 230 } });
  assert.equal(s.past.length, 2);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(width(s), 210);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project, p0);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project, p0);
  s = reduce(s, { type: 'history/redo' });
  assert.equal(width(s), 210);
  s = act(s, { type: 'piece/update', patch: { width: 300 } });
  assert.equal(s.future.length, 0);
  assert.equal(reduce(s, { type: 'history/redo' }), s);
});

test('rapid edits with the same coalesce key form one undo step', () => {
  let s = initialState(one());
  const p0 = s.project;
  for (let i = 0; i < 20; i++) s = reduce(s, { type: 'piece/update', patch: { width: 150 + i * 5 }, coalesce: 'p:width', at: 1000 + i * 30 });
  assert.equal(s.past.length, 1);
  assert.equal(width(s), 245);
  // another key, or a pause, starts a new step
  s = reduce(s, { type: 'piece/update', patch: { depth: 55 }, coalesce: 'p:depth', at: 1700 });
  assert.equal(s.past.length, 2);
  s = reduce(s, { type: 'piece/update', patch: { depth: 58 }, coalesce: 'p:depth', at: 1700 + COALESCE_MS + 1 });
  assert.equal(s.past.length, 3);
  s = reduce(s, { type: 'history/undo' });
  s = reduce(s, { type: 'history/undo' });
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project, p0);
});

test('history/seal ends a coalescing run', () => {
  let s = initialState(one());
  s = reduce(s, { type: 'piece/update', patch: { width: 210 }, coalesce: 'h', at: 1 });
  s = reduce(s, { type: 'history/seal' });
  s = reduce(s, { type: 'piece/update', patch: { width: 220 }, coalesce: 'h', at: 2 });
  assert.equal(s.past.length, 2);
});

test('no-op actions do not add history', () => {
  const s = initialState(one());
  const same = reduce(s, { type: 'piece/update', patch: { width: 200 }, at: 1 });
  assert.equal(same, s);
  assert.equal(reduce(s, { type: 'piece/remove', id: 'nope', at: 2 }), s);
  assert.equal(reduce(s, { type: 'bogus' }), s);
  assert.equal(reduce(s, null), s);
});

test('history is capped at 100 steps', () => {
  let s = initialState(one());
  for (let i = 0; i < HISTORY_LIMIT + 30; i++) s = act(s, { type: 'piece/update', patch: { width: 100 + (i % 150) + 1 } });
  assert.equal(s.past.length, HISTORY_LIMIT);
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) s = reduce(s, { type: 'history/undo' });
  assert.equal(s.past.length, 0);
  assert.equal(s.future.length, HISTORY_LIMIT);
});

test('UI state is separate from the project and never enters history', () => {
  let s = initialState(one());
  const p = s.project;
  s = reduce(s, { type: 'ui/step', step: 1 });
  s = reduce(s, { type: 'ui/pane', pane: '3d' });
  assert.equal(s.project, p);
  assert.equal(s.past.length, 0);
  assert.deepEqual([s.ui.step, s.ui.pane], [1, '3d']);
  assert.equal(reduce(s, { type: 'ui/pane', pane: 'wall' }), s, 'there is no wall view any more');
});

test('project/load replaces the project and resets history', () => {
  let s = initialState(one());
  s = act(s, { type: 'piece/update', patch: { width: 250 } });
  s = reduce(s, { type: 'ui/step', step: 1 });
  const other = M.addPiece(bare(), 'desk', undefined, { id: 'd', width: 150 });
  s = reduce(s, { type: 'project/load', project: other });
  assert.deepEqual(s.project.pieces.map((p) => p.id), ['d']);
  assert.equal(s.ui.pieceId, 'd');
  assert.equal(s.past.length, 0);
  assert.equal(s.ui.step, 1);
  // an old project with a room loads as pieces only
  s = reduce(s, { type: 'project/load', project: { ...JSON.parse(JSON.stringify(M.createProject())), room: { walls: [] }, placements: [{ pieceId: 'p1', mode: 'free', x: 1, z: 1 }] } });
  assert.deepEqual(Object.keys(s.project).sort(), ['pieces', 'v']);
  assert.equal(s.project.pieces.length, 2);
});

test('createStore: dispatch, subscribe, unsubscribe, timestamps', () => {
  const store = createStore(one(), { now: () => 5000 });
  const seen = [];
  const off = store.subscribe((s, before, a) => seen.push([a.type, a.at, s !== before]));
  store.dispatch({ type: 'piece/update', patch: { width: 220 } });
  store.dispatch({ type: 'ui/step', step: 1 });
  store.dispatch({ type: 'ui/step', step: 1 }); // no change, no notification
  off();
  store.dispatch({ type: 'piece/update', patch: { width: 230 } });
  assert.deepEqual(seen, [['piece/update', 5000, true], ['ui/step', 5000, true]]);
  assert.equal(width(store.getState()), 230);
});

test('createStore persistence is debounced to one save', async () => {
  const saves = [], hashes = [];
  const store = createStore(one(), { persist: true, delay: 30, save: (p) => saves.push(p), setHash: (c) => hashes.push(c) });
  for (let i = 0; i < 5; i++) store.dispatch({ type: 'piece/update', patch: { width: 210 + i } });
  store.dispatch({ type: 'ui/step', step: 1 }); // UI changes do not save
  assert.equal(saves.length, 0);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(saves.length, 1);
  assert.equal(saves[0].pieces[0].width, 214);
  assert.equal(hashes.length, 1);
  assert.match(hashes[0], /^[zu]/);
});

test('loadInitialProject: URL hash, then storage, then a fresh project', async () => {
  const custom = M.addPiece(bare(), 'desk', undefined, { id: 'd', width: 150 });
  const { encodeProject } = await import('../site/js/planner/share.js');
  const code = await encodeProject(custom);
  const fromUrl = await loadInitialProject({ hash: `#p=${code}`, load: () => null });
  assert.equal(fromUrl.pieces[0].width, 150);
  const stored = bare();
  assert.equal(await loadInitialProject({ hash: '', load: () => stored }), stored);
  assert.equal(await loadInitialProject({ hash: '#p=garbage!!', load: () => stored }), stored);
  const fresh = await loadInitialProject({ hash: '', load: () => null });
  assert.equal(fresh.v, 2);
  assert.equal(fresh.pieces.length, 2);
});

// ---------- piece actions (phase 3) ----------
test('piece/add selects the new piece and swaps a fresh one for the new type', () => {
  let s = initialState(bare());
  assert.equal(s.ui.pieceId, null);
  s = act(s, { type: 'piece/add', pieceType: 'wardrobe' });
  assert.equal(s.project.pieces.length, 1);
  assert.equal(s.ui.pieceId, s.project.pieces[0].id);
  assert.equal(s.ui.fresh, s.ui.pieceId);
  assert.deepEqual(Object.keys(s.project).sort(), ['pieces', 'v']);
  s = act(s, { type: 'piece/add', pieceType: 'desk' });
  assert.equal(s.project.pieces.length, 1, 'untouched piece was replaced');
  assert.equal(s.project.pieces[0].type, 'desk');
  s = act(s, { type: 'piece/update', patch: { width: 150 } });
  assert.equal(s.ui.fresh, null);
  s = act(s, { type: 'piece/add', pieceType: 'wardrobe' });
  assert.equal(s.project.pieces.length, 2);
  assert.equal(s.project.pieces[1].type, 'wardrobe');
  assert.equal(s.ui.pieceId, s.project.pieces[1].id);
  s = act(s, { type: 'piece/add', pieceType: 'nope' });
  assert.equal(s.project.pieces.length, 2);
});

test('piece update, remove and selection fall back sensibly', () => {
  let s = initialState(M.createProject());
  assert.equal(s.ui.pieceId, 'p1');
  s = act(s, { type: 'ui/piece', id: 'p2' });
  assert.equal(s.ui.pieceId, 'p2');
  s = act(s, { type: 'piece/update', patch: { width: 160 } });
  assert.equal(s.project.pieces[1].width, 160);
  s = act(s, { type: 'piece/remove' });
  assert.equal(s.project.pieces.length, 1);
  assert.equal(s.ui.pieceId, 'p1');
  s = act(s, { type: 'history/undo' });
  assert.equal(s.project.pieces.length, 2);
  s = act(s, { type: 'ui/piece', id: 'nope' });
  assert.equal(s.ui.pieceId, 'p1');
  s = act(s, { type: 'piece/remove', id: 'p1' });
  s = act(s, { type: 'piece/remove', id: 'p2' });
  assert.equal(s.ui.pieceId, null);
});

test('interior actions edit items and the selection follows', () => {
  let s = initialState(bare());
  s = act(s, { type: 'piece/add', pieceType: 'wardrobe', overrides: { bays: [{ width: 80, items: [] }, { width: 80, items: [] }, { width: 74, items: [] }] } });
  assert.equal(s.project.pieces[0].bays.length, 3);
  s = act(s, { type: 'piece/item/add', bay: 1, item: { kind: 'shelf', y: 100 } });
  assert.equal(s.ui.bay, 1);
  assert.equal(s.ui.item, 0);
  s = act(s, { type: 'piece/item/add', bay: 1, item: { kind: 'drawers', y: 0, count: 2 } });
  assert.equal(s.ui.item, 1);
  s = act(s, { type: 'piece/item/move', bay: 1, index: 0, y: 140 });
  assert.equal(s.project.pieces[0].bays[1].items[0].y, M.snapY(140));
  assert.equal(s.ui.item, 0);
  s = act(s, { type: 'piece/item/move', bay: 1, index: 0, toBay: 2, y: 50 });
  assert.equal(s.ui.bay, 2);
  assert.equal(s.ui.item, 0);
  assert.equal(s.project.pieces[0].bays[2].items[0].kind, 'shelf');
  assert.equal(s.project.pieces[0].bays[1].items.length, 1);
  s = act(s, { type: 'piece/item/update', bay: 1, index: 0, patch: { count: 4 } });
  assert.equal(s.project.pieces[0].bays[1].items[0].count, 4);
  s = act(s, { type: 'piece/item/remove', bay: 1, index: 0 });
  assert.equal(s.ui.item, null);
  s = act(s, { type: 'piece/preset', bay: 0, preset: 'hanging-shelf' });
  assert.ok(s.project.pieces[0].bays[0].items.length >= 2);
  assert.equal(s.ui.bay, 0);
  s = act(s, { type: 'piece/bays', bays: [60, 100, 72] });
  assert.deepEqual(s.project.pieces[0].bays.map((b) => b.width), [60, 100, 72]);
  s = act(s, { type: 'ui/item', bay: 0, index: 0 });
  assert.equal(s.ui.item, 0);
  s = act(s, { type: 'ui/bay', bay: 2 });
  assert.equal(s.ui.bay, 2);
  assert.equal(s.ui.item, null);
});

test('piece edits are coalesced and the reducer stays pure', () => {
  let s = deepFreeze(initialState(M.createProject()));
  s = reduce(s, { type: 'piece/update', patch: { width: 180 }, coalesce: 'k', at: 1 });
  s = reduce(s, { type: 'piece/update', patch: { width: 190 }, coalesce: 'k', at: 2 });
  assert.equal(s.past.length, 1);
  s = reduce(s, { type: 'piece/item/add', bay: 0, item: { kind: 'shelf', y: 50 }, at: 3 });
  assert.equal(s.past.length, 2);
});

test('ui/new-piece opens Furniture with nothing chosen until a type is picked', () => {
  let s = initialState(M.addPiece(one(), 'table', 'flat-oak', { id: 't' }));
  s = act(s, { type: 'ui/step', step: 2 });
  s = act(s, { type: 'ui/new-piece' });
  assert.equal(s.ui.step, 0);
  assert.equal(s.ui.starting, true);
  assert.equal(act(s, { type: 'ui/new-piece' }), s, 'repeating it changes nothing');
  s = act(s, { type: 'piece/add', pieceType: 'desk' });
  assert.equal(s.ui.starting, false);
  assert.equal(s.project.pieces.length, 3, 'a new piece, not a replacement');
  assert.equal(s.ui.pieceId, s.project.pieces[2].id);
  // leaving the step or picking a piece also ends it
  s = act(s, { type: 'ui/new-piece' });
  assert.equal(act(s, { type: 'ui/step', step: 1 }).ui.starting, false);
  assert.equal(act(s, { type: 'ui/piece', id: 'a' }).ui.starting, false);
  assert.equal(initialState(one()).ui.starting, false);
});

test('a piece removed from the list: the selection falls back to a neighbour, and undo brings it back', () => {
  let s = initialState(M.addPiece(one(), 'table', 'flat-oak', { id: 't' }));
  s = act(s, { type: 'ui/piece', id: 't' });
  s = act(s, { type: 'piece/remove', id: 't' });
  assert.deepEqual(s.project.pieces.map((p) => p.id), ['a']);
  assert.equal(s.ui.pieceId, 'a');
  s = act(s, { type: 'history/undo' });
  assert.equal(s.project.pieces.length, 2);
});
