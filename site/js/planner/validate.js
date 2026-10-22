// Planner v2 validation: pure, never throws. Rules follow docs/PLANNER.md; codes are listed in CONTRACTS.md.
import {
  ITEMS, TYPES, GRID, MIN_BAY, wallsOf, signedArea, footprintOf, ceilingHeightAt, pieceGeometry, pieceLabel, describeItem
} from './model.js';

const TOL = 0.5;       // cm of touching we forgive
const WALKWAY = 60;    // cm to walk past a free-standing piece
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- geometry ----------
const cross = (ax, az, bx, bz) => ax * bz - az * bx;
function segsIntersect(a, b, c, d) {
  const o1 = cross(b.x - a.x, b.z - a.z, c.x - a.x, c.z - a.z);
  const o2 = cross(b.x - a.x, b.z - a.z, d.x - a.x, d.z - a.z);
  const o3 = cross(d.x - c.x, d.z - c.z, a.x - c.x, a.z - c.z);
  const o4 = cross(d.x - c.x, d.z - c.z, b.x - c.x, b.z - c.z);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  const on = (p, q, r) => Math.min(p.x, q.x) - 1e-9 <= r.x && r.x <= Math.max(p.x, q.x) + 1e-9 && Math.min(p.z, q.z) - 1e-9 <= r.z && r.z <= Math.max(p.z, q.z) + 1e-9;
  if (o1 === 0 && on(a, b, c)) return true;
  if (o2 === 0 && on(a, b, d)) return true;
  if (o3 === 0 && on(c, d, a)) return true;
  if (o4 === 0 && on(c, d, b)) return true;
  return false;
}
function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}
function segSegDist(a, b, c, d) {
  if (segsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function distToPolyEdges(p, poly) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, pointSegDist(p, poly[i], poly[(i + 1) % poly.length]));
  return m;
}
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
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return o;
      min = Math.min(min, o);
    }
  }
  return min;
}
function polyDistance(A, B) {
  let m = Infinity;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      m = Math.min(m, segSegDist(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length]));
    }
  }
  return m;
}

// ---------- the validator ----------
export function validateProject(project) {
  const errors = [];
  const add = (code, message, ref, blocking = true) => errors.push({ code, message, ref, blocking });
  const guard = (fn) => { try { fn(); } catch (e) { add('validation-failed', `Could not check part of the project: ${e && e.message}`, { type: 'room' }, false); } };

  const done = () => ({
    ok: !errors.some((e) => e.blocking), errors,
    blocking: errors.filter((e) => e.blocking), warnings: errors.filter((e) => !e.blocking)
  });
  if (!project || typeof project !== 'object' || !project.room || typeof project.room !== 'object') {
    add('project-invalid', 'This is not a planner project.', { type: 'room' });
    return done();
  }
  const room = project.room;
  const pieces = Array.isArray(project.pieces) ? project.pieces : [];
  const placements = Array.isArray(project.placements) ? project.placements : [];
  let walls = [];

  guard(() => checkRoom());
  guard(() => pieces.forEach((p) => checkPiece(p)));
  guard(() => checkPlacements());
  return done();

  // ----- room -----
  function checkRoom() {
    const corners = Array.isArray(room.walls) ? room.walls : [];
    if (corners.length < 3 || corners.some((c) => !c || !isNum(c.x) || !isNum(c.z))) {
      add('room-too-few-walls', 'A room needs at least 3 walls with valid corners.', { type: 'room' });
      return;
    }
    walls = wallsOf(room);
    walls.forEach((w) => {
      if (w.length < 10) add('room-wall-degenerate', `Wall ${w.id} is shorter than 10 cm.`, { type: 'room' });
    });
    if (signedArea(room) <= 0) add('room-not-clockwise', 'The corners must run clockwise (x right, z down).', { type: 'room' });
    const n = walls.length;
    let crossing = false;
    for (let i = 0; i < n && !crossing; i++) {
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        if (segsIntersect(walls[i].start, walls[i].end, walls[j].start, walls[j].end)) {
          add('room-self-intersects', `Wall ${walls[i].id} crosses wall ${walls[j].id}.`, { type: 'room' });
          crossing = true;
          break;
        }
      }
    }
    const ops = Array.isArray(room.openings) ? room.openings : [];
    ops.forEach((o) => {
      const ref = { type: 'opening', id: o.id };
      const wall = walls.find((w) => w.id === o.wallId);
      if (!wall) { add('opening-off-wall', `The ${o.type} is on a wall that no longer exists.`, ref); }
      else if (!isNum(o.offset) || !isNum(o.width) || o.offset < -TOL || o.offset + o.width > wall.length + TOL) {
        add('opening-off-wall', `The ${o.type} does not fit on wall ${wall.id} (${Math.round(wall.length)} cm).`, ref);
      }
      if (isNum(room.height) && o.bottom + o.height > room.height + TOL) {
        add('opening-too-tall', `The ${o.type} reaches above the ${room.height} cm ceiling.`, ref);
      }
    });
    for (let i = 0; i < ops.length; i++) {
      for (let j = i + 1; j < ops.length; j++) {
        const a = ops[i], b = ops[j];
        if (a.wallId !== b.wallId) continue;
        if (a.offset < b.offset + b.width - TOL && b.offset < a.offset + a.width - TOL
          && a.bottom < b.bottom + b.height - TOL && b.bottom < a.bottom + a.height - TOL) {
          add('opening-overlap', `The ${a.type} and the ${b.type} on wall ${a.wallId} overlap.`, { type: 'opening', id: b.id });
        }
      }
    }
  }

  // ----- pieces -----
  function hasDoor(piece, bay) {
    const k = piece.fronts && piece.fronts.kind;
    if (k === 'sliding') return true;
    if (k === 'hinged' || k === 'glass') return bay.door && bay.door !== 'none';
    return false;
  }

  function checkPiece(piece) {
    const pref = { type: 'piece', id: piece && piece.id };
    if (!piece || !TYPES[piece.type]) { add('piece-type-unknown', `Unknown piece type "${piece && piece.type}".`, pref); return; }
    const T = TYPES[piece.type];
    const name = pieceLabel(project, piece.id);
    for (const dim of ['width', 'height', 'depth']) {
      const [lo, hi] = T.limits[dim];
      if (!isNum(piece[dim]) || piece[dim] < lo || piece[dim] > hi) {
        add('piece-size', `${name}: ${dim} must be ${lo} to ${hi} cm.`, pref);
      }
    }
    const bays = Array.isArray(piece.bays) ? piece.bays : [];
    if (bays.length < T.limits.bays[0] || bays.length > T.limits.bays[1]) {
      add('bays-count', `${name}: ${T.label.toLowerCase()} takes ${T.limits.bays[0]} to ${T.limits.bays[1]} bays.`, pref);
    }
    if (!bays.length || !isNum(piece.width) || !isNum(piece.height)) return;
    const g = pieceGeometry(piece, bays.length);
    const sum = bays.reduce((s, b) => s + (isNum(b.width) ? b.width : 0), 0);
    if (Math.abs(sum - g.innerW) > TOL) {
      add('bays-width', `${name}: bay widths add up to ${sum} cm but the inside is ${g.innerW} cm wide.`, pref);
    }
    bays.forEach((bay, bi) => {
      const bref = { type: 'bay', pieceId: piece.id, bay: bi };
      if (!isNum(bay.width) || bay.width < MIN_BAY) add('bays-width', `${name}, bay ${bi + 1}: narrower than ${MIN_BAY} cm.`, bref);
      checkItems(piece, name, bay, bi, g);
    });
  }

  function checkItems(piece, name, bay, bi, g) {
    const T = TYPES[piece.type];
    const items = Array.isArray(bay.items) ? bay.items : [];
    const where = `${name}, bay ${bi + 1}`;
    const zones = [];
    items.forEach((it, ii) => {
      const ref = { type: 'item', pieceId: piece.id, bay: bi, index: ii };
      const def = it && ITEMS[it.kind];
      if (!def) { add('item-unknown', `${where}: unknown item "${it && it.kind}".`, ref); return; }
      const label = describeItem(it);
      if (!T.palette.includes(it.kind)) add('item-not-allowed', `${where}: ${label.toLowerCase()} is not offered for a ${T.label.toLowerCase()}.`, ref, false);
      if (!isNum(it.y)) { add('item-outside-bay', `${where}: ${label.toLowerCase()} has no height.`, ref); return; }
      const [blo, bhi] = def.body(it);
      if (it.y + blo < -0.05 || it.y + bhi > g.innerH + 0.05) {
        add('item-outside-bay', `${where}: ${label.toLowerCase()} sticks out of the bay (inside height ${g.innerH} cm).`, ref);
      }
      const zone = def.zone(it);
      if (zone) {
        if (it.y + zone[0] < -0.05) {
          add('item-clearance', `${where}: ${label.toLowerCase()} needs ${Math.round(-zone[0])} cm of free space below it.`, ref);
        }
        zones.push({ ii, label, lo: it.y + zone[0], hi: it.y + zone[1], ref });
      }
      if (def.minBay.width && bay.width < def.minBay.width) {
        add('item-clearance', `${where}: ${label.toLowerCase()} needs a bay at least ${def.minBay.width} cm wide.`, ref);
      }
      if (def.minBay.height && g.innerH < def.minBay.height) {
        add('item-clearance', `${where}: ${label.toLowerCase()} needs a bay at least ${def.minBay.height} cm high.`, ref);
      }
      if (def.minDepth && piece.depth < def.minDepth) {
        add('item-clearance', `${where}: ${label.toLowerCase()} needs runners, so the piece must be ${def.minDepth} cm deep.`, ref);
      }
      if (def.needsDoor(it) && !hasDoor(piece, bay)) {
        add('item-needs-door', `${where}: ${label.toLowerCase()} needs a door in front of it.`, ref);
      }
      if (it.kind === 'divider' && isNum(it.position) && (it.position < 0 || it.position > bay.width)) {
        add('item-outside-bay', `${where}: the divider is outside the bay.`, ref);
      }
      if (def.zone(it) && Math.abs(it.y / GRID - Math.round(it.y / GRID)) > 0.02) {
        add('item-off-grid', `${where}: ${label.toLowerCase()} is not on the 32 mm hole system.`, ref, false);
      }
    });
    for (let a = 0; a < zones.length; a++) {
      for (let b = a + 1; b < zones.length; b++) {
        const A = zones[a], B = zones[b];
        if (A.lo < B.hi - 0.05 && B.lo < A.hi - 0.05) {
          add('item-clearance', `${where}: ${B.label.toLowerCase()} is too close to ${A.label.toLowerCase()}.`, B.ref);
        }
      }
    }
  }

  // ----- placements -----
  function checkPlacements() {
    const placed = [];
    placements.forEach((pl) => {
      const ref = { type: 'placement', pieceId: pl && pl.pieceId };
      const piece = pieces.find((p) => p.id === (pl && pl.pieceId));
      if (!piece || !TYPES[piece.type]) { add('placement-unknown-piece', 'A placement points at a piece that does not exist.', ref); return; }
      const name = pieceLabel(project, piece.id);
      const elevation = isNum(pl.elevation) ? pl.elevation : 0;
      let wall = null;
      if (pl.mode === 'wall') {
        wall = walls.find((w) => w.id === pl.wallId);
        if (!wall) { add('placement-wall-missing', `${name} stands on wall ${pl.wallId}, which no longer exists.`, ref); return; }
        if (piece.width > wall.length + TOL) {
          add('wall-too-short', `${name} is ${piece.width} cm wide but wall ${wall.id} is only ${Math.round(wall.length)} cm.`, ref);
        } else if (pl.offset < -TOL || pl.offset + piece.width > wall.length + TOL) {
          add('placement-off-wall', `${name} runs past the end of wall ${wall.id}.`, ref);
        }
      } else if (pl.mode !== 'free' || !isNum(pl.x) || !isNum(pl.z)) {
        add('placement-wall-missing', `${name} has no valid position.`, ref);
        return;
      }
      const fp = footprintOf(project, pl);
      if (!fp) return;
      const poly = fp.corners;
      const top = elevation + piece.height;
      placed.push({ pl, piece, name, poly, elevation, top, ref });

      // inside the room
      const roomPoly = walls.map((w) => w.start);
      const outside = poly.some((c) => !pointInPoly(c, roomPoly) && distToPolyEdges(c, roomPoly) > TOL);
      const poking = roomPoly.some((v) => pointInPoly(v, poly) && distToPolyEdges(v, poly) > TOL);
      if (outside || poking) add('placement-outside-room', `${name} does not fit inside the room outline here.`, ref);

      // ceiling and slope
      const lowest = Math.min(...poly.map((c) => ceilingHeightAt(room, c.x, c.z)));
      if (top > lowest + TOL) {
        if (room.slope && lowest < room.height - TOL) {
          add('placement-under-slope', `${name} (${top} cm) is taller than the sloping ceiling (${Math.floor(lowest)} cm) where it stands.`, ref);
        } else {
          add('placement-too-tall', `${name} (${top} cm) is taller than the ${room.height} cm ceiling.`, ref);
        }
      }

      // openings
      (room.openings || []).forEach((o) => {
        if (pl.mode === 'wall' && o.wallId === pl.wallId) {
          const h = pl.offset < o.offset + o.width - TOL && o.offset < pl.offset + piece.width - TOL;
          const v = elevation < o.bottom + o.height - TOL && o.bottom < top - TOL;
          if (h && v) {
            if (o.type === 'socket') add('placement-covers-opening', `${name} covers a socket.`, ref, false);
            else if (o.type === 'radiator') {
              if (!piece.radiatorCutout) add('placement-covers-opening', `${name} covers a radiator. Allow a radiator cut-out or move it.`, ref);
            } else add('placement-covers-opening', `${name} covers the ${o.type} on wall ${o.wallId}.`, ref);
          }
        }
        if (o.type === 'door' && typeof o.swing === 'string' && o.swing.startsWith('in-')) {
          const w = walls.find((x) => x.id === o.wallId);
          if (!w || elevation >= o.bottom + o.height) return;
          const left = o.swing === 'in-left';
          const hinge = left ? o.offset : o.offset + o.width;
          const a = left ? w.dir : { x: -w.dir.x, z: -w.dir.z };
          const P = { x: w.start.x + w.dir.x * hinge, z: w.start.z + w.dir.z * hinge };
          const sector = [P];
          for (let k = 0; k <= 8; k++) {
            const t = (k / 8) * (Math.PI / 2);
            sector.push({ x: P.x + o.width * (Math.cos(t) * a.x + Math.sin(t) * w.normal.x), z: P.z + o.width * (Math.cos(t) * a.z + Math.sin(t) * w.normal.z) });
          }
          if (penetration(poly, sector) > TOL) add('placement-door-swing', `${name} is in the way of the door swing (wall ${o.wallId}).`, ref);
        }
      });
    });

    // overlaps between pieces
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (!(a.elevation < b.top - TOL && b.elevation < a.top - TOL)) continue;
        if (penetration(a.poly, b.poly) > TOL) add('placement-overlap', `${a.name} and ${b.name} overlap.`, b.ref);
      }
    }

    // room to walk past free-standing pieces
    placed.filter((x) => x.pl.mode === 'free').forEach((a) => {
      let gap = Infinity, what = 'a wall';
      walls.forEach((w) => {
        const d = polyDistance(a.poly, [w.start, w.end]);
        if (d < gap) { gap = d; what = `wall ${w.id}`; }
      });
      placed.forEach((b) => {
        if (b === a || b.elevation >= 100 || b.top <= 0) return;
        const d = polyDistance(a.poly, b.poly);
        if (d < gap) { gap = d; what = b.name; }
      });
      if (gap > TOL && gap < WALKWAY) {
        add('walkway', `Only ${Math.round(gap)} cm between ${a.name} and ${what}; leave 60 cm to walk past.`, a.ref, false);
      }
    });

    pieces.forEach((p) => {
      if (p && TYPES[p.type] && !placements.some((pl) => pl.pieceId === p.id)) {
        add('piece-unplaced', `${pieceLabel(project, p.id)} is not placed in the room yet.`, { type: 'piece', id: p.id }, false);
      }
    });
  }
}

