// Planner v2 Review step: pure logic (no DOM, no Three.js), so Node can test it. Quote grouping and formatting, the
// blockers that stop "Send to the workshop", render settings per device class and camera presets. Money is integer cents wherever it is added up.
import { MATERIALS } from './model.js';

export const THUMB_MAX = 300 * 1024;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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
// Which step fixes a validation error: 0 Furniture (the piece, its sections, its size), 1 Interior (an item inside).
export function issueStep(ref) {
  return ref && ref.type === 'item' ? 1 : 0;
}
export const STEP_NAMES = ['Furniture', 'Interior'];

// Everything that stops "Send to the workshop": blocking errors, and nothing designed at all.
export function sendBlockers(project, errors = []) {
  const out = [];
  if (!project.pieces || !project.pieces.length) {
    out.push({ code: 'no-pieces', message: 'You have not designed a piece yet. Add one, then send the design.', ref: null, step: 0, label: 'Add a piece' });
  }
  for (const e of errors) {
    if (!e.blocking) continue;
    const step = issueStep(e.ref);
    const r = e.ref || {};
    out.push({
      code: e.code, message: String(e.message), ref: e.ref || null, step, label: `Fix in ${STEP_NAMES[step]}`,
      pieceId: r.pieceId || (r.type === 'piece' ? r.id : undefined)
    });
  }
  return out;
}
export function adviceList(errors = []) {
  return errors.filter((e) => !e.blocking).map((e) => ({ code: e.code, message: String(e.message), ref: e.ref || null }));
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
      id: pq.id, label: pq.label,
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
    materials
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
