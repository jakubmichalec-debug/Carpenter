// The neutral studio the pieces stand in: pure layout (no DOM, no Three.js), so Node can test it. The planner knows no room.
// Pieces stand side by side with a small gap, in a row along a back wall; tables and islands (the types that stand on their
// own) form a second row in front. A floor and a back wall, sized to the pieces, close the scene. All lengths in cm; the 3D
// scene turns them into metres. x runs right, z out of the wall toward the camera, y up. The wall is the plane z = 0.
import { TYPES, defaultElevation, pieceLabel } from './model.js';

export const STUDIO = {
  gap: 30,          // between neighbouring pieces in a row
  side: 360,        // floor and wall beyond the outer pieces, so the edges stay out of the picture
  front: 260,       // floor in front of the front row
  freeGap: 80,      // between the back row and the free-standing row (or the wall, when only tables are there)
  wallAbove: 140,   // wall above the tallest piece
  wallMin: 300,     // never a lower wall than this
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

// The pose that shows everything (metres): used by the live viewer's first view and by the "All pieces" preset. The camera
// stands in front, a little to the left and above the middle, and backs off until every corner of every piece is inside the
// picture with some air around it (worked out by projecting the corners, so a tall wardrobe and a long row both fit).
export function overviewPose(layout, { aspect = 1.5, fov = 36, fill = 0.74 } = {}) {
  const M = 0.01;
  const items = layout.items;
  const half = [(layout.extent / 2) * M, 0, 0];
  const top = Math.max(...items.map((i) => i.lift + i.h), 100) * M;
  const depth = (items.length ? Math.max(...items.map((i) => i.z + i.d)) : 100) * M;
  const target = [half[0], top * 0.46, depth * 0.45];
  const az = -0.32, polar = 1.28; // a little from the left and above
  const dir = [Math.sin(az) * Math.sin(polar), Math.cos(polar), Math.cos(az) * Math.sin(polar)];
  const th = Math.tan((fov * Math.PI) / 360);
  // camera basis for a camera at target + dir * d looking at the target
  const f = dir.map((v) => -v);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const corners = [];
  for (const it of items) {
    for (const x of [it.x, it.x + it.w]) for (const y of [it.lift, it.lift + it.h]) for (const z of [it.z, it.z + it.d]) corners.push([x * M, y * M, z * M]);
  }
  if (!corners.length) corners.push([0, 0, 0], [1, 2, 0.6]);
  const fits = (d) => {
    const pos = target.map((t, i) => t + dir[i] * d);
    for (const c of corners) {
      const v = c.map((x, i) => x - pos[i]);
      const z = dot(v, f);
      if (z < 0.2) return false;
      if (Math.abs(dot(v, right)) / (z * th * aspect) > fill || Math.abs(dot(v, up)) / (z * th) > fill) return false;
    }
    return true;
  };
  let lo = 0.8, hi = 60;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  const dist = Math.max(2.2, hi);
  return { position: target.map((t, i) => t + dir[i] * dist), target };
}
