// "Fit to wall" and "Fit to ceiling": pure helpers for the Furniture step. All lengths in cm.
import { TYPES, wallsOf, wallById, footprintOf, ceilingHeightAt, defaultElevation, SCRIBE } from './model.js';
import { blockedRanges } from './place-geom.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The free stretch of a wall around a piece (or the largest one when it is not there yet): { wallId, from, to, length }.
// Other pieces at the same height and doors, windows and radiators (unless the piece cuts around them) end the stretch.
export function freeSpan(project, pieceId, wallId) {
  const piece = project.pieces.find((p) => p.id === pieceId);
  if (!piece) return null;
  const pl = project.placements.find((p) => p.pieceId === pieceId);
  const walls = wallsOf(project.room);
  const wall = (pl && pl.mode === 'wall' && wallById(project.room, pl.wallId)) || (wallId && wallById(project.room, wallId))
    || walls.reduce((m, w) => (!m || w.length > m.length ? w : m), null);
  if (!wall) return null;
  const elev = pl ? pl.elevation : defaultElevation(piece);
  // blockedRanges are offsets of the piece's left end; an obstacle itself runs from lo + width to hi
  const obstacles = blockedRanges(project, piece, wall, elev).map((r) => [r.lo + piece.width, r.hi]).sort((a, b) => a[0] - b[0]);
  const spans = [];
  let at = 0;
  for (const [a, b] of obstacles) {
    if (a > at) spans.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < wall.length) spans.push([at, wall.length]);
  if (!spans.length) return { wallId: wall.id, from: 0, to: 0, length: 0 };
  let best = spans[0];
  if (pl && pl.mode === 'wall') {
    const mid = pl.offset + piece.width / 2;
    best = spans.find(([a, b]) => mid >= a && mid <= b) || spans.reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m));
  } else {
    best = spans.reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m));
  }
  return { wallId: wall.id, from: Math.ceil(best[0] - 1e-9) + 0, to: Math.floor(best[1] + 1e-9), length: Math.floor(best[1] + 1e-9) - Math.ceil(best[0] - 1e-9) };
}

// The width (and, if placed, the offset) that fills the free stretch, within the type's limits.
export function fitToWall(project, pieceId, wallId) {
  const piece = project.pieces.find((p) => p.id === pieceId);
  const span = piece && freeSpan(project, pieceId, wallId);
  if (!piece || !span || span.length <= 0) return null;
  const L = TYPES[piece.type].limits.width;
  const width = clamp(span.length, L[0], L[1]);
  const placed = project.placements.find((p) => p.pieceId === pieceId);
  return { wallId: span.wallId, width, offset: span.from, placed: !!placed, exact: span.length >= L[0] && span.length <= L[1], span };
}

// The tallest height that fits under the ceiling above the piece, less a little room to scribe.
export function fitToCeiling(project, pieceId) {
  const piece = project.pieces.find((p) => p.id === pieceId);
  if (!piece) return null;
  const pl = project.placements.find((p) => p.pieceId === pieceId);
  const room = project.room;
  const elev = pl ? pl.elevation : defaultElevation(piece);
  let ceiling = room.height;
  const fp = pl ? footprintOf(project, pl) : null;
  if (fp) ceiling = Math.min(...fp.corners.map((c) => ceilingHeightAt(room, c.x, c.z)));
  const allowance = piece.look && piece.look.scribe ? SCRIBE.top - 1 : 0.5;
  const L = TYPES[piece.type].limits.height;
  const height = clamp(Math.floor(ceiling - elev - allowance), L[0], L[1]);
  return { height, ceiling, exact: Math.floor(ceiling - elev - allowance) >= L[0] && Math.floor(ceiling - elev - allowance) <= L[1], placed: !!pl };
}
