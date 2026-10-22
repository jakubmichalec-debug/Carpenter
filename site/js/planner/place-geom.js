// Planner v2 placement helpers (step 4): pure, no DOM, no Three.js. All lengths in cm, plan coordinates (x right, z down).
// The model's own placePiece already snaps a little (wall ends, neighbours, right angles). These helpers add what a
// drag needs on top: following the nearest wall, snapping clear of doors and windows, finding a free spot, corners.
import { TYPES, wallsOf, wallById, footprintOf, placePiece } from './model.js';
import { ceilingProfile, minCeiling, roomBounds } from './plan-geom.js';
import { validateProject } from './validate.js';

const EPS = 1e-6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pieceOf = (project, id) => project.pieces.find((p) => p.id === id) || null;
const placementOf = (project, id) => project.placements.find((p) => p.pieceId === id) || null;
// Things on a wall that a piece must not stand in front of (a socket is fine, a radiator only with a cut-out).
const blocksPiece = (o, piece) => o.type === 'door' || o.type === 'window' || (o.type === 'radiator' && !piece.radiatorCutout);
const vOverlap = (a0, a1, b0, b1) => a0 < b1 - EPS && b0 < a1 - EPS;

export const snapRotation = (deg, step = 15) => (((Math.round((Number(deg) || 0) / step) * step) % 360) + 360) % 360;

// A point in wall space: u along the wall from its start, v into the room from its inner face.
export function projectOnWall(wall, pt) {
  const dx = pt.x - wall.start.x, dz = pt.z - wall.start.z;
  return { u: dx * wall.dir.x + dz * wall.dir.z, v: dx * wall.normal.x + dz * wall.normal.z };
}

export function nearestWall(room, pt, walls = wallsOf(room)) {
  let best = null;
  for (const wall of walls) {
    const { u, v } = projectOnWall(wall, pt);
    const dist = Math.hypot(u - clamp(u, 0, wall.length), v);
    if (!best || dist < best.dist) best = { wall, u, v, dist };
  }
  return best;
}

// Offsets (of the piece's left end) that put the piece in front of another piece or an opening on the same wall.
function blockedRanges(project, piece, wall, elevation) {
  const top = elevation + piece.height;
  const out = [];
  for (const pl of project.placements) {
    if (pl.pieceId === piece.id || pl.mode !== 'wall' || pl.wallId !== wall.id) continue;
    const other = pieceOf(project, pl.pieceId);
    if (!other || !vOverlap(elevation, top, pl.elevation, pl.elevation + other.height)) continue;
    out.push({ lo: pl.offset - piece.width, hi: pl.offset + other.width, kind: 'piece' });
  }
  for (const o of project.room.openings) {
    if (o.wallId !== wall.id || !blocksPiece(o, piece)) continue;
    if (!vOverlap(elevation, top, o.bottom, o.bottom + o.height)) continue;
    out.push({ lo: o.offset - piece.width, hi: o.offset + o.width, kind: 'opening' });
  }
  return out;
}

// Snaps the left end of a piece along a wall to the wall ends, to the pieces beside it and to the edges of openings
// (so it sits clear of a door or a window). `dist` is how close, in cm, counts as near.
export function snapWallOffset(project, pieceId, wallId, offset, { dist = 6, elevation } = {}) {
  const piece = pieceOf(project, pieceId), wall = wallById(project.room, wallId);
  if (!piece || !wall) return { offset: Math.round(offset), snap: null };
  const pl = placementOf(project, pieceId);
  const elev = elevation !== undefined ? elevation : pl ? pl.elevation : TYPES[piece.type].defaults.elevation;
  const max = Math.max(0, Math.floor(wall.length - piece.width + EPS));
  const cands = [{ at: 0, kind: 'start' }, { at: wall.length - piece.width, kind: 'end' }];
  for (const r of blockedRanges(project, piece, wall, elev)) {
    cands.push({ at: r.hi, kind: r.kind }, { at: r.lo, kind: r.kind });
  }
  let best = null;
  for (const c of cands) {
    if (c.at < -EPS || c.at > max + 1 + EPS) continue;
    const d = Math.abs(c.at - offset);
    if (d <= dist && (!best || d < best.d)) best = { ...c, d };
  }
  if (best) return { offset: clamp(Math.round(best.at), 0, max), snap: best.kind };
  return { offset: clamp(Math.round(offset), 0, max), snap: null };
}

// A wall piece follows the wall nearest to the pointer. `grab` is where on the piece (cm from its left end) the
// pointer holds it; it changes to the middle when the piece jumps to another wall. `hysteresis` stops it flicking
// between two walls near a corner.
export function dragOnWalls(project, pieceId, pt, { grab = 0, wallId = null, dist = 6, grid = 5, hysteresis = 15 } = {}) {
  const piece = pieceOf(project, pieceId);
  const walls = wallsOf(project.room);
  if (!piece || !walls.length) return null;
  const near = nearestWall(project.room, pt, walls);
  let wall = walls.find((w) => w.id === wallId) || null;
  let g = grab;
  if (wall) {
    const { u, v } = projectOnWall(wall, pt);
    const curDist = Math.hypot(u - clamp(u, 0, wall.length), v);
    if (near.wall.id !== wall.id && near.dist < curDist - hysteresis) wall = null;
  }
  if (!wall) { wall = near.wall; g = Math.min(piece.width / 2, wall.length / 2); }
  const raw = projectOnWall(wall, pt).u - g;
  const snapped = snapWallOffset(project, pieceId, wall.id, raw, { dist });
  const max = Math.max(0, Math.floor(wall.length - piece.width + EPS));
  const offset = snapped.snap ? snapped.offset : clamp(Math.round(raw / grid) * grid, 0, max);
  return { wallId: wall.id, offset, grab: g, snap: snapped.snap };
}

export function dragFree(project, pieceId, pt, { grab = { x: 0, z: 0 }, grid = 5 } = {}) {
  const b = roomBounds(project.room);
  const x = clamp(Math.round((pt.x - grab.x) / grid) * grid, b.minX, b.maxX);
  const z = clamp(Math.round((pt.z - grab.z) / grid) * grid, b.minZ, b.maxZ);
  return { x, z };
}

// Arrow keys. (dx, dz) is the screen direction. A wall piece slides along its wall when the arrow points along it;
// a free piece moves in x and z. Returns a patch for place/move, or null when the arrow does nothing.
export function nudge(project, pieceId, dx, dz, step = 1) {
  const pl = placementOf(project, pieceId);
  if (!pl) return null;
  if (pl.mode === 'free') return { x: pl.x + dx * step, z: pl.z + dz * step, snap: false };
  const wall = wallById(project.room, pl.wallId);
  if (!wall) return null;
  const dot = dx * wall.dir.x + dz * wall.dir.z;
  if (Math.abs(dot) < 0.5) return null;
  return { offset: pl.offset + Math.sign(dot) * step, snap: false };
}

// Closest offset to `prefer` where the piece clears every opening and every other piece on that wall, or null.
export function freeSpotOnWall(project, pieceId, wallId, prefer = 0, elevation) {
  const piece = pieceOf(project, pieceId), wall = wallById(project.room, wallId);
  if (!piece || !wall) return null;
  const pl = placementOf(project, pieceId);
  const elev = elevation !== undefined ? elevation : pl ? pl.elevation : TYPES[piece.type].defaults.elevation;
  const max = Math.floor(wall.length - piece.width + EPS);
  if (max < 0) return null;
  let spans = [[0, max]];
  for (const r of blockedRanges(project, piece, wall, elev)) {
    const next = [];
    for (const [a, b] of spans) {
      if (a <= Math.min(b, r.lo)) next.push([a, Math.min(b, r.lo)]);
      if (Math.max(a, r.hi) <= b) next.push([Math.max(a, r.hi), b]);
    }
    spans = next;
  }
  let best = null;
  for (const [a0, b0] of spans) {
    const a = Math.ceil(a0 - 1e-9), b = Math.floor(b0 + 1e-9);
    if (a > b) continue;
    const at = clamp(Math.round(prefer), a, b);
    if (best === null || Math.abs(at - prefer) < Math.abs(best - prefer)) best = at;
  }
  return best;
}

// ---------- problems ----------
// Penetration depth of two convex polygons (SAT); <= 0 means they do not overlap.
function penetration(A, B) {
  let min = Infinity;
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      let nx = q.z - p.z, nz = p.x - q.x;
      const l = Math.hypot(nx, nz);
      if (!l) continue;
      nx /= l; nz /= l;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of A) { const d = v.x * nx + v.z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const v of B) { const d = v.x * nx + v.z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      min = Math.min(min, Math.min(a1, b1) - Math.max(a0, b0));
    }
  }
  return min;
}

// Pairs of placed pieces that overlap (same test as the validation rule `placement-overlap`).
export function overlapPairs(project) {
  const placed = [];
  for (const pl of project.placements) {
    const piece = pieceOf(project, pl.pieceId), fp = footprintOf(project, pl);
    if (piece && fp) placed.push({ id: piece.id, poly: fp.corners, lo: pl.elevation || 0, hi: (pl.elevation || 0) + piece.height });
  }
  const out = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (a.lo < b.hi - 0.5 && b.lo < a.hi - 0.5 && penetration(a.poly, b.poly) > 0.5) out.push([a.id, b.id]);
    }
  }
  return out;
}

// Placement errors grouped by piece: { [pieceId]: { blocking: [{ code, message }], warn: [...] } }. Both pieces of an
// overlap get it, although validation reports it on one of them.
export function clashesByPiece(project, errors) {
  const out = {};
  const add = (id, e) => {
    const g = out[id] || (out[id] = { blocking: [], warn: [] });
    (e.blocking ? g.blocking : g.warn).push({ code: e.code, message: e.message });
  };
  let pairs = null;
  for (const e of errors || []) {
    if (!e.ref || e.ref.type !== 'placement' || !e.ref.pieceId) continue;
    add(e.ref.pieceId, e);
    if (e.code === 'placement-overlap') {
      pairs = pairs || overlapPairs(project);
      for (const [a, b] of pairs) {
        if (a === e.ref.pieceId) add(b, e);
        else if (b === e.ref.pieceId) add(a, e);
      }
    }
  }
  return out;
}

// Number of problems a placement would have for this piece (blocking ones, and advice when `strict`).
function problemsOf(project, pieceId, spec, strict = false) {
  const next = placePiece(project, pieceId, { ...spec, snap: false });
  const errs = validateProject(next).errors.filter((e) => e.ref && e.ref.type === 'placement');
  const map = clashesByPiece(next, errs)[pieceId];
  return map ? map.blocking.length + (strict ? map.warn.length : 0) : 0;
}

// ---------- corners and a first spot ----------
// Convex 90 degree corners where the piece sits flush against both walls. Corner i is where wall i starts. At each
// one the piece can stand with its back to the wall that starts there ('start', left end in the corner) or to the
// wall that ends there ('end', right end in the corner).
export function cornerSpots(project, pieceId) {
  const piece = pieceOf(project, pieceId);
  if (!piece) return [];
  const walls = wallsOf(project.room);
  const n = walls.length;
  const out = [];
  walls.forEach((cur, i) => {
    const prev = walls[(i - 1 + n) % n];
    const cross = prev.dir.x * cur.dir.z - prev.dir.z * cur.dir.x;
    const dot = prev.dir.x * cur.dir.x + prev.dir.z * cur.dir.z;
    if (cross < 0.98 || Math.abs(dot) > 0.05) return;
    if (cur.length >= piece.width - EPS) out.push({ wallId: cur.id, offset: 0, end: 'start', corner: i });
    if (prev.length >= piece.width - EPS) out.push({ wallId: prev.id, offset: Math.max(0, Math.floor(prev.length - piece.width + EPS)), end: 'end', corner: i });
  });
  return out;
}

function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// Where a piece goes when the user presses Place: free-standing types in the middle of the floor, the rest against
// the longest wall where they fit, at the first spot that clashes with nothing. Never fails; the worst case is a spot
// that validation will flag.
export function suggestPlacement(project, pieceId) {
  const piece = pieceOf(project, pieceId);
  const room = project.room;
  const walls = wallsOf(room);
  if (!piece || !walls.length) return { mode: 'free', x: 0, z: 0, rotation: 0 };
  const T = TYPES[piece.type];
  if (T.freestanding) {
    const b = roomBounds(room);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const poly = room.walls;
    const spots = [];
    for (let x = b.minX; x <= b.maxX; x += 20) for (let z = b.minZ; z <= b.maxZ; z += 20) if (inPoly({ x, z }, poly)) spots.push({ x, z, d: Math.hypot(x - cx, z - cz) });
    spots.sort((p, q) => p.d - q.d);
    const tried = spots.slice(0, 60).map((s) => ({ mode: 'free', x: Math.round(s.x), z: Math.round(s.z), rotation: 0 }));
    const clean = tried.find((s) => problemsOf(project, pieceId, s, true) === 0);
    if (clean) return clean;
    const ok = tried.find((s) => problemsOf(project, pieceId, s) === 0);
    return ok || tried[0] || { mode: 'free', x: Math.round(cx), z: Math.round(cz), rotation: 0 };
  }
  const top = T.defaults.elevation + piece.height;
  const roomy = (w) => w.length >= piece.width - EPS;
  const lowEnough = (w) => minCeiling(ceilingProfile(room, w), 0, w.length) >= top - 0.5;
  const order = [...walls].sort((a, b) => (roomy(b) - roomy(a)) || (lowEnough(b) - lowEnough(a)) || (b.length - a.length));
  for (const w of order) {
    if (!roomy(w)) continue;
    const spot = freeSpotOnWall(project, pieceId, w.id, 0, T.defaults.elevation);
    if (spot === null) continue;
    const spec = { mode: 'wall', wallId: w.id, offset: spot, elevation: T.defaults.elevation };
    if (problemsOf(project, pieceId, spec) === 0) return spec;
  }
  const w = order[0];
  return { mode: 'wall', wallId: w.id, offset: 0, elevation: T.defaults.elevation };
}
