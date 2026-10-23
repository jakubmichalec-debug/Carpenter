import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { validateProject as rawValidate } from '../site/js/planner/validate.js';

const seen = new Set();
const validateProject = (p) => {
  const r = rawValidate(p);
  r.errors.forEach((e) => seen.add(e.code));
  return r;
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const codes = (p) => validateProject(p).errors.map((e) => e.code);
const find = (p, code) => validateProject(p).errors.find((e) => e.code === code);

// A plain 420 x 380 room with a wardrobe on the top wall, a desk on the left wall and nothing else.
function base() {
  let p = M.createProject();
  p = M.setTemplate(p, 'rect', {});
  p.room.openings = [];
  p = M.removePiece(M.removePiece(p, 'p1'), 'p2');
  p = M.addPiece(p, 'wardrobe', 'flat-oak', { id: 'w', width: 200 });
  p = M.placePiece(p, 'w', { mode: 'wall', wallId: 'w1', offset: 0 });
  return p;
}
const bay0 = (p) => p.pieces.find((x) => x.id === 'w').bays[0];
const setItems = (p, items, bay = 0) => { p = clone(p); p.pieces.find((x) => x.id === 'w').bays[bay].items = items; return p; };

test('a clean project has no errors', () => {
  assert.deepEqual(validateProject(base()), { ok: true, errors: [], blocking: [], warnings: [] });
  const d = validateProject(M.createProject());
  assert.equal(d.ok, true);
  assert.deepEqual(d.errors, []);
});

test('errors carry a code, a message, a ref and a blocking flag', () => {
  const p = base();
  p.room.openings = [{ id: 'o9', wallId: 'w9', type: 'window', offset: 0, bottom: 90, width: 100, height: 100 }];
  const r = validateProject(p);
  assert.equal(r.ok, false);
  const e = r.errors[0];
  assert.equal(e.code, 'opening-off-wall');
  assert.equal(typeof e.message, 'string');
  assert.deepEqual(e.ref, { type: 'opening', id: 'o9' });
  assert.equal(e.blocking, true);
  assert.deepEqual(r.blocking, r.errors);
});

// ---------- room ----------
test('room-too-few-walls, room-wall-degenerate, room-not-clockwise, room-self-intersects', () => {
  let p = base();
  p.room.walls = p.room.walls.slice(0, 2);
  assert.ok(codes(p).includes('room-too-few-walls'));
  p = base();
  p.room.walls[1] = { ...p.room.walls[1], x: 3, z: 0 };
  assert.ok(codes(p).includes('room-wall-degenerate'));
  p = base();
  p.room.walls = [...p.room.walls].reverse();
  assert.ok(codes(p).includes('room-not-clockwise'));
  p = base();
  p.room.walls = [{ id: 'w1', x: 0, z: 0 }, { id: 'w2', x: 400, z: 300 }, { id: 'w3', x: 400, z: 0 }, { id: 'w4', x: 0, z: 300 }];
  const e = find(p, 'room-self-intersects');
  assert.ok(e && e.blocking && e.ref.type === 'room');
  p = base();
  p.room.walls = [{ id: 'w1', x: 0, z: 0 }, { id: 'w2', x: Number.NaN, z: 0 }, { id: 'w3', x: 1, z: 1 }];
  assert.ok(codes(p).includes('room-too-few-walls'));
});

test('opening-off-wall, opening-overlap, opening-too-tall', () => {
  let p = base();
  p.room.openings = [{ id: 'o1', wallId: 'w1', type: 'window', offset: 350, bottom: 90, width: 120, height: 100 }];
  assert.deepEqual(find(p, 'opening-off-wall').ref, { type: 'opening', id: 'o1' });
  p.room.openings[0].wallId = 'w42';
  assert.ok(find(p, 'opening-off-wall'));
  p = base();
  p.room.openings = [
    { id: 'a', wallId: 'w3', type: 'window', offset: 100, bottom: 90, width: 120, height: 100 },
    { id: 'b', wallId: 'w3', type: 'door', offset: 200, bottom: 0, width: 90, height: 210 }
  ];
  assert.deepEqual(find(p, 'opening-overlap').ref, { type: 'opening', id: 'b' });
  p.room.openings[1].offset = 230; // clear of the window
  assert.equal(find(p, 'opening-overlap'), undefined);
  p.room.openings[0].bottom = 250; p.room.openings[0].height = 100;
  assert.ok(find(p, 'opening-too-tall'));
  // side by side, or stacked without touching, is fine
  p.room.openings = [
    { id: 'a', wallId: 'w3', type: 'window', offset: 100, bottom: 150, width: 100, height: 60 },
    { id: 'b', wallId: 'w3', type: 'radiator', offset: 100, bottom: 15, width: 100, height: 60 }
  ];
  assert.deepEqual(validateProject(p).errors.filter((e) => e.code === 'opening-overlap'), []);
});

// ---------- piece ----------
test('piece-type-unknown, piece-size, bays-count, bays-width', () => {
  let p = base();
  p.pieces.push({ id: 'z', type: 'sofa', bays: [] });
  assert.ok(find(p, 'piece-type-unknown'));
  p = base();
  p.pieces[0].width = 1000;
  assert.deepEqual(find(p, 'piece-size').ref, { type: 'piece', id: 'w' });
  p = base();
  p.pieces[0].bays = [];
  assert.ok(find(p, 'bays-count'));
  p = base();
  p.pieces[0].bays = Array.from({ length: 12 }, () => ({ width: 15, door: 'left', items: [] }));
  assert.ok(find(p, 'bays-count'));
  p = base();
  p.pieces[0].bays[0].width += 10;
  assert.ok(find(p, 'bays-width'));
  p = base();
  const g = M.pieceGeometry(p.pieces[0]);
  p.pieces[0].bays = [{ width: 10, door: 'left', items: [] }, { width: g.innerW - 10 - 2 - 0, door: 'left', items: [] }];
  p.pieces[0].bays = M.setBays(p, 'w', 2).pieces[0].bays;
  p.pieces[0].bays[0].width = 10;
  p.pieces[0].bays[1].width = M.pieceGeometry(p.pieces[0], 2).innerW - 10;
  assert.equal(validateProject(p).errors.filter((e) => e.code === 'bays-width')[0].ref.bay, 0);
});

test('item-unknown, item-not-allowed (warning), item-off-grid (warning)', () => {
  let p = setItems(base(), [{ kind: 'teleporter', y: 0 }]);
  assert.deepEqual(find(p, 'item-unknown').ref, { type: 'item', pieceId: 'w', bay: 0, index: 0 });
  p = setItems(base(), [{ kind: 'pan-drawer', y: 0, count: 1, front: 26 }]);
  const na = find(p, 'item-not-allowed');
  assert.equal(na.blocking, false);
  assert.equal(validateProject(p).ok, true, 'a warning does not block');
  p = setItems(base(), [{ kind: 'shelf', y: 100 }]);
  const og = find(p, 'item-off-grid');
  assert.equal(og.blocking, false);
  assert.equal(validateProject(p).warnings.length, 1);
});

test('item-outside-bay: below the floor, above the top, a divider outside the bay', () => {
  const inner = M.pieceGeometry(base().pieces[0]).innerH;
  assert.ok(find(setItems(base(), [{ kind: 'shelf', y: -3.2 }]), 'item-outside-bay'));
  assert.ok(find(setItems(base(), [{ kind: 'shelf', y: inner }]), 'item-outside-bay'));
  assert.ok(find(setItems(base(), [{ kind: 'drawers', y: 188.8, count: 3, front: 19.2 }]), 'item-outside-bay'));
  assert.ok(find(setItems(base(), [{ kind: 'rail', length: 'short', y: -3.2 }]), 'item-outside-bay'), 'rail below the floor');
  assert.ok(find(setItems(base(), [{ kind: 'shelf', y: Number.NaN }]), 'item-outside-bay'));
  assert.ok(find(setItems(base(), [{ kind: 'divider', y: 0, height: 60, position: 500 }]), 'item-outside-bay'));
  assert.equal(find(setItems(base(), [{ kind: 'shelf', y: 99.2 }]), 'item-outside-bay'), undefined);
});

// One test per clearance rule of the ITEMS table.
test('item-clearance: hanging space below rails', () => {
  const inner = M.pieceGeometry(base().pieces[0]).innerH;
  // each rail kind is fine when it sits near the top of the bay
  for (const it of [{ kind: 'rail', length: 'long' }, { kind: 'rail', length: 'short' }, { kind: 'pull-down-rail' }]) {
    const ok = setItems(base(), [{ ...it, y: M.snapDown(inner - 12) }]);
    assert.deepEqual(validateProject(ok).errors.filter((e) => e.blocking), [], `${it.kind} ${it.length || ''} high enough`);
  }
  const e = find(setItems(base(), [{ kind: 'rail', length: 'long', y: 100.8 }]), 'item-clearance');
  assert.match(e.message, /150 cm/);
  assert.equal(find(setItems(base(), [{ kind: 'rail', length: 'long', y: 153.6 }]), 'item-clearance'), undefined);
  assert.ok(find(setItems(base(), [{ kind: 'rail', length: 'long', y: 147.2 }]), 'item-clearance'));
  assert.ok(find(setItems(base(), [{ kind: 'rail', length: 'short', y: 89.6 }]), 'item-clearance'));
  assert.equal(find(setItems(base(), [{ kind: 'rail', length: 'short', y: 96 }]), 'item-clearance'), undefined);
  assert.ok(find(setItems(base(), [{ kind: 'pull-down-rail', y: 96 }]), 'item-clearance'));
  assert.equal(find(setItems(base(), [{ kind: 'pull-down-rail', y: 102.4 }]), 'item-clearance'), undefined);
  // double hanging is two short rails: they need 99 cm between them, and the lower one 95 cm of its own
  const two = (y) => setItems(base(), [{ kind: 'rail', length: 'short', y }, { kind: 'rail', length: 'short', y: y - 99.2 }]);
  assert.ok(find(two(185.6), 'item-clearance'));
  assert.equal(find(two(198.4), 'item-clearance'), undefined);
});

test('item-clearance: two items may not claim the same space', () => {
  const at = (kind, y, o = {}) => ({ kind, y, ...o });
  // shelf to shelf needs 18 cm
  assert.ok(find(setItems(base(), [at('shelf', 96), at('shelf', 105.6)]), 'item-clearance'));
  assert.equal(find(setItems(base(), [at('shelf', 96), at('shelf', 115.2)]), 'item-clearance'), undefined);
  // a shelf inside the hanging space of a rail
  assert.ok(find(setItems(base(), [at('rail', 192), at('shelf', 96)]), 'item-clearance'));
  // a shelf above the rail is fine
  assert.equal(find(setItems(base(), [at('rail', 192), at('shelf', 198.4)]), 'item-clearance'), undefined);
  // drawers under a rail
  assert.ok(find(setItems(base(), [at('rail', 192), at('drawers', 0, { count: 3, front: 19.2 })]), 'item-clearance'));
  assert.equal(find(setItems(base(), [at('rail', 211.2), at('drawers', 0, { count: 3, front: 19.2 })]), 'item-clearance'), undefined);
  // every kind with a zone collides with a copy of itself at the same height and not when stacked
  for (const kind of M.TYPES.wardrobe.palette) {
    const it = M.normalizeItem({ kind, y: 90 }, { bayWidth: 80, innerH: 226 });
    const zone = M.itemZone(it);
    if (!zone) continue;
    const twice = setItems(base(), [it, { ...it }]);
    const errs = validateProject(twice).errors.filter((e) => e.code === 'item-clearance' && /too close/.test(e.message));
    assert.equal(errs.length, 1, `${kind} overlaps itself`);
    assert.equal(errs[0].blocking, true);
  }
  // LED strips and inside-door mirrors claim no space
  assert.equal(find(setItems(base(), [at('led', 100), at('led', 100), at('mirror', 0, { mode: 'fixed' }), at('shelf', 100)]), 'item-clearance'), undefined);
});

test('item-clearance: minimum bay size and runner depth', () => {
  // larder: bay at least 30 wide
  let p = M.setBays(base(), 'w', 9); // 200 wide / 9 = ~20 each
  p = setItems(p, [{ kind: 'larder', y: 0, baskets: 4 }]);
  assert.match(find(p, 'item-clearance').message, /30 cm wide/);
  assert.equal(find(setItems(base(), [{ kind: 'larder', y: 0, baskets: 4 }]), 'item-clearance'), undefined);
  // trouser rack, hamper
  assert.ok(find(setItems(M.setBays(base(), 'w', 9), [{ kind: 'trouser-rack', y: 0 }]), 'item-clearance'));
  assert.ok(find(setItems(M.setBays(base(), 'w', 9), [{ kind: 'hamper', y: 0 }]), 'item-clearance'));
  // pull-down rail needs a 210 cm bay
  let q = M.updatePiece(base(), 'w', { height: 200 });
  q = setItems(q, [{ kind: 'pull-down-rail', y: M.snapDown(M.pieceGeometry(q.pieces[0]).innerH - 12) }]);
  assert.match(find(q, 'item-clearance').message, /210 cm high/);
  // runners need depth: a shallow wall unit cannot take drawers
  let u = M.addPiece(M.setTemplate(base(), 'rect', {}), 'wall-unit', 'open-ash', { id: 'u', depth: 30 });
  u.pieces.find((x) => x.id === 'u').bays[0].items = [{ kind: 'drawers', y: 0, count: 2, front: 19.2 }];
  assert.match(find(u, 'item-clearance').message, /35 cm deep/);
  u = M.updatePiece(u, 'u', { depth: 40 });
  assert.equal(find(u, 'item-clearance'), undefined);
});

test('item-needs-door', () => {
  const inner = { kind: 'inner-drawers', y: 0, count: 2, front: 19.2 };
  const p = setItems(base(), [inner]);
  assert.equal(find(p, 'item-needs-door'), undefined, 'hinged bay has a door');
  const noDoor = clone(p);
  noDoor.pieces[0].bays[0].door = 'none';
  const e = find(noDoor, 'item-needs-door');
  assert.deepEqual(e.ref, { type: 'item', pieceId: 'w', bay: 0, index: 0 });
  assert.equal(e.blocking, true);
  const open = M.updatePiece(p, 'w', { fronts: { kind: 'open' } });
  assert.ok(find(open, 'item-needs-door'));
  const sliding = M.updatePiece(p, 'w', { fronts: { kind: 'sliding' } });
  assert.equal(find(sliding, 'item-needs-door'), undefined, 'sliding doors cover every bay');
  const mirror = setItems(noDoor, [{ kind: 'mirror', y: 0, mode: 'fixed' }]);
  assert.ok(find(mirror, 'item-needs-door'));
  assert.equal(find(setItems(noDoor, [{ kind: 'mirror', y: 0, mode: 'pull-out' }]), 'item-needs-door'), undefined);
});

// ---------- placements ----------
test('piece-unplaced is a warning', () => {
  const p = M.addPiece(base(), 'desk', 'walnut-grooved', { id: 'd' });
  const e = find(p, 'piece-unplaced');
  assert.equal(e.blocking, false);
  assert.deepEqual(e.ref, { type: 'piece', id: 'd' });
  assert.equal(validateProject(p).ok, true);
});

test('placement-unknown-piece, placement-wall-missing, placement-off-wall, wall-too-short', () => {
  let p = base();
  p.placements.push({ pieceId: 'ghost', mode: 'wall', wallId: 'w1', offset: 0, elevation: 0 });
  assert.ok(find(p, 'placement-unknown-piece'));
  p = base();
  p.placements[0].wallId = 'w77';
  assert.ok(find(p, 'placement-wall-missing'));
  p = base();
  p.placements[0].offset = 300; // 200 wide on a 420 wall
  assert.deepEqual(find(p, 'placement-off-wall').ref, { type: 'placement', pieceId: 'w' });
  p = base();
  p = M.setTemplate(p, 'rect', { width: 250, depth: 380 });
  p = M.updatePiece(p, 'w', { width: 300 });
  p.placements[0].offset = 0;
  assert.ok(find(p, 'wall-too-short'));
  assert.equal(find(p, 'placement-off-wall'), undefined);
  p = base();
  p.placements[0] = { pieceId: 'w', mode: 'free', x: 'x', z: 3 };
  assert.ok(find(p, 'placement-wall-missing'));
});

test('placement-outside-room: a piece cannot poke through a wall or sit over a chimney breast', () => {
  let p = base();
  p.placements[0] = { pieceId: 'w', mode: 'free', x: 10, z: 100, rotation: 0, elevation: 0 };
  assert.ok(find(p, 'placement-outside-room'));
  p = base();
  p.placements[0] = { pieceId: 'w', mode: 'free', x: 210, z: 190, rotation: 0, elevation: 0 };
  assert.equal(find(p, 'placement-outside-room'), undefined);
  // across the chimney breast in an alcove room
  let a = M.setTemplate(base(), 'alcoves', {});
  a = M.placePiece(a, 'w', { mode: 'free', x: 220, z: 40, rotation: 0 });
  assert.ok(find(a, 'placement-outside-room'));
  assert.ok(find(M.placePiece(a, 'w', { mode: 'free', x: 100, z: 40, rotation: 0 }), 'placement-outside-room'), '200 wide runs into the breast at x=170');
  a = M.updatePiece(a, 'w', { width: 150 });
  a = M.placePiece(a, 'w', { mode: 'free', x: 75, z: 30, rotation: 0 });
  assert.equal(find(a, 'placement-outside-room'), undefined, 'a 150 piece fits the left alcove');
});

test('placement-overlap: overlapping pieces block, neighbours and stacked pieces do not', () => {
  let p = M.addPiece(base(), 'wardrobe', 'flat-oak', { id: 'v', width: 100 });
  p = M.placePiece(p, 'v', { mode: 'wall', wallId: 'w1', offset: 150 });
  p.placements.find((x) => x.pieceId === 'v').offset = 150;
  const e = find(p, 'placement-overlap');
  assert.ok(e && e.blocking);
  p.placements.find((x) => x.pieceId === 'v').offset = 200;
  assert.equal(find(p, 'placement-overlap'), undefined, 'touching is fine');
  // corner clash: a piece on the left wall running into the one on the top wall
  const q = M.placePiece(p, 'v', { mode: 'wall', wallId: 'w4', offset: 100 });
  assert.equal(find(q, 'placement-overlap'), undefined, 'w4 starts at the bottom-left corner, runs up the left wall: the piece is at z 280..380');
  const r = M.placePiece(p, 'v', { mode: 'wall', wallId: 'w4', offset: 330 });
  assert.equal(find(r, 'placement-overlap') !== undefined, true);
  // a wall cabinet above a base cabinet is not an overlap
  let k = M.removePiece(base(), 'w');
  k = M.addPiece(k, 'kitchen-base', 'sage-kitchen', { id: 'b' });
  k = M.addPiece(k, 'kitchen-wall', 'sage-kitchen', { id: 'u' });
  k = M.placePiece(k, 'b', { mode: 'wall', wallId: 'w1', offset: 50 });
  k = M.placePiece(k, 'u', { mode: 'wall', wallId: 'w1', offset: 50, elevation: 140 });
  assert.equal(find(k, 'placement-overlap'), undefined);
  k = M.placePiece(k, 'u', { mode: 'wall', wallId: 'w1', offset: 50, elevation: 100 });
  assert.equal(find(k, 'placement-overlap'), undefined, 'a 90 cm base cabinet ends below a cabinet at 100 cm');
  k = M.addPiece(k, 'tall-cabinet', 'white-minimal', { id: 'tc' });
  k = M.placePiece(k, 'tc', { mode: 'wall', wallId: 'w1', offset: 60 });
  assert.ok(find(k, 'placement-overlap'), 'a tall cabinet runs into the wall cabinet');
  // rotated free piece versus a wall piece
  let t = M.addPiece(base(), 'table', 'flat-oak', { id: 't' });
  t = M.placePiece(t, 't', { mode: 'free', x: 100, z: 60, rotation: 45 });
  assert.ok(find(t, 'placement-overlap'));
});

test('placement-covers-opening: doors and windows block, radiators need a cut-out, sockets only warn', () => {
  const withOpening = (o) => { const p = base(); p.room.openings = [{ id: 'o1', wallId: 'w1', ...o }]; return p; };
  const door = withOpening({ type: 'door', offset: 50, bottom: 0, width: 90, height: 210, swing: 'out-left' });
  const e = find(door, 'placement-covers-opening');
  assert.ok(e && e.blocking && e.ref.type === 'placement');
  const farDoor = withOpening({ type: 'door', offset: 300, bottom: 0, width: 90, height: 210, swing: 'out-left' });
  assert.equal(find(farDoor, 'placement-covers-opening'), undefined);
  const win = withOpening({ type: 'window', offset: 50, bottom: 90, width: 100, height: 100 });
  assert.ok(find(win, 'placement-covers-opening'), 'a 240 cm wardrobe covers a window');
  const lowWin = withOpening({ type: 'window', offset: 50, bottom: 245, width: 100, height: 30 });
  assert.equal(find(lowWin, 'placement-covers-opening'), undefined, 'above the wardrobe');
  const rad = withOpening({ type: 'radiator', offset: 50, bottom: 15, width: 80, height: 60, depth: 10 });
  assert.ok(find(rad, 'placement-covers-opening').blocking);
  const cut = clone(rad);
  cut.pieces[0].radiatorCutout = true;
  assert.equal(find(cut, 'placement-covers-opening'), undefined);
  const sock = withOpening({ type: 'socket', offset: 50, bottom: 30, width: 8, height: 8 });
  const se = find(sock, 'placement-covers-opening');
  assert.equal(se.blocking, false);
  assert.equal(validateProject(sock).ok, true);
  // a desk under a window is fine
  let d = M.addPiece(base(), 'desk', 'walnut-grooved', { id: 'd', width: 140 });
  d = M.placePiece(d, 'd', { mode: 'wall', wallId: 'w3', offset: 100 });
  d.room.openings = [{ id: 'o1', wallId: 'w3', type: 'window', offset: 100, bottom: 90, width: 100, height: 100 }];
  assert.equal(find(d, 'placement-covers-opening'), undefined);
});

test('placement-door-swing: nothing may stand where a door opens', () => {
  const p = base();
  p.room.openings = [{ id: 'd1', wallId: 'w3', type: 'door', offset: 100, bottom: 0, width: 90, height: 210, swing: 'in-left' }];
  let q = M.addPiece(p, 'table', 'flat-oak', { id: 't' });
  // w3 runs right to left along the bottom wall; offset 100 = 100 cm from the bottom-right corner
  q = M.placePiece(q, 't', { mode: 'free', x: 320 - 30, z: 380 - 50, rotation: 0 });
  assert.ok(find(q, 'placement-door-swing'), 'table in the swing');
  q = M.placePiece(q, 't', { mode: 'free', x: 100, z: 200, rotation: 0 });
  assert.equal(find(q, 'placement-door-swing'), undefined);
  // out-swinging doors have no swing in the room
  const out = clone(p);
  out.room.openings[0].swing = 'out-left';
  let o = M.addPiece(out, 'table', 'flat-oak', { id: 't' });
  o = M.placePiece(o, 't', { mode: 'free', x: 290, z: 330, rotation: 0 });
  assert.equal(find(o, 'placement-door-swing'), undefined);
  // a wall cabinet at 180 cm is still below the 210 cm door head, so it is in the way too
  let h = M.addPiece(p, 'kitchen-wall', 'sage-kitchen', { id: 'k', width: 60 });
  h = M.placePiece(h, 'k', { mode: 'free', x: 290, z: 340, rotation: 0, elevation: 180 });
  assert.ok(find(h, 'placement-door-swing'));
});

test('placement-under-slope and placement-too-tall', () => {
  let p = M.setTemplate(base(), 'attic', { slopeWall: 1, slopeAngle: 45, kneeHeight: 100 });
  p = M.updatePiece(p, 'w', { height: 240, width: 200 });
  p = M.placePiece(p, 'w', { mode: 'wall', wallId: 'w1', offset: 0 });
  const e = find(p, 'placement-under-slope');
  assert.ok(e && e.blocking);
  assert.equal(find(p, 'placement-too-tall'), undefined);
  // against the high wall it fits
  const q = M.placePiece(p, 'w', { mode: 'wall', wallId: 'w3', offset: 0 });
  assert.equal(find(q, 'placement-under-slope'), undefined);
  // a low piece fits under the slope
  const low = M.addPiece(p, 'window-seat', 'flat-oak', { id: 's', width: 150, height: 45 });
  const lp = M.placePiece(low, 's', { mode: 'wall', wallId: 'w1', offset: 220 });
  assert.equal(validateProject(lp).errors.some((x) => x.code === 'placement-under-slope' && x.ref.pieceId === 's'), false);
  // flat ceiling
  let t = base();
  t = M.updateRoom(t, { height: 220 });
  t = M.updatePiece(t, 'w', { height: 240 });
  assert.ok(find(t, 'placement-too-tall'));
  assert.equal(find(t, 'placement-under-slope'), undefined);
  t = M.updateRoom(t, { height: 260 });
  assert.equal(find(t, 'placement-too-tall'), undefined);
});

test('walkway: a free-standing piece needs 60 cm to walk past, and it is only a warning', () => {
  let p = M.addPiece(base(), 'table', 'flat-oak', { id: 't' });
  p = M.placePiece(p, 't', { mode: 'free', x: 210, z: 250, rotation: 0 });
  assert.equal(find(p, 'walkway'), undefined, 'open floor all round');
  const near = M.placePiece(p, 't', { mode: 'free', x: 210, z: 316, rotation: 0 }); // 380 - (316 + 45) = 19 cm from the wall
  const e = find(near, 'walkway');
  assert.ok(e);
  assert.equal(e.blocking, false);
  assert.equal(validateProject(near).ok, true);
  assert.deepEqual(e.ref, { type: 'placement', pieceId: 't' });
  const touching = M.placePiece(p, 't', { mode: 'free', x: 210, z: 335, rotation: 0 }); // tucked against the bottom wall
  assert.equal(find(touching, 'walkway'), undefined, 'touching is not a gap');
  // 40 cm from the wardrobe
  let c = M.placePiece(p, 't', { mode: 'free', x: 210, z: 60 + 40 + 45, rotation: 0 });
  assert.ok(find(c, 'walkway'));
  c = M.placePiece(p, 't', { mode: 'free', x: 210, z: 60 + 80 + 45, rotation: 0 });
  assert.equal(find(c, 'walkway'), undefined);
  // wall-mode pieces are not checked
  assert.equal(find(base(), 'walkway'), undefined);
});

test('validateProject never throws, whatever it is given', () => {
  const junk = [undefined, null, 0, 'x', [], {}, { room: null }, { room: {} }, { room: { walls: 'x' } }, { room: { walls: [{}, {}, {}] }, pieces: [null] },
    { room: { walls: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] }, pieces: [{ type: 'wardrobe', bays: [null, { items: [null, 5, { kind: 'shelf' }] }] }], placements: [null, 5, { pieceId: 'x' }] },
    { room: M.createProject().room, pieces: 'nope', placements: 7 }];
  for (const j of junk) {
    const r = validateProject(j);
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.errors));
  }
  // random corruption of a good project
  const good = M.createProject();
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 0; n < 200; n++) {
    const p = clone(good);
    const flat = [];
    (function walk(o) { for (const k of Object.keys(o)) { if (o[k] && typeof o[k] === 'object') walk(o[k]); else flat.push([o, k]); } })(p);
    for (let i = 0; i < 3; i++) {
      const [o, k] = flat[Math.floor(rnd() * flat.length)];
      const vals = [null, undefined, -1, 1e9, 'x', NaN, true, {}, []];
      o[k] = vals[Math.floor(rnd() * vals.length)];
    }
    assert.doesNotThrow(() => validateProject(p));
  }
});

test('every documented code is produced by some test project', () => {
  const documented = ['room-too-few-walls', 'room-wall-degenerate', 'room-not-clockwise', 'room-self-intersects', 'opening-off-wall', 'opening-overlap', 'opening-too-tall',
    'piece-type-unknown', 'piece-size', 'bays-count', 'bays-width', 'item-unknown', 'item-outside-bay', 'item-clearance', 'item-needs-door', 'item-not-allowed', 'item-off-grid',
    'placement-unknown-piece', 'placement-wall-missing', 'placement-off-wall', 'wall-too-short', 'placement-outside-room', 'placement-overlap', 'placement-covers-opening',
    'placement-door-swing', 'placement-under-slope', 'placement-too-tall', 'walkway', 'piece-unplaced'];
  assert.equal(new Set(documented).size, documented.length);
  const missing = documented.filter((c) => !seen.has(c));
  assert.deepEqual(missing, [], 'codes no test ever triggered');
});
