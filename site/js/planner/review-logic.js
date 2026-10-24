// Planner v2 Review step: pure logic (no DOM, no Three.js), so Node can test it. Quote grouping and formatting, the
// blockers that stop "Send to the quote form", render settings per device class, camera presets, and the summary the
// contact page shows. Money is integer cents wherever it is added up.
import {
  TYPES, MATERIALS, wallsOf, footprintOf, ceilingHeightAt, pieceLabel
} from './model.js';

export const THUMB_KEY = 'gj.review.thumb';
export const THUMB_MAX = 300 * 1024;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const M = 0.01;

// ---------- money and time ----------
let eur = null;
export function formatEuro(amount) {
  const n = Number(amount) || 0;
  try {
    if (!eur) eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return eur.format(n).replace(/ /g, ' ');
  } catch {
    const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${n < 0 ? '-' : ''}€${abs}`;
  }
}
export function formatEuroWhole(amount) {
  const n = Math.round(Number(amount) || 0);
  return `${n < 0 ? '-' : ''}€${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

// ---------- problems ----------
// Which step fixes a validation error.
export function issueStep(ref, code) {
  const t = ref && ref.type;
  if (code === 'piece-unplaced') return 3; // a piece that is not placed yet is the Place step's business
  return t === 'room' || t === 'opening' ? 0 : t === 'piece' || t === 'bay' ? 1 : t === 'item' ? 2 : t === 'placement' ? 3 : 0;
}
export const STEP_NAMES = ['Room', 'Furniture', 'Interior', 'Place'];

// Everything that stops "Send to the quote form": blocking errors, and nothing in the room at all.
export function sendBlockers(project, errors = []) {
  const out = [];
  if (!project.pieces || !project.pieces.length) {
    out.push({ code: 'no-pieces', message: 'You have not designed a piece yet. Add one, then place it in the room.', ref: null, step: 1, label: 'Add a piece' });
  } else if (!project.placements || !project.placements.length) {
    out.push({ code: 'none-placed', message: 'No piece is in the room yet. Place at least one before you send the design.', ref: null, step: 3, label: 'Place a piece' });
  }
  for (const e of errors) {
    if (!e.blocking) continue;
    const step = issueStep(e.ref, e.code);
    const r = e.ref || {};
    out.push({
      code: e.code, message: String(e.message).replace(/\b([Ww])all w(\d+)\b/g, '$1all $2'), ref: e.ref || null, step, label: `Fix in ${STEP_NAMES[step]}`,
      pieceId: r.pieceId || (r.type === 'piece' ? r.id : undefined), openingId: r.type === 'opening' ? r.id : undefined
    });
  }
  return out;
}
export function adviceList(errors = []) {
  return errors.filter((e) => !e.blocking).map((e) => ({ code: e.code, message: String(e.message).replace(/\b([Ww])all w(\d+)\b/g, '$1all $2'), ref: e.ref || null }));
}

// ---------- the quote, shaped for the panel ----------
const PART_TITLES = {
  carcass: 'Carcass boards', frame: 'Frame', worktop: 'Top', plinth: 'Base (plinth)', sliding: 'Sliding doors', base: 'Workshop time',
  bays: 'Extra sections', fitting: 'Fitting', doors: 'Doors, hinges and handles', trim: 'Top and trim', back: 'Back panel and colour', look: 'Front design and finish'
};
const sumCents = (a) => a.reduce((s, x) => s + x.cents, 0);

export function quoteView(quote, project) {
  const pieces = [];
  for (const pq of quote.pieces) {
    const piece = (project.pieces || []).find((p) => p.id === pq.id);
    const placed = (project.placements || []).some((pl) => pl.pieceId === pq.id);
    const rowsByKey = new Map();
    for (const l of pq.lines) {
      const bay = l.ref.bay;
      const sectionKey = bay === undefined ? 'piece' : `bay:${bay}`;
      const rowKey = l.ref.item !== undefined ? `i${l.ref.item}` : `p:${l.ref.part || l.label}`;
      const key = `${sectionKey}|${rowKey}`;
      let r = rowsByKey.get(key);
      if (!r) {
        const label = l.ref.item !== undefined ? l.label : (PART_TITLES[l.ref.part] || l.label);
        r = { sectionKey, order: l.ref.item !== undefined ? 1000 + l.ref.item : 0, label, cents: 0 };
        rowsByKey.set(key, r);
      }
      r.cents += l.cents;
    }
    const bySection = new Map();
    for (const r of rowsByKey.values()) {
      if (!bySection.has(r.sectionKey)) bySection.set(r.sectionKey, []);
      bySection.get(r.sectionKey).push(r);
    }
    const sections = [...bySection.entries()].map(([key, rows]) => {
      rows.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
      const bay = key === 'piece' ? -1 : Number(key.slice(4));
      return { key, bay, title: key === 'piece' ? 'The piece' : `Section ${bay + 1}`, cents: sumCents(rows), rows: rows.map(({ label, cents }) => ({ label, cents })) };
    }).sort((a, b) => a.bay - b.bay);
    const groupMap = new Map();
    for (const l of pq.lines) groupMap.set(l.group, (groupMap.get(l.group) || 0) + l.cents);
    const groups = ['Materials', 'Hardware', 'Workshop labour', 'Fitting'].filter((g) => groupMap.get(g)).map((g) => ({ label: g, cents: groupMap.get(g) }));
    pieces.push({
      id: pq.id, label: pq.label, placed,
      size: piece ? `${piece.width} × ${piece.height} × ${piece.depth} cm` : '',
      cents: pq.cents, groups, sections
    });
  }
  const materials = Object.entries(quote.boardM2ByMaterial || {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, m2]) => ({ id, label: (MATERIALS[id] || { label: id }).label, m2 }));
  return {
    pieces,
    totals: {
      lines: quote.lines.map((l) => ({ label: l.label, cents: l.cents })),
      subtotalCents: quote.cents.subtotal, vatCents: quote.cents.vat, totalCents: quote.cents.total,
      vatOn: quote.cents.vat > 0, leadTimeWeeks: quote.leadTimeWeeks
    },
    materials,
    unplaced: (quote.unplaced || []).map((id) => ({ id, label: pieceLabel(project, id) }))
  };
}

// ---------- render settings per device class ----------
export function renderSettings(env = {}, override = null) {
  const e = {
    screenWidth: 1440, screenHeight: 900, pointerCoarse: false, deviceMemory: 0, cores: 0, maxTextureSize: 16384, software: false, aspect: 16 / 9, ...env
  };
  const reasons = [];
  if (e.pointerCoarse && Math.min(e.screenWidth, e.screenHeight) < 700) reasons.push('a small touch screen');
  if (e.deviceMemory > 0 && e.deviceMemory <= 4) reasons.push('little memory');
  if (e.pointerCoarse && e.cores > 0 && e.cores <= 4) reasons.push('a slow processor');
  if (e.maxTextureSize < 8192) reasons.push('small GPU limits');
  if (e.software) reasons.push('no hardware graphics');
  const weak = reasons.length > 0;
  const longEdge = weak ? 960 : 1600;
  const aspect = clamp(Number(e.aspect) || 16 / 9, 0.6, 2.2);
  let width = longEdge, height = Math.round(longEdge / aspect);
  if (height > longEdge) { height = longEdge; width = Math.round(longEdge * aspect); }
  let maxSamples = weak ? 96 : 256;
  let maxSeconds = weak ? 45 : 60;
  const o = override || {};
  if (o.width > 0) { width = Math.round(o.width); height = Math.round(o.width / aspect); }
  if (o.maxSamples > 0) maxSamples = Math.round(o.maxSamples);
  if (o.maxSeconds > 0) maxSeconds = o.maxSeconds;
  width -= width % 2; height -= height % 2;
  const px = width * height;
  const tiles = px <= 400000 ? [1, 1] : px <= 1400000 ? (weak ? [2, 2] : [1, 1]) : [2, 2];
  // quarter resolution first so an image shows at once, then half, then the full size
  const stages = [{ scale: 0.25, samples: 2 }, { scale: 0.5, samples: 4 }, { scale: 1, samples: maxSamples }];
  return {
    cls: weak ? 'weak' : 'desktop', width, height, maxSamples, maxSeconds, tiles, denoise: !(override && override.denoise === false), bounces: weak ? 4 : 6, stages, capped: weak, reasons,
    note: weak ? `This device renders at up to ${longEdge} px wide and ${maxSamples} samples (${reasons.join(', ')}), so it finishes sooner and looks a little grainier.` : ''
  };
}

export function progressFraction({ samples = 0, maxSamples = 1, elapsed = 0, maxSeconds = 1 }) {
  return clamp(Math.max(samples / Math.max(1, maxSamples), elapsed / Math.max(1, maxSeconds)), 0, 1);
}

// ---------- geometry helpers ----------
export function insideRoom(room, x, z) {
  const c = room.walls;
  let inside = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const a = c[i], b = c[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// Walls whose outer face is toward the camera (position in metres): the viewer fades them, so the render leaves them out.
export function hiddenWalls(room, cam) {
  const out = [];
  for (const w of wallsOf(room)) {
    const mx = ((w.start.x + w.end.x) / 2) * M, mz = ((w.start.z + w.end.z) / 2) * M;
    const dOut = (cam[0] - mx) * -w.normal.x + (cam[2] - mz) * -w.normal.z;
    if (dOut > 0.02) out.push(w.id);
  }
  return out;
}

// Polygon clipped to one side of a line: keep points where (x - ox) * nx + (z - oz) * nz is >= 0 (keep = 1) or <= 0 (keep = -1).
function clipHalf(poly, ox, oz, nx, nz, keep) {
  const d = (p) => keep * ((p.x - ox) * nx + (p.z - oz) * nz);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = d(a), db = d(b);
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}
const polyArea = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.z - b.x * a.z; }
  return Math.abs(s / 2);
};

// The ceiling as polygons (cm). Flat: the room outline. An attic: split where the slope reaches the ridge, so each
// polygon is flat or a single slope. Each vertex carries `y`, the ceiling height there (cm).
export function ceilingPolygons(room) {
  const base = room.walls.map((c) => ({ x: c.x, z: c.z }));
  const withY = (poly) => poly.map((p) => ({ x: p.x, z: p.z, y: ceilingHeightAt(room, p.x, p.z) }));
  const s = room.slope;
  const wall = s && wallsOf(room).find((w) => w.id === s.wallId);
  if (!s || !wall) return [withY(base)];
  const ox = wall.start.x + wall.normal.x * s.depth, oz = wall.start.z + wall.normal.z * s.depth;
  const near = clipHalf(base, ox, oz, wall.normal.x, wall.normal.z, -1);
  const far = clipHalf(base, ox, oz, wall.normal.x, wall.normal.z, 1);
  return [near, far].filter((p) => p.length >= 3 && polyArea(p) > 1).map(withY);
}

// Where a placed piece's group goes in the scene (metres, radians), exactly as the viewer places it.
export function placedTransform(project, placement) {
  const fp = footprintOf(project, placement);
  if (!fp) return null;
  const c = fp.corners[0];
  return { x: c.x * M, z: c.z * M, rotY: (-fp.rotation * Math.PI) / 180, lift: (placement.elevation || 0) * M };
}

// Distance (cm) from a point along a direction to the nearest wall; Infinity when the ray leaves through nothing.
export function rayToWall(room, ox, oz, dx, dz) {
  let best = Infinity;
  for (const w of wallsOf(room)) {
    const ex = w.end.x - w.start.x, ez = w.end.z - w.start.z;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((w.start.x - ox) * ez - (w.start.z - oz) * ex) / den;
    const u = ((w.start.x - ox) * dz - (w.start.z - oz) * dx) / den;
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
  }
  return best;
}

// ---------- camera presets ----------
export function presetList(project) {
  const list = [{ id: 'room', label: 'Room' }, { id: 'top', label: 'Top' }];
  for (const pl of project.placements || []) {
    if (footprintOf(project, pl)) list.push({ id: `front:${pl.pieceId}`, label: `Front of ${pieceLabel(project, pl.pieceId)}` });
  }
  return list;
}

export function frontPose(project, pieceId, { aspect = 1.5, fov = 36 } = {}) {
  const pl = (project.placements || []).find((p) => p.pieceId === pieceId);
  const piece = (project.pieces || []).find((p) => p.id === pieceId);
  const fp = pl && piece && footprintOf(project, pl);
  if (!fp) return null;
  const r = (fp.rotation * Math.PI) / 180;
  const f = { x: -Math.sin(r), z: Math.cos(r) }; // the way the front faces
  const wM = piece.width * M, hM = piece.height * M, dM = piece.depth * M;
  const lift = (pl.elevation || 0) * M;
  const th = Math.tan((fov * Math.PI) / 360);
  const need = Math.max((wM / 2) * 1.25 / (th * Math.max(0.6, aspect)), ((hM + lift) / 2) * 1.15 / th);
  // stand far enough to frame the piece, but keep the camera inside the room when it can
  const avail = rayToWall(project.room, fp.cx, fp.cz, f.x, f.z) * M;
  const dist = clamp(Math.min(need + dM / 2, avail - 0.3), 1.6, 9);
  const ty = clamp(lift + hM / 2, 0.55, 1.35);
  const cy = clamp(Math.max(1.1, ty), 1.1, 1.55);
  const target = [fp.cx * M, ty, fp.cz * M];
  const position = [target[0] + f.x * dist, cy, target[2] + f.z * dist];
  return { position, target, inRoom: insideRoom(project.room, position[0] / M, position[2] / M) };
}

// ---------- the contact page ----------
const FORM_TYPE = [
  [['island', 'kitchen-base', 'kitchen-wall'], 'kitchen', 'Kitchen'],
  [['wardrobe'], 'wardrobe', 'Bedroom'],
  [['window-seat'], 'window-seat', 'Living room'],
  [['desk'], 'desk', 'Study or home office'],
  [['table'], 'table', 'Dining room'],
  [['wall-unit', 'tall-cabinet'], 'wall-unit', 'Living room'],
  [['under-stairs'], 'under-stairs', 'Hallway']
];

export function summaryFor(project, quote) {
  const pieces = (project.pieces || []).map((p) => ({
    id: p.id, type: p.type, label: pieceLabel(project, p.id), size: `${p.width} × ${p.height} × ${p.depth} cm`,
    color: (MATERIALS[p.fronts.material] || MATERIALS.oak || { color: '#b9844a' }).color
  }));
  const types = new Set(pieces.map((p) => p.type));
  let formType = 'other', roomGuess = '';
  for (const [list, id, room] of FORM_TYPE) {
    if (list.some((t) => types.has(t))) { formType = id; roomGuess = room; break; }
  }
  const walls = wallsOf(project.room);
  const used = new Set((project.placements || []).filter((pl) => pl.mode === 'wall').map((pl) => pl.wallId));
  const pool = walls.filter((w) => used.has(w.id));
  const best = (pool.length ? pool : walls).reduce((m, w) => (w.length > m ? w.length : m), 0);
  const kinds = [];
  for (const t of types) kinds.push(TYPES[t] ? TYPES[t].label.toLowerCase() : t);
  return {
    pieces, pieceCount: pieces.length, kinds, total: quote.total, leadTimeWeeks: quote.leadTimeWeeks,
    wallWidth: clamp(Math.round(best), 60, 900), wallHeight: project.room.height, formType, roomGuess
  };
}

export function contactMessage(summary, link) {
  const n = summary.pieceCount;
  const what = summary.pieces.map((p) => p.label).join(', ');
  return `I would like a quote for the design I made in the planner: ${n} piece${n === 1 ? '' : 's'} (${what}), estimated at ${formatEuro(summary.total)} including VAT, about ${summary.leadTimeWeeks} weeks to make.\n\nMy design: ${link}`;
}

// A small plan of the room and its pieces, as an SVG string for the contact page (classes are styled there).
export function planSvg(project) {
  const walls = project.room.walls;
  const xs = walls.map((c) => c.x), zs = walls.map((c) => c.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const pad = 14, vw = 400;
  const sc = (vw - pad * 2) / Math.max(1, maxX - minX);
  const vh = Math.round((maxZ - minZ) * sc + pad * 2);
  const pt = (x, z) => `${(pad + (x - minX) * sc).toFixed(1)},${(pad + (z - minZ) * sc).toFixed(1)}`;
  let s = `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="Plan of your room with the pieces in it"><polygon class="d-wall" points="${walls.map((c) => pt(c.x, c.z)).join(' ')}"/>`;
  (project.placements || []).forEach((pl, i) => {
    const fp = footprintOf(project, pl);
    const piece = (project.pieces || []).find((p) => p.id === pl.pieceId);
    if (!fp || !piece) return;
    const fill = (MATERIALS[piece.fronts.material] || MATERIALS.oak || { color: '#b9844a' }).color;
    s += `<polygon class="d-mod" style="--i:${i}" fill="${fill}" points="${fp.corners.map((c) => pt(c.x, c.z)).join(' ')}"/>`;
  });
  return `${s}</svg>`;
}

// Link helpers shared by the step and the contact page.
export const contactLink = (encoded) => `contact.html#p=${encoded}`;
export const plannerLink = (encoded) => `planner.html#p=${encoded}`;
export function validThumb(entry, encoded) {
  return !!entry && typeof entry === 'object' && entry.p === encoded && typeof entry.thumb === 'string'
    && entry.thumb.startsWith('data:image/jpeg;base64,') && entry.thumb.length <= THUMB_MAX;
}
