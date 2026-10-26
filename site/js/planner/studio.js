// The neutral studio the pieces stand in: pure layout (no DOM, no Three.js), so Node can test it. The planner knows no room.
// Pieces stand side by side with a small gap, in a row along a back wall; tables and islands (the types that stand on their
// own) form a second row in front. A floor and a back wall, sized to the pieces, close the scene. All lengths in cm; the 3D
// scene turns them into metres. x runs right, z out of the wall toward the camera, y up. The wall is the plane z = 0.
import { TYPES, defaultElevation, pieceLabel } from './model.js';

export const STUDIO = {
  gap: 30,          // between neighbouring pieces in a row
  side: 100,        // floor and wall beyond the outer pieces
  front: 120,       // floor in front of the front row
  freeGap: 80,      // between the back row and the free-standing row (or the wall, when only tables are there)
  wallAbove: 70,    // wall above the tallest piece
  wallMin: 250,     // never a lower wall than this
  cove: 25          // radius of the curve where the floor meets the wall
};

// Placement of every piece: { items: [{ pieceId, x, z, lift, w, h, d, free }], extent, floor, wall, bounds }.
//   x, z: the piece's left-back corner (cm); lift: its height above the floor (a wall unit hangs).
//   floor: { x0, x1, z1 } the floor runs from the wall (z = 0) to z1; wall: { x0, x1, height }.
//   bounds: the box around everything that is drawn, { minX, maxX, minZ, maxZ, maxY }.
export function layoutStudio(project) {
  const pieces = ((project && project.pieces) || []).filter((p) => p && TYPES[p.type]);
  const along = [], free = [];
  for (const p of pieces) (TYPES[p.type].freestanding ? free : along).push(p);
  const rowWidth = (row) => (row.length ? row.reduce((s, p) => s + p.width, 0) + STUDIO.gap * (row.length - 1) : 0);
  const extent = Math.max(rowWidth(along), rowWidth(free));
  const items = [];
  const place = (row, z) => {
    let x = (extent - rowWidth(row)) / 2;
    for (const p of row) {
      items.push({ pieceId: p.id, x, z, lift: defaultElevation(p), w: p.width, h: p.height, d: p.depth, free: row === free });
      x += p.width + STUDIO.gap;
    }
  };
  place(along, 0);
  const backDepth = along.reduce((m, p) => Math.max(m, p.depth), 0);
  place(free, backDepth + STUDIO.freeGap);
  // keep the original order of the project in the list
  items.sort((a, b) => pieces.findIndex((p) => p.id === a.pieceId) - pieces.findIndex((p) => p.id === b.pieceId));

  const zEnd = items.reduce((m, it) => Math.max(m, it.z + it.d), 0);
  const top = items.reduce((m, it) => Math.max(m, it.lift + it.h), 0);
  const x0 = -STUDIO.side, x1 = extent + STUDIO.side;
  const z1 = zEnd + STUDIO.front;
  const wallHeight = Math.max(STUDIO.wallMin, Math.round(top + STUDIO.wallAbove));
  return {
    items, extent,
    floor: { x0, x1, z1 },
    wall: { x0, x1, height: wallHeight },
    bounds: { minX: x0, maxX: x1, minZ: 0, maxZ: z1, maxY: wallHeight },
    empty: !items.length
  };
}

export const itemOf = (layout, pieceId) => layout.items.find((it) => it.pieceId === pieceId) || null;

// The camera presets of the Review step: the whole set, and the front of each piece.
export function presetList(project) {
  const pieces = ((project && project.pieces) || []).filter((p) => p && TYPES[p.type]);
  if (!pieces.length) return [];
  const list = [{ id: 'all', label: pieces.length > 1 ? 'All pieces' : 'Overview' }];
  for (const p of pieces) list.push({ id: `front:${p.id}`, label: `Front of ${pieceLabel(project, p.id)}` });
  return list;
}

// The camera for "Front of <piece>" (metres): in front of the piece, far enough to frame it, a little above its middle.
export function frontPose(layout, pieceId, { aspect = 1.5, fov = 36 } = {}) {
  const it = itemOf(layout, pieceId);
  if (!it) return null;
  const M = 0.01;
  const th = Math.tan((fov * Math.PI) / 360);
  const wM = it.w * M, hM = it.h * M, dM = it.d * M, lift = it.lift * M;
  const need = Math.max((wM / 2) * 1.2 / (th * Math.max(0.6, aspect)), ((hM + lift * 0.3) / 2) * 1.2 / th);
  const dist = Math.min(Math.max(need + dM / 2, 1.4), 9);
  const ty = Math.min(Math.max(lift + hM / 2, 0.45), 1.3);
  const cy = Math.min(Math.max(ty + 0.15, 0.9), 1.6);
  const target = [(it.x + it.w / 2) * M, ty, (it.z + it.d / 2) * M];
  return { position: [target[0], cy, (it.z + it.d) * M + dist - dM / 2], target };
}

// The pose that shows everything (metres): used by the live viewer's first view and by the "All pieces" preset.
export function overviewPose(layout, { aspect = 1.5, fov = 36 } = {}) {
  const M = 0.01;
  const b = layout.bounds;
  const cx = ((b.minX + b.maxX) / 2) * M, cz = (layout.items.length ? Math.max(...layout.items.map((i) => i.z + i.d)) / 2 : 100) * M;
  const topM = Math.max(...layout.items.map((i) => i.lift + i.h), 100) * M;
  const halfW = (layout.extent / 2 + STUDIO.side * 0.55) * M;
  const th = Math.tan((fov * Math.PI) / 360);
  const dist = Math.max(2.4, Math.max(halfW / (th * Math.max(0.6, aspect)), (topM / 2) * 1.35 / th) + 0.9);
  const target = [cx, topM * 0.45, cz];
  const az = -0.38, polar = 1.2; // a little from the left and above
  const position = [
    target[0] + Math.sin(az) * Math.sin(polar) * dist,
    target[1] + Math.cos(polar) * dist,
    target[2] + Math.cos(az) * Math.sin(polar) * dist
  ];
  return { position, target };
}
