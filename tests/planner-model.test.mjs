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
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const bare = () => { const p = M.createProject(); p.room.openings = []; return p; };
const roomErrors = (room) => validateProject({ v: 2, room, pieces: [], placements: [] }).errors.filter((e) => e.code.startsWith('room-'));

const EXPECT = {
  rect:      { corners: 4, area: (p) => p.width * p.depth },
  'l-shape': { corners: 6, area: (p) => p.lengthA * p.widthA + p.widthB * (p.lengthB - p.widthA) },
  alcoves:   { corners: 8, area: (p) => p.width * p.depth - p.breastWidth * p.breastDepth },
  attic:     { corners: 4, area: (p) => p.width * p.depth },
  hallway:   { corners: 4, area: (p) => p.length * p.width },
  bay:       { corners: 8, area: (p) => p.width * p.depth + (p.bayWidth - p.bayDepth) * p.bayDepth }
};

// ---------- rooms ----------
test('every template: closed, clockwise, simple outline with the right corner count and area', () => {
  assert.deepEqual(Object.keys(M.TEMPLATE_PARAMS).sort(), Object.keys(EXPECT).sort());
  for (const id of Object.keys(EXPECT)) {
    const room = M.roomFromTemplate(id, {});
    const params = room.template.params;
    assert.equal(room.template.id, id);
    assert.equal(room.walls.length, EXPECT[id].corners, id);
    assert.ok(M.signedArea(room) > 0, `${id} is clockwise`);
    assert.equal(M.area(room), EXPECT[id].area(params), `${id} area`);
    assert.deepEqual(roomErrors(room), [], id);
    const ws = M.wallsOf(room);
    assert.equal(ws.length, room.walls.length);
    // closed: each wall ends where the next one starts
    ws.forEach((w, i) => assert.deepEqual(w.end, ws[(i + 1) % ws.length].start));
    assert.deepEqual(ws.map((w) => w.id), room.walls.map((_, i) => `w${i + 1}`));
    // the inward normal really points into the room
    for (const w of ws) {
      const mid = { x: (w.start.x + w.end.x) / 2 + w.normal.x * 0.5, z: (w.start.z + w.end.z) / 2 + w.normal.z * 0.5 };
      assert.ok(pointInPoly(mid, room.walls), `${id} ${w.id} normal points inwards`);
    }
    assert.ok(Math.abs(M.perimeter(room) - ws.reduce((s, w) => s + w.length, 0)) < 1e-9);
  }
});

test('templates at the corners of their parameter ranges stay valid', () => {
  for (const [id, spec] of Object.entries(M.TEMPLATE_PARAMS)) {
    const names = Object.keys(spec);
    for (let mask = 0; mask < 1 << names.length; mask++) {
      const raw = {};
      names.forEach((n, i) => { raw[n] = mask & (1 << i) ? spec[n].max : spec[n].min; });
      const room = M.roomFromTemplate(id, raw);
      const p = room.template.params;
      assert.equal(room.walls.length, EXPECT[id].corners);
      assert.deepEqual(roomErrors(room), [], `${id} ${JSON.stringify(raw)}`);
      assert.equal(M.area(room), EXPECT[id].area(p), `${id} ${JSON.stringify(raw)}`);
      for (const w of M.wallsOf(room)) assert.ok(w.length >= 10, `${id} wall ${w.id} not degenerate`);
    }
  }
});

test('TEMPLATE_PARAMS: defaults are inside min and max, and clamping keeps them', () => {
  for (const [id, spec] of Object.entries(M.TEMPLATE_PARAMS)) {
    const defaults = {};
    for (const [n, s] of Object.entries(spec)) {
      assert.ok(s.min <= s.default && s.default <= s.max, `${id}.${n}`);
      assert.equal(typeof s.label, 'string');
      defaults[n] = s.default;
    }
    assert.deepEqual(M.clampTemplateParams(id, defaults), defaults);
    assert.deepEqual(M.roomFromTemplate(id, defaults).template.params, defaults);
  }
  assert.deepEqual(M.clampTemplateParams('rect', { width: 'abc', depth: 1e9 }), { width: 420, depth: 800 });
});

test('specific geometry: l-shape notch, alcoves breast, bay, attic, hallway', () => {
  const l = M.roomFromTemplate('l-shape', { lengthA: 500, widthA: 300, lengthB: 450, widthB: 250 });
  assert.deepEqual(l.walls.map((c) => [c.x, c.z]), [[0, 0], [500, 0], [500, 300], [250, 300], [250, 450], [0, 450]]);
  const a = M.roomFromTemplate('alcoves', { width: 460, depth: 380, breastWidth: 100, breastDepth: 40, breastOffset: 170 });
  assert.deepEqual(a.walls.slice(0, 5).map((c) => [c.x, c.z]), [[0, 0], [170, 0], [170, 40], [270, 40], [270, 0]]);
  const b = M.roomFromTemplate('bay', { width: 420, depth: 360, bayWidth: 240, bayDepth: 50 });
  const sides = M.wallsOf(b).slice(1, 4);
  assert.ok(Math.abs(sides[0].length - Math.hypot(50, 50)) < 1e-9 && Math.abs(sides[2].length - sides[0].length) < 1e-9);
  assert.equal(sides[1].length, 140);
  assert.equal(b.walls[3].z, 0);
  const at = M.roomFromTemplate('attic', { width: 480, depth: 400, kneeHeight: 120, slopeAngle: 45, slopeWall: 1 });
  assert.equal(at.height, 250);
  assert.deepEqual(at.slope, { wallId: 'w1', lowHeight: 120, depth: 130 });
  assert.equal(M.ceilingHeightAt(at, 100, 0), 120);
  assert.equal(M.ceilingHeightAt(at, 100, 65), 185);
  assert.equal(M.ceilingHeightAt(at, 100, 300), 250);
  const h = M.roomFromTemplate('hallway', { length: 500, width: 120 });
  assert.deepEqual(h.openings.map((o) => [o.wallId, o.type]), [['w2', 'door'], ['w4', 'door']]);
  assert.throws(() => M.roomFromTemplate('nope', {}));
});

test('setTemplate: parameter changes keep openings by wall and offset, and flag the rest', () => {
  let p = M.setTemplate(bare(), 'rect', {});
  p = M.addOpening(p, { type: 'window', wallId: 'w1', offset: 260, width: 120 });
  p = M.addOpening(p, { type: 'door', wallId: 'w4', offset: 40 });
  assert.equal(p.room.openings.length, 2);
  // depth change: w1 keeps its length, so the window stays; w4 gets shorter but the door still fits
  const deeper = M.setTemplate(p, 'rect', { depth: 300 });
  assert.equal(deeper.room.walls[2].z, 300);
  assert.deepEqual(deeper.room.openings.map((o) => [o.wallId, o.offset, o.flagged]), [['w1', 260, undefined], ['w4', 40, undefined]]);
  // narrower room: the window no longer fits on w1
  const narrow = M.setTemplate(p, 'rect', { width: 300 });
  const win = narrow.room.openings.find((o) => o.type === 'window');
  assert.equal(win.flagged, true);
  assert.equal(win.offset, 260);
  assert.ok(validateProject(narrow).errors.some((e) => e.code === 'opening-off-wall' && e.ref.id === win.id));
  assert.equal(narrow.room.openings.find((o) => o.type === 'door').flagged, undefined);
  // switching template: same wall index and offset, and a wall that is gone is flagged, not deleted
  const l = M.setTemplate(p, 'l-shape', {});
  assert.equal(l.room.openings.length, 2);
  assert.equal(l.room.template.id, 'l-shape');
  const tiny = M.setTemplate(M.addOpening(p, { type: 'window', wallId: 'w3', offset: 10, width: 100 }), 'rect', { width: 200, depth: 200 });
  assert.ok(tiny.room.openings.length === 3);
  const back = M.setTemplate(narrow, 'rect', { width: 420 });
  assert.equal(back.room.openings.find((o) => o.type === 'window').flagged, undefined, 'flag clears once it fits again');
  // 8-wall room to 4-wall room: an opening on w7 has nowhere to go
  const alc = M.setTemplate(bare(), 'alcoves', {});
  const on7 = M.addOpening(alc, { type: 'window', wallId: 'w7', offset: 100, width: 100 });
  const rect = M.setTemplate(on7, 'rect', {});
  assert.equal(rect.room.openings.find((o) => o.wallId === 'w7').flagged, true);
  assert.equal(M.setTemplate(p, 'unknown', {}), p);
  // other room settings survive a template change
  const styled = M.updateRoom(p, { height: 300, floor: 'tile-floor', wall: 'sage', skirting: 10 });
  const t2 = M.setTemplate(styled, 'alcoves', {});
  assert.deepEqual([t2.room.height, t2.room.floor, t2.room.wall, t2.room.skirting], [300, 'tile-floor', 'sage', 10]);
});

test('attic keeps its slope in step with the ridge height', () => {
  let p = M.setTemplate(M.createProject(), 'attic', { slopeAngle: 45 });
  assert.ok(p.room.slope);
  const before = p.room.slope.depth;
  p = M.updateRoom(p, { height: 300 });
  assert.ok(p.room.slope.depth > before);
  p = M.setTemplate(p, 'rect', {});
  assert.equal(p.room.slope, null);
});

test('opening edits clamp to the wall and clear flags when fixed', () => {
  let p = M.setTemplate(bare(), 'rect', {});
  p = M.addOpening(p, { type: 'window', wallId: 'w1', offset: 400, width: 120 });
  const id = p.room.openings[0].id;
  assert.equal(p.room.openings[0].offset + p.room.openings[0].width <= 420, true);
  p = M.updateOpening(p, id, { width: 600, offset: 0 });
  assert.equal(p.room.openings[0].width, 420 > 600 ? 600 : 420);
  p = M.updateOpening(p, id, { type: 'door' });
  assert.equal(p.room.openings[0].type, 'door');
  p = M.removeOpening(p, id);
  assert.equal(p.room.openings.length, 0);
  assert.equal(M.addOpening(p, { type: 'bogus' }).room.openings.length, 0);
  assert.equal(M.updateOpening(p, 'zzz', { width: 5 }).room.openings.length, 0);
});

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
  const rail = M.addItem(p0, 'p1', 1, { kind: 'rail-long', y: 9999 }).pieces[0].bays[1].items.at(-1);
  assert.ok(rail.y + 4 <= inner);
  // presets are on the grid too
  for (const [id, pre] of Object.entries(M.PRESETS)) {
    for (const t of pre.types) {
      const piece = M.createPiece(t, undefined, { id: 'px' });
      const proj = M.applyPreset({ ...p0, pieces: [piece], placements: [] }, 'px', 0, id);
      for (const i of proj.pieces[0].bays[0].items) if (M.ITEMS[i.kind].zone(i)) assert.ok(onGrid(i.y), `${id}/${t}/${i.kind}@${i.y}`);
    }
  }
});

test('item edits: add, update, move between bays, remove, params clamp', () => {
  let p = M.createProject();
  const n0 = p.pieces[0].bays[1].items.length;
  p = M.addItem(p, 'p1', 1, { kind: 'drawers', y: 0, count: 99, front: 1 });
  const d = p.pieces[0].bays[1].items.at(-1);
  assert.deepEqual([d.count, d.front], [6, 12]);
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
  const bay = M.applyPreset(p, 'p1', 0, 'dressing').pieces[0].bays[0].items.map((i) => i.kind);
  assert.deepEqual(bay, ['jewellery', 'divided-drawer', 'trouser-rack', 'mirror']);
  assert.deepEqual(M.applyPreset(p, 'p1', 0, 'nope'), p, 'unknown preset changes nothing');
  assert.deepEqual(M.applyPreset(p, 'p1', 0, 'kitchen-bin'), p, 'a preset for another type changes nothing');
  assert.deepEqual(M.presetsFor('wardrobe').map((x) => x.id).sort(), ['double-hanging', 'drawers-shelves', 'dressing', 'hanging-shelf', 'shelves', 'shoes']);
});

test('ITEMS: every kind has a label, params, hardware and a zone consistent with its body', () => {
  assert.ok(Object.keys(M.ITEMS).length >= 21);
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
  assert.deepEqual(M.itemZone(it('rail-long')), [-150, 4]);
  assert.deepEqual(M.itemZone(it('rail-short')), [-95, 4]);
  assert.deepEqual(M.itemZone(it('double-hang')), [-190, 4]);
  assert.deepEqual(M.itemZone(it('pull-down-rail')), [-100, 10]);
  assert.deepEqual(M.itemZone(it('drawers', { count: 3, front: 20 })), [0, 60]);
  assert.deepEqual(M.itemZone(it('jewellery')), [0, 8]);
  assert.deepEqual(M.itemZone(it('divided-drawer')), [0, 15]);
  assert.deepEqual(M.itemZone(it('shoes', { rows: 3 })), [0, 60]);
  assert.deepEqual(M.itemZone(it('shoe-pullout', { rows: 3 })), [0, 66]);
  assert.deepEqual(M.itemZone(it('trouser-rack')), [0, 70]);
  assert.deepEqual(M.itemZone(it('tie-belt')), [0, 50]);
  assert.deepEqual(M.itemZone(it('valet-rod')), [0, 5]);
  assert.deepEqual(M.itemZone(it('basket', { depth: 20 })), [0, 23]);
  assert.deepEqual(M.itemZone(it('hamper')), [0, 60]);
  assert.deepEqual(M.itemZone(it('ironing')), [0, 110]);
  assert.equal(M.itemZone(it('mirror', { mode: 'door' })), null);
  assert.deepEqual(M.itemZone(it('mirror', { mode: 'pull-out' })), [0, 120]);
  assert.deepEqual(M.itemZone(it('cubbies', { rows: 2 })), [0, 60]);
  assert.deepEqual(M.itemZone(it('hooks')), [0, 10]);
  assert.equal(M.itemZone(it('led')), null);
  assert.equal(M.ITEMS['inner-drawers'].needsDoor({}), true);
  assert.equal(M.ITEMS.ironing.minBay.width, 40);
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
    const proj = { v: 2, room: M.roomFromTemplate('rect', { width: 900, depth: 800 }), pieces: [piece], placements: [] };
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

test('addPiece / removePiece: unique ids, removal drops the placement', () => {
  let p = M.createProject();
  p = M.addPiece(p, 'table', 'flat-oak');
  p = M.addPiece(p, 'table', 'flat-oak', { id: 'p3' });
  assert.deepEqual(p.pieces.map((x) => x.id), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(M.addPiece(p, 'sofa', 'x').pieces.length, 4);
  const r = M.removePiece(p, 'p1');
  assert.equal(r.pieces.length, 3);
  assert.equal(r.placements.some((pl) => pl.pieceId === 'p1'), false);
  assert.equal(M.pieceLabel(p, 'p3'), 'Table 1');
  assert.equal(M.pieceLabel(p, 'p4'), 'Table 2');
});

// ---------- placement ----------
test('placePiece: wall mode snaps to wall ends and neighbours within 5 cm', () => {
  let p = M.setTemplate(M.createProject(), 'rect', {});
  p = M.removePiece(M.removePiece(p, 'p1'), 'p2');
  p = M.addPiece(p, 'wardrobe', 'flat-oak', { id: 'a', width: 100 });
  p = M.addPiece(p, 'wardrobe', 'flat-oak', { id: 'b', width: 100 });
  p = M.placePiece(p, 'a', { mode: 'wall', wallId: 'w1', offset: 3 });
  assert.equal(p.placements[0].offset, 0, 'snaps to the wall start');
  p = M.placePiece(p, 'b', { mode: 'wall', wallId: 'w1', offset: 104 });
  assert.equal(p.placements.find((x) => x.pieceId === 'b').offset, 100, 'snaps to the neighbour');
  p = M.movePlacement(p, 'b', { offset: 200 });
  assert.equal(p.placements.find((x) => x.pieceId === 'b').offset, 200, 'no snap beyond 5 cm');
  p = M.movePlacement(p, 'b', { offset: 318 });
  assert.equal(p.placements.find((x) => x.pieceId === 'b').offset, 320, 'snaps to the wall end');
  p = M.movePlacement(p, 'b', { offset: 9999 });
  assert.equal(p.placements.find((x) => x.pieceId === 'b').offset, 320, 'clamped inside the wall');
  p = M.movePlacement(p, 'b', { wallId: 'w2', offset: 50 });
  assert.deepEqual([p.placements.find((x) => x.pieceId === 'b').wallId], ['w2']);
  assert.equal(p.placements.length, 2, 'one placement per piece');
  p = M.unplace(p, 'a');
  assert.equal(p.placements.length, 1);
  assert.equal(M.movePlacement(p, 'a', { offset: 5 }).placements.length, 1);
  // a wall unit above a base cabinet does not snap to it (no vertical overlap)
  let q = M.setTemplate(M.createProject(), 'rect', {});
  q = M.removePiece(M.removePiece(q, 'p1'), 'p2');
  q = M.addPiece(q, 'kitchen-base', 'sage-kitchen', { id: 'k1' });
  q = M.addPiece(q, 'kitchen-wall', 'sage-kitchen', { id: 'k2' });
  q = M.placePiece(q, 'k1', { mode: 'wall', wallId: 'w1', offset: 100 });
  q = M.placePiece(q, 'k2', { mode: 'wall', wallId: 'w1', offset: 163 });
  assert.equal(q.placements.find((x) => x.pieceId === 'k2').offset, 163);
  assert.equal(q.placements.find((x) => x.pieceId === 'k2').elevation, 140);
});

test('placePiece: free mode keeps x, z and snaps rotation to right angles', () => {
  let p = M.addPiece(M.createProject(), 'table', 'flat-oak');
  p = M.placePiece(p, 'p3', { mode: 'free', x: 210.4, z: 190, rotation: 93 });
  assert.deepEqual(p.placements.at(-1), { pieceId: 'p3', mode: 'free', x: 210, z: 190, rotation: 90, elevation: 0 });
  p = M.movePlacement(p, 'p3', { rotation: 45 });
  assert.equal(p.placements.at(-1).rotation, 45);
  p = M.movePlacement(p, 'p3', { rotation: -90 });
  assert.equal(p.placements.at(-1).rotation, 270);
  const fp = M.footprintOf(p, p.placements.at(-1));
  assert.equal(fp.corners.length, 4);
  assert.ok(Math.abs(fp.cx - 210) < 1e-9);
  assert.equal(M.placePiece(p, 'p3', { mode: 'sideways' }).placements.length, p.placements.length);
});

test('footprintOf: wall pieces sit against their wall, facing into the room', () => {
  const p = M.createProject();
  const fp = M.footprintOf(p, p.placements[0]);
  assert.deepEqual(fp.corners.map((c) => [c.x, c.z]), [[0, 0], [170, 0], [170, 60], [0, 60]]);
  // on a side wall (w6 runs down at x=460): the piece faces left
  const q = M.placePiece(p, 'p2', { mode: 'wall', wallId: 'w6', offset: 10 });
  const f2 = M.footprintOf(q, q.placements.find((x) => x.pieceId === 'p2'));
  assert.ok(f2.corners.every((c) => c.x >= 460 - 65 - 1e-9 && c.x <= 460 + 1e-9));
  assert.equal(M.footprintOf(p, { pieceId: 'nope', mode: 'wall' }), null);
});

// ---------- immutability ----------
test('every edit returns a new project and never mutates its input', () => {
  const base = deepFreeze(M.createProject());
  const snapshot = JSON.stringify(base);
  const edits = [
    (p) => M.updateRoom(p, { height: 300, floor: 'tile-floor' }),
    (p) => M.setTemplate(p, 'l-shape', { lengthA: 600 }),
    (p) => M.setTemplate(p, 'attic', {}),
    (p) => M.addOpening(p, { type: 'window', wallId: 'w7', offset: 20, width: 100 }),
    (p) => M.updateOpening(p, 'o1', { width: 90 }),
    (p) => M.removeOpening(p, 'o1'),
    (p) => M.addPiece(p, 'island', 'sage-kitchen'),
    (p) => M.updatePiece(p, 'p1', { width: 200, style: 'glass-oak' }),
    (p) => M.removePiece(p, 'p1'),
    (p) => M.setBays(p, 'p1', 4),
    (p) => M.setBays(p, 'p1', [40, 60]),
    (p) => M.addItem(p, 'p1', 0, { kind: 'led', y: 100 }),
    (p) => M.moveItem(p, 'p1', 0, 0, { y: 50, bay: 1 }),
    (p) => M.updateItem(p, 'p1', 0, 0, { y: 70 }),
    (p) => M.removeItem(p, 'p1', 0, 0),
    (p) => M.applyPreset(p, 'p1', 1, 'shoes'),
    (p) => M.placePiece(p, 'p2', { mode: 'free', x: 100, z: 100, rotation: 0 }),
    (p) => M.movePlacement(p, 'p1', { offset: 30 }),
    (p) => M.unplace(p, 'p1'),
    (p) => M.clampProject(p)
  ];
  for (const edit of edits) {
    const out = edit(base);
    assert.notEqual(out, base);
    assert.equal(JSON.stringify(base), snapshot);
  }
  // results are independent of each other and of the input
  const a = M.updateRoom(base, { height: 300 });
  const b = M.updateRoom(a, { height: 280 });
  assert.equal(a.room.height, 300);
  assert.equal(b.room.height, 280);
  assert.notEqual(a.room.walls, base.room.walls);
  assert.notEqual(a.pieces[0].bays[0].items, base.pieces[0].bays[0].items);
  // unknown ids change nothing
  for (const out of [M.removePiece(base, 'zz'), M.updatePiece(base, 'zz', {}), M.addItem(base, 'zz', 0, { kind: 'shelf' }), M.unplace(base, 'zz'), M.placePiece(base, 'zz', { mode: 'free', x: 0, z: 0 })]) {
    assert.equal(JSON.stringify(out), snapshot);
  }
});

test('createProject: alcoves room, wardrobe in the left alcove, desk in the right', () => {
  const p = M.createProject();
  assert.equal(p.v, 2);
  assert.equal(p.room.template.id, 'alcoves');
  assert.equal(p.room.walls.length, 8);
  const [w, d] = p.pieces;
  assert.deepEqual([w.type, d.type], ['wardrobe', 'desk']);
  const walls = M.wallsOf(p.room);
  const wa = p.placements.find((x) => x.pieceId === w.id), da = p.placements.find((x) => x.pieceId === d.id);
  const wFp = M.footprintOf(p, wa), dFp = M.footprintOf(p, da);
  const breastLeft = p.room.template.params.breastOffset;
  assert.ok(wFp.corners.every((c) => c.x <= breastLeft + 1e-9), 'wardrobe is left of the breast');
  assert.ok(dFp.corners.every((c) => c.x >= breastLeft + p.room.template.params.breastWidth - 1e-9), 'desk is right of the breast');
  assert.equal(walls.find((x) => x.id === wa.wallId).length, 170);
  assert.deepEqual(validateProject(p).errors, []);
  assert.deepEqual(M.clampProject(clone(p)), p, 'clampProject is idempotent on a valid project');
});

test('clampProject turns garbage into a valid project', () => {
  for (const raw of [null, undefined, 5, 'x', [], {}, { room: 7, pieces: 'x' }, { pieces: [null, 3, { type: 'sofa' }, { type: 'desk', width: 'abc', bays: 'x' }] }]) {
    const p = M.clampProject(raw);
    assert.equal(p.v, 2);
    assert.ok(p.room.walls.length >= 3);
    assert.deepEqual(validateProject(p).errors.filter((e) => e.blocking), []);
  }
  const p = M.clampProject({
    room: { walls: [{ x: 0, z: 0 }, { x: 1e9, z: 0 }, { x: 5, z: 'x' }], height: 1, openings: [{ type: 'door', wallId: 'w1', offset: 1e9, width: 5, height: 5 }, { type: 'x' }] },
    pieces: [{ id: 'a!b', type: 'wardrobe', width: 1e9, bays: [{ width: 5, items: [{ kind: 'shelf', y: 1e9 }, { kind: 'zzz' }] }, 5] }, { id: 'p1', type: 'desk' }, { id: 'p1', type: 'desk' }],
    placements: [{ pieceId: 'p1', mode: 'wall', offset: 'x' }, { pieceId: 'p1', mode: 'free' }, { pieceId: 'nope', mode: 'free' }]
  });
  assert.equal(p.room.height, 220);
  assert.equal(p.room.walls.length >= 3, true);
  assert.equal(new Set(p.pieces.map((x) => x.id)).size, p.pieces.length);
  assert.equal(p.placements.length, 1);
  assert.ok(p.room.openings.every((o) => o.width >= 60 && o.height >= 180));
});

// ---------- migrate ----------
test('migrate: the default v1 design becomes a rect room with a piece and a placement per module', () => {
  const v1 = createDesign();
  const snapshot = JSON.stringify(v1);
  const p = M.migrate(deepFreeze(clone(v1)));
  assert.equal(JSON.stringify(v1), snapshot);
  assert.equal(p.v, 2);
  assert.equal(p.room.template.id, 'rect');
  assert.deepEqual(p.room.template.params, { width: 420, depth: 380 });
  assert.equal(p.room.walls.length, 4);
  assert.equal(p.room.height, 260);
  assert.deepEqual([p.room.floor, p.room.wall], [v1.room.floor, v1.room.wall]);
  assert.equal(p.room.openings.length, 1);
  assert.deepEqual(
    (({ wallId, type, offset, bottom, width, height }) => ({ wallId, type, offset, bottom, width, height }))(p.room.openings[0]),
    { wallId: 'w1', type: 'window', offset: 260, bottom: 90, width: 120, height: 130 }
  );
  assert.deepEqual(p.pieces.map((x) => x.type), ['wardrobe', 'desk']);
  assert.deepEqual(p.placements.map((x) => [x.pieceId, x.mode, x.wallId, x.offset]), [['p1', 'wall', 'w1', 0], ['p2', 'wall', 'w1', 250]]);
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
  assert.equal(p.room.template.params.width, 700);
  assert.equal(p.pieces.length, d.modules.length);
  const types = p.pieces.map((x) => x.type);
  assert.deepEqual(types.filter((t) => t === 'kitchen-base').length, 4);
  assert.ok(types.includes('wall-unit') && types.includes('window-seat'), 'shelving and bench map to v2 types');
  const island = p.pieces.find((x) => x.type === 'island');
  const ip = p.placements.find((x) => x.pieceId === island.id);
  assert.equal(ip.mode, 'free');
  const m = d.modules.find((x) => x.type === 'island');
  assert.deepEqual([ip.x, ip.z], [m.x + m.width / 2, m.z + m.depth / 2]);
  const wall = p.placements.filter((x) => x.mode === 'wall');
  assert.equal(wall.length, p.pieces.length - 1);
  const wc = p.pieces.find((x) => x.type === 'kitchen-wall');
  assert.equal(p.placements.find((x) => x.pieceId === wc.id).elevation, 140);
  assert.equal(wc.worktop, null);
  assert.ok(p.pieces.find((x) => x.type === 'kitchen-base').worktop);
  const wd = p.pieces.find((x) => x.type === 'wardrobe');
  assert.equal(wd.fronts.kind, 'sliding');
  assert.equal(wd.bays.length, 3);
  assert.ok(wd.bays.every((b) => b.items.some((i) => i.kind === 'rail-long' || i.kind === 'rail-short')), 'rail interior expands to hanging rails');
  assert.ok(wd.bays.every((b) => b.items.some((i) => i.kind === 'led')), 'v1 led flag becomes an LED item');
  assert.equal(wd.bays.reduce((n, b) => n + b.items.filter((i) => i.kind === 'drawers').reduce((s, i) => s + i.count, 0), 0), 3);
  // rail wardrobe with drawers is a sound layout
  assert.deepEqual(validateProject({ ...p, placements: [] }).errors.filter((e) => e.blocking), []);
  // edge cases
  assert.equal(M.migrate({}).pieces.length, 0);
  assert.equal(M.migrate(null).room.walls.length, 4);
  const mixed = M.migrate(updateModule(createDesign(), 'm1', { interior: 'mixed', sections: 4, width: 300 }));
  const kinds = mixed.pieces[0].bays.map((b) => b.items.some((i) => i.kind === 'rail-long'));
  assert.deepEqual(kinds, [false, true, false, true]);
});
