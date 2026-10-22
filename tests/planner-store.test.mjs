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
