// Planner v2 interior helpers: pure functions for the Interior step (bay layout, free heights, divider dragging,
// grouping validation problems). No DOM and no Three.js, so Node can test them. All lengths in cm.
import {
  ITEMS, LAYOUT_T, GRID, MIN_BAY, normalizeItem, pieceGeometry, snapY, snapUp, snapDown
} from './model.js';

const r1 = (n) => Math.round(n * 10) / 10 + 0;
const TOL = 0.05;

// Where each bay's clear opening sits, measured from the piece's left edge.
export function bayLayout(piece) {
  let x = LAYOUT_T;
  return piece.bays.map((b, index) => {
    const out = { index, x0: x, x1: x + b.width, width: b.width };
    x += b.width + LAYOUT_T;
    return out;
  });
}

// The nearest bay to an x position (cm from the piece's left edge).
export function bayAt(layout, x) {
  let best = 0, bestD = Infinity;
  for (const b of layout) {
    const d = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
    if (d < bestD) { bestD = d; best = b.index; }
  }
  return best;
}

// The space an item takes up: its zone if it claims one, else its body when that has any height.
function occupied(item) {
  const d = ITEMS[item.kind];
  if (!d) return null;
  const z = d.zone(item);
  if (z) return [item.y + z[0], item.y + z[1]];
  const b = d.body(item);
  return b[1] - b[0] > 0 ? [item.y + b[0], item.y + b[1]] : null;
}

const SHELF_LIKE = new Set(['shelf', 'book-shelf']);
const TOP_LIKE = new Set(['led']);

// A free, grid-snapped height for a new item. Hanging items and LED strips are tried from the top down, everything
// else from the floor up (shelves start 32 cm up). When nothing is free the item still lands inside the bay
// (validation then says what clashes).
export function suggestY(piece, bayIndex, kind) {
  const bay = piece.bays[bayIndex];
  const def = ITEMS[kind];
  if (!bay || !def) return 0;
  const g = pieceGeometry(piece);
  const ctx = { bayWidth: bay.width, innerH: g.innerH };
  const base = normalizeItem({ kind, y: 0 }, ctx);
  if (!base) return 0;
  const [blo, bhi] = def.body(base);
  const zone = def.zone(base);
  const lo = Math.max(zone ? -zone[0] : 0, -blo, 0);
  const hi = g.innerH - bhi;
  const sLo = snapUp(lo), sHi = snapDown(hi);
  if (sLo > sHi) return base.y;
  const mine = zone || (bhi - blo > 0 ? [blo, bhi] : null);
  const others = bay.items.map(occupied).filter(Boolean);
  const free = (y) => {
    if (!mine) return true;
    const a = y + mine[0], b = y + mine[1];
    return others.every(([c, d]) => !(a < d - TOL && c < b - TOL));
  };
  const hanging = (zone && zone[0] < 0) || TOP_LIKE.has(kind);
  if (hanging) {
    for (let y = sHi; y >= sLo - TOL; y = r1(y - GRID)) if (free(y)) return Math.max(sLo, y);
  } else {
    const start = SHELF_LIKE.has(kind) ? Math.min(sHi, Math.max(sLo, snapY(32))) : sLo;
    for (let y = start; y <= sHi + TOL; y = r1(y + GRID)) if (free(y)) return y;
  }
  return base.y;
}

// Moves the divider between bay k and bay k + 1 by `delta` cm (whole cm); both bays stay at least MIN_BAY wide.
export function dragDivider(widths, k, delta) {
  const w = widths.slice();
  if (!(k >= 0 && k < w.length - 1)) return w;
  const total = w[k] + w[k + 1];
  const a = Math.min(total - MIN_BAY, Math.max(MIN_BAY, Math.round(w[k] + delta)));
  w[k] = a;
  w[k + 1] = total - a;
  return w;
}

// Sets bay k to `width` and takes the difference from its right neighbour (from the left one for the last bay).
export function resizeBay(widths, k, width) {
  const w = widths.slice();
  if (w.length < 2 || !(k >= 0 && k < w.length)) return w;
  const other = k < w.length - 1 ? k + 1 : k - 1;
  const total = w[k] + w[other];
  const a = Math.min(total - MIN_BAY, Math.max(MIN_BAY, Math.round(width)));
  w[k] = a;
  w[other] = total - a;
  return w;
}

// Moves a height by whole 32 mm steps from its nearest hole.
export function nudgeY(y, steps) {
  return snapY(snapY(y) + steps * GRID);
}

// Groups the validation errors that belong to one piece: { piece: [], bays: { 0: [] }, items: { '0:2': [] } }.
export function itemsProblems(errors, pieceId) {
  const out = { piece: [], bays: {}, items: {}, count: 0 };
  for (const e of errors || []) {
    const r = e.ref;
    if (!r) continue;
    if (r.type === 'piece' && r.id === pieceId) out.piece.push(e);
    else if (r.type === 'bay' && r.pieceId === pieceId) (out.bays[r.bay] = out.bays[r.bay] || []).push(e);
    else if (r.type === 'item' && r.pieceId === pieceId) (out.items[`${r.bay}:${r.index}`] = out.items[`${r.bay}:${r.index}`] || []).push(e);
    else continue;
    out.count++;
  }
  return out;
}
