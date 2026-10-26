import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { STUDIO, layoutStudio, itemOf, presetList, frontPose, overviewPose } from '../site/js/planner/studio.js';
import { studioSignature } from '../site/js/planner/geometry.js';

const project = (...specs) => specs.reduce((p, [type, o]) => M.addPiece(p, type, undefined, o), M.createBlankProject());

test('pieces stand side by side along the back wall with a gap, in the order of the project', () => {
  const p = project(['wardrobe', { id: 'a', width: 200 }], ['desk', { id: 'b', width: 140 }], ['tall-cabinet', { id: 'c', width: 60 }]);
  const l = layoutStudio(p);
  assert.deepEqual(l.items.map((i) => i.pieceId), ['a', 'b', 'c']);
  assert.deepEqual(l.items.map((i) => i.x), [0, 200 + STUDIO.gap, 200 + STUDIO.gap + 140 + STUDIO.gap]);
  assert.ok(l.items.every((i) => i.z === 0 && !i.free), 'against the wall');
  assert.equal(l.extent, 200 + 140 + 60 + 2 * STUDIO.gap);
  for (let i = 1; i < l.items.length; i++) assert.equal(l.items[i].x - (l.items[i - 1].x + l.items[i - 1].w), STUDIO.gap, 'a small gap between neighbours');
});

test('tables and islands stand free in front, in a row of their own, centred on the others', () => {
  const p = project(['wardrobe', { id: 'a', width: 450, depth: 60 }], ['table', { id: 't', width: 160 }], ['island', { id: 'i', width: 120 }]);
  const l = layoutStudio(p);
  const a = itemOf(l, 'a'), t = itemOf(l, 't'), i = itemOf(l, 'i');
  assert.equal(a.free, false);
  assert.ok(t.free && i.free);
  assert.ok(t.z >= a.d + STUDIO.freeGap, 'in front of the wall row, with room to walk');
  assert.equal(t.z, i.z);
  assert.equal(i.x - (t.x + t.w), STUDIO.gap);
  const row = (t.w + STUDIO.gap + i.w);
  assert.equal(t.x, (l.extent - row) / 2, 'centred');
  assert.equal(l.extent, 450);
  // nothing overlaps
  const boxes = l.items.map((x) => [x.x, x.x + x.w, x.z, x.z + x.d]);
  for (let m = 0; m < boxes.length; m++) for (let n = m + 1; n < boxes.length; n++) {
    const [a0, a1, b0, b1] = boxes[m], [c0, c1, d0, d1] = boxes[n];
    assert.ok(a1 <= c0 || c1 <= a0 || b1 <= d0 || d1 <= b0, `${m} and ${n} do not overlap`);
  }
});

test('only tables: they still stand in front of the wall', () => {
  const l = layoutStudio(project(['table', { id: 't' }]));
  assert.equal(l.items[0].z, STUDIO.freeGap);
  assert.ok(l.floor.z1 > l.items[0].z + l.items[0].d);
});

test('a wall unit hangs at its own height', () => {
  const l = layoutStudio(project(['kitchen-wall', { id: 'u', elevation: 140 }], ['kitchen-base', { id: 'b' }]));
  assert.equal(itemOf(l, 'u').lift, 140);
  assert.equal(itemOf(l, 'b').lift, 0);
  assert.ok(l.wall.height >= 140 + itemOf(l, 'u').h + STUDIO.wallAbove - 1, 'the wall is taller than what hangs on it');
});

test('the floor and the wall are sized to the pieces, with margins, and never smaller than a minimum', () => {
  const small = layoutStudio(project(['desk', { id: 'd', width: 100, height: 75 }]));
  assert.equal(small.wall.height, STUDIO.wallMin);
  assert.equal(small.floor.x0, -STUDIO.side);
  assert.equal(small.floor.x1, small.extent + STUDIO.side);
  assert.equal(small.floor.z1, 65 + STUDIO.front);
  const tall = layoutStudio(project(['wardrobe', { id: 'w', height: 280 }]));
  assert.equal(tall.wall.height, 280 + STUDIO.wallAbove);
  const wide = layoutStudio(project(['wardrobe', { id: 'a', width: 300 }], ['wardrobe', { id: 'b', width: 300 }]));
  assert.ok(wide.floor.x1 - wide.floor.x0 > small.floor.x1 - small.floor.x0);
  assert.deepEqual(wide.bounds, { minX: wide.floor.x0, maxX: wide.floor.x1, minZ: 0, maxZ: wide.floor.z1, maxY: wide.wall.height });
  assert.notEqual(studioSignature(wide), studioSignature(small));
  // moving the other pieces around does not change what the studio looks like when the size stays
  assert.equal(studioSignature(layoutStudio(project(['wardrobe', { id: 'x', width: 300 }], ['wardrobe', { id: 'y', width: 300 }]))), studioSignature(wide));
});

test('an empty project has an empty studio, and unknown pieces are left out', () => {
  const e = layoutStudio(M.createBlankProject());
  assert.equal(e.empty, true);
  assert.deepEqual(e.items, []);
  assert.deepEqual(layoutStudio({ pieces: [null, { id: 'x', type: 'sofa' }] }).items, []);
  assert.deepEqual(layoutStudio(null).items, []);
  assert.deepEqual(presetList(M.createBlankProject()), []);
});

test('one piece alone, as the Furniture and Interior steps show it, is the same layout with one item', () => {
  const p = M.createProject();
  const only = layoutStudio({ pieces: p.pieces.filter((x) => x.id === 'p2') });
  assert.equal(only.items.length, 1);
  assert.equal(only.items[0].x, 0);
  assert.equal(only.extent, 140);
});

test('preset views: all pieces, then the front of each piece', () => {
  const p = M.createProject();
  const list = presetList(p);
  assert.deepEqual(list.map((x) => x.id), ['all', 'front:p1', 'front:p2']);
  assert.deepEqual(list.map((x) => x.label), ['All pieces', 'Front of Wardrobe 1', 'Front of Desk 1']);
  assert.equal(presetList(M.addPiece(M.createBlankProject(), 'desk'))[0].label, 'Overview', 'one piece: no "all"');
});

test('frontPose stands in front of the piece, looking at its middle, and further back for a bigger piece', () => {
  const p = project(['desk', { id: 's', width: 100, height: 75 }], ['wardrobe', { id: 'w', width: 300, height: 260 }]);
  const l = layoutStudio(p);
  const s = frontPose(l, 's', { aspect: 1.5 }), w = frontPose(l, 'w', { aspect: 1.5 });
  const it = itemOf(l, 's');
  assert.ok(Math.abs(s.target[0] - (it.x + it.w / 2) / 100) < 1e-9, 'looks at the middle of the piece');
  assert.ok(s.position[2] > s.target[2], 'stands in front (+z)');
  assert.equal(s.position[0], s.target[0], 'straight on');
  assert.ok(s.position[1] >= 0.9 && s.position[1] <= 1.6);
  const dist = (q) => Math.hypot(q.position[0] - q.target[0], q.position[2] - q.target[2]);
  assert.ok(dist(w) > dist(s));
  assert.equal(frontPose(l, 'nope'), null);
  // a narrower picture needs more distance
  assert.ok(dist(frontPose(l, 'w', { aspect: 0.6 })) > dist(w));
});

test('overviewPose looks at the whole set from the front left and a little above; more pieces, further away', () => {
  const one = layoutStudio(project(['wardrobe', { id: 'a', width: 200 }]));
  const many = layoutStudio(project(['wardrobe', { id: 'a', width: 200 }], ['wardrobe', { id: 'b', width: 200 }], ['wardrobe', { id: 'c', width: 200 }]));
  const a = overviewPose(one), b = overviewPose(many);
  assert.ok(a.position[1] > a.target[1], 'above the middle');
  assert.ok(a.position[2] > a.target[2], 'in front');
  assert.ok(a.position[0] < a.target[0], 'a little from the left');
  const d = (q) => Math.hypot(...q.position.map((v, i) => v - q.target[i]));
  assert.ok(d(b) > d(a));
  assert.ok(Math.abs(b.target[0] - many.extent / 200) < 1e-9, 'looks at the middle of the row');
});
