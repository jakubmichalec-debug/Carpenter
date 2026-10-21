// Pricing and cut lists: pure, no DOM, no Three.js. Money in EUR, lengths in cm.
import { MODULE_TYPES, MATERIALS } from './model.js';

export const PRICES = {
  labourPerHour: 58,
  installPerModule: 120,
  hingePair: 18,
  drawerRunner: 46,
  slidingTrack: 140,            // per metre of width
  handle: { bar: 14, knob: 9, push: 22, groove: 0 },
  ledPerMetre: 38,
  glassPerM2: 95,
  rail: 24,                     // one hanging rail
  plinthPerMetre: 22,           // adjustable feet and clips, per metre
  designFee: 250,
  vat: 0.21,
  wasteFactor: 1.12,            // offcut allowance on board cost
  labourHours: {
    wardrobe: 10, 'kitchen-base': 5.5, 'kitchen-wall': 4, 'tall-cabinet': 7, island: 14,
    shelving: 6, desk: 6, table: 8, bench: 4, 'window-seat': 7
  },
  labourExtras: {               // hours added on top of the per-type base
    perExtraSection: 0.8, perDoor: 0.5, perSlidingPanel: 1.2, perGlassDoor: 0.5,
    perDrawer: 1.2, led: 0.6, worktop: 2, stoneWorktop: 3.5, plinth: 0.5
  }
};

// Board thicknesses (cm)
const T = 1.8, BACK = 0.8, FRONT = 1.9, BOX = 1.2, BOXBASE = 0.8;
const PLINTH_H = 10;
const DRAWER_H = { wardrobe: 22, 'tall-cabinet': 20, 'kitchen-base': 24, island: 24, 'window-seat': 28, desk: 14, shelving: 22 };
const CARCASS = new Set(['wardrobe', 'kitchen-base', 'kitchen-wall', 'tall-cabinet', 'island', 'shelving', 'window-seat']);

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const area = (p) => (p.w * p.h * p.qty) / 10000;

// Internal layout of a module: bays with their shelves, rails, drawers and doors.
export function layoutOf(m) {
  const type = m.type;
  const isCarcass = CARCASS.has(type);
  const ph = isCarcass && m.plinth ? PLINTH_H : 0;
  const topT = type === 'desk' ? 3.8 : 0;
  const H = m.height - ph - topT;
  const n = m.sections;
  const innerW = (m.width - 2 * T - (n - 1) * T) / n;
  const outerW = m.width / n;
  const clearH = H - 2 * T;
  const dH = DRAWER_H[type] || 20;
  const maxPer = Math.max(0, Math.floor((0.6 * clearH) / dH));
  const hasDrawers = !['table', 'bench'].includes(type);
  const D = hasDrawers ? m.drawers : 0;
  const bays = [];
  for (let i = 0; i < n; i++) {
    const drawers = Math.min(maxPer, Math.floor(D / n) + (i < D % n ? 1 : 0));
    const stack = drawers * dH;
    let interior = 'shelves';
    if (type === 'wardrobe' || type === 'tall-cabinet') {
      if (m.interior === 'rail') interior = 'rail';
      else if (m.interior === 'shoe') interior = 'shoe';
      else if (m.interior === 'mixed') interior = i % 2 === 0 ? 'shelves' : 'rail';
    }
    const free = clearH - stack;
    let shelves;
    if (interior === 'rail') shelves = 1;
    else if (interior === 'shoe') shelves = Math.max(2, Math.min(9, Math.floor(free / 25)));
    else shelves = Math.max(1, Math.floor(free / (type === 'shelving' ? 32 : 40)) - 1);
    bays.push({ drawers, stack, interior, shelves, rail: interior === 'rail' ? 1 : 0 });
  }
  return { ph, topT, H, n, innerW, outerW, clearH, dH, bays };
}

function doorPanels(m, L) {
  const out = [];
  const mode = m.doors;
  if (mode === 'sliding') {
    const count = Math.max(2, Math.ceil(m.width / 100));
    const stack = Math.max(0, ...L.bays.map((b) => b.stack));
    out.push({ part: 'door', w: (m.width + (count - 1) * 3) / count, h: L.H - 0.4 - stack, t: FRONT, qty: count, kind: 'sliding' });
  } else if (mode === 'hinged' || mode === 'glass') {
    L.bays.forEach((b) => {
      const per = L.outerW <= 65 ? 1 : 2;
      out.push({ part: 'door', w: L.outerW / per - 0.3, h: L.H - 0.4 - b.stack, t: FRONT, qty: per, kind: mode });
    });
  }
  return out;
}

export function glassAreaM2(m) {
  if (m.doors !== 'glass') return 0;
  return doorPanels(m, layoutOf(m)).reduce((s, d) => s + (Math.max(0, d.w - 11) * Math.max(0, d.h - 11) * d.qty) / 10000, 0);
}

export function moduleStats(m) {
  const L = layoutOf(m);
  const doors = doorPanels(m, L);
  const doorCount = doors.reduce((s, d) => s + d.qty, 0);
  return {
    doorCount,
    slidingPanels: m.doors === 'sliding' ? doorCount : 0,
    glassDoors: m.doors === 'glass' ? doorCount : 0,
    hingePairs: m.doors === 'hinged' || m.doors === 'glass'
      ? doors.reduce((s, d) => s + d.qty * Math.max(1, Math.ceil(d.h / 90)), 0) : 0,
    drawers: L.bays.reduce((s, b) => s + b.drawers, 0),
    rails: L.bays.reduce((s, b) => s + b.rail, 0),
    glassM2: glassAreaM2(m)
  };
}

export function panelsFor(m) {
  const list = [];
  const add = (part, w, h, t, qty, material) => {
    if (qty <= 0 || w <= 0 || h <= 0) return;
    const p = { part, w: r1(w), h: r1(h), t: r1(t), qty, material };
    const hit = list.find((q) => q.part === p.part && q.w === p.w && q.h === p.h && q.t === p.t && q.material === p.material);
    if (hit) hit.qty += qty; else list.push(p);
  };
  const type = m.type;
  const W = m.width, D = m.depth;
  const body = m.body, front = m.front;
  const L = layoutOf(m);
  const worktopT = m.worktop && MATERIALS[m.worktop].kind === 'stone' ? 3 : 3.8;

  // Tops and legs only
  if (type === 'table' || type === 'bench') {
    const topT = type === 'bench' ? 4 : 3.8;
    if (m.worktop) add('worktop', W, D, topT, 1, m.worktop); else add('top', W, D, topT, 1, front);
    const legH = m.height - topT;
    add('leg', 5.5, legH, 5.5, 4, front);
    add('side', W - 11, 8, 2.2, 2, front);   // long aprons
    add('side', D - 11, 8, 2.2, 2, front);   // short aprons
    if (W > 200) add('divider', D - 11, 8, 2.2, 1, front); // centre stretcher
    return list;
  }

  const sideH = L.H;
  const innerH = L.H - 2 * T;
  add('side', D, sideH, T, 2, body);

  if (type === 'desk') {
    if (m.worktop) add('worktop', W, D, 3.8, 1, m.worktop); else add('top', W, D, 3.8, 1, front);
    const needsCarcass = m.drawers > 0 || m.doors !== 'none' || m.sections > 1;
    list.length = 0; // rebuild in a tidy order
    if (m.worktop) add('worktop', W, D, 3.8, 1, m.worktop); else add('top', W, D, 3.8, 1, front);
    if (!needsCarcass) { add('leg', 5, L.H, 5, 4, front); return list; }
    add('side', D - 2, L.H, T, 2, body);
    add('back', W - 2 * T, 35, T, 1, body);       // modesty panel
    add('divider', D - 4, L.H, T, m.sections - 1, body);
  } else {
    // carcass
    if (type === 'window-seat') add('top', W, D, 3.2, 1, front);
    else if (type === 'kitchen-base' || type === 'island') add('top', W - 2 * T, 8, T, 2, body); // stretchers
    else add('top', W - 2 * T, D - 1, T, 1, body);
    add('bottom', W - 2 * T, D - 1, T, 1, body);
    add('back', W - 2 * T, innerH, BACK, 1, body);
    add('divider', D - 1.5, innerH, T, m.sections - 1, body);
  }

  // Shelves
  if (type !== 'desk') {
    L.bays.forEach((b) => add('shelf', L.innerW - 0.2, D - 3, T, b.shelves, body));
  }

  // Drawers: front, plus a ply box behind each
  L.bays.forEach((b) => {
    if (!b.drawers) return;
    add('drawer-front', L.outerW - 0.3, L.dH - 0.3, FRONT, b.drawers, front);
    add('side', D - 6, L.dH - 5, BOX, 2 * b.drawers, body);
    add('back', L.innerW - 5, L.dH - 5, BOX, b.drawers, body);
    add('bottom', L.innerW - 5, D - 6, BOXBASE, b.drawers, body);
  });

  // Doors (glass doors are a frame of stiles and rails; the pane is priced separately)
  doorPanels(m, L).forEach((d) => {
    if (d.kind === 'glass') {
      add('door', 5.5, d.h, d.t, 2 * d.qty, front);
      add('door', d.w - 11, 5.5, d.t, 2 * d.qty, front);
    } else {
      add('door', d.w, d.h, d.t, d.qty, front);
    }
  });

  // Plinth
  if (L.ph > 0) {
    add('plinth', W - 4, L.ph, T, 1, body);
    add('plinth', D - 8, L.ph, T, 2, body);
  }

  // Worktops
  if (type === 'kitchen-base' && m.worktop) add('worktop', W, D + 2, worktopT, 1, m.worktop);
  if (type === 'island' && m.worktop) add('worktop', W + 6, D + 30, worktopT, 1, m.worktop);

  return list;
}

function boardCost(panel) {
  return area(panel) * MATERIALS[panel.material].pricePerM2 * PRICES.wasteFactor;
}

function labourHours(m, st) {
  const X = PRICES.labourExtras;
  let h = PRICES.labourHours[m.type] ?? 6;
  h += (m.sections - 1) * X.perExtraSection;
  h += (st.doorCount - st.slidingPanels) * X.perDoor + st.slidingPanels * X.perSlidingPanel;
  h += st.glassDoors * X.perGlassDoor;
  h += st.drawers * X.perDrawer;
  if (m.led) h += X.led;
  if (m.worktop) h += MATERIALS[m.worktop].kind === 'stone' ? X.stoneWorktop : X.worktop;
  if (m.plinth && CARCASS.has(m.type)) h += X.plinth;
  return h;
}

function quoteModule(m) {
  const panels = panelsFor(m);
  const st = moduleStats(m);
  const mats = panels.reduce((s, p) => s + boardCost(p), 0) + st.glassM2 * PRICES.glassPerM2;
  const handles = (st.doorCount + st.drawers) * PRICES.handle[m.handle];
  const hardware = st.hingePairs * PRICES.hingePair
    + st.drawers * PRICES.drawerRunner
    + (m.doors === 'sliding' ? (m.width / 100) * PRICES.slidingTrack : 0)
    + st.rails * PRICES.rail
    + (m.led ? (m.width / 100) * PRICES.ledPerMetre : 0)
    + (CARCASS.has(m.type) && m.plinth ? (m.width / 100) * PRICES.plinthPerMetre : 0)
    + (m.doors === 'open' || m.doors === 'none' ? 0 : handles);
  const hours = labourHours(m, st);
  const materials = r2(mats), hw = r2(hardware), labour = r2(hours * PRICES.labourPerHour), install = r2(PRICES.installPerModule);
  return {
    row: {
      id: m.id, type: m.type, label: MODULE_TYPES[m.type].label,
      boardM2: r3(panels.reduce((s, p) => s + area(p), 0)),
      materials, hardware: hw, labour, install,
      total: r2(materials + hw + labour + install)
    },
    hours, panels
  };
}

export function quoteDesign(design, { vat = true } = {}) {
  const rows = [], merged = new Map(), byMat = {};
  let hours = 0;
  for (const m of design.modules) {
    const q = quoteModule(m);
    rows.push(q.row);
    hours += q.hours;
    for (const p of q.panels) {
      const key = `${p.material}|${p.part}|${p.w}|${p.h}|${p.t}`;
      const e = merged.get(key);
      if (e) e.qty += p.qty; else merged.set(key, { material: p.material, part: p.part, w: p.w, h: p.h, t: p.t, qty: p.qty });
      byMat[p.material] = (byMat[p.material] || 0) + area(p);
    }
  }
  Object.keys(byMat).forEach((k) => { byMat[k] = r3(byMat[k]); });
  const cutList = [...merged.values()].sort((a, b) =>
    a.material.localeCompare(b.material) || a.part.localeCompare(b.part) || a.w - b.w || a.h - b.h);

  const sum = (k) => r2(rows.reduce((s, x) => s + x[k], 0));
  const lines = [
    { label: 'Materials', amount: sum('materials') },
    { label: 'Hardware', amount: sum('hardware') },
    { label: 'Workshop labour', amount: sum('labour') },
    { label: 'Installation', amount: sum('install') },
    { label: 'Design fee', amount: rows.length ? PRICES.designFee : 0 }
  ];
  const cents = lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
  const vatCents = vat ? Math.round(cents * PRICES.vat) : 0;
  return {
    modules: rows, lines,
    subtotal: cents / 100,
    vat: vatCents / 100,
    total: (cents + vatCents) / 100,
    cutList,
    boardM2ByMaterial: byMat,
    leadTimeWeeks: 4 + Math.ceil(hours / 40)
  };
}
