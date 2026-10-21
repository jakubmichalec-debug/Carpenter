import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign, createModule, clampRoom } from '../site/js/configurator/model.js';
import { PRICES, panelsFor, quoteDesign } from '../site/js/configurator/pricing.js';

const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const design = (modules, room = {}) => ({ v: 1, room: clampRoom({ width: 420, openings: [], ...room }), modules });
const parts = (m) => panelsFor(m).map((p) => p.part);
const count = (m, part) => panelsFor(m).filter((p) => p.part === part).reduce((s, p) => s + p.qty, 0);

function wardrobe() { return design([createModule('wardrobe', { id: 'w', x: 0 })]); }
function kitchen() {
  const mods = [];
  for (let i = 0; i < 4; i++) mods.push(createModule('kitchen-base', { id: `b${i}`, x: i * 75, width: 75, worktop: 'terrazzo', front: 'lacquer-sage' }));
  for (let i = 0; i < 3; i++) mods.push(createModule('kitchen-wall', { id: `w${i}`, x: i * 100, width: 100, front: 'lacquer-sage' }));
  return design(mods, { width: 400 });
}

test('PRICES has the contract table', () => {
  assert.equal(PRICES.labourPerHour, 58);
  assert.equal(PRICES.installPerModule, 120);
  assert.equal(PRICES.hingePair, 18);
  assert.equal(PRICES.drawerRunner, 46);
  assert.equal(PRICES.slidingTrack, 140);
  assert.deepEqual(PRICES.handle, { bar: 14, knob: 9, push: 22, groove: 0 });
  assert.equal(PRICES.ledPerMetre, 38);
  assert.equal(PRICES.glassPerM2, 95);
  assert.equal(PRICES.rail, 24);
  assert.equal(PRICES.plinthPerMetre, 22);
  assert.equal(PRICES.designFee, 250);
  assert.equal(PRICES.vat, 0.21);
  assert.equal(PRICES.labourHours.wardrobe, 10);
});

test('panelsFor wardrobe: sides, top, bottom, back, dividers, shelves, doors, drawer fronts', () => {
  const w = createModule('wardrobe'); // 200 wide, 2 sections, hinged, 2 drawers
  for (const p of ['side', 'top', 'bottom', 'back', 'divider', 'shelf', 'door', 'drawer-front', 'plinth']) assert.ok(parts(w).includes(p), p);
  assert.equal(count({ ...w, drawers: 0 }, 'divider'), 1);
  assert.equal(count({ ...w, sections: 4 }, 'divider'), 3);
  assert.equal(count(w, 'drawer-front'), 2);
  assert.equal(count({ ...w, drawers: 6 }, 'drawer-front'), 6);
  // 100 cm bays get two hinged doors each; 50 cm bays get one
  assert.equal(count(w, 'door'), 4);
  assert.equal(count({ ...w, sections: 4 }, 'door'), 4);
  for (const p of panelsFor(w)) {
    assert.ok(p.w > 0 && p.h > 0 && p.t > 0 && p.qty > 0 && MATERIALS_OK(p.material), JSON.stringify(p));
    assert.ok(p.w <= 300 && p.h <= 300);
  }
  const mats = Object.fromEntries(panelsFor(w).map((p) => [p.part, p.material]));
  assert.equal(mats.side, 'birch-ply');
  assert.equal(mats.door, 'oak');
  assert.equal(mats['drawer-front'], 'oak');
});
function MATERIALS_OK(id) { return typeof id === 'string' && id.length > 0; }

test('panelsFor wardrobe doors: sliding is 2 wide panels, glass is a frame, open and none have no doors', () => {
  const w = createModule('wardrobe', { drawers: 0 });
  const slide = panelsFor({ ...w, doors: 'sliding' }).filter((p) => p.part === 'door');
  assert.equal(slide.reduce((s, p) => s + p.qty, 0), 2);
  assert.ok(slide[0].w > 90, 'wide panels');
  assert.equal(count({ ...w, doors: 'sliding', width: 300 }, 'door'), 3);
  assert.equal(count({ ...w, doors: 'open' }, 'door'), 0);
  assert.equal(count({ ...w, doors: 'none' }, 'door'), 0);
  assert.ok(count({ ...w, doors: 'glass' }, 'door') >= 8, 'frame pieces');
});

test('panelsFor interior modes change the shelf count', () => {
  const w = createModule('wardrobe', { drawers: 0, sections: 2 });
  const shelves = count({ ...w, interior: 'shelves' }, 'shelf');
  assert.ok(shelves >= 4);
  assert.equal(count({ ...w, interior: 'rail' }, 'shelf'), 2, 'one hat shelf per bay');
  const mixed = count({ ...w, interior: 'mixed' }, 'shelf');
  assert.ok(mixed > 2 && mixed < shelves);
});

test('panelsFor other types', () => {
  const table = createModule('table');
  assert.deepEqual(new Set(parts(table)), new Set(['top', 'leg', 'side']));
  assert.equal(count(table, 'leg'), 4);
  assert.ok(parts(createModule('table', { worktop: 'oak' })).includes('worktop'));

  const bench = createModule('bench');
  assert.ok(parts(bench).includes('top') && count(bench, 'leg') === 4);

  const desk = createModule('desk'); // 2 drawers -> side panels
  assert.ok(parts(desk).includes('top') && parts(desk).includes('side') && parts(desk).includes('drawer-front'));
  assert.equal(count(desk, 'leg'), 0);
  const legDesk = createModule('desk', { drawers: 0 });
  assert.equal(count(legDesk, 'leg'), 4);
  assert.ok(!parts(legDesk).includes('side'));
  assert.ok(parts(createModule('desk', { worktop: 'oak' })).includes('worktop'));

  const base = createModule('kitchen-base');
  const bp = parts(base);
  for (const p of ['side', 'bottom', 'back', 'door', 'worktop', 'plinth']) assert.ok(bp.includes(p), p);
  assert.equal(parts(createModule('kitchen-base', { worktop: null })).includes('worktop'), false);
  assert.equal(parts(createModule('kitchen-wall')).includes('plinth'), false);
  const worktop = panelsFor(base).find((p) => p.part === 'worktop');
  assert.equal(worktop.material, 'terrazzo');
  assert.equal(worktop.w, base.width);

  const island = panelsFor(createModule('island'));
  assert.ok(island.some((p) => p.part === 'worktop') && island.some((p) => p.part === 'drawer-front'));
  assert.ok(parts(createModule('shelving')).includes('shelf'));
  assert.ok(parts(createModule('window-seat')).includes('top'));
  assert.ok(parts(createModule('tall-cabinet')).includes('door'));
});

test('quote: lines sum to subtotal, subtotal + vat equals total, modules sum to lines', () => {
  const q = quoteDesign(createDesign());
  near(q.lines.reduce((s, l) => s + l.amount, 0), q.subtotal);
  near(q.subtotal + q.vat, q.total);
  near(q.vat, q.subtotal * PRICES.vat, 0.006);
  assert.deepEqual(q.lines.map((l) => l.label), ['Materials', 'Hardware', 'Workshop labour', 'Installation', 'Design fee']);
  for (const key of ['materials', 'hardware', 'labour', 'install']) {
    const label = { materials: 'Materials', hardware: 'Hardware', labour: 'Workshop labour', install: 'Installation' }[key];
    near(q.modules.reduce((s, m) => s + m[key], 0), q.lines.find((l) => l.label === label).amount);
  }
  for (const m of q.modules) {
    near(m.materials + m.hardware + m.labour + m.install, m.total);
    assert.ok(m.boardM2 > 0 && m.label);
  }
  assert.equal(q.lines.find((l) => l.label === 'Design fee').amount, 250);
  assert.equal(q.lines.find((l) => l.label === 'Installation').amount, 240);
});

test('quote: VAT toggle', () => {
  const d = createDesign();
  const withVat = quoteDesign(d);
  const noVat = quoteDesign(d, { vat: false });
  assert.equal(noVat.vat, 0);
  assert.equal(noVat.total, noVat.subtotal);
  assert.equal(noVat.subtotal, withVat.subtotal);
  assert.ok(withVat.total > noVat.total);
  near(withVat.total / noVat.total, 1.21, 0.001);
});

test('quote: empty design is free, lead time minimum', () => {
  const q = quoteDesign(design([]));
  assert.equal(q.total, 0);
  assert.equal(q.subtotal, 0);
  assert.equal(q.leadTimeWeeks, 4);
  assert.deepEqual(q.cutList, []);
});

test('realistic prices: 200 x 240 cm oak wardrobe lands between 3,500 and 6,500 incl. VAT', () => {
  const q = quoteDesign(wardrobe());
  assert.ok(q.total >= 3500 && q.total <= 6500, `wardrobe total ${q.total}`);
});

test('realistic prices: 3 m kitchen run lands between 9,000 and 16,000 incl. VAT', () => {
  const q = quoteDesign(kitchen());
  assert.ok(q.total >= 9000 && q.total <= 16000, `kitchen total ${q.total}`);
  assert.ok(q.modules.length === 7);
});

test('realistic prices: default design', () => {
  const q = quoteDesign(createDesign());
  assert.ok(q.total > 4000 && q.total < 9000, `default total ${q.total}`);
});

test('options move the price in the right direction', () => {
  const base = createModule('wardrobe', { id: 'w' });
  const price = (patch) => quoteDesign(design([{ ...base, ...patch }])).subtotal;
  const p0 = price({});
  assert.ok(price({ led: true }) > p0);
  assert.ok(price({ drawers: 6 }) > p0);
  assert.ok(price({ front: 'walnut' }) > p0);
  assert.ok(price({ front: 'lacquer-white' }) < price({ front: 'walnut' }));
  assert.ok(price({ width: 300 }) > p0);
  assert.ok(price({ handle: 'push' }) > price({ handle: 'groove' }));
  assert.ok(price({ doors: 'sliding' }) !== p0);
  assert.ok(price({ doors: 'glass' }) > price({ doors: 'none' }));
  assert.ok(price({ doors: 'none' }) < p0);
  assert.ok(price({ interior: 'rail' }) !== p0);
});

test('quote: cut list merges identical panels across modules, sorted by material', () => {
  const a = createModule('kitchen-base', { id: 'a', x: 0, drawers: 0 });
  const b = createModule('kitchen-base', { id: 'b', x: 60, drawers: 0 });
  const q1 = quoteDesign(design([a]));
  const q2 = quoteDesign(design([a, b]));
  for (const row of q1.cutList) {
    const twin = q2.cutList.find((r) => r.material === row.material && r.part === row.part && r.w === row.w && r.h === row.h && r.t === row.t);
    assert.ok(twin, 'merged row exists');
    assert.equal(twin.qty, row.qty * 2);
  }
  assert.equal(q2.cutList.length, q1.cutList.length, 'no duplicate rows');
  const keys = q2.cutList.map((r) => `${r.material}|${r.part}|${r.w}|${r.h}|${r.t}`);
  assert.equal(new Set(keys).size, keys.length);
  const mats = q2.cutList.map((r) => r.material);
  assert.deepEqual(mats, [...mats].sort((x, y) => x.localeCompare(y)));
  for (const r of q2.cutList) assert.deepEqual(Object.keys(r).sort(), ['h', 'material', 'part', 'qty', 't', 'w']);
});

test('quote: board area by material matches cut list and module rows', () => {
  const q = quoteDesign(kitchen());
  const fromCuts = {};
  for (const r of q.cutList) fromCuts[r.material] = (fromCuts[r.material] || 0) + (r.w * r.h * r.qty) / 10000;
  for (const [mat, m2] of Object.entries(q.boardM2ByMaterial)) near(m2, fromCuts[mat], 0.01);
  assert.deepEqual(Object.keys(fromCuts).sort(), Object.keys(q.boardM2ByMaterial).sort());
  near(Object.values(q.boardM2ByMaterial).reduce((s, x) => s + x, 0), q.modules.reduce((s, m) => s + m.boardM2, 0), 0.01);
  assert.ok(q.boardM2ByMaterial.terrazzo > 1);
});

test('quote: lead time is 4 weeks plus a week per 40 labour hours', () => {
  const small = quoteDesign(design([createModule('bench', { id: 'b' })]));
  assert.equal(small.leadTimeWeeks, 5);
  const big = quoteDesign(kitchen());
  const hours = big.lines.find((l) => l.label === 'Workshop labour').amount / PRICES.labourPerHour;
  assert.equal(big.leadTimeWeeks, 4 + Math.ceil(hours / 40 - 1e-6));
});
