import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { validateProject } from '../site/js/planner/validate.js';
import { bayLayout, bayAt, suggestY, dragDivider, resizeBay, nudgeY, itemsProblems } from '../site/js/planner/interior-geom.js';

const wardrobe = () => M.createPiece('wardrobe', 'flat-oak', { id: 'p1', bays: [{ width: 80, items: [] }, { width: 80, items: [] }, { width: 74, items: [] }] });

test('bayLayout lines bays up with the dividers', () => {
  const p = wardrobe();
  const L = bayLayout(p);
  assert.equal(L.length, 3);
  assert.equal(L[0].x0, M.LAYOUT_T);
  assert.equal(L[1].x0, L[0].x1 + M.LAYOUT_T);
  assert.equal(L[2].x1 + M.LAYOUT_T, p.width);
  assert.equal(bayAt(L, -50), 0);
  assert.equal(bayAt(L, L[1].x0 + 5), 1);
  assert.equal(bayAt(L, 9999), 2);
});

test('suggestY finds free grid heights and keeps validation quiet', () => {
  let proj = { ...M.createProject(), pieces: [wardrobe()], placements: [] };
  const add = (kind, params = {}) => {
    const y = suggestY(proj.pieces[0], 0, kind, params);
    assert.ok(Math.abs(y / M.GRID - Math.round(y / M.GRID)) < 0.02, `${kind} on the grid (${y})`);
    proj = M.addItem(proj, 'p1', 0, { ...params, kind, y });
    return y;
  };
  const dr = add('drawers');
  assert.equal(dr, 0);
  const rail = add('rail', { length: 'short' });
  const g = M.pieceGeometry(proj.pieces[0]);
  assert.ok(rail > g.innerH - 12, 'rail goes near the top');
  const s1 = add('shelf');
  const s2 = add('shelf');
  assert.ok(s2 >= s1 + 18, 'shelves keep 18 cm apart');
  assert.ok(s1 >= 57.6, 'shelves start above the drawers');
  const v = validateProject(proj).errors.filter((e) => e.ref.type === 'item' && e.blocking);
  assert.deepEqual(v, [], JSON.stringify(v));
});

test('suggestY falls back to a valid height when the bay is full', () => {
  let proj = { ...M.createProject(), pieces: [wardrobe()], placements: [] };
  for (let i = 0; i < 12; i++) proj = M.addItem(proj, 'p1', 0, { kind: 'shelf', y: suggestY(proj.pieces[0], 0, 'shelf') });
  const y = suggestY(proj.pieces[0], 0, 'shelf');
  assert.ok(y >= 0 && y <= M.pieceGeometry(proj.pieces[0]).innerH);
  assert.equal(suggestY(proj.pieces[0], 9, 'shelf'), 0);
  assert.equal(suggestY(proj.pieces[0], 0, 'nope'), 0);
});

test('dragDivider and resizeBay keep the total and the minimum', () => {
  const w = [80, 80, 74];
  assert.deepEqual(dragDivider(w, 0, 10), [90, 70, 74]);
  assert.deepEqual(dragDivider(w, 1, -500), [80, M.MIN_BAY, 134]);
  assert.deepEqual(dragDivider(w, 1, 500), [80, 134, M.MIN_BAY]);
  assert.deepEqual(dragDivider(w, 2, 5), w);
  assert.deepEqual(resizeBay(w, 0, 100), [100, 60, 74]);
  assert.deepEqual(resizeBay(w, 2, 64), [80, 90, 64]);
  assert.equal(resizeBay([100], 0, 50)[0], 100);
  for (const r of [dragDivider(w, 0, 7.4), resizeBay(w, 1, 33.7)]) assert.equal(r.reduce((a, b) => a + b), 234);
});

test('nudgeY moves in whole 32 mm steps', () => {
  assert.equal(nudgeY(0, 1), 3.2);
  assert.equal(nudgeY(3.2, -1), 0);
  assert.equal(nudgeY(100, 10), M.snapY(M.snapY(100) + 32));
});

test('itemsProblems groups errors by piece, bay and item', () => {
  const errs = [
    { code: 'a', ref: { type: 'piece', id: 'p1' } }, { code: 'b', ref: { type: 'bay', pieceId: 'p1', bay: 2 } },
    { code: 'c', ref: { type: 'item', pieceId: 'p1', bay: 0, index: 3 } }, { code: 'd', ref: { type: 'item', pieceId: 'p2', bay: 0, index: 0 } },
    { code: 'e', ref: { type: 'placement', pieceId: 'p1' } }
  ];
  const g = itemsProblems(errs, 'p1');
  assert.equal(g.count, 3);
  assert.equal(g.piece.length, 1);
  assert.equal(g.bays[2].length, 1);
  assert.equal(g.items['0:3'].length, 1);
});

test('changeBayCount keeps widths: adding splits the widest, removing feeds the neighbour', async () => {
  const { changeBayCount } = await import('../site/js/planner/interior-geom.js');
  const p = M.createPiece('wardrobe', 'flat-oak', { id: 'p1', bays: [{ width: 60, items: [{ kind: 'shelf', y: 32 }] }, { width: 110, items: [] }, { width: 54, items: [] }] });
  const inner = (n) => M.pieceGeometry(p, n).innerW;
  const four = changeBayCount(p, 4);
  assert.equal(four.length, 4);
  assert.equal(four.reduce((s, b) => s + b.width, 0), inner(4));
  assert.equal(four[0].width, p.bays[0].width, 'untouched bays keep their width');
  assert.equal(four[3].width, p.bays[2].width);
  assert.ok(Math.abs(four[1].width - four[2].width) <= 1, 'the widest bay was split');
  assert.deepEqual(four[0].items, p.bays[0].items);
  assert.deepEqual(four[2].items, []);
  const two = changeBayCount(p, 2);
  assert.equal(two.reduce((s, b) => s + b.width, 0), inner(2));
  assert.equal(two[0].width, p.bays[0].width);
  assert.equal(two[1].width, p.bays[1].width + p.bays[2].width + M.LAYOUT_T);
  const updated = M.updatePiece({ ...M.createProject(), pieces: [p], placements: [] }, 'p1', { bays: four }).pieces[0];
  assert.deepEqual(updated.bays.map((b) => b.width), four.map((b) => b.width));
  assert.equal(updated.bays[0].items.length, 1);
});
