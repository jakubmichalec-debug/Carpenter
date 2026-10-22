import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { validateProject } from '../site/js/planner/validate.js';
import * as G from '../site/js/planner/place-geom.js';

// 420 x 380 rectangle: a window on wall 1 at 260..380, a door on wall 4 at 40..130 (opens into the room)
function base() {
  let p = M.setTemplate(M.createProject(), 'rect', { width: 420, depth: 380 });
  p = { ...p, pieces: [], placements: [], room: { ...p.room, height: 260, openings: [] } };
  p = M.addOpening(p, { id: 'win', wallId: 'w1', type: 'window', offset: 260, bottom: 90, width: 120, height: 130 });
  p = M.addOpening(p, { id: 'dr', wallId: 'w4', type: 'door', offset: 40, bottom: 0, width: 90, height: 210, swing: 'in-left' });
  return p;
}
const withPiece = (p, id, type, over = {}) => M.addPiece(p, type, undefined, { id, ...over });
const pl = (p, id) => p.placements.find((x) => x.pieceId === id);

test('snapRotation rounds to 15 degrees and wraps', () => {
  assert.equal(G.snapRotation(7), 0);
  assert.equal(G.snapRotation(8), 15);
  assert.equal(G.snapRotation(-10), 345);
  assert.equal(G.snapRotation(362), 0);
  assert.equal(G.snapRotation(100), 105);
});

test('projectOnWall and nearestWall use wall space', () => {
  const p = base();
  const [w1, , w3, w4] = M.wallsOf(p.room);
  assert.deepEqual(G.projectOnWall(w1, { x: 100, z: 30 }), { u: 100, v: 30 });
  const n = G.nearestWall(p.room, { x: 10, z: 200 });
  assert.equal(n.wall.id, 'w4');
  assert.equal(Math.round(n.dist), 10);
  assert.equal(G.nearestWall(p.room, { x: 200, z: 370 }).wall.id, w3.id);
  assert.equal(G.projectOnWall(w4, { x: 20, z: 300 }).v, 20, 'v is the distance into the room');
});

test('snapWallOffset: wall ends, neighbours and the edges of openings', () => {
  let p = withPiece(base(), 'a', 'wardrobe', { width: 100 });
  p = withPiece(p, 'b', 'wardrobe', { width: 100 });
  p = M.placePiece(p, 'a', { mode: 'wall', wallId: 'w1', offset: 0, snap: false });
  // start, end
  assert.deepEqual(G.snapWallOffset(p, 'b', 'w3', 4), { offset: 0, snap: 'start' });
  assert.deepEqual(G.snapWallOffset(p, 'b', 'w3', 317), { offset: 320, snap: 'end' });
  assert.deepEqual(G.snapWallOffset(p, 'b', 'w3', 150), { offset: 150, snap: null });
  // beside the wardrobe on wall 1
  assert.deepEqual(G.snapWallOffset(p, 'b', 'w1', 104), { offset: 100, snap: 'piece' });
  // in front of a window on wall 1 (260..380): a 100 wide piece ends at 260 or starts at 380
  assert.deepEqual(G.snapWallOffset(p, 'b', 'w1', 157), { offset: 160, snap: 'opening' });
  // a wall unit above window height does not snap to the window
  let q = withPiece(base(), 'k', 'kitchen-wall', { width: 60 });
  q = M.updateOpening(q, 'win', { bottom: 90, height: 40 });
  assert.equal(G.snapWallOffset(q, 'k', 'w1', 197, { elevation: 140 }).snap, null, 'no overlap in height: window top 130 < elevation 140');
  // too far from anything: only whole centimetres
  assert.deepEqual(G.snapWallOffset(p, 'b', 'w3', 200.4), { offset: 200, snap: null });
});

test('freeSpotOnWall avoids pieces and openings', () => {
  let p = withPiece(base(), 'a', 'wardrobe', { width: 100 });
  p = withPiece(p, 'b', 'wardrobe', { width: 120 });
  p = M.placePiece(p, 'b', { mode: 'wall', wallId: 'w1', offset: 0, snap: false });
  assert.equal(G.freeSpotOnWall(p, 'a', 'w1', 0), 120, 'right after b, clear of the window at 260');
  assert.equal(G.freeSpotOnWall(p, 'a', 'w1', 400), 160, 'between b and the window the spot is 120 to 160, as near 400 as it goes');
  assert.equal(G.freeSpotOnWall(p, 'a', 'w3', 140), 140, 'an empty wall keeps the preferred spot');
  assert.equal(G.freeSpotOnWall(p, 'a', 'w4', 0), 130, 'past the door');
  const wide = withPiece(base(), 'w', 'wardrobe', { width: 500 });
  assert.equal(G.freeSpotOnWall(wide, 'w', 'w1', 0), null, 'wider than the wall');
});

test('dragOnWalls follows the nearest wall and keeps the grab point', () => {
  let p = withPiece(base(), 'a', 'wardrobe', { width: 100 });
  p = M.placePiece(p, 'a', { mode: 'wall', wallId: 'w3', offset: 100, snap: false });
  const w3 = M.wallsOf(p.room)[2];
  // wall 3 runs right to left along the bottom: u = 420 - x
  let r = G.dragOnWalls(p, 'a', { x: 250, z: 340 }, { grab: 30, wallId: 'w3' });
  assert.equal(r.wallId, 'w3');
  assert.equal(r.offset, 140, 'u 170 - grab 30 = 140');
  assert.equal(r.snap, null);
  // near the left end it snaps to the wall start (the right-hand corner)
  r = G.dragOnWalls(p, 'a', { x: 395, z: 340 }, { grab: 30, wallId: 'w3' });
  assert.deepEqual([r.offset, r.snap], [0, 'start']);
  // pointer moves up to the top wall: the piece jumps to wall 1, held by its middle
  r = G.dragOnWalls(p, 'a', { x: 100, z: 20 }, { grab: 30, wallId: 'w3' });
  assert.equal(r.wallId, 'w1');
  assert.equal(r.grab, 50);
  assert.equal(r.offset, 50);
  // hysteresis: nearly halfway between two walls it stays on its own wall
  r = G.dragOnWalls(p, 'a', { x: 200, z: 185 }, { grab: 30, wallId: 'w3' });
  assert.equal(r.wallId, 'w3');
  assert.ok(w3);
});

test('dragFree snaps to a 5 cm grid and stays in the room box', () => {
  const p = withPiece(base(), 't', 'table');
  assert.deepEqual(G.dragFree(p, 't', { x: 203, z: 188 }), { x: 205, z: 190 });
  assert.deepEqual(G.dragFree(p, 't', { x: 203, z: 188 }, { grab: { x: 10, z: -10 } }), { x: 195, z: 200 });
  assert.deepEqual(G.dragFree(p, 't', { x: 9000, z: -9000 }), { x: 420, z: 0 });
});

test('nudge slides along the wall for arrows that point along it, moves free pieces in x and z', () => {
  let p = withPiece(base(), 'a', 'wardrobe', { width: 100 });
  p = withPiece(p, 't', 'table');
  p = M.placePiece(p, 'a', { mode: 'wall', wallId: 'w3', offset: 50, snap: false });
  p = M.placePiece(p, 't', { mode: 'free', x: 200, z: 150, rotation: 0 });
  // wall 3 runs right to left: the Right arrow reduces the offset
  assert.deepEqual(G.nudge(p, 'a', 1, 0, 1), { offset: 49, snap: false });
  assert.deepEqual(G.nudge(p, 'a', -1, 0, 10), { offset: 60, snap: false });
  assert.equal(G.nudge(p, 'a', 0, 1, 1), null, 'down points into the wall: nothing');
  assert.deepEqual(G.nudge(p, 't', 0, -1, 10), { x: 200, z: 140, snap: false });
  assert.equal(G.nudge(p, 'zzz', 1, 0), null);
  // a nudge of 1 cm next to a wall end survives the model's own snapping when snap is false
  const q = M.movePlacement(p, 'a', { offset: 1, snap: false });
  assert.equal(pl(q, 'a').offset, 1);
  assert.equal(pl(M.movePlacement(q, 'a', { offset: 3 }), 'a').offset, 0, 'default keeps the model snapping');
  assert.equal(pl(M.movePlacement(p, 't', { rotation: 92, snap: false }), 't').rotation, 92);
  assert.equal(pl(M.movePlacement(p, 't', { rotation: 92 }), 't').rotation, 90);
});

test('cornerSpots finds the convex right-angle corners where the piece fits', () => {
  let p = withPiece(base(), 'a', 'wardrobe', { width: 100 });
  let spots = G.cornerSpots(p, 'a');
  assert.equal(spots.length, 8, 'four corners, two ways each');
  const c0 = spots.filter((s) => s.corner === 0);
  assert.deepEqual(c0.map((s) => [s.wallId, s.offset, s.end]), [['w1', 0, 'start'], ['w4', 280, 'end']]);
  // the L-shape has one reflex corner, which does not count
  const l = M.setTemplate(withPiece(base(), 'a', 'wardrobe', { width: 100 }), 'l-shape', {});
  assert.equal(G.cornerSpots(l, 'a').length, 10, 'five convex corners');
  // a piece wider than a wall cannot take that side
  p = withPiece(base(), 'w', 'wardrobe', { width: 400 });
  assert.equal(G.cornerSpots(p, 'w').length, 4, 'only the two 420 walls hold 400 cm');
  assert.deepEqual(G.cornerSpots(p, 'nope'), []);
  // every spot is flush to both walls: no validation problems for an empty room
  const q = withPiece(base(), 'a', 'wardrobe', { width: 100 });
  q.room.openings = [];
  for (const s of G.cornerSpots(q, 'a')) {
    const placed = M.placePiece(q, 'a', { mode: 'wall', wallId: s.wallId, offset: s.offset, snap: false });
    assert.deepEqual(validateProject(placed).errors.filter((e) => e.ref.type === 'placement'), [], `${s.wallId} ${s.end}`);
  }
});

test('overlapPairs and clashesByPiece mark both pieces of an overlap', () => {
  let p = withPiece(base(), 'a', 'wardrobe', { width: 100 });
  p = withPiece(p, 'b', 'wardrobe', { width: 100 });
  p = M.placePiece(p, 'a', { mode: 'wall', wallId: 'w3', offset: 0, snap: false });
  p = M.placePiece(p, 'b', { mode: 'wall', wallId: 'w3', offset: 50, snap: false });
  assert.deepEqual(G.overlapPairs(p), [['a', 'b']]);
  const v = validateProject(p);
  const by = G.clashesByPiece(p, v.errors);
  assert.deepEqual(Object.keys(by).sort(), ['a', 'b']);
  assert.equal(by.a.blocking[0].code, 'placement-overlap');
  assert.equal(by.b.blocking[0].code, 'placement-overlap');
  // touching is not overlapping
  const q = M.movePlacement(p, 'b', { offset: 100, snap: false });
  assert.deepEqual(G.overlapPairs(q), []);
  assert.deepEqual(G.clashesByPiece(q, validateProject(q).errors), {});
  // advice goes to the warn list: a free table close to a wall
  let t = withPiece(base(), 't', 'table');
  t = M.placePiece(t, 't', { mode: 'free', x: 100, z: 60, rotation: 0 });
  const tb = G.clashesByPiece(t, validateProject(t).errors);
  assert.equal(tb.t.blocking.length, 0);
  assert.equal(tb.t.warn[0].code, 'walkway');
});

test('wall units above a base cabinet do not overlap it', () => {
  let p = withPiece(base(), 'k', 'kitchen-base');
  p = withPiece(p, 'u', 'kitchen-wall');
  p = M.placePiece(p, 'k', { mode: 'wall', wallId: 'w3', offset: 100, snap: false });
  p = M.placePiece(p, 'u', { mode: 'wall', wallId: 'w3', offset: 100, snap: false });
  assert.deepEqual(G.overlapPairs(p), []);
});

test('suggestPlacement: a wardrobe goes on the longest free wall clear of openings, a table in the middle', () => {
  let p = withPiece(base(), 'a', 'wardrobe', { width: 200 });
  p = withPiece(p, 't', 'table');
  const s = G.suggestPlacement(p, 'a');
  assert.equal(s.mode, 'wall');
  const placed = M.placePiece(p, 'a', { ...s, snap: false });
  assert.deepEqual(validateProject(placed).errors.filter((e) => e.ref.type === 'placement'), []);
  // wall 1 has a window, so the first choice is a wall without one or a gap beside it; either way nothing clashes
  const t = G.suggestPlacement(p, 't');
  assert.equal(t.mode, 'free');
  const near = Math.hypot(t.x - 210, t.z - 190);
  assert.ok(near <= 40, `table close to the middle, got ${t.x},${t.z}`);
  // a second wardrobe finds a different spot
  let q = withPiece(placed, 'b', 'wardrobe', { width: 200 });
  const s2 = G.suggestPlacement(q, 'b');
  q = M.placePiece(q, 'b', { ...s2, snap: false });
  assert.deepEqual(validateProject(q).errors.filter((e) => e.ref.type === 'placement'), []);
  assert.notDeepEqual([s.wallId, s.offset], [s2.wallId, s2.offset]);
  // a piece too wide for every wall still gets a (flagged) spot instead of throwing
  const big = withPiece(base(), 'w', 'wardrobe', { width: 500 });
  const sb = G.suggestPlacement(big, 'w');
  assert.equal(sb.mode, 'wall');
  assert.equal(G.suggestPlacement(base(), 'nope').mode, 'free');
});

test('suggestPlacement keeps a tall piece off the low side of an attic', () => {
  let p = M.setTemplate(base(), 'attic', { width: 420, depth: 380, kneeHeight: 100, slopeAngle: 35, slopeWall: 1 });
  p = { ...p, room: { ...p.room, openings: [] } };
  p = withPiece(p, 'a', 'wardrobe', { width: 150, height: 230 });
  const s = G.suggestPlacement(p, 'a');
  const placed = M.placePiece(p, 'a', { ...s, snap: false });
  assert.deepEqual(validateProject(placed).errors.filter((e) => e.ref.type === 'placement'), []);
  assert.notEqual(s.wallId, 'w1', 'not under the slope');
});

test('bestCorner picks the nearest corner that is free', () => {
  let p = withPiece(base(), 'a', 'wardrobe', { width: 100 });
  p = withPiece(p, 'b', 'wardrobe', { width: 100 });
  const near = G.bestCorner(p, 'a', { x: 10, z: 10 });
  assert.equal(near.corner, 0, 'top left corner');
  assert.equal(near.bad, 0);
  // take the top-left corner with another piece, the next nearest free corner wins
  p = M.placePiece(p, 'b', { mode: 'wall', wallId: 'w1', offset: 0, snap: false });
  const next = G.bestCorner(p, 'a', { x: 10, z: 10 });
  assert.equal(next.bad, 0);
  assert.ok(!(next.corner === 0 && next.wallId === 'w1'), 'not on top of b');
  assert.equal(G.bestCorner(withPiece(base(), 'w', 'wardrobe', { width: 500 }), 'w', null), null, 'no corner holds a 500 cm piece');
});
