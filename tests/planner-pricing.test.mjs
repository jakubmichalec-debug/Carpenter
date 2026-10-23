import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { quoteProject, cutListFor, PRICES_V2 } from '../site/js/planner/pricing.js';
import { PRICES } from '../site/js/configurator/pricing.js';
import { createDesign, addModule } from '../site/js/configurator/model.js';

const cents = (x) => Math.round(x * 100);

function rectRoom() {
  const p = M.createProject();
  const room = M.setTemplate(p, 'rect', { width: 600, depth: 420 }).room;
  return { ...M.setTemplate(p, 'rect', { width: 600, depth: 420 }), room: { ...room, openings: [] }, pieces: [], placements: [] };
}
function wardrobe240(extra = {}) {
  let p = rectRoom();
  p = M.addPiece(p, 'wardrobe', 'flat-oak', { id: 'w', ...extra });
  return M.placePiece(p, 'w', { mode: 'wall', wallId: 'w1', offset: 0 });
}
function kitchenRun() {
  let p = rectRoom();
  for (let i = 0; i < 5; i++) {
    p = M.addPiece(p, 'kitchen-base', 'sage-kitchen', { id: `b${i}` });
    p = M.placePiece(p, `b${i}`, { mode: 'wall', wallId: 'w1', offset: i * 60 });
    p = M.addPiece(p, 'kitchen-wall', 'sage-kitchen', { id: `u${i}` });
    p = M.placePiece(p, `u${i}`, { mode: 'wall', wallId: 'w1', offset: i * 60 });
  }
  return p;
}
const everything = () => {
  let p = M.createProject();
  for (const t of Object.keys(M.TYPES)) {
    p = M.addPiece(p, t, undefined, { id: `x-${t}` });
    p = M.placePiece(p, `x-${t}`, M.TYPES[t].freestanding ? { mode: 'free', x: 300, z: 200, rotation: 0 } : { mode: 'wall', wallId: 'w7', offset: 0 });
  }
  p = M.addPiece(p, 'wardrobe', 'charcoal-sliding', { id: 'sl' });
  p = M.addPiece(p, 'tall-cabinet', 'glass-oak', { id: 'gl' });
  p = M.addPiece(p, 'wardrobe', 'flat-oak', { id: 'fe', bays: 4 });
  for (const kind of M.TYPES.wardrobe.palette) p = M.addItem(p, 'fe', 0, { kind, y: 100 });
  return p;
};

function checkInvariants(p, opts) {
  const q = quoteProject(p, opts);
  // every line: integer cents, amount = cents / 100, a ref and a path
  for (const piece of q.pieces) {
    let sum = 0;
    for (const l of piece.lines) {
      assert.ok(Number.isInteger(l.cents) && l.cents > 0, `${l.path}`);
      assert.equal(l.amount, l.cents / 100);
      assert.equal(l.ref.pieceId, piece.id);
      assert.ok(['Materials', 'Hardware', 'Workshop labour', 'Fitting'].includes(l.group));
      assert.equal(typeof l.label, 'string');
      assert.ok(l.path.startsWith(piece.label), l.path);
      sum += l.cents;
    }
    assert.equal(piece.cents, sum, `${piece.label}: lines add up`);
    assert.equal(cents(piece.total), sum);
    assert.equal(piece.items.reduce((s, i) => s + i.cents, 0), piece.lines.filter((l) => l.ref.item !== undefined).reduce((s, l) => s + l.cents, 0));
  }
  const fee = q.pieces.length ? cents(PRICES.designFee) : 0;
  assert.deepEqual(q.lines.map((l) => l.label), ['Materials', 'Hardware', 'Workshop labour', 'Fitting', 'Design fee']);
  assert.equal(q.lines.reduce((s, l) => s + l.cents, 0), q.cents.subtotal, 'aggregated lines = subtotal');
  assert.equal(q.pieces.reduce((s, x) => s + x.cents, 0) + fee, q.cents.subtotal, 'piece totals + design fee = subtotal');
  assert.equal(q.cents.subtotal + q.cents.vat, q.cents.total, 'subtotal + vat = total');
  assert.equal(q.subtotal, q.cents.subtotal / 100);
  assert.equal(q.vat, q.cents.vat / 100);
  assert.equal(q.total, q.cents.total / 100);
  assert.equal(cents(q.subtotal) + cents(q.vat), cents(q.total));
  if (opts && opts.vat === false) assert.equal(q.vat, 0);
  else assert.equal(q.cents.vat, Math.round(q.cents.subtotal * PRICES.vat));
  return q;
}

test('quote invariants hold on every kind of project, with and without VAT', () => {
  for (const [name, p] of [['default', M.createProject()], ['wardrobe', wardrobe240()], ['kitchen', kitchenRun()], ['everything', everything()], ['empty', rectRoom()]]) {
    for (const vat of [true, false]) {
      const q = checkInvariants(p, { vat });
      assert.ok(q.leadTimeWeeks >= 4, name);
    }
    checkInvariants(p);
  }
  const empty = quoteProject(rectRoom());
  assert.deepEqual([empty.subtotal, empty.vat, empty.total, empty.pieces.length, empty.cutList.length], [0, 0, 0, 0, 0]);
});

test('a 240 cm oak wardrobe with three fitted bays costs roughly EUR 4,500 to 8,000 incl. VAT', () => {
  const p = wardrobe240();
  const w = p.pieces[0];
  assert.deepEqual([w.width, w.bays.length, w.fronts.material], [240, 3, 'oak']);
  assert.ok(w.bays.every((b) => b.items.length >= 2), 'every bay is fitted');
  const q = checkInvariants(p);
  assert.ok(q.total >= 4500 && q.total <= 8000, `total ${q.total}`);
  assert.ok(q.cents.vat > 0);
  // the pieces are in plausible proportion
  const g = Object.fromEntries(q.lines.map((l) => [l.label, l.amount]));
  assert.ok(g.Materials > 1500 && g.Materials < 4000, `materials ${g.Materials}`);
  assert.ok(g['Workshop labour'] > 800 && g['Workshop labour'] < 2500, `labour ${g['Workshop labour']}`);
  assert.ok(g.Hardware > 300 && g.Hardware < 1500, `hardware ${g.Hardware}`);
  assert.equal(g.Fitting, 192);
  assert.equal(g['Design fee'], 250);
  assert.equal(q.leadTimeWeeks, 4 + Math.ceil(q.pieces[0].lines.filter((l) => l.group === 'Workshop labour').reduce((s, l) => s + l.qty, 0) / 40));
  // a smaller, plain version costs less
  const plain = quoteProject(wardrobe240({ width: 120, bays: 1 }));
  assert.ok(plain.total < q.total);
  // oak fronts cost more than lacquer
  const lacquer = quoteProject(wardrobe240({ fronts: { material: 'lacquer-white' } }));
  assert.ok(lacquer.total < q.total);
  const walnut = quoteProject(wardrobe240({ fronts: { material: 'walnut' } }));
  assert.ok(walnut.total > q.total);
});

test('a 3 m kitchen run (five base and five wall cabinets) is priced sensibly', () => {
  const q = checkInvariants(kitchenRun());
  assert.equal(q.pieces.length, 10);
  assert.ok(q.total > 5000 && q.total < 16000, `kitchen ${q.total}`);
  assert.deepEqual(q.pieces.slice(0, 2).map((x) => x.label), ['Base cabinet 1', 'Wall cabinet 1']);
  assert.ok(q.pieces.every((x) => x.lines.some((l) => l.group === 'Fitting')));
  assert.ok(q.boardM2ByMaterial.oak > 0, 'oak worktop');
  assert.ok(q.boardM2ByMaterial['sage'] > 0);
});

test('every line points at a piece, bay or item: "Wardrobe 1 > Bay 2 > 3 drawers"', () => {
  const q = quoteProject(wardrobe240());
  const piece = q.pieces[0];
  assert.equal(piece.label, 'Wardrobe 1');
  const drawers = piece.items.find((i) => i.label === '3 drawers');
  assert.ok(drawers);
  assert.equal(drawers.path, 'Wardrobe 1 > Bay 2 > 3 drawers');
  assert.deepEqual(drawers.ref, { pieceId: 'w', bay: 1, item: 0 });
  assert.equal(drawers.cents, piece.lines.filter((l) => l.ref.bay === 1 && l.ref.item === 0).reduce((s, l) => s + l.cents, 0));
  // 3 drawers: three runners (EUR 46 each), three handles, boards and labour
  const hw = piece.lines.find((l) => l.ref.bay === 1 && l.ref.item === 0 && l.group === 'Hardware');
  assert.equal(hw.cents, 3 * cents(PRICES.drawerRunner) + 3 * cents(PRICES.handle.bar));
  assert.ok(drawers.amount > 138);
  const doors = piece.lines.filter((l) => l.ref.part === 'doors' && l.ref.bay === 0);
  assert.ok(doors.length >= 3, 'doors: boards, hinges, handles and labour');
  assert.ok(piece.lines.some((l) => l.ref.part === 'carcass'));
  assert.ok(piece.lines.some((l) => l.group === 'Fitting' && l.ref.part === 'fitting'));
});

test('hinges follow the door height: 2 up to 100 cm, 3 up to 200 cm, 4 above', () => {
  const hinges = (type, height) => {
    let p = rectRoom();
    p = M.addPiece(p, type, undefined, { id: 'h', height, width: 60, bays: 1 });
    p.pieces[0].bays = [{ width: p.pieces[0].bays[0].width, door: 'left', items: [] }];
    const q = quoteProject(p);
    return q.pieces[0].lines.find((l) => l.label === 'Hinges').qty;
  };
  assert.equal(hinges('kitchen-wall', 60), 2);
  assert.equal(hinges('kitchen-wall', 100), 2);
  assert.equal(hinges('tall-cabinet', 180), 3);
  assert.equal(hinges('tall-cabinet', 210), 3, 'the door is 199.6 cm');
  assert.equal(hinges('tall-cabinet', 220), 4);
  assert.equal(hinges('tall-cabinet', 300), 4);
  // double doors double it
  let p = rectRoom();
  p = M.addPiece(p, 'tall-cabinet', undefined, { id: 'h', height: 180, width: 60 });
  p.pieces[0].bays[0].door = 'double';
  assert.equal(quoteProject(p).pieces[0].lines.find((l) => l.label === 'Hinges').qty, 6);
  // hinge price comes from the configurator table (hingePair / 2)
  assert.equal(PRICES_V2.hinge * 2, PRICES.hingePair);
});

test('fitting is charged per placed piece, with extras for slope and radiator cut-outs', () => {
  let p = wardrobe240();
  const placed = quoteProject(p);
  const fit = (q) => q.pieces[0].lines.filter((l) => l.group === 'Fitting');
  assert.equal(fit(placed).length, 1);
  assert.equal(fit(placed)[0].cents, cents(PRICES_V2.fitting.base + 2.4 * PRICES_V2.fitting.perMetre));
  const unplaced = quoteProject(M.unplace(p, 'w'));
  assert.equal(fit(unplaced).length, 0);
  assert.deepEqual(unplaced.unplaced, ['w']);
  assert.deepEqual(placed.unplaced, []);
  assert.equal(unplaced.lines.find((l) => l.label === 'Fitting').cents, 0);
  assert.ok(unplaced.total < placed.total);
  // scribing to a slope
  let a = M.setTemplate(p, 'attic', { slopeWall: 1, slopeAngle: 45, kneeHeight: 100, width: 600, depth: 420 });
  a = M.updatePiece(a, 'w', { height: 180 });
  a = M.placePiece(a, 'w', { mode: 'wall', wallId: 'w3', offset: 0 });
  assert.equal(fit(quoteProject(a)).length, 1, 'against the high wall: no scribing');
  a = M.placePiece(a, 'w', { mode: 'wall', wallId: 'w1', offset: 0 });
  a = M.updatePiece(a, 'w', { height: 110 });
  const s = fit(quoteProject(a));
  assert.ok(s.some((l) => l.label.startsWith('Scribing')) && s.find((l) => l.label.startsWith('Scribing')).cents === cents(PRICES_V2.fitting.slope));
  // radiator cut-out
  let r = wardrobe240({ radiatorCutout: true });
  r.room.openings = [{ id: 'o1', wallId: 'w1', type: 'radiator', offset: 50, bottom: 15, width: 80, height: 60, depth: 10 }];
  const rc = fit(quoteProject(r)).find((l) => l.label === 'Radiator cut-out');
  assert.equal(rc.cents, cents(PRICES_V2.fitting.radiator));
  r.pieces[0].radiatorCutout = false;
  assert.equal(fit(quoteProject(r)).find((l) => l.label === 'Radiator cut-out'), undefined);
});

test('the cut list: boards come from carcass, dividers, back, shelves, drawers, doors, plinth and worktop', () => {
  const w = wardrobe240().pieces[0];
  const parts = new Set(cutListFor(w).map((b) => b.part));
  for (const part of ['side', 'top', 'bottom', 'back', 'divider', 'plinth', 'shelf', 'drawer-front', 'drawer-side', 'drawer-back', 'drawer-bottom', 'door']) assert.ok(parts.has(part), part);
  const g = M.pieceGeometry(w);
  const div = cutListFor(w).find((b) => b.part === 'divider');
  assert.equal(div.qty, 2);
  assert.equal(div.h, g.innerH);
  const sides = cutListFor(w).find((b) => b.part === 'side' && b.ref.part === 'carcass');
  assert.deepEqual([sides.qty, sides.h, sides.material], [2, g.Hc, 'birch-ply']);
  // every shelf item has its own board
  const shelves = w.bays.flatMap((b) => b.items).filter((i) => i.kind === 'shelf').length;
  assert.equal(cutListFor(w).filter((b) => b.part === 'shelf').reduce((s, b) => s + b.qty, 0), shelves);
  // doors: one per bay for single, two for double
  const doors = cutListFor(w).filter((b) => b.part === 'door');
  assert.equal(doors.reduce((s, b) => s + b.qty, 0), w.bays.reduce((s, b) => s + (b.door === 'double' ? 2 : b.door === 'none' ? 0 : 1), 0));
  assert.ok(doors.every((b) => b.material === 'oak'));
  // kitchen worktop and island overhang
  const base = M.createPiece('kitchen-base', undefined, { id: 'k' });
  const wt = cutListFor(base).find((b) => b.part === 'worktop');
  assert.deepEqual([wt.w, wt.h, wt.material], [60, 62, 'oak']);
  const isl = cutListFor(M.createPiece('island', undefined, { id: 'i' })).find((b) => b.part === 'worktop');
  assert.deepEqual([isl.w, isl.h], [186, 120]);
  // tables, sliding, glass, desk
  assert.ok(cutListFor(M.createPiece('table', undefined, { id: 't' })).some((b) => b.part === 'leg' && b.qty === 4));
  const sl = cutListFor(M.createPiece('wardrobe', 'charcoal-sliding', { id: 's' })).filter((b) => b.part === 'door');
  assert.equal(sl.reduce((s, b) => s + b.qty, 0), 3);
  assert.ok(cutListFor(M.createPiece('tall-cabinet', 'glass-oak', { id: 'g' })).filter((b) => b.part === 'door').reduce((s, b) => s + b.qty, 0) >= 4, 'frame parts');
  assert.ok(cutListFor(M.createPiece('desk', undefined, { id: 'd' })).some((b) => b.part === 'top'));
  const bare = M.createPiece('desk', undefined, { id: 'd', bays: [{ width: 130, items: [] }] });
  assert.ok(cutListFor(bare).some((b) => b.part === 'leg'), 'an empty desk is a table on legs');
});

test('cut list and board areas agree', () => {
  const q = quoteProject(everything());
  const fromList = {};
  for (const b of q.cutList) fromList[b.material] = (fromList[b.material] || 0) + (b.w * b.h * b.qty) / 10000;
  assert.deepEqual(Object.keys(fromList).sort(), Object.keys(q.boardM2ByMaterial).sort());
  for (const [m, v] of Object.entries(q.boardM2ByMaterial)) assert.ok(Math.abs(v - fromList[m]) < 0.01, m);
  const sorted = [...q.cutList].sort((a, b) => a.material.localeCompare(b.material) || a.part.localeCompare(b.part) || a.w - b.w || a.h - b.h);
  assert.deepEqual(q.cutList, sorted);
  assert.ok(q.cutList.every((b) => b.w > 0 && b.h > 0 && b.t > 0 && b.qty > 0 && M.MATERIALS[b.material]));
  // two identical pieces merge into doubled quantities
  const one = quoteProject(wardrobe240());
  let two = wardrobe240();
  two = M.addPiece(two, 'wardrobe', 'flat-oak', { id: 'w2' });
  const qq = quoteProject(two);
  const sideOne = one.cutList.find((b) => b.part === 'side' && b.material === 'birch-ply');
  const sideTwo = qq.cutList.find((b) => b.part === sideOne.part && b.w === sideOne.w && b.h === sideOne.h && b.material === sideOne.material);
  assert.equal(sideTwo.qty, 2 * sideOne.qty);
});

test('items and options move the price in the right direction', () => {
  const base = quoteProject(wardrobe240()).cents.total;
  const withItem = (item, bay = 0) => quoteProject(M.addItem(wardrobe240(), 'w', bay, item)).cents.total;
  assert.ok(withItem({ kind: 'led', y: 220, sensor: true }) > base);
  assert.ok(withItem({ kind: 'led', y: 220, sensor: true }) > withItem({ kind: 'led', y: 220 }));
  assert.ok(withItem({ kind: 'ironing', y: 100 }) - base > cents(PRICES_V2.hardware.ironingFitting.price) * 1.2, 'fitting + labour + VAT');
  assert.ok(withItem({ kind: 'shelf', y: 100, material: 'glass' }) > withItem({ kind: 'shelf', y: 100 }) - 50 * 1.21 * 100 / 100, 'glass shelf is priced');
  assert.ok(withItem({ kind: 'drawers', y: 120, count: 4 }) - base > withItem({ kind: 'drawers', y: 120, count: 1 }) - base);
  const knobs = quoteProject(wardrobe240({ fronts: { handle: 'push' } })).cents.total;
  const groove = quoteProject(wardrobe240({ fronts: { handle: 'groove' } })).cents.total;
  assert.ok(knobs > groove, 'push handles cost more than a groove');
  const tall = quoteProject(wardrobe240({ height: 300 })).cents.total;
  assert.ok(tall > base);
  const sliding = quoteProject(wardrobe240({ fronts: { kind: 'sliding' } }));
  assert.ok(sliding.pieces[0].lines.some((l) => l.label === 'Sliding track'));
  const stone = quoteProject(M.updatePiece(kitchenRun(), 'b0', { worktop: 'terrazzo' })).cents.total;
  assert.ok(stone > quoteProject(kitchenRun()).cents.total);
  // no plinth, no plinth feet
  const noPlinth = quoteProject(wardrobe240({ plinth: 0 }));
  assert.equal(noPlinth.pieces[0].lines.some((l) => l.label === 'Plinth feet'), false);
});

test('PRICES_V2 reuses the configurator table where it can and covers every hardware key', () => {
  assert.equal(PRICES_V2.hardware.runner.price, PRICES.drawerRunner);
  assert.equal(PRICES_V2.hardware.ledM.price, PRICES.ledPerMetre);
  assert.equal(PRICES_V2.hardware.glassM2.price, PRICES.glassPerM2);
  assert.equal(PRICES_V2.fitting.base, PRICES.installPerModule);
  const dummy = { bayW: 80, depth: 60, innerH: 226, outerW: 82 };
  for (const [kind, d] of Object.entries(M.ITEMS)) {
    const it = M.normalizeItem({ kind, y: 0 }, { bayWidth: 80, innerH: 226 });
    for (const h of d.hardware(it, dummy)) assert.ok(PRICES_V2.hardware[h.key], `${kind}: ${h.key}`);
  }
  for (const t of Object.keys(M.TYPES)) assert.ok(PRICES_V2.labour.baseHours[t] > 0, t);
  for (const e of Object.values(PRICES_V2.hardware)) assert.ok(e.price > 0 && e.label && e.unit);
});

test('quotes of migrated v1 designs add up', () => {
  let d = createDesign();
  d = addModule(d, 'kitchen-base');
  d = addModule(d, 'island');
  const q = checkInvariants(M.migrate(d));
  assert.equal(q.pieces.length, 4);
  assert.ok(q.total > 0);
});

test('quote does not mutate the project and is deterministic', () => {
  const p = JSON.parse(JSON.stringify(M.createProject()));
  const s = JSON.stringify(p);
  const a = quoteProject(p);
  assert.equal(JSON.stringify(p), s);
  assert.deepEqual(quoteProject(p), a);
});
