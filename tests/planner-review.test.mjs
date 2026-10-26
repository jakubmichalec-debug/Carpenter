import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { quoteProject } from '../site/js/planner/pricing.js';
import { validateProject } from '../site/js/planner/validate.js';
import { encodeProject, decodeProject } from '../site/js/planner/share.js';
import * as R from '../site/js/planner/review-logic.js';

function room(template = 'rect', params = { width: 420, depth: 380 }) {
  const p = M.setTemplate(M.createProject(), template, params);
  return { ...p, room: { ...p.room, openings: [] }, pieces: [], placements: [] };
}
function sample() {
  let p = room();
  p = M.addPiece(p, 'wardrobe', 'flat-oak', { id: 'w' });
  p = M.setBays(p, 'w', 3);
  p = M.addItem(p, 'w', 2, { kind: 'led', y: 230 });
  p = M.placePiece(p, 'w', { mode: 'wall', wallId: 'w1', offset: 20 });
  p = M.addPiece(p, 'table', 'oak-table', { id: 't' });
  p = M.placePiece(p, 't', { mode: 'free', x: 210, z: 240, rotation: 0 });
  return p;
}

// ---------- money and time ----------
test('formatEuro: two decimals, grouping, euro sign', () => {
  assert.equal(R.formatEuro(1234.5), '€1,234.50');
  assert.equal(R.formatEuro(0), '€0.00');
  assert.equal(R.formatEuro(13837.72), '€13,837.72');
  assert.equal(R.formatEuro(-5), '-€5.00');
  assert.equal(R.formatEuro('nonsense'), '€0.00');
});
test('formatEuroWhole and formatDuration', () => {
  assert.equal(R.formatEuroWhole(8000.4), '€8,000');
  assert.equal(R.formatDuration(7.4), '7 s');
  assert.equal(R.formatDuration(61), '1 min 01 s');
  assert.equal(R.formatDuration(-3), '0 s');
});

// ---------- quote view ----------
test('quoteView adds up: sections, pieces and totals match the quote to the cent', () => {
  for (const vat of [true, false]) {
    const p = sample();
    const q = quoteProject(p, { vat });
    const v = R.quoteView(q, p);
    assert.equal(v.pieces.length, 2);
    for (const pc of v.pieces) {
      const src = q.pieces.find((x) => x.id === pc.id);
      assert.equal(pc.cents, src.cents);
      assert.equal(pc.sections.reduce((s, x) => s + x.cents, 0), pc.cents, `${pc.label} sections`);
      assert.equal(pc.groups.reduce((s, x) => s + x.cents, 0), pc.cents, `${pc.label} groups`);
      for (const sec of pc.sections) assert.equal(sec.rows.reduce((s, r) => s + r.cents, 0), sec.cents);
    }
    assert.equal(v.pieces.reduce((s, x) => s + x.cents, 0) + v.totals.lines.find((l) => l.label === 'Design fee').cents, q.cents.subtotal);
    assert.equal(v.totals.lines.reduce((s, l) => s + l.cents, 0), v.totals.subtotalCents);
    assert.equal(v.totals.subtotalCents + v.totals.vatCents, v.totals.totalCents);
    assert.equal(v.totals.totalCents, q.cents.total);
    assert.equal(v.totals.vatOn, vat);
    assert.equal(v.totals.leadTimeWeeks, q.leadTimeWeeks);
  }
});
test('quoteView: the wardrobe has a section per bay with item rows, labelled like the interior', () => {
  const p = sample();
  const v = R.quoteView(quoteProject(p), p);
  const w = v.pieces.find((x) => x.id === 'w');
  assert.deepEqual(w.sections.map((s) => s.title), ['The piece', 'Section 1', 'Section 2', 'Section 3']);
  assert.equal(w.label, 'Wardrobe 1');
  assert.equal(w.size, '240 × 240 × 60 cm');
  assert.ok(w.sections[2].rows.some((r) => /drawers/.test(r.label)));
  assert.ok(w.sections[3].rows.some((r) => /LED/.test(r.label)));
  assert.ok(w.sections[0].rows.some((r) => r.label === 'Carcass boards'));
  assert.ok(w.groups.map((g) => g.label).includes('Fitting'));
  assert.ok(w.sections[1].rows.every((r) => r.cents > 0));
});
test('quoteView: materials sorted by area, unplaced pieces named', () => {
  let p = sample();
  p = M.addPiece(p, 'desk', 'oak-desk', { id: 'd' });
  const v = R.quoteView(quoteProject(p), p);
  assert.deepEqual(v.unplaced.map((u) => u.label), ['Desk 1']);
  const areas = v.materials.map((m) => m.m2);
  assert.deepEqual(areas, [...areas].sort((a, b) => b - a));
  assert.ok(v.materials.every((m) => m.label && m.label !== m.id.toUpperCase()));
  assert.equal(v.pieces.find((x) => x.id === 'd').placed, false);
});
test('quoteView on an empty project is empty but valid', () => {
  const p = room();
  const v = R.quoteView(quoteProject(p), p);
  assert.deepEqual(v.pieces, []);
  assert.equal(v.totals.totalCents, 0);
});

// ---------- blockers ----------
test('sendBlockers: empty project and nothing placed', () => {
  const p0 = room();
  assert.deepEqual(R.sendBlockers(p0, validateProject(p0).errors).map((b) => b.code), ['no-pieces']);
  let p1 = M.addPiece(p0, 'wardrobe', 'flat-oak', { id: 'w' });
  const b = R.sendBlockers(p1, validateProject(p1).errors);
  assert.deepEqual(b.map((x) => x.code), ['none-placed']);
  assert.equal(b[0].step, 3);
});
test('sendBlockers: a finished project has none; a clash is blocking and points to Place', () => {
  const ok = sample();
  assert.deepEqual(R.sendBlockers(ok, validateProject(ok).errors), []);
  let bad = M.addPiece(ok, 'wardrobe', 'flat-oak', { id: 'x' });
  bad = M.placePiece(bad, 'x', { mode: 'wall', wallId: 'w1', offset: 100, snap: false });
  const list = R.sendBlockers(bad, validateProject(bad).errors);
  assert.ok(list.length > 0);
  const overlap = list.find((b) => b.code === 'placement-overlap');
  assert.ok(overlap, 'overlap reported');
  assert.equal(overlap.step, 3);
  assert.equal(overlap.label, 'Fix in Place');
  assert.ok(overlap.pieceId);
  assert.ok(!/\bw1\b/.test(overlap.message), 'wall ids are written as numbers');
});
test('issueStep maps refs to the step that fixes them', () => {
  assert.equal(R.issueStep({ type: 'room' }), 0);
  assert.equal(R.issueStep({ type: 'opening', id: 'o1' }), 0);
  assert.equal(R.issueStep({ type: 'piece', id: 'p' }), 1);
  assert.equal(R.issueStep({ type: 'bay', pieceId: 'p', bay: 0 }), 1);
  assert.equal(R.issueStep({ type: 'item', pieceId: 'p', bay: 0, index: 0 }), 2);
  assert.equal(R.issueStep({ type: 'placement', pieceId: 'p' }), 3);
  assert.equal(R.issueStep({ type: 'piece', id: 'p' }, 'piece-unplaced'), 3);
  assert.equal(R.issueStep(null), 0);
});
test('adviceList keeps only non-blocking items', () => {
  const errors = [{ code: 'a', message: 'x', blocking: true }, { code: 'walkway', message: 'Wall w2 is tight', blocking: false, ref: { type: 'placement', pieceId: 'p' } }];
  const a = R.adviceList(errors);
  assert.equal(a.length, 1);
  assert.equal(a[0].message, 'Wall 2 is tight');
});

// ---------- render settings ----------
test('renderSettings: desktop gets the full size, 256 samples and 60 s', () => {
  const s = R.renderSettings({ aspect: 16 / 9 });
  assert.equal(s.cls, 'desktop');
  assert.equal(s.width, 1600);
  assert.equal(s.height, 900);
  assert.equal(s.maxSamples, 256);
  assert.equal(s.maxSeconds, 60);
  assert.equal(s.capped, false);
  assert.equal(s.note, '');
  assert.deepEqual(s.stages.map((x) => x.scale), [0.25, 0.5, 1]);
  assert.equal(s.stages[2].samples, 256);
});
test('renderSettings: phones and weak GPUs are capped at 960 px and 96 samples, and the note says so', () => {
  const cases = [
    { pointerCoarse: true, screenWidth: 390, screenHeight: 844 },
    { deviceMemory: 2 },
    { software: true },
    { maxTextureSize: 4096 },
    { pointerCoarse: true, screenWidth: 1024, screenHeight: 768, cores: 4 }
  ];
  for (const env of cases) {
    const s = R.renderSettings({ aspect: 1.5, ...env });
    assert.equal(s.cls, 'weak', JSON.stringify(env));
    assert.ok(s.width <= 960 && s.height <= 960);
    assert.equal(s.maxSamples, 96);
    assert.ok(s.maxSeconds <= 60);
    assert.ok(s.capped);
    assert.match(s.note, /960 px/);
    assert.match(s.note, /96 samples/);
    assert.ok(s.reasons.length > 0);
  }
  // a tablet with a big screen and a fast CPU is not weak
  assert.equal(R.renderSettings({ pointerCoarse: true, screenWidth: 1180, screenHeight: 820, cores: 8, deviceMemory: 8 }).cls, 'desktop');
});
test('renderSettings: aspect is kept, long edge capped, sizes even, override applies', () => {
  const tall = R.renderSettings({ aspect: 0.5 }); // clamped to 0.6
  assert.ok(tall.height <= 1600 && tall.width < tall.height);
  assert.equal(tall.width % 2, 0);
  assert.equal(tall.height % 2, 0);
  const wide = R.renderSettings({ aspect: 5 });
  assert.ok(Math.abs(wide.width / wide.height - 2.2) < 0.02);
  const o = R.renderSettings({ aspect: 2 }, { width: 321, maxSamples: 5, maxSeconds: 9 });
  assert.equal(o.width, 320);
  assert.equal(o.height, 160);
  assert.equal(o.maxSamples, 5);
  assert.equal(o.maxSeconds, 9);
  assert.deepEqual(o.tiles, [1, 1]);
  assert.equal(o.stages[2].samples, 5);
});
test('renderSettings: denoise is on unless a test turns it off', () => {
  assert.equal(R.renderSettings({}).denoise, true);
  assert.equal(R.renderSettings({}, { width: 320 }).denoise, true);
  assert.equal(R.renderSettings({}, { denoise: false }).denoise, false);
});
test('renderSettings: big images are tiled so one frame stays short', () => {
  assert.deepEqual(R.renderSettings({ aspect: 16 / 9 }).tiles, [2, 2]); // 1600x900
  assert.deepEqual(R.renderSettings({ aspect: 16 / 9 }, { width: 800 }).tiles, [1, 1]);
  const weak = R.renderSettings({ software: true, aspect: 16 / 9 });
  assert.deepEqual(weak.tiles, [2, 2]);
});
test('progressFraction follows whichever limit is closer', () => {
  assert.equal(R.progressFraction({ samples: 0, maxSamples: 100, elapsed: 0, maxSeconds: 60 }), 0);
  assert.equal(R.progressFraction({ samples: 50, maxSamples: 100, elapsed: 3, maxSeconds: 60 }), 0.5);
  assert.equal(R.progressFraction({ samples: 5, maxSamples: 100, elapsed: 45, maxSeconds: 60 }), 0.75);
  assert.equal(R.progressFraction({ samples: 500, maxSamples: 100, elapsed: 1, maxSeconds: 60 }), 1);
});

// ---------- camera and room geometry ----------
test('presetList: Room, Top, then a front view per placed piece', () => {
  let p = sample();
  p = M.addPiece(p, 'desk', 'oak-desk', { id: 'd' }); // not placed: no preset
  const list = R.presetList(p);
  assert.deepEqual(list.map((x) => x.id), ['room', 'top', 'front:w', 'front:t']);
  assert.deepEqual(list.map((x) => x.label), ['Room', 'Top', 'Front of Wardrobe 1', 'Front of Table 1']);
});
test('frontPose: stands in front of a wall piece, looking at it, inside the room', () => {
  const p = sample();
  const pose = R.frontPose(p, 'w', { aspect: 1.5 });
  // wardrobe on wall 1 (top wall, z = 0), 240 wide from x = 20: centre x = 1.4 m, the front faces +z
  assert.ok(Math.abs(pose.target[0] - 1.4) < 0.01);
  assert.ok(pose.position[2] > pose.target[2] + 1.5);
  assert.ok(Math.abs(pose.position[0] - pose.target[0]) < 0.01);
  assert.ok(pose.position[1] >= 1.1 && pose.position[1] <= 1.55);
  assert.equal(pose.inRoom, true);
  assert.equal(R.frontPose(p, 'nope'), null);
});
test('frontPose: a free piece turned 90 degrees is seen from its own front', () => {
  let p = room();
  p = M.addPiece(p, 'table', 'oak-table', { id: 't' });
  p = M.placePiece(p, 't', { mode: 'free', x: 210, z: 190, rotation: 90 });
  const pose = R.frontPose(p, 't');
  // rotation 90: the front faces -x
  assert.ok(pose.position[0] < pose.target[0] - 1);
  assert.ok(Math.abs(pose.position[2] - pose.target[2]) < 0.01);
});
test('frontPose: a bigger piece is seen from further away', () => {
  let p = room('rect', { width: 900, depth: 800 });
  p = M.addPiece(p, 'desk', 'oak-desk', { id: 'big', width: 300, height: 100 });
  p = M.placePiece(p, 'big', { mode: 'wall', wallId: 'w1', offset: 0 });
  p = M.addPiece(p, 'desk', 'oak-desk', { id: 'small', width: 120, height: 100 });
  p = M.placePiece(p, 'small', { mode: 'wall', wallId: 'w3', offset: 0 });
  const dist = (id) => { const q = R.frontPose(p, id); return Math.hypot(q.position[0] - q.target[0], q.position[2] - q.target[2]); };
  assert.ok(dist('big') > dist('small'));
});
test('frontPose keeps the camera inside a small room, even for a tall piece', () => {
  const p = sample(); // 240 x 240 wardrobe in a 420 x 380 room
  const pose = R.frontPose(p, 'w', { aspect: 1.5 });
  assert.equal(pose.inRoom, true);
  assert.ok(pose.position[2] < 3.8 - 0.2);
  assert.ok(Math.abs(R.rayToWall(p.room, 100, 100, 0, 1) - 280) < 1e-6);
  assert.equal(R.rayToWall(p.room, 100, 100, 0, -1), 100);
});
test('insideRoom and hiddenWalls', () => {
  const p = room('rect', { width: 400, depth: 300 });
  assert.equal(R.insideRoom(p.room, 200, 150), true);
  assert.equal(R.insideRoom(p.room, 450, 150), false);
  assert.deepEqual(R.hiddenWalls(p.room, [2, 5, 1.5]), []);           // inside: nothing between the camera and the room
  assert.deepEqual(R.hiddenWalls(p.room, [2, 5, 7]), ['w3']);          // beyond the bottom wall (z = 3 m)
  assert.deepEqual(R.hiddenWalls(p.room, [-3, 5, 7]).sort(), ['w3', 'w4']);
  const l = room('l-shape', { lengthA: 500, widthA: 200, lengthB: 400, widthB: 200 });
  assert.ok(R.hiddenWalls(l.room, [10, 5, 10]).length > 0);
});
function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.z - b.x * a.z; }
  return Math.abs(s / 2);
}
test('ceilingPolygons: flat room is one polygon at the ceiling height covering the floor', () => {
  const p = room('rect', { width: 400, depth: 300 });
  const polys = R.ceilingPolygons(p.room);
  assert.equal(polys.length, 1);
  assert.ok(Math.abs(polyArea(polys[0]) - M.area(p.room)) < 1e-6);
  assert.ok(polys[0].every((v) => v.y === p.room.height));
});
test('ceilingPolygons: an attic is split where the slope ends; areas add up and heights follow the slope', () => {
  const p = room('attic', { width: 480, depth: 360, kneeHeight: 120, slopeAngle: 40, slopeWall: 1 });
  assert.ok(p.room.slope, 'attic has a slope');
  const polys = R.ceilingPolygons(p.room);
  assert.equal(polys.length, 2);
  const total = polys.reduce((s, q) => s + polyArea(q), 0);
  assert.ok(Math.abs(total - M.area(p.room)) < 1e-3, `${total} vs ${M.area(p.room)}`);
  const ys = polys.flat().map((v) => v.y);
  assert.ok(Math.abs(Math.min(...ys) - p.room.slope.lowHeight) < 1e-6);
  assert.ok(Math.abs(Math.max(...ys) - p.room.height) < 1e-6);
  // the far polygon is flat at the ridge
  assert.ok(polys.some((q) => q.every((v) => Math.abs(v.y - p.room.height) < 1e-6)) || polys.length === 2);
});
test('placedTransform puts the group at the footprint corner, turned like the footprint', () => {
  const p = sample();
  const wall = R.placedTransform(p, p.placements.find((x) => x.pieceId === 'w'));
  assert.ok(Math.abs(wall.x - 0.2) < 1e-9 && Math.abs(wall.z) < 1e-9 && wall.lift === 0);
  const t = R.placedTransform(p, p.placements.find((x) => x.pieceId === 't'));
  const fp = M.footprintOf(p, p.placements.find((x) => x.pieceId === 't'));
  assert.ok(Math.abs(t.x - fp.corners[0].x / 100) < 1e-9);
  assert.equal(R.placedTransform(p, { pieceId: 'gone', mode: 'free', x: 0, z: 0 }), null);
});

// ---------- the whole path: a link opens the same quote ----------
test('a share link decodes to a project whose quote equals the original', async () => {
  const p = sample();
  const enc = await encodeProject(p);
  const back = await decodeProject(`#p=${enc}`);
  assert.equal(quoteProject(back).total, quoteProject(p).total);
  assert.deepEqual(back.pieces.map((x) => M.pieceLabel(back, x.id)), ['Wardrobe 1', 'Table 1']);
});
