// Planner v2 room geometry helpers: pure, no DOM, no Three.js. All lengths in cm.
// Shared by the plan editor (steps/room.js) and the 3D builder (geometry.js) so the two always agree.
import { wallsOf, wallById, ceilingHeightAt } from './model.js';

export const WALL_T = 10; // wall thickness in cm, grown outward from the room outline

// Outward mitre vector for every corner: corner i is where wall i starts. Adding it to the corner gives the
// outer corner of a wall ring that is WALL_T thick.
export function cornerOffsets(room, t = WALL_T) {
  const walls = wallsOf(room);
  const n = walls.length;
  return walls.map((w, i) => {
    const prev = walls[(i - 1 + n) % n];
    const a = prev.normal, b = w.normal;
    const denom = Math.max(0.25, 1 + a.x * b.x + a.z * b.z);
    return { x: (-(a.x + b.x) / denom) * t, z: (-(a.z + b.z) / denom) * t };
  });
}

// Each wall as a mitred quad: inner = [start, end] on the room outline, outer = [start, end] pushed out by t.
export function wallQuads(room, t = WALL_T) {
  const walls = wallsOf(room);
  const off = cornerOffsets(room, t);
  const n = walls.length;
  return walls.map((w, i) => {
    const o0 = off[i], o1 = off[(i + 1) % n];
    return {
      id: w.id, index: i, wall: w,
      inner: [{ x: w.start.x, z: w.start.z }, { x: w.end.x, z: w.end.z }],
      outer: [{ x: w.start.x + o0.x, z: w.start.z + o0.z }, { x: w.end.x + o1.x, z: w.end.z + o1.z }],
      // how far the outer face starts / ends along the wall direction compared with the inner face (cm)
      shift: [o0.x * w.dir.x + o0.z * w.dir.z, o1.x * w.dir.x + o1.z * w.dir.z]
    };
  });
}

// Point on a wall: u along the wall from its start, v into the room from the inner face.
export function wallPoint(wall, u, v = 0) {
  return { x: wall.start.x + wall.dir.x * u + wall.normal.x * v, z: wall.start.z + wall.dir.z * u + wall.normal.z * v };
}

// Ceiling height along a wall as a polyline [[u, height], ...]. Straight for a flat ceiling; an attic slope bends it.
export function ceilingProfile(room, wall) {
  const L = wall.length;
  const flat = [[0, room.height], [L, room.height]];
  if (!room.slope) return flat;
  const sw = wallById(room, room.slope.wallId);
  if (!sw) return flat;
  const depth = room.slope.depth;
  const tAt = (u) => (wall.start.x + wall.dir.x * u - sw.start.x) * sw.normal.x + (wall.start.z + wall.dir.z * u - sw.start.z) * sw.normal.z;
  const t0 = tAt(0), t1 = tAt(L);
  const us = [0, L];
  if (Math.abs(t1 - t0) > 1e-6) {
    for (const target of [0, depth]) {
      const u = ((target - t0) / (t1 - t0)) * L;
      if (u > 0.5 && u < L - 0.5) us.push(u);
    }
  }
  us.sort((a, b) => a - b);
  return us.map((u) => {
    const p = wallPoint(wall, u);
    return [u, ceilingHeightAt(room, p.x, p.z)];
  });
}

// Lowest ceiling between two positions along a wall.
export function minCeiling(profile, u0, u1) {
  const at = (u) => {
    for (let i = 1; i < profile.length; i++) {
      const [ua, ha] = profile[i - 1], [ub, hb] = profile[i];
      if (u <= ub + 1e-9) return ub === ua ? ha : ha + ((hb - ha) * (u - ua)) / (ub - ua);
    }
    return profile[profile.length - 1][1];
  };
  let m = Math.min(at(u0), at(u1));
  for (const [u, h] of profile) if (u > u0 && u < u1) m = Math.min(m, h);
  return m;
}

export function roomBounds(room) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of room.walls) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

// The main template measurements that can be dragged on the plan. `wall` is the wall index (0-based) whose
// midpoint carries the handle, `axis` the plan axis it moves along, `factor` how many cm of the measurement
// one cm of movement is worth (a bay is symmetric, so its width changes twice as fast) and `sign` its direction.
export const PLAN_HANDLES = {
  rect: [
    { param: 'width', wall: 1, axis: 'x', sign: 1 },
    { param: 'depth', wall: 2, axis: 'z', sign: 1 }
  ],
  'l-shape': [
    { param: 'lengthA', wall: 1, axis: 'x', sign: 1 },
    { param: 'widthA', wall: 2, axis: 'z', sign: 1 },
    { param: 'widthB', wall: 3, axis: 'x', sign: 1 },
    { param: 'lengthB', wall: 4, axis: 'z', sign: 1 }
  ],
  alcoves: [
    { param: 'width', wall: 5, axis: 'x', sign: 1 },
    { param: 'depth', wall: 6, axis: 'z', sign: 1 },
    { param: 'breastOffset', wall: 1, axis: 'x', sign: 1 },
    { param: 'breastWidth', wall: 3, axis: 'x', sign: 1 },
    { param: 'breastDepth', wall: 2, axis: 'z', sign: 1 }
  ],
  attic: [
    { param: 'width', wall: 1, axis: 'x', sign: 1 },
    { param: 'depth', wall: 2, axis: 'z', sign: 1 }
  ],
  hallway: [
    { param: 'length', wall: 1, axis: 'x', sign: 1 },
    { param: 'width', wall: 2, axis: 'z', sign: 1 }
  ],
  bay: [
    { param: 'width', wall: 5, axis: 'x', sign: 1 },
    { param: 'depth', wall: 6, axis: 'z', sign: 1 },
    { param: 'bayWidth', wall: 3, axis: 'x', sign: 1, factor: 2 },
    { param: 'bayDepth', wall: 0, axis: 'z', sign: 1 }
  ]
};

export const snapTo = (v, step) => Math.round(v / step) * step;
