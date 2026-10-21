import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODULE_TYPES, MATERIALS, FLOORS, WALL_COLORS, createDesign, createModule, clampModule, clampRoom,
  addModule, updateModule, removeModule, moveModule, updateRoom, findCollisions, validate, cloneDesign
} from '../site/js/configurator/model.js';

const room = (o = {}) => clampRoom({ width: 420, height: 260, depth: 380, openings: [], ...o });
const empty = (o) => ({ v: 1, room: room(o), modules: [] });

test('registry has every type, materials and palettes', () => {
  for (const t of ['wardrobe', 'kitchen-base', 'kitchen-wall', 'tall-cabinet', 'island', 'shelving', 'desk', 'table', 'bench', 'window-seat']) {
    const T = MODULE_TYPES[t];
    assert.ok(T, t);
    assert.ok(T.label && T.icon && T.defaults && T.limits && T.allowed, t);
    assert.equal(typeof T.freestanding, 'boolean');
    assert.ok(createModule(t).width >= T.limits.width[0]);
  }
  assert.equal(MODULE_TYPES.island.freestanding, true);
  assert.equal(MODULE_TYPES.table.freestanding, true);
  assert.equal(typeof createModule('island').z, 'number');
  assert.equal(createModule('wardrobe').z, undefined);
  for (const id of ['oak', 'walnut', 'ash', 'birch-ply', 'lacquer-white', 'lacquer-sage', 'lacquer-charcoal', 'lacquer-clay', 'terrazzo', 'steel-black']) {
    const m = MATERIALS[id];
    assert.ok(m, id);
    assert.match(m.color, /^#[0-9a-f]{6}$/i);
    assert.ok(['wood', 'ply', 'lacquer', 'stone'].includes(m.kind));
    assert.equal(typeof m.grain, 'boolean');
  }
  assert.ok(Object.keys(FLOORS).length >= 2 && Object.keys(WALL_COLORS).length >= 2);
});

test('createDesign: default room, wardrobe and desk, valid with no collisions', () => {
  const d = createDesign();
  assert.equal(d.v, 1);
  assert.equal(d.room.width, 420);
  assert.equal(d.room.height, 260);
  assert.deepEqual(d.room.openings.map((o) => [o.type, o.x]), [['window', 260]]);
  const [w, desk] = d.modules;
  assert.equal(w.type, 'wardrobe');
  assert.equal(w.x, 0);
  assert.equal(w.width, 200);
  assert.equal(w.front, 'oak');
  assert.equal(w.body, 'birch-ply');
  assert.equal(desk.type, 'desk');
  assert.equal(desk.width, 140);
  assert.equal(desk.front, 'walnut');
  assert.deepEqual(findCollisions(d), []);
  assert.deepEqual(validate(d), { ok: true, errors: [] });
  assert.notEqual(createDesign(), createDesign());
});

test('createModule gives unique ids and applies clamped overrides', () => {
  const a = createModule('wardrobe');
  const b = createModule('wardrobe');
  assert.notEqual(a.id, b.id);
  assert.equal(createModule('desk', { width: 5000 }).width, MODULE_TYPES.desk.limits.width[1]);
  assert.equal(createModule('desk', { id: 'custom' }).id, 'custom');
  assert.throws(() => createModule('spaceship'));
});

test('clampModule: limits, rounding and allowed values', () => {
  const r = room();
  const m = clampModule({ ...createModule('wardrobe'), width: 9999, height: 10, depth: 1, sections: 99, drawers: -4 }, r);
  assert.equal(m.width, MODULE_TYPES.wardrobe.limits.width[1]);
  assert.equal(m.height, MODULE_TYPES.wardrobe.limits.height[0]);
  assert.equal(m.depth, MODULE_TYPES.wardrobe.limits.depth[0]);
  assert.equal(m.sections, 8);
  assert.equal(m.drawers, 0);

  const c = clampModule({ ...createModule('wardrobe'), width: 100.6, x: 12.4 }, r);
  assert.equal(c.width, 101);
  assert.equal(c.x, 12);
  assert.ok(Number.isInteger(c.width) && Number.isInteger(c.x));

  const bad = clampModule({ ...createModule('table'), doors: 'sliding', handle: 'laser', body: 'steel-black', front: 'nope', worktop: 'nope', interior: 'rail' }, r);
  assert.equal(bad.doors, 'none');
  assert.equal(bad.handle, 'bar');
  assert.equal(bad.body, 'birch-ply');
  assert.equal(bad.front, MODULE_TYPES.table.defaults.front);
  assert.equal(bad.worktop, null);
  assert.equal(bad.interior, 'shelves');
  assert.equal(clampModule({ ...createModule('wardrobe'), worktop: 'oak' }, r).worktop, null, 'wardrobes take no worktop');
  assert.equal(clampModule({ ...createModule('desk'), worktop: 'oak' }, r).worktop, 'oak');
});

test('clampModule keeps modules inside the wall and under the ceiling', () => {
  const r = room({ width: 300, height: 250 });
  const m = clampModule({ ...createModule('wardrobe'), x: 280, width: 200 }, r);
  assert.ok(m.x >= 0 && m.x + m.width <= 300);
  assert.equal(clampModule({ ...createModule('wardrobe'), x: -50 }, r).x, 0);
  const tall = clampModule({ ...createModule('wardrobe'), height: 300 }, r);
  assert.ok(tall.elevation + tall.height <= 250);
  const wall = clampModule({ ...createModule('kitchen-wall'), elevation: 180, height: 100 }, r);
  assert.ok(wall.elevation + wall.height <= 250);
  assert.ok(wall.elevation >= MODULE_TYPES['kitchen-wall'].limits.elevation[0]);
  const isl = clampModule({ ...createModule('island'), z: 9999 }, r);
  assert.ok(isl.z + isl.depth <= r.depth);
});

test('clampRoom clamps dimensions, ids and openings', () => {
  const r = clampRoom({ width: 50, height: 9999, depth: 1, floor: 'lava', wall: 'x', openings: [{ type: 'window', x: 900, y: -5, w: 120, h: 130 }, null] });
  assert.equal(r.width, 200);
  assert.equal(r.height, 400);
  assert.equal(r.depth, 250);
  assert.equal(r.floor, 'oak-floor');
  assert.equal(r.openings.length, 1);
  const o = r.openings[0];
  assert.ok(o.x >= 0 && o.x + o.w <= r.width && o.y >= 0);
  const door = clampRoom({ openings: [{ type: 'door', x: 10, y: 50, w: 90, h: 210 }] }).openings[0];
  assert.equal(door.y, 0);
});

test('addModule finds the first free gap, never mutates, handles vertical stacking', () => {
  const d = createDesign();
  const snapshot = JSON.stringify(d);
  const d2 = addModule(d, 'bench', { width: 100 });
  assert.equal(JSON.stringify(d), snapshot, 'input untouched');
  assert.notEqual(d2, d);
  assert.equal(d2.modules.length, 3);
  assert.equal(d2.modules[2].id, 'm3');

  // wardrobe 0..200, desk 270..410: a 60 cm bench fits the 200..270 gap
  const wide = updateModule(d, 'm2', { x: 270 });
  assert.equal(addModule(wide, 'bench', { width: 60 }).modules[2].x, 200);
  // an 80 cm bench fits nowhere (gap is 70, free end is 10), so it falls back to x = 0
  assert.equal(addModule(wide, 'bench', { width: 80 }).modules[2].x, 0);

  // first gap is after the first module when the start is taken
  let e = addModule(empty(), 'kitchen-base', { width: 60 });
  e = addModule(e, 'kitchen-base', { width: 60 });
  assert.deepEqual(e.modules.map((m) => m.x), [0, 60]);

  // wall cabinet goes above a base cabinet at x = 0 (no vertical overlap)
  const stacked = addModule(e, 'kitchen-wall', { width: 60 });
  assert.equal(stacked.modules[2].x, 0);

  // explicit x is respected, freestanding placed centred
  assert.equal(addModule(empty(), 'bench', { x: 77 }).modules[0].x, 77);
  const isl = addModule(empty(), 'island').modules[0];
  assert.equal(isl.x, Math.round((420 - isl.width) / 2));
});

test('updateModule, removeModule are immutable and clamp', () => {
  const d = createDesign();
  const before = JSON.stringify(d);
  const u = updateModule(d, 'm1', { width: 5000, front: 'walnut' });
  assert.equal(JSON.stringify(d), before);
  assert.equal(u.modules[0].width, MODULE_TYPES.wardrobe.limits.width[1]);
  assert.equal(u.modules[0].front, 'walnut');
  assert.equal(updateModule(d, 'nope', { width: 100 }).modules.length, 2);
  const r = removeModule(d, 'm1');
  assert.deepEqual(r.modules.map((m) => m.id), ['m2']);
  assert.equal(d.modules.length, 2);
  const c = cloneDesign(d);
  c.modules[0].width = 1;
  assert.equal(d.modules[0].width, 200);
});

test('moveModule snaps to neighbour edges within 5 cm, clamps to the wall', () => {
  const d = createDesign(); // wardrobe 0..200, desk 250..390
  assert.equal(moveModule(d, 'm2', 203).modules[1].x, 200, 'snaps to wardrobe right edge');
  assert.equal(moveModule(d, 'm2', 206).modules[1].x, 206, 'beyond 5 cm no snap');
  assert.equal(moveModule(d, 'm2', 418).modules[1].x, 420 - 140, 'clamped to wall end');
  assert.equal(moveModule(d, 'm2', -30).modules[1].x, 0);
});

test('moveModule snaps own right edge to neighbour left edge', () => {
  const d = createDesign();
  assert.equal(moveModule(d, 'm1', 48).modules[0].x, 50, 'wardrobe right edge meets desk left edge at 250');
  assert.equal(moveModule(d, 'm1', 3).modules[0].x, 0, 'snaps to wall start');
});

test('updateRoom clamps the room and re-clamps modules', () => {
  const d = createDesign();
  const before = JSON.stringify(d);
  const n = updateRoom(d, { width: 300, height: 250 });
  assert.equal(JSON.stringify(d), before);
  assert.equal(n.room.width, 300);
  for (const m of n.modules) assert.ok(m.x + m.width <= 300 && m.elevation + m.height <= 250);
  assert.equal(updateRoom(d, { width: 10 }).room.width, 200);
  assert.equal(updateRoom(d, { floor: 'ash-floor' }).room.floor, 'ash-floor');
});

test('findCollisions: x and vertical overlap only, wall modules only', () => {
  let d = empty();
  d = addModule(d, 'wardrobe', { x: 0, width: 100 });
  d = addModule(d, 'wardrobe', { x: 100, width: 100 });
  assert.deepEqual(findCollisions(d), [], 'touching is not overlapping');
  d = updateModule(d, 'm2', { x: 80 });
  assert.deepEqual(findCollisions(d), [['m1', 'm2']]);

  let k = addModule(empty(), 'kitchen-base', { x: 0 });
  k = addModule(k, 'kitchen-wall', { x: 0 });
  assert.deepEqual(findCollisions(k), [], 'wall cabinet above base cabinet');
  k = addModule(k, 'tall-cabinet', { x: 0 });
  assert.deepEqual(findCollisions(k), [['m1', 'm3'], ['m2', 'm3']], 'a tall cabinet overlaps both vertically');

  let f = addModule(empty(), 'island', { x: 0 });
  f = addModule(f, 'wardrobe', { x: 0 });
  assert.deepEqual(findCollisions(f), [], 'freestanding modules are ignored');
});

test('validate: overlap, blocks-opening, too-tall codes', () => {
  let d = createDesign();
  assert.equal(validate(d).ok, true);

  const o = validate(updateModule(d, 'm2', { x: 150 }));
  assert.equal(o.ok, false);
  assert.ok(o.errors.some((e) => e.code === 'overlap' && e.message));

  // wardrobe into the window span
  const b = validate(updateModule(d, 'm1', { x: 200 }));
  assert.ok(b.errors.some((e) => e.code === 'blocks-opening' && e.moduleId === 'm1'));

  // a desk under the window is fine, a tall one is not
  const high = { ...d, modules: [{ ...d.modules[1], elevation: 0, height: 100 }] };
  assert.ok(validate(high).errors.some((e) => e.code === 'blocks-opening'), 'covering the sill blocks the window');
  assert.equal(validate({ ...d, modules: [d.modules[1]] }).ok, true);

  // wall cabinet above the window bottom edge blocks; below the sill passes
  const wallBelow = { ...d, modules: [{ ...createModule('kitchen-wall', { id: 'w', x: 260, elevation: 100 }) }] };
  assert.ok(validate(wallBelow).errors.some((e) => e.code === 'blocks-opening'));
  const wallClear = { ...d, room: { ...d.room, openings: [{ id: 'o1', type: 'window', x: 0, y: 150, w: 100, h: 100 }] }, modules: [createModule('kitchen-base', { id: 'b', x: 0 })] };
  assert.equal(validate(wallClear).ok, true);

  // too-tall (only reachable with an unclamped design)
  const tall = { ...d, modules: [{ ...d.modules[0], height: 300 }] };
  assert.ok(validate(tall).errors.some((e) => e.code === 'too-tall' && e.moduleId === 'm1'));

  // door counts as an opening
  const door = { ...d, room: { ...d.room, openings: [{ id: 'd1', type: 'door', x: 0, y: 0, w: 90, h: 210 }] } };
  assert.ok(validate(door).errors.some((e) => e.code === 'blocks-opening'));
});
