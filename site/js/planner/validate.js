// Planner v2 validation: pure, never throws. Rules follow docs/PLANNER.md; codes are listed in CONTRACTS.md.
// The planner knows pieces only (no room): sizes, the inside of each piece, and the optional space a piece must fit.
import {
  ITEMS, TYPES, GRID, MIN_BAY, pieceGeometry, pieceLabel, describeItem
} from './model.js';
import { spaceCheck } from './fit.js';

const TOL = 0.5;       // cm of touching we forgive
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function validateProject(project) {
  const errors = [];
  const add = (code, message, ref, blocking = true) => errors.push({ code, message, ref, blocking });
  const guard = (fn) => { try { fn(); } catch (e) { add('validation-failed', `Could not check part of the project: ${e && e.message}`, { type: 'project' }, false); } };

  const done = () => ({
    ok: !errors.some((e) => e.blocking), errors,
    blocking: errors.filter((e) => e.blocking), warnings: errors.filter((e) => !e.blocking)
  });
  if (!project || typeof project !== 'object' || !Array.isArray(project.pieces)) {
    add('project-invalid', 'This is not a planner project.', { type: 'project' });
    return done();
  }
  const pieces = project.pieces;

  guard(() => pieces.forEach((p) => checkPiece(p)));
  return done();

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
      add('bays-count', `${name}: ${T.label.toLowerCase()} takes ${T.limits.bays[0]} to ${T.limits.bays[1]} sections.`, pref);
    }
    checkSpace(piece, name, pref);
    if (!bays.length || !isNum(piece.width) || !isNum(piece.height)) return;
    const g = pieceGeometry(piece, bays.length);
    const sum = bays.reduce((s, b) => s + (isNum(b.width) ? b.width : 0), 0);
    if (Math.abs(sum - g.innerW) > TOL) {
      add('bays-width', `${name}: section widths add up to ${sum} cm but the inside is ${g.innerW} cm wide.`, pref);
    }
    bays.forEach((bay, bi) => {
      const bref = { type: 'bay', pieceId: piece.id, bay: bi };
      if (!isNum(bay.width) || bay.width < MIN_BAY) add('bays-width', `${name}, section ${bi + 1}: narrower than ${MIN_BAY} cm.`, bref);
      checkItems(piece, name, bay, bi, g);
    });
  }

  function checkItems(piece, name, bay, bi, g) {
    const T = TYPES[piece.type];
    const items = Array.isArray(bay.items) ? bay.items : [];
    const where = `${name}, section ${bi + 1}`;
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
        add('item-outside-bay', `${where}: ${label.toLowerCase()} sticks out of the section (inside height ${g.innerH} cm).`, ref);
      }
      const zone = def.zone(it);
      if (zone) {
        if (it.y + zone[0] < -0.05) {
          add('item-clearance', `${where}: ${label.toLowerCase()} needs ${Math.round(-zone[0])} cm of free space below it.`, ref);
        }
        zones.push({ ii, label, lo: it.y + zone[0], hi: it.y + zone[1], ref });
      }
      if (def.minBay.width && bay.width < def.minBay.width) {
        add('item-clearance', `${where}: ${label.toLowerCase()} needs a section at least ${def.minBay.width} cm wide.`, ref);
      }
      if (def.minBay.height && g.innerH < def.minBay.height) {
        add('item-clearance', `${where}: ${label.toLowerCase()} needs a section at least ${def.minBay.height} cm high.`, ref);
      }
      if (def.minDepth && piece.depth < def.minDepth) {
        add('item-clearance', `${where}: ${label.toLowerCase()} needs runners, so the piece must be ${def.minDepth} cm deep.`, ref);
      }
      if (def.needsDoor(it) && !hasDoor(piece, bay)) {
        add('item-needs-door', `${where}: ${label.toLowerCase()} needs a door in front of it.`, ref);
      }
      if (it.kind === 'divider' && isNum(it.position) && (it.position < 0 || it.position > bay.width)) {
        add('item-outside-bay', `${where}: the divider is outside the section.`, ref);
      }
      if (def.warn) { // sizes the makers' fittings are made for: advice, never a block
        const w = def.warn, lc = label.toLowerCase();
        if (w.minWidth && bay.width < w.minWidth) add('item-size', `${where}: ${lc} is made for sections at least ${w.minWidth} cm wide.`, ref, false);
        if (w.maxWidth && bay.width > w.maxWidth) add('item-size', `${where}: ${lc} is made for sections up to ${w.maxWidth} cm wide.`, ref, false);
        if (w.minDepth && piece.depth < w.minDepth) add('item-size', `${where}: ${lc} works best in a piece at least ${w.minDepth} cm deep.`, ref, false);
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

  // The space the person said they have: advice, never a block. It is the one check that looks outside the piece.
  function checkSpace(piece, name, pref) {
    const c = spaceCheck(piece);
    if (c.fits) return;
    const sp = c.space;
    if (c.tooWide) add('space-too-wide', `${name} is ${piece.width} cm wide, ${c.overWidth} cm more than the ${sp.width} cm you have.`, pref, false);
    if (c.tooTall) add('space-too-tall', `${name} is ${piece.height} cm tall, ${c.overHeight} cm more than the ${sp.height} cm you have.`, pref, false);
  }
}
