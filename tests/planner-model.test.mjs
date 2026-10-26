import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { validateProject } from '../site/js/planner/validate.js';
import { createDesign, addModule, updateRoom as v1UpdateRoom, updateModule } from '../site/js/configurator/model.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}
// ---------- items and the 32 mm system ----------
const onGrid = (y) => Math.abs(y / 3.2 - Math.round(y / 3.2)) < 1e-6;

test('item y snaps to the 32 mm system, rounded to 0.1', () => {
  const p0 = M.createProject();
  let p = M.addItem(p0, 'p1', 0, { kind: 'shelf', y: 100 });
  const it = p.pieces[0].bays[0].items.at(-1);
  assert.equal(it.y, 99.2);
  assert.ok(onGrid(it.y));
  const idx = p.pieces[0].bays[0].items.length - 1;
  for (const y of [0, 1.5, 3.3, 17, 33.3, 64.99, 150.4, 190]) {
    const q = M.moveItem(p, 'p1', 0, idx, { y });
    const got = q.pieces[0].bays[0].items[idx].y;
    assert.ok(onGrid(got), `${y} -> ${got}`);
    assert.equal(got, Math.round(got * 10) / 10);
    assert.ok(Math.abs(got - y) <= 1.6 + 1e-9);
  }
  assert.equal(M.snapY(3.2), 3.2);
  assert.equal(M.snapY(9.6), 9.6);
  assert.equal(M.snapUp(10), 12.8);
  assert.equal(M.snapDown(10), 9.6);
  // out of range is clamped inside the bay, still on the grid
  const inner = M.pieceGeometry(p.pieces[0]).innerH;
  const high = M.moveItem(p, 'p1', 0, idx, { y: 9999 }).pieces[0].bays[0].items[idx].y;
  assert.ok(high <= inner - 1.8 + 1e-9 && onGrid(high));
  assert.equal(M.moveItem(p, 'p1', 0, idx, { y: -50 }).pieces[0].bays[0].items[idx].y, 0);
  // a rail keeps its body inside the bay
  const rail = M.addItem(p0, 'p1', 1, { kind: 'rail', length: 'long', y: 9999 }).pieces[0].bays[1].items.at(-1);
  assert.ok(rail.y + 4 <= inner);
  // presets are on the grid too
  for (const [id, pre] of Object.entries(M.PRESETS)) {
    for (const t of pre.types) {
      const piece = M.createPiece(t, undefined, { id: 'px' });
      const proj = M.applyPreset({ ...p0, pieces: [piece] }, 'px', 0, id);
      for (const i of proj.pieces[0].bays[0].items) if (M.ITEMS[i.kind].zone(i)) assert.ok(onGrid(i.y), `${id}/${t}/${i.kind}@${i.y}`);
    }
  }
});

test('item edits: add, update, move between bays, remove, params clamp', () => {
  let p = M.createProject();
  const n0 = p.pieces[0].bays[1].items.length;
  p = M.addItem(p, 'p1', 1, { kind: 'drawers', y: 0, count: 99, front: 1 });
  const d = p.pieces[0].bays[1].items.at(-1);
  assert.deepEqual([d.count, d.front, d.size], [6, 19.2, 'low'], 'old heights become the nearest drawer size');
  p = M.updateItem(p, 'p1', 1, n0, { count: 2, kind: 'shelf' });
  assert.equal(p.pieces[0].bays[1].items[n0].kind, 'drawers', 'kind is fixed');
  assert.equal(p.pieces[0].bays[1].items[n0].count, 2);
  p = M.moveItem(p, 'p1', 1, n0, { bay: 0, y: 0 });
  assert.equal(p.pieces[0].bays[1].items.length, n0);
  assert.equal(p.pieces[0].bays[0].items.at(-1).kind, 'drawers');
  p = M.removeItem(p, 'p1', 0, p.pieces[0].bays[0].items.length - 1);
  assert.equal(p.pieces[0].bays[0].items.some((i) => i.kind === 'drawers'), false);
  assert.equal(M.addItem(p, 'p1', 0, { kind: 'nope', y: 0 }).pieces[0].bays[0].items.length, p.pieces[0].bays[0].items.length);
  assert.equal(M.addItem(p, 'zz', 0, { kind: 'shelf', y: 0 }).pieces.length, p.pieces.length);
  // divider position defaults to the middle of the bay and stays inside it
  const dv = M.addItem(p, 'p1', 0, { kind: 'divider', y: 0, position: 9999 }).pieces[0].bays[0].items.at(-1);
  assert.equal(dv.position, p.pieces[0].bays[0].width - 5);
  // presets
  const bay = M.applyPreset(p, 'p1', 0, 'trousers-ties').pieces[0].bays[0].items.map((i) => i.kind);
  assert.deepEqual(bay, ['trouser-rack', 'tie-belt', 'valet-rod', 'mirror']);
  assert.deepEqual(M.applyPreset(p, 'p1', 0, 'dressing'), M.applyPreset(p, 'p1', 0, 'trousers-ties'), 'old preset ids still work');
  assert.deepEqual(M.applyPreset(p, 'p1', 0, 'nope'), p, 'unknown preset changes nothing');
  assert.deepEqual(M.applyPreset(p, 'p1', 0, 'kitchen-bin'), p, 'a preset for another type changes nothing');
  assert.deepEqual(M.presetsFor('wardrobe').map((x) => x.id).sort(), ['double-hang', 'drawers', 'hang', 'shelves', 'shoes', 'trousers-ties']);
});

test('ITEMS: every kind has a label, params, hardware and a zone consistent with its body', () => {
  assert.ok(Object.keys(M.ITEMS).length >= 26);
  for (const [kind, d] of Object.entries(M.ITEMS)) {
    assert.equal(typeof d.label, 'string', kind);
    const it = M.normalizeItem({ kind, y: 0 }, { bayWidth: 80, innerH: 226 });
    assert.equal(it.kind, kind);
    const [blo, bhi] = d.body(it);
    assert.ok(bhi >= blo);
    const z = d.zone(it);
    if (z) assert.ok(z[0] <= blo && z[1] >= bhi, `${kind}: zone covers body`);
    const ctx = { bayW: 80, depth: 60, innerH: 226, outerW: 82 };
    for (const h of d.hardware(it, ctx)) assert.ok(h.qty > 0 && typeof h.key === 'string', kind);
    for (const b of d.boards(it, ctx)) assert.ok(b.w > 0 && b.h > 0 && b.qty > 0, `${kind} ${b.part}`);
    assert.equal(typeof M.describeItem(it), 'string');
  }
  // the documented clearances
  const it = (k, o = {}) => M.normalizeItem({ kind: k, y: 100, ...o }, { bayWidth: 80, innerH: 226 });
  assert.deepEqual(M.itemZone(it('shelf')), [0, 18]);
  assert.deepEqual(M.itemZone(it('rail')), [-150, 4]);
  assert.deepEqual(M.itemZone(it('rail', { length: 'short' })), [-95, 4]);
  assert.deepEqual(M.itemZone(it('pull-down-rail')), [-100, 10]);
  assert.deepEqual(M.itemZone(it('drawers', { count: 3 })), [0, 57.6]);
  assert.deepEqual(M.itemZone(it('drawers', { count: 2, size: 'deep' })), [0, 76.8]);
  assert.deepEqual(M.itemZone(it('jewellery')), [0, 8]);
  assert.deepEqual(M.itemZone(it('shoes', { rows: 3 })), [0, 60]);
  assert.deepEqual(M.itemZone(it('shoe-pullout', { rows: 3 })), [0, 66]);
  assert.deepEqual(M.itemZone(it('trouser-rack')), [0, 70]);
  assert.deepEqual(M.itemZone(it('tie-belt')), [0, 50]);
  assert.deepEqual(M.itemZone(it('valet-rod')), [0, 5]);
  assert.deepEqual(M.itemZone(it('basket', { depth: 20 })), [0, 23]);
  assert.deepEqual(M.itemZone(it('hamper')), [0, 60]);
  assert.equal(M.itemZone(it('mirror', { mode: 'fixed' })), null);
  assert.equal(M.itemZone(it('mirror', { mode: 'swivel' })), null);
  assert.deepEqual(M.itemZone(it('mirror', { mode: 'pull-out' })), [0, 120]);
  assert.deepEqual(M.itemZone(it('larder', { baskets: 4 })), [0, 140]);
  assert.deepEqual(M.itemZone(it('tray')), [0, 8]);
  assert.deepEqual(M.itemZone(it('spice', { tiers: 3 })), [0, 62]);
  assert.deepEqual(M.itemZone(it('hooks')), [0, 10]);
  assert.equal(M.itemZone(it('led')), null);
  assert.equal(M.ITEMS['inner-drawers'].needsDoor({}), true);
  assert.equal(M.ITEMS.larder.minBay.width, 30);
  assert.equal(M.ITEMS['pull-down-rail'].minBay.height, 210);
});

// ---------- pieces ----------
test('createPiece: defaults per type are clamped, consistent and valid', () => {
  assert.deepEqual(Object.keys(M.TYPES).sort(), ['desk', 'island', 'kitchen-base', 'kitchen-wall', 'table', 'tall-cabinet', 'under-stairs', 'wall-unit', 'wardrobe', 'window-seat']);
  for (const type of Object.keys(M.TYPES)) {
    const piece = M.createPiece(type, undefined, { id: 'p1' });
    const g = M.pieceGeometry(piece);
    assert.equal(piece.bays.reduce((s, b) => s + b.width, 0), g.innerW, type);
    assert.equal(piece.bays.length, M.TYPES[type].defaults.bays, type);
    const proj = { v: 2, pieces: [piece] };
    const errs = validateProject(proj).errors.filter((e) => e.blocking);
    assert.deepEqual(errs, [], type);
    for (const b of piece.bays) for (const i of b.items) assert.ok(M.TYPES[type].palette.includes(i.kind), `${type}: ${i.kind} in palette`);
  }
  const w = M.createPiece('wardrobe', 'flat-oak', { id: 'p1' });
  assert.deepEqual([w.width, w.height, w.depth, w.bays.length, w.fronts.material, w.plinth], [240, 240, 60, 3, 'oak', 10]);
  assert.equal(M.createPiece('wardrobe', 'charcoal-sliding').fronts.kind, 'sliding');
  assert.equal(M.createPiece('desk', 'flat-oak').fronts.kind, 'none');
  assert.equal(M.createPiece('wardrobe', 'x', { width: 9999, depth: 1 }).width, 500);
  assert.equal(M.createPiece('wardrobe', 'x', { width: 9999, depth: 1 }).depth, 35);
  assert.throws(() => M.createPiece('sofa'));
  assert.equal(M.createPiece('wardrobe', 'flat-oak', { bays: 5 }).bays.length, 5);
  for (const id of Object.keys(M.STYLES)) {
    const s = M.STYLES[id];
    assert.ok(M.MATERIALS[s.fronts.material] && M.MATERIALS[s.carcass], id);
    assert.ok(M.FRONT_KINDS.includes(s.fronts.kind) && M.HANDLES.includes(s.fronts.handle), id);
    assert.equal(typeof s.plinth, 'number');
  }
});

test('setBays redistributes widths so they always add up to the inside width', () => {
  let p = M.createProject();
  for (const n of [1, 2, 3, 4, 5, 8]) {
    const q = M.setBays(p, 'p1', n);
    const piece = q.pieces[0];
    assert.equal(piece.bays.length, Math.min(n, M.maxBaysFor('wardrobe', piece.width)));
    assert.equal(piece.bays.reduce((s, b) => s + b.width, 0), M.pieceGeometry(piece).innerW);
    assert.ok(piece.bays.every((b) => Number.isInteger(b.width) && b.width >= M.MIN_BAY));
    assert.deepEqual(validateProject(q).errors.filter((e) => e.code === 'bays-width'), []);
  }
  const q = M.setBays(p, 'p1', [50, 100]);
  assert.equal(q.pieces[0].bays[0].width + q.pieces[0].bays[1].width, M.pieceGeometry(q.pieces[0]).innerW);
  assert.ok(q.pieces[0].bays[1].width > q.pieces[0].bays[0].width);
  // items stay with their bay
  assert.equal(q.pieces[0].bays[0].items.length, p.pieces[0].bays[0].items.length);
  // resizing the piece refits the bays
  const wide = M.updatePiece(p, 'p1', { width: 301 });
  assert.equal(wide.pieces[0].bays.reduce((s, b) => s + b.width, 0), M.pieceGeometry(wide.pieces[0]).innerW);
  // lower piece: items are re-clamped into the new inside height
  const low = M.updatePiece(p, 'p1', { height: 180 });
  assert.deepEqual(validateProject(low).errors.filter((e) => e.code === 'item-outside-bay'), []);
});

test('updatePiece: style bundle, nested merge, bad input', () => {
  let p = M.createProject();
  p = M.updatePiece(p, 'p1', { style: 'charcoal-sliding' });
  assert.deepEqual([p.pieces[0].fronts.kind, p.pieces[0].fronts.material, p.pieces[0].style], ['sliding', 'black', 'charcoal-sliding']);
  assert.ok(p.pieces[0].bays.every((b) => b.door === 'none'));
  p = M.updatePiece(p, 'p1', { fronts: { handle: 'knob' } });
  assert.deepEqual([p.pieces[0].fronts.handle, p.pieces[0].fronts.kind], ['knob', 'sliding']);
  p = M.updatePiece(p, 'p1', { style: 'flat-oak' });
  assert.ok(p.pieces[0].bays.every((b) => b.door !== 'none'));
  const same = M.updatePiece(p, 'p1', { width: 'x', fronts: { kind: 'nope', material: 'steel-black' } });
  assert.equal(same.pieces[0].width, p.pieces[0].width, 'a bad width falls back to the current one');
  assert.notEqual(same.pieces[0].fronts.material, 'steel-black');
  assert.equal(M.updatePiece(p, 'zz', { width: 100 }).pieces.length, 2);
  assert.equal(M.updatePiece(p, 'p1', { worktop: 'terrazzo' }).pieces[0].worktop, null, 'wardrobes take no worktop');
  const k = M.addPiece(p, 'kitchen-base', 'sage-kitchen');
  assert.equal(M.updatePiece(k, 'p3', { worktop: 'terrazzo' }).pieces[2].worktop, 'quartz-white', 'the old terrazzo becomes white quartz');
});

test('addPiece / removePiece: unique ids', () => {
  let p = M.createProject();
  p = M.addPiece(p, 'table', 'flat-oak');
  p = M.addPiece(p, 'table', 'flat-oak', { id: 'p3' });
  assert.deepEqual(p.pieces.map((x) => x.id), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(M.addPiece(p, 'sofa', 'x').pieces.length, 4);
  const r = M.removePiece(p, 'p1');
  assert.equal(r.pieces.length, 3);
  assert.equal(r.pieces.some((x) => x.id === 'p1'), false);
  assert.equal(M.pieceLabel(p, 'p3'), 'Table 1');
  assert.equal(M.pieceLabel(p, 'p4'), 'Table 2');
});

// ---------- immutability ----------
test('every edit returns a new project and never mutates its input', () => {
  const base = deepFreeze(M.createProject());
  const snapshot = JSON.stringify(base);
  const edits = [
    (p) => M.addPiece(p, 'island', 'sage-kitchen'),
    (p) => M.updatePiece(p, 'p1', { width: 200, style: 'glass-oak' }),
    (p) => M.updatePiece(p, 'p1', { space: { width: 220, height: 250 } }),
    (p) => M.removePiece(p, 'p1'),
    (p) => M.setBays(p, 'p1', 4),
    (p) => M.setBays(p, 'p1', [40, 60]),
    (p) => M.addItem(p, 'p1', 0, { kind: 'led', y: 100 }),
    (p) => M.moveItem(p, 'p1', 0, 0, { y: 50, bay: 1 }),
    (p) => M.updateItem(p, 'p1', 0, 0, { y: 70 }),
    (p) => M.removeItem(p, 'p1', 0, 0),
    (p) => M.applyPreset(p, 'p1', 1, 'shoes'),
    (p) => M.clampProject(p)
  ];
  for (const edit of edits) {
    const out = edit(base);
    assert.notEqual(out, base);
    assert.equal(JSON.stringify(base), snapshot);
  }
  // results are independent of each other and of the input
  const a = M.updatePiece(base, 'p1', { width: 200 });
  const b = M.updatePiece(a, 'p1', { width: 180 });
  assert.equal(a.pieces[0].width, 200);
  assert.equal(b.pieces[0].width, 180);
  assert.notEqual(a.pieces[0].bays[0].items, base.pieces[0].bays[0].items);
  // unknown ids change nothing
  for (const out of [M.removePiece(base, 'zz'), M.updatePiece(base, 'zz', {}), M.addItem(base, 'zz', 0, { kind: 'shelf' })]) {
    assert.equal(JSON.stringify(out), snapshot);
  }
});

test('createProject: a wardrobe and a desk, no room, no placements', () => {
  const p = M.createProject();
  assert.equal(p.v, 2);
  assert.deepEqual(Object.keys(p).sort(), ['pieces', 'v']);
  assert.deepEqual(p.pieces.map((x) => x.type), ['wardrobe', 'desk']);
  assert.equal(p.pieces[0].width, 170);
  assert.deepEqual(validateProject(p).errors, []);
  assert.deepEqual(M.clampProject(clone(p)), p, 'clampProject is idempotent on a valid project');
  assert.deepEqual(M.createBlankProject(), { v: 2, pieces: [] });
});

test('clampProject turns garbage into a valid project', () => {
  for (const raw of [null, undefined, 5, 'x', [], {}, { room: 7, pieces: 'x' }, { pieces: [null, 3, { type: 'sofa' }, { type: 'desk', width: 'abc', bays: 'x' }] }]) {
    const p = M.clampProject(raw);
    assert.equal(p.v, 2);
    assert.ok(Array.isArray(p.pieces));
    assert.deepEqual(validateProject(p).errors.filter((e) => e.blocking), []);
  }
  const p = M.clampProject({
    pieces: [{ id: 'a!b', type: 'wardrobe', width: 1e9, bays: [{ width: 5, items: [{ kind: 'shelf', y: 1e9 }, { kind: 'zzz' }] }, 5] }, { id: 'p1', type: 'desk' }, { id: 'p1', type: 'desk' }]
  });
  assert.equal(new Set(p.pieces.map((x) => x.id)).size, p.pieces.length);
  assert.equal(p.pieces.length, 3);
});

test('clampProject ignores a room and placements from an older save, and keeps a wall unit at the height it hung', () => {
  const old = JSON.parse(JSON.stringify(M.createProject()));
  old.room = { walls: [{ id: 'w1', x: 0, z: 0 }, { id: 'w2', x: 400, z: 0 }, { id: 'w3', x: 400, z: 300 }, { id: 'w4', x: 0, z: 300 }], height: 250, openings: [{ id: 'o1', wallId: 'w1', type: 'window', offset: 10, bottom: 90, width: 100, height: 100 }], template: { id: 'rect', params: {} } };
  old.pieces.push({ ...M.createPiece('kitchen-wall', undefined, { id: 'p3' }) });
  old.placements = [{ pieceId: 'p1', mode: 'wall', wallId: 'w1', offset: 0, elevation: 0 }, { pieceId: 'p3', mode: 'wall', wallId: 'w1', offset: 200, elevation: 150 }, { pieceId: 'p2', mode: 'free', x: 100, z: 100, rotation: 90, elevation: 0 }];
  const p = M.clampProject(old);
  assert.deepEqual(Object.keys(p).sort(), ['pieces', 'v']);
  assert.equal(p.pieces.length, 3);
  assert.equal(p.pieces.find((x) => x.id === 'p3').elevation, 150);
  assert.equal('room' in p, false);
  assert.equal('placements' in p, false);
});

test('space: a piece can carry the wall width and ceiling height it has to fit, and nothing else changes', () => {
  const p = M.createProject();
  assert.equal('space' in p.pieces[0], false, 'no space unless one is set');
  const a = M.updatePiece(p, 'p1', { space: { width: '220', height: 250.4 } });
  assert.deepEqual(a.pieces[0].space, { width: 220, height: 250 });
  assert.deepEqual(M.updatePiece(a, 'p1', { space: { width: null, height: 240 } }).pieces[0].space, { width: null, height: 240 });
  assert.equal('space' in M.updatePiece(a, 'p1', { space: null }).pieces[0], false);
  assert.equal('space' in M.updatePiece(a, 'p1', { space: { width: '', height: null } }).pieces[0], false);
  assert.deepEqual(M.updatePiece(p, 'p1', { space: { width: 1, height: 99999 } }).pieces[0].space, { width: 40, height: 500 }, 'clamped to what a wall can be');
  assert.equal(a.pieces[0].width, p.pieces[0].width);
  assert.deepEqual(M.clampProject(clone(a)), a);
});

// ---------- migrate ----------
test('migrate: the default v1 design becomes one piece per module, with no room', () => {
  const v1 = createDesign();
  const snapshot = JSON.stringify(v1);
  const p = M.migrate(deepFreeze(clone(v1)));
  assert.equal(JSON.stringify(v1), snapshot);
  assert.equal(p.v, 2);
  assert.deepEqual(Object.keys(p).sort(), ['pieces', 'v']);
  assert.deepEqual(p.pieces.map((x) => x.type), ['wardrobe', 'desk']);
  const w = p.pieces[0];
  assert.deepEqual([w.width, w.height, w.depth], [200, 240, 60]);
  assert.equal(w.bays.length, 2);
  assert.equal(w.fronts.kind, 'hinged');
  assert.equal(w.fronts.material, 'oak');
  assert.equal(w.carcass.material, 'birch-ply');
  assert.equal(w.bays.reduce((s, b) => s + b.width, 0), M.pieceGeometry(w).innerW);
  // v1: 2 drawers over 2 sections = one drawer per bay; interior 'shelves' = shelves above
  for (const bay of w.bays) {
    const dr = bay.items.filter((i) => i.kind === 'drawers');
    assert.equal(dr.length, 1);
    assert.equal(dr[0].count, 1);
    assert.ok(bay.items.some((i) => i.kind === 'shelf'));
  }
  assert.deepEqual(validateProject(p).errors.filter((e) => e.blocking), []);
  assert.deepEqual(M.clampProject(clone(p)), p);
});

test('migrate: a kitchen v1 design with wall cabinets, an island and a rail wardrobe', () => {
  let d = v1UpdateRoom(createDesign(), { width: 700, height: 270, depth: 450 });
  d = { ...d, modules: [] };
  for (let i = 0; i < 4; i++) d = addModule(d, 'kitchen-base');
  d = addModule(d, 'kitchen-wall');
  d = addModule(d, 'kitchen-wall');
  d = addModule(d, 'island');
  d = addModule(d, 'tall-cabinet');
  d = addModule(d, 'wardrobe', { interior: 'rail', led: true, doors: 'sliding', sections: 3, drawers: 3, width: 300 });
  d = addModule(d, 'shelving');
  d = addModule(d, 'bench');
  const p = M.migrate(d);
  assert.equal(p.pieces.length, d.modules.length);
  const types = p.pieces.map((x) => x.type);
  assert.deepEqual(types.filter((t) => t === 'kitchen-base').length, 4);
  assert.ok(types.includes('wall-unit') && types.includes('window-seat'), 'shelving and bench map to v2 types');
  const wc = p.pieces.find((x) => x.type === 'kitchen-wall');
  assert.equal(wc.elevation, 140, 'a wall cabinet keeps the height it hung at');
  assert.equal(wc.worktop, null);
  assert.ok(p.pieces.find((x) => x.type === 'kitchen-base').worktop);
  const wd = p.pieces.find((x) => x.type === 'wardrobe');
  assert.equal(wd.fronts.kind, 'sliding');
  assert.equal(wd.bays.length, 3);
  assert.ok(wd.bays.every((b) => b.items.some((i) => i.kind === 'rail')), 'rail interior expands to hanging rails');
  assert.ok(wd.bays.every((b) => b.items.some((i) => i.kind === 'led')), 'v1 led flag becomes an LED item');
  assert.equal(wd.bays.reduce((n, b) => n + b.items.filter((i) => i.kind === 'drawers').reduce((s, i) => s + i.count, 0), 0), 3);
  assert.deepEqual(validateProject(p).errors.filter((e) => e.blocking), []);
  // edge cases
  assert.equal(M.migrate({}).pieces.length, 0);
  assert.deepEqual(M.migrate(null).pieces, []);
  const mixed = M.migrate(updateModule(createDesign(), 'm1', { interior: 'mixed', sections: 4, width: 300 }));
  const kinds = mixed.pieces[0].bays.map((b) => b.items.some((i) => i.kind === 'rail'));
  assert.deepEqual(kinds, [false, true, false, true]);
});
