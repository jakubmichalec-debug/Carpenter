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

// A project with one 200 cm wardrobe and nothing else.
function base() {
  return M.addPiece({ v: 2, pieces: [] }, 'wardrobe', 'flat-oak', { id: 'w', width: 200 });
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
  p.pieces[0].width = 1000;
  const r = validateProject(p);
  assert.equal(r.ok, false);
  const e = r.errors[0];
  assert.equal(e.code, 'piece-size');
  assert.equal(typeof e.message, 'string');
  assert.deepEqual(e.ref, { type: 'piece', id: 'w' });
  assert.equal(e.blocking, true);
  assert.deepEqual(r.blocking, r.errors);
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
  let u = M.addPiece(base(), 'wall-unit', 'open-ash', { id: 'u', depth: 30 });
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

// ---------- space ----------
test('space-too-wide and space-too-tall are advice about one piece, and say how much it is over', () => {
  let p = M.updatePiece(base(), 'w', { space: { width: 180, height: 230 } });
  const wide = find(p, 'space-too-wide'), tall = find(p, 'space-too-tall');
  assert.equal(wide.blocking, false);
  assert.equal(tall.blocking, false);
  assert.deepEqual(wide.ref, { type: 'piece', id: 'w' });
  assert.match(wide.message, /20 cm more than the 180 cm you have/);
  assert.match(tall.message, /10 cm more than the 230 cm you have/);
  assert.equal(validateProject(p).ok, true, 'advice never blocks');
  assert.equal(validateProject(p).warnings.length, 2);
  p = M.updatePiece(base(), 'w', { space: { width: 200, height: 240 } });
  assert.deepEqual(validateProject(p).errors, [], 'exactly the size of the space fits');
  p = M.updatePiece(base(), 'w', { space: { width: 150, height: null } });
  assert.deepEqual(codes(p), ['space-too-wide']);
  assert.deepEqual(codes(base()), [], 'no space, no advice');
});

test('a project that carries no room and no placements raises none of the old room, opening or placement errors', () => {
  const p = M.createProject();
  assert.deepEqual(validateProject(p).errors, []);
  const old = clone(p);
  old.room = { walls: [], openings: [{ id: 'o1', wallId: 'w9', type: 'window' }], height: 100 };
  old.placements = [{ pieceId: 'ghost', mode: 'wall', wallId: 'w9', offset: -50 }, { pieceId: 'p1', mode: 'free', x: 9999, z: 9999 }];
  assert.deepEqual(validateProject(old).errors, [], 'whatever an old save carries, only the pieces are checked');
  assert.deepEqual(validateProject(M.clampProject(old)).errors, []);
});

test('validateProject never throws, whatever it is given', () => {
  const junk = [undefined, null, 0, 'x', [], {}, { room: null }, { pieces: null }, { pieces: [null] },
    { pieces: [{ type: 'wardrobe', bays: [null, { items: [null, 5, { kind: 'shelf' }] }] }] },
    { pieces: [{ type: 'wardrobe', space: 'x', bays: [] }] }, { pieces: 'nope', placements: 7 }];
  for (const j of junk) {
    const r = validateProject(j);
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.errors));
  }
  // random corruption of a good project
  const good = M.updatePiece(M.createProject(), 'p1', { space: { width: 150, height: 200 } });
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
  const documented = ['piece-type-unknown', 'piece-size', 'bays-count', 'bays-width', 'item-unknown', 'item-outside-bay', 'item-clearance', 'item-needs-door',
    'item-not-allowed', 'item-off-grid', 'space-too-wide', 'space-too-tall', 'project-invalid'];
  assert.equal(new Set(documented).size, documented.length);
  const missing = documented.filter((c) => !seen.has(c));
  assert.deepEqual(missing, [], 'codes no test ever triggered');
  const extra = [...seen].filter((c) => !documented.includes(c) && c !== 'item-size');
  assert.deepEqual(extra, [], 'codes that are not documented');
});
