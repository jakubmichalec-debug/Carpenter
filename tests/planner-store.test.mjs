import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { validateProject } from '../site/js/planner/validate.js';
import { reduce, initialState, createStore, loadInitialProject, HISTORY_LIMIT, COALESCE_MS } from '../site/js/planner/store.js';
import { WALL_T, cornerOffsets, wallQuads, ceilingProfile, minCeiling, PLAN_HANDLES } from '../site/js/planner/plan-geom.js';

const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const rectProject = () => M.setTemplate(M.createProject(), 'rect', {});
const bare = () => { const p = M.createProject(); return { ...p, pieces: [], placements: [] }; };
let t = 1000;
const act = (s, a) => reduce(s, { at: (t += 5000), ...a });

test('reducer is pure: frozen state in, no mutation', () => {
  let s = deepFreeze(initialState(bare()));
  s = reduce(s, { type: 'room/template', id: 'l-shape', at: 1 });
  assert.equal(s.project.room.template.id, 'l-shape');
  assert.equal(s.project.room.walls.length, 6);
  s = reduce(s, { type: 'room/opening/add', opening: { type: 'window' }, at: 2 });
  assert.equal(s.project.room.openings.length, 3);
});

test('template, params and update map to model functions', () => {
  let s = initialState(bare());
  s = act(s, { type: 'room/template', id: 'rect', params: { width: 500, depth: 400 } });
  assert.deepEqual(s.project.room.template.params, { width: 500, depth: 400 });
  s = act(s, { type: 'room/params', params: { width: 640 } });
  assert.equal(s.project.room.template.params.width, 640);
  assert.equal(s.project.room.template.params.depth, 400);
  assert.equal(s.project.room.walls[1].x, 640);
  s = act(s, { type: 'room/update', patch: { height: 280, floor: 'ash-floor', wall: 'sage' } });
  assert.equal(s.project.room.height, 280);
  assert.equal(s.project.room.floor, 'ash-floor');
  assert.equal(s.project.room.wall, 'sage');
});

test('opening add picks a free spot, selects it, update and remove work', () => {
  let s = initialState(bare());
  s = act(s, { type: 'room/template', id: 'rect', params: { width: 420, depth: 380 } });
  s = { ...s, project: { ...s.project, room: { ...s.project.room, openings: [] } } };
  s = act(s, { type: 'ui/wall', wallId: 'w1' });
  s = act(s, { type: 'room/opening/add', opening: { type: 'window' } });
  const a = s.project.room.openings[0];
  assert.equal(a.wallId, 'w1');
  assert.equal(a.offset, 150);
  assert.equal(s.ui.openingId, a.id);
  s = act(s, { type: 'room/opening/add', opening: { type: 'window' } });
  const b = s.project.room.openings[1];
  assert.ok(b.offset + b.width <= a.offset || a.offset + a.width <= b.offset, 'second window does not overlap');
  assert.equal(s.ui.openingId, b.id);
  s = act(s, { type: 'room/opening/update', id: b.id, patch: { width: 90, bottom: 100 } });
  assert.equal(s.project.room.openings[1].width, 90);
  assert.equal(s.project.room.openings[1].bottom, 100);
  s = act(s, { type: 'room/opening/remove', id: b.id });
  assert.equal(s.project.room.openings.length, 1);
  assert.equal(s.ui.openingId, null);
});

test('door is added at floor level with a swing', () => {
  let s = initialState(bare());
  s = act(s, { type: 'room/opening/add', opening: { type: 'door', wallId: 'w3' } });
  const d = s.project.room.openings.at(-1);
  assert.equal(d.type, 'door');
  assert.equal(d.bottom, 0);
  assert.equal(d.swing, 'in-left');
  assert.equal(d.wallId, 'w3');
});

test('undo and redo walk the history; a new edit clears redo', () => {
  let s = initialState(bare());
  const p0 = s.project;
  s = act(s, { type: 'room/update', patch: { height: 250 } });
  s = act(s, { type: 'room/update', patch: { height: 270 } });
  assert.equal(s.past.length, 2);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project.room.height, 250);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project, p0);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project, p0);
  s = reduce(s, { type: 'history/redo' });
  assert.equal(s.project.room.height, 250);
  s = act(s, { type: 'room/update', patch: { height: 300 } });
  assert.equal(s.future.length, 0);
  assert.equal(reduce(s, { type: 'history/redo' }), s);
});

test('rapid edits with the same coalesce key form one undo step', () => {
  let s = initialState(bare());
  const p0 = s.project;
  for (let i = 0; i < 20; i++) s = reduce(s, { type: 'room/params', params: { width: 300 + i * 5 }, coalesce: 'p:width', at: 1000 + i * 30 });
  assert.equal(s.past.length, 1);
  assert.equal(s.project.room.template.params.width, 395);
  // another key, or a pause, starts a new step
  s = reduce(s, { type: 'room/params', params: { depth: 300 }, coalesce: 'p:depth', at: 1700 });
  assert.equal(s.past.length, 2);
  s = reduce(s, { type: 'room/params', params: { depth: 310 }, coalesce: 'p:depth', at: 1700 + COALESCE_MS + 1 });
  assert.equal(s.past.length, 3);
  s = reduce(s, { type: 'history/undo' });
  s = reduce(s, { type: 'history/undo' });
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project, p0);
});

test('history/seal ends a coalescing run', () => {
  let s = initialState(bare());
  s = reduce(s, { type: 'room/update', patch: { height: 240 }, coalesce: 'h', at: 1 });
  s = reduce(s, { type: 'history/seal' });
  s = reduce(s, { type: 'room/update', patch: { height: 250 }, coalesce: 'h', at: 2 });
  assert.equal(s.past.length, 2);
});

test('no-op actions do not add history', () => {
  let s = initialState(bare());
  const same = reduce(s, { type: 'room/update', patch: { height: s.project.room.height }, at: 1 });
  assert.equal(same, s);
  assert.equal(reduce(s, { type: 'room/opening/remove', id: 'nope', at: 2 }), s);
  assert.equal(reduce(s, { type: 'bogus' }), s);
  assert.equal(reduce(s, null), s);
});

test('history is capped at 100 steps', () => {
  let s = initialState(bare());
  for (let i = 0; i < HISTORY_LIMIT + 30; i++) s = act(s, { type: 'room/update', patch: { height: 220 + (i % 150) + 1 } });
  assert.equal(s.past.length, HISTORY_LIMIT);
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) s = reduce(s, { type: 'history/undo' });
  assert.equal(s.past.length, 0);
  assert.equal(s.future.length, HISTORY_LIMIT);
});

test('UI state is separate from the project and never enters history', () => {
  let s = initialState(bare());
  const p = s.project;
  s = reduce(s, { type: 'ui/step', step: 3 });
  s = reduce(s, { type: 'ui/pane', pane: '3d' });
  s = reduce(s, { type: 'ui/wall', wallId: 'w2' });
  assert.equal(s.project, p);
  assert.equal(s.past.length, 0);
  assert.deepEqual([s.ui.step, s.ui.pane, s.ui.wallId], [3, '3d', 'w2']);
  assert.equal(reduce(s, { type: 'ui/step', step: 99 }).ui.step, 4);
  assert.equal(reduce(s, { type: 'ui/step', step: -4 }).ui.step, 0);
  assert.equal(reduce(s, { type: 'ui/wall', wallId: 'zz' }), s);
});

test('selection survives edits but is cleaned up when its wall or opening disappears', () => {
  let s = initialState(bare());
  s = act(s, { type: 'ui/wall', wallId: 'w6' });
  assert.equal(s.ui.wallId, 'w6');
  s = act(s, { type: 'room/template', id: 'rect' });
  assert.equal(s.ui.wallId, 'w1');
  s = act(s, { type: 'room/opening/add', opening: { type: 'window' } });
  const id = s.ui.openingId;
  assert.ok(id);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.ui.openingId, null);
});

test('project/load replaces the project and resets history', () => {
  let s = initialState(bare());
  s = act(s, { type: 'room/update', patch: { height: 250 } });
  s = reduce(s, { type: 'ui/step', step: 2 });
  const other = M.setTemplate(bare(), 'hallway', {});
  s = reduce(s, { type: 'project/load', project: other });
  assert.equal(s.project.room.template.id, 'hallway');
  assert.equal(s.past.length, 0);
  assert.equal(s.ui.step, 2);
});

test('createStore: dispatch, subscribe, unsubscribe, timestamps', () => {
  const store = createStore(bare(), { now: () => 5000 });
  const seen = [];
  const off = store.subscribe((s, before, a) => seen.push([a.type, a.at, s !== before]));
  store.dispatch({ type: 'room/update', patch: { height: 240 } });
  store.dispatch({ type: 'ui/step', step: 1 });
  store.dispatch({ type: 'ui/step', step: 1 }); // no change, no notification
  off();
  store.dispatch({ type: 'room/update', patch: { height: 250 } });
  assert.deepEqual(seen, [['room/update', 5000, true], ['ui/step', 5000, true]]);
  assert.equal(store.getState().project.room.height, 250);
});

test('createStore persistence is debounced to one save', async () => {
  const saves = [], hashes = [];
  const store = createStore(bare(), { persist: true, delay: 30, save: (p) => saves.push(p), setHash: (c) => hashes.push(c) });
  for (let i = 0; i < 5; i++) store.dispatch({ type: 'room/update', patch: { height: 230 + i } });
  store.dispatch({ type: 'ui/step', step: 2 }); // UI changes do not save
  assert.equal(saves.length, 0);
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(saves.length, 1);
  assert.equal(saves[0].room.height, 234);
  assert.equal(hashes.length, 1);
  assert.match(hashes[0], /^[zu]/);
});

test('loadInitialProject: URL hash, then storage, then a fresh project', async () => {
  const custom = M.setTemplate(bare(), 'bay', { width: 500 });
  const { encodeProject } = await import('../site/js/planner/share.js');
  const code = await encodeProject(custom);
  const fromUrl = await loadInitialProject({ hash: `#p=${code}`, load: () => null });
  assert.equal(fromUrl.room.template.id, 'bay');
  const stored = bare();
  assert.equal(await loadInitialProject({ hash: '', load: () => stored }), stored);
  assert.equal(await loadInitialProject({ hash: '#p=garbage!!', load: () => stored }), stored);
  const fresh = await loadInitialProject({ hash: '', load: () => null });
  assert.equal(fresh.v, 2);
});

// ---------- plan-geom ----------
test('wall quads are mitred: a rectangle ring is WALL_T thick everywhere', () => {
  const room = rectProject().room;
  const [a] = cornerOffsets(room);
  assert.ok(Math.abs(a.x + WALL_T) < 1e-9 && Math.abs(a.z + WALL_T) < 1e-9);
  const q = wallQuads(room);
  assert.equal(q.length, 4);
  assert.ok(Math.abs(q[0].outer[0].x + WALL_T) < 1e-9);
  assert.ok(Math.abs(q[0].shift[0] + WALL_T) < 1e-9, 'outer face of the top wall starts 10 cm before the corner');
});

test('ceiling profile follows the attic slope and is flat otherwise', () => {
  const flat = rectProject().room;
  const w = M.wallsOf(flat)[0];
  assert.deepEqual(ceilingProfile(flat, w), [[0, flat.height], [w.length, flat.height]]);
  const attic = M.setTemplate(rectProject(), 'attic', { width: 480, depth: 400, kneeHeight: 120, slopeAngle: 40, slopeWall: 1 }).room;
  const ws = M.wallsOf(attic);
  const onSlope = ceilingProfile(attic, ws[0]);
  assert.ok(onSlope.every(([, h]) => h === 120), 'the sloping wall itself is the knee wall');
  const side = ceilingProfile(attic, ws[1]);
  assert.equal(side[0][1], 120);
  assert.equal(side.at(-1)[1], attic.height);
  assert.ok(side.length >= 3, 'has a kink where the slope ends');
  assert.ok(minCeiling(side, 0, 50) < attic.height);
});

test('every plan handle names a real parameter and wall', () => {
  for (const [id, hs] of Object.entries(PLAN_HANDLES)) {
    const room = M.setTemplate(bare(), id, {}).room;
    for (const h of hs) {
      assert.ok(M.TEMPLATE_PARAMS[id][h.param], `${id}.${h.param}`);
      assert.ok(room.walls[h.wall], `${id} wall ${h.wall}`);
    }
  }
});

test('an opening on a vanished wall can be moved to another wall', () => {
  let s = initialState(bare());
  s = { ...s, project: { ...s.project, room: { ...s.project.room, walls: M.roomFromTemplate('rect', {}).walls, openings: [{ id: 'o9', wallId: 'w9', type: 'window', offset: 10, bottom: 90, width: 120, height: 130, flagged: true }] } } };
  s = act(s, { type: 'room/opening/move', id: 'o9', wallId: 'w2' });
  const moved = s.project.room.openings[0];
  assert.equal(moved.wallId, 'w2');
  assert.ok(!moved.flagged);
  assert.ok(moved.offset >= 0 && moved.offset + moved.width <= 380);
});

test('adding an opening uses the largest free gap, and says so when nothing fits', () => {
  let s = initialState(bare());
  s = act(s, { type: 'room/template', id: 'rect', params: { width: 420, depth: 380 } });
  s = { ...s, project: { ...s.project, room: { ...s.project.room, openings: [] } } };
  s = act(s, { type: 'ui/wall', wallId: 'w1' });
  s = act(s, { type: 'room/opening/add', opening: { type: 'window', offset: 0, width: 300 } });
  s = act(s, { type: 'room/opening/add', opening: { type: 'window' } });
  const b = s.project.room.openings[1];
  assert.equal(b.offset, 300, 'only the 120 cm gap at the right is free');
  const before = s.project;
  s = act(s, { type: 'room/opening/add', opening: { type: 'window' } });
  assert.equal(s.project, before);
  assert.match(s.ui.notice.text, /No room on this wall for a 120 cm window/);
  const n1 = s.ui.notice.id;
  s = act(s, { type: 'room/opening/add', opening: { type: 'window' } });
  assert.equal(s.ui.notice.id, n1 + 1);
});

test('a template change re-homes openings instead of leaving them flagged', () => {
  for (const id of Object.keys(M.TEMPLATES)) {
    let s = initialState(M.createProject()); // alcoves with a window on w5 and a door on w6
    s = act(s, { type: 'room/template', id });
    const bad = s.project.room.openings.filter((o) => o.flagged);
    assert.equal(bad.length, 0, `${id}: nothing flagged`);
    const v = validateProject(s.project).errors.filter((e) => e.ref.type === 'room' || e.ref.type === 'opening');
    assert.deepEqual(v.map((e) => e.code), [], `${id}: no room warnings`);
  }
});

test('switching to the attic leaves no opening above the sloping ceiling', () => {
  for (const wall of [1, 2, 3, 4]) {
    let s = initialState(M.createProject());
    s = act(s, { type: 'room/template', id: 'attic', params: { slopeWall: wall } });
    const errs = validateProject(s.project).errors.filter((e) => e.ref.type === 'room' || e.ref.type === 'opening');
    assert.deepEqual(errs.map((e) => e.code), [], `slope wall ${wall}`);
    const slopeId = s.project.room.slope.wallId;
    for (const o of s.project.room.openings) {
      if (o.wallId === slopeId) assert.ok(o.bottom + o.height <= s.project.room.slope.lowHeight, 'on the knee wall only if it fits');
    }
  }
});

test('validate: an opening above a sloping ceiling is a blocking error', () => {
  let p = M.setTemplate(bare(), 'attic', { slopeWall: 1 });
  p = { ...p, room: { ...p.room, openings: [{ id: 'o1', wallId: 'w1', type: 'door', offset: 100, bottom: 0, width: 90, height: 210, swing: 'in-left' }] } };
  const e = validateProject(p).errors.find((x) => x.code === 'opening-above-ceiling');
  assert.ok(e && e.blocking);
});

// ---------- piece actions (phase 3) ----------
test('piece/add selects an unplaced piece and swaps a fresh one for the new type', () => {
  let s = initialState(bare());
  assert.equal(s.ui.pieceId, null);
  s = act(s, { type: 'piece/add', pieceType: 'wardrobe' });
  assert.equal(s.project.pieces.length, 1);
  assert.equal(s.ui.pieceId, s.project.pieces[0].id);
  assert.equal(s.ui.fresh, s.ui.pieceId);
  assert.equal(s.project.placements.length, 0);
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
  assert.equal(s.project.placements.length, 1, 'only its own placement went');
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

test('piece edits are coalesced like room edits and the reducer stays pure', () => {
  let s = deepFreeze(initialState(M.createProject()));
  s = reduce(s, { type: 'piece/update', patch: { width: 180 }, coalesce: 'k', at: 1 });
  s = reduce(s, { type: 'piece/update', patch: { width: 190 }, coalesce: 'k', at: 2 });
  assert.equal(s.past.length, 1);
  s = reduce(s, { type: 'piece/item/add', bay: 0, item: { kind: 'shelf', y: 50 }, at: 3 });
  assert.equal(s.past.length, 2);
});

// ---------- Place step ----------
const placeBase = () => {
  let p = M.setTemplate(M.createProject(), 'rect', { width: 420, depth: 380 });
  p = { ...p, pieces: [], placements: [], room: { ...p.room, openings: [] } };
  p = M.addPiece(p, 'wardrobe', 'flat-oak', { id: 'a', width: 100 });
  p = M.addPiece(p, 'table', 'flat-oak', { id: 't' });
  return p;
};

test('place/set, place/move and place/remove go through the model and select the piece', () => {
  let s = deepFreeze(initialState(placeBase()));
  assert.equal(s.ui.pieceId, 'a');
  s = act(s, { type: 'place/set', id: 't', spec: { mode: 'free', x: 200, z: 190, rotation: 0 } });
  assert.deepEqual(s.project.placements, [{ pieceId: 't', mode: 'free', x: 200, z: 190, rotation: 0, elevation: 0 }]);
  assert.equal(s.ui.pieceId, 't', 'the placed piece becomes the selection');
  s = act(s, { type: 'place/set', id: 'a', spec: { mode: 'wall', wallId: 'w1', offset: 30 } });
  assert.equal(s.ui.pieceId, 'a');
  s = act(s, { type: 'place/move', patch: { offset: 31, snap: false } });
  assert.equal(s.project.placements.find((x) => x.pieceId === 'a').offset, 31, 'id defaults to the selected piece; snap: false keeps 1 cm');
  s = act(s, { type: 'place/move', patch: { wallId: 'w2', offset: 100, snap: false } });
  assert.equal(s.project.placements.find((x) => x.pieceId === 'a').wallId, 'w2');
  s = act(s, { type: 'place/move', id: 't', patch: { rotation: 45, snap: false } });
  assert.equal(s.project.placements.find((x) => x.pieceId === 't').rotation, 45);
  assert.equal(s.ui.pieceId, 't');
  s = act(s, { type: 'place/remove' });
  assert.deepEqual(s.project.placements.map((x) => x.pieceId), ['a'], 'un-placed');
  assert.equal(s.project.pieces.length, 2, 'the piece stays in the list');
  assert.equal(s.ui.pieceId, 't', 'selection stays');
  // unknown ids and un-placed moves change nothing
  const same = s;
  assert.equal(act(s, { type: 'place/move', id: 't', patch: { x: 5 } }), same);
  assert.equal(act(s, { type: 'place/set', id: 'nope', spec: { mode: 'free', x: 1, z: 1 } }), same);
  assert.equal(act(s, { type: 'place/remove', id: 't' }), same);
});

test('placement edits coalesce into one undo step, and undo restores the selection safely', () => {
  let s = initialState(placeBase());
  s = reduce(s, { type: 'place/set', id: 'a', spec: { mode: 'wall', wallId: 'w1', offset: 0 }, at: 1000 });
  s = reduce(s, { type: 'history/seal' });
  const before = s.past.length;
  for (let i = 1; i <= 5; i++) s = reduce(s, { type: 'place/move', patch: { offset: i * 10, snap: false }, coalesce: 'drag:a', at: 5000 + i * 100 });
  assert.equal(s.past.length, before + 1, 'a drag is one step');
  assert.equal(s.project.placements[0].offset, 50);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project.placements[0].offset, 0);
  s = reduce(s, { type: 'history/undo' });
  assert.equal(s.project.placements.length, 0);
  assert.equal(s.ui.pieceId, 'a');
  s = reduce(s, { type: 'history/redo' });
  assert.equal(s.project.placements.length, 1);
});

test('editing a placed piece keeps its placement; a clash shows up in validation', () => {
  let s = initialState(placeBase());
  s = act(s, { type: 'place/set', id: 'a', spec: { mode: 'wall', wallId: 'w1', offset: 300 } });
  assert.equal(s.project.placements[0].offset, 300);
  s = act(s, { type: 'ui/piece', id: 'a' });
  s = act(s, { type: 'piece/update', patch: { width: 200 } });
  assert.deepEqual(s.project.placements.map((x) => [x.pieceId, x.wallId, x.offset]), [['a', 'w1', 300]], 'placement untouched');
  const codes = validateProject(s.project).errors.map((e) => e.code);
  assert.ok(codes.includes('placement-off-wall'), codes.join());
});

test('ui/new-piece opens Furniture with nothing chosen until a type is picked', () => {
  let s = initialState(placeBase());
  s = act(s, { type: 'ui/step', step: 3 });
  s = act(s, { type: 'ui/new-piece' });
  assert.equal(s.ui.step, 1);
  assert.equal(s.ui.starting, true);
  assert.equal(act(s, { type: 'ui/new-piece' }), s, 'repeating it changes nothing');
  s = act(s, { type: 'piece/add', pieceType: 'desk' });
  assert.equal(s.ui.starting, false);
  assert.equal(s.project.pieces.length, 3, 'a new piece, not a replacement');
  assert.equal(s.ui.pieceId, s.project.pieces[2].id);
  // leaving the step or picking a piece also ends it
  s = act(s, { type: 'ui/new-piece' });
  assert.equal(act(s, { type: 'ui/step', step: 2 }).ui.starting, false);
  assert.equal(act(s, { type: 'ui/piece', id: 'a' }).ui.starting, false);
  assert.equal(initialState(placeBase()).ui.starting, false);
});

test('a piece deleted while placed drops its placement and the selection falls back', () => {
  let s = initialState(placeBase());
  s = act(s, { type: 'place/set', id: 'a', spec: { mode: 'wall', wallId: 'w1', offset: 0 } });
  s = act(s, { type: 'place/set', id: 't', spec: { mode: 'free', x: 200, z: 190, rotation: 0 } });
  s = act(s, { type: 'piece/remove', id: 't' });
  assert.equal(s.project.placements.length, 1);
  assert.equal(s.ui.pieceId, 'a');
});
