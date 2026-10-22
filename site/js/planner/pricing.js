// Planner v2 pricing: cut list and quote built from the project. Pure; money in integer cents.
import { PRICES } from '../configurator/pricing.js';
import {
  ITEMS, TYPES, MATERIALS, LAYOUT_T, pieceGeometry, describeItem, pieceLabel, visibleFrontHeight,
  footprintOf, ceilingHeightAt, wallById
} from './model.js';

export { PRICES };

// Prices that are new in v2. Everything the v1 table already has (labour rate, hinges, runners,
// handles, LED, glass, plinth feet, sliding track, design fee, VAT, waste) comes from PRICES.
export const PRICES_V2 = {
  hinge: PRICES.hingePair / 2,
  hardware: {
    shelfPin:       { label: 'Shelf pins',            unit: 'pc',  price: 0.4 },
    glassM2:        { label: 'Glass',                 unit: 'm²',  price: PRICES.glassPerM2 },
    railTube:       { label: 'Hanging rail',          unit: 'm',   price: 16 },
    railSocket:     { label: 'Rail sockets',          unit: 'pc',  price: 3.5 },
    wardrobeLift:   { label: 'Wardrobe lift',         unit: 'pc',  price: 195 },
    runner:         { label: 'Soft-close runners',    unit: 'pc',  price: PRICES.drawerRunner },
    runnerHeavy:    { label: 'Heavy runners',         unit: 'pc',  price: 64 },
    sideRunner:     { label: 'Side-mount runner',     unit: 'pc',  price: 44 },
    velvetTray:     { label: 'Velvet tray',           unit: 'pc',  price: 42 },
    dividerGrid:    { label: 'Divider grid',          unit: 'pc',  price: 26 },
    shoeRail:       { label: 'Angled shoe rails',     unit: 'pc',  price: 14 },
    trouserRack:    { label: 'Trouser rack',          unit: 'pc',  price: 62 },
    tieRack:        { label: 'Tie and belt rack',     unit: 'pc',  price: 48 },
    valetRod:       { label: 'Valet rod',             unit: 'pc',  price: 44 },
    wireBasket:     { label: 'Wire basket',           unit: 'pc',  price: 52 },
    hamperBag:      { label: 'Laundry bag',           unit: 'pc',  price: 38 },
    ironingFitting: { label: 'Ironing board fitting', unit: 'pc',  price: 220 },
    mirrorM2:       { label: 'Mirror glass',          unit: 'm²',  price: 150 },
    hook:           { label: 'Hook',                  unit: 'pc',  price: 6.5 },
    ledM:           { label: 'LED strip',             unit: 'm',   price: PRICES.ledPerMetre },
    ledDriver:      { label: 'LED driver',            unit: 'pc',  price: 24 },
    ledSensor:      { label: 'Motion sensor',         unit: 'pc',  price: 28 },
    cutleryInsert:  { label: 'Cutlery insert',        unit: 'pc',  price: 78 },
    binSet:         { label: 'Bin set',               unit: 'pc',  price: 62 },
    carousel:       { label: 'Corner carousel',       unit: 'pc',  price: 260 },
    cableTray:      { label: 'Cable tray',            unit: 'pc',  price: 26 },
    keyboardRunner: { label: 'Keyboard runner',       unit: 'pc',  price: 58 }
  },
  labour: {
    baseHours: {
      wardrobe: 16, 'kitchen-base': 5, 'kitchen-wall': 3.5, 'tall-cabinet': 8, 'wall-unit': 8, desk: 7,
      table: 8, 'window-seat': 8, 'under-stairs': 9, island: 14
    },
    extraBayHours: 0.75,      // each bay after the first: divider, back and fitting
    doorHours: 0.5,           // per hinged door
    glassDoorHours: 0.5,      // extra per glass door
    slidingPanelHours: 1.2,
    plinthHours: 0.5,
    worktopHours: 2,
    stoneWorktopHours: 3.5
  },
  fitting: {
    base: PRICES.installPerModule,   // per placed piece
    perMetre: 30,                    // per metre of width
    slope: 85,                       // scribing to a sloping ceiling
    radiator: 60                     // cutting around a radiator
  },
  slabThickness: { desk: 3.8, table: 3.8, 'window-seat': 3.2 }
};

// ---------- helpers ----------
const BOARD = 1.8, BACK = 0.8, FRONT = 1.9;
const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;
const area = (b) => (b.w * b.h * b.qty) / 10000;
const cents = (euros) => Math.round(euros * 100);
const money = (c) => c / 100;
const matPrice = (id) => (MATERIALS[id] ? MATERIALS[id].pricePerM2 : 0);
const boardCents = (b) => cents(area(b) * matPrice(b.material) * PRICES.wasteFactor);

function doorsIn(piece, bay) {
  const k = piece.fronts.kind;
  if (k !== 'hinged' && k !== 'glass') return 0;
  return bay.door === 'double' ? 2 : bay.door === 'left' || bay.door === 'right' ? 1 : 0;
}
const hingesFor = (h) => (h <= 100 ? 2 : h <= 200 ? 3 : 4);
const slidingPanels = (piece) => Math.max(2, Math.ceil(piece.width / 100));

// Door geometry for a bay: { count, w, h }.
function bayDoor(piece, bay, g) {
  const count = doorsIn(piece, bay);
  if (!count) return { count: 0, w: 0, h: 0 };
  const h = r1(g.Hc - 0.4 - visibleFrontHeight(bay.items));
  return { count: h >= 15 ? count : 0, w: r1(g.outerBayW / count - 0.3), h };
}

// ---------- cut list ----------
// Every board of a piece: { ref, part, w, h, t, qty, material }. `ref.part` says where it belongs.
export function cutListFor(piece) {
  const g = pieceGeometry(piece);
  const out = [];
  const body = piece.carcass.material, front = piece.fronts.material;
  const W = piece.width, D = piece.depth;
  const add = (ref, part, w, h, t, qty, material) => {
    if (qty > 0 && w > 0 && h > 0) out.push({ ref: { pieceId: piece.id, ...ref }, part, w: r1(w), h: r1(h), t: r1(t), qty, material });
  };
  const n = piece.bays.length;
  const type = piece.type;

  if (type === 'table') {
    add({ part: 'worktop' }, piece.worktop ? 'worktop' : 'top', W, D, g.slab, 1, piece.worktop || front);
    add({ part: 'frame' }, 'leg', 5.5, piece.height - g.slab, 5.5, 4, front);
    add({ part: 'frame' }, 'apron', W - 11, 8, 2.2, 2, front);
    add({ part: 'frame' }, 'apron', D - 11, 8, 2.2, 2, front);
    if (W > 200) add({ part: 'frame' }, 'stretcher', D - 11, 8, 2.2, 1, front);
    return out;
  }
  const legged = type === 'desk' && piece.bays.every((b) => !b.items.length) && piece.fronts.kind === 'none';
  if (type === 'desk') {
    add({ part: 'worktop' }, piece.worktop ? 'worktop' : 'top', W, D, g.slab, 1, piece.worktop || front);
    if (legged) {
      add({ part: 'frame' }, 'leg', 5, g.Hc, 5, 4, front);
      add({ part: 'frame' }, 'apron', W - 10, 8, 2.2, 2, front);
      add({ part: 'frame' }, 'apron', D - 10, 8, 2.2, 2, front);
      return out;
    }
  }

  const innerH = g.innerH;
  add({ part: 'carcass' }, 'side', type === 'desk' ? D - 2 : D, g.Hc, BOARD, 2, body);
  if (type === 'window-seat') add({ part: 'worktop' }, 'top', W, D, g.slab, 1, front);
  else if (type === 'kitchen-base' || type === 'island') add({ part: 'carcass' }, 'stretcher', W - 2 * LAYOUT_T, 8, BOARD, 2, body);
  else if (type !== 'desk') add({ part: 'carcass' }, 'top', W - 2 * LAYOUT_T, D - 1, BOARD, 1, body);
  if (type !== 'desk') add({ part: 'carcass' }, 'bottom', W - 2 * LAYOUT_T, D - 1, BOARD, 1, body);
  add({ part: 'carcass' }, 'back', W - 2 * LAYOUT_T, type === 'desk' ? 35 : innerH, type === 'desk' ? BOARD : BACK, 1, body);
  add({ part: 'carcass' }, 'divider', D - 1.5, innerH, BOARD, n - 1, body);
  if (g.plinth > 0) {
    add({ part: 'carcass' }, 'plinth', W - 4, g.plinth, BOARD, 1, body);
    add({ part: 'carcass' }, 'plinth', D - 8, g.plinth, BOARD, 2, body);
  }
  if (type === 'kitchen-base' && piece.worktop) add({ part: 'worktop' }, 'worktop', W, D + 2, g.slab, 1, piece.worktop);
  if (type === 'island' && piece.worktop) add({ part: 'worktop' }, 'worktop', W + 6, D + 30, g.slab, 1, piece.worktop);

  // doors
  if (piece.fronts.kind === 'sliding') {
    const count = slidingPanels(piece);
    const stack = Math.max(0, ...piece.bays.map((b) => visibleFrontHeight(b.items)));
    add({ part: 'sliding' }, 'door', (W + (count - 1) * 3) / count, g.Hc - 0.4 - stack, FRONT, count, front);
  } else {
    piece.bays.forEach((bay, bi) => {
      const d = bayDoor(piece, bay, g);
      if (!d.count) return;
      const ref = { bay: bi, part: 'doors' };
      if (piece.fronts.kind === 'glass') {
        add(ref, 'door', 5.5, d.h, FRONT, 2 * d.count, front);
        add(ref, 'door', d.w - 11, 5.5, FRONT, 2 * d.count, front);
      } else {
        add(ref, 'door', d.w, d.h, FRONT, d.count, front);
      }
    });
  }

  // items
  piece.bays.forEach((bay, bi) => {
    bay.items.forEach((it, ii) => {
      const def = ITEMS[it.kind];
      if (!def) return;
      const ctx = { bayW: bay.width, depth: D, innerH, outerW: g.outerBayW };
      def.boards(it, ctx).forEach((b) => add({ bay: bi, item: ii }, b.part, b.w, b.h, b.t, b.qty, b.use === 'front' ? front : body));
    });
  });
  return out;
}

// ---------- the quote ----------
const GROUPS = ['Materials', 'Hardware', 'Workshop labour', 'Fitting'];

function quotePiece(project, piece, label, placement) {
  const T = TYPES[piece.type];
  const g = pieceGeometry(piece);
  const lines = [];
  let hours = 0;
  const pathOf = (ref, text) => {
    const parts = [label];
    if (ref.bay !== undefined) parts.push(`Bay ${ref.bay + 1}`);
    if (text) parts.push(text);
    return parts.join(' > ');
  };
  const line = (group, ref, text, qty, unit, c) => {
    if (!c) return;
    const full = { pieceId: piece.id, ...ref };
    lines.push({ ref: full, label: text, path: pathOf(ref, text), group, qty, unit, amount: money(c), cents: c });
  };
  const hw = (key, qty) => {
    const e = PRICES_V2.hardware[key];
    return e ? cents(e.price * qty) : 0;
  };
  const handleC = PRICES.handle[piece.fronts.handle] ?? 0;

  // Materials: boards grouped by where they belong
  const boards = cutListFor(piece);
  const groupBoards = (match) => boards.filter(match);
  const sumBoards = (bs) => ({ c: bs.reduce((s, b) => s + boardCents(b), 0), m2: bs.reduce((s, b) => s + area(b), 0) });
  for (const [part, text] of [['carcass', 'Carcass boards'], ['frame', 'Frame'], ['worktop', piece.type === 'desk' || piece.type === 'table' ? 'Top' : piece.type === 'window-seat' ? 'Seat lid' : 'Worktop'], ['sliding', 'Sliding doors']]) {
    const s = sumBoards(groupBoards((b) => b.ref.part === part && b.ref.bay === undefined));
    line('Materials', { part }, text, r3(s.m2), 'm²', s.c);
  }
  piece.bays.forEach((bay, bi) => {
    const s = sumBoards(groupBoards((b) => b.ref.bay === bi && b.ref.part === 'doors'));
    line('Materials', { bay: bi, part: 'doors' }, 'Doors', r3(s.m2), 'm²', s.c);
    if (piece.fronts.kind === 'glass') {
      const d = bayDoor(piece, bay, g);
      const m2 = (d.count * Math.max(0, d.w - 11) * Math.max(0, d.h - 11)) / 10000;
      line('Materials', { bay: bi, part: 'doors' }, 'Door glass', r3(m2), 'm²', cents(m2 * PRICES.glassPerM2));
    }
    bay.items.forEach((it, ii) => {
      const def = ITEMS[it.kind];
      if (!def) return;
      const bs = groupBoards((b) => b.ref.bay === bi && b.ref.item === ii);
      const s = sumBoards(bs);
      line('Materials', { bay: bi, item: ii }, describeItem(it), r3(s.m2), 'm²', s.c);
    });
  });

  // Hardware
  piece.bays.forEach((bay, bi) => {
    const d = bayDoor(piece, bay, g);
    if (d.count) {
      const hinges = d.count * hingesFor(d.h);
      line('Hardware', { bay: bi, part: 'doors' }, 'Hinges', hinges, 'pc', cents(hinges * PRICES_V2.hinge));
      line('Hardware', { bay: bi, part: 'doors' }, 'Door handles', d.count, 'pc', d.count * cents(handleC));
    }
    const ctxBase = { bayW: bay.width, depth: piece.depth, innerH: g.innerH, outerW: g.outerBayW };
    bay.items.forEach((it, ii) => {
      const def = ITEMS[it.kind];
      if (!def) return;
      const c = def.hardware(it, ctxBase).reduce((s, h) => s + hw(h.key, h.qty), 0) + def.handles(it) * cents(handleC);
      line('Hardware', { bay: bi, item: ii }, describeItem(it), 1, 'set', c);
    });
  });
  if (piece.fronts.kind === 'sliding') {
    const count = slidingPanels(piece);
    line('Hardware', { part: 'sliding' }, 'Sliding track', r1(piece.width / 100), 'm', cents((piece.width / 100) * PRICES.slidingTrack));
    line('Hardware', { part: 'sliding' }, 'Door handles', count, 'pc', count * cents(handleC));
  }
  if (g.plinth > 0) line('Hardware', { part: 'plinth' }, 'Plinth feet', r1(piece.width / 100), 'm', cents((piece.width / 100) * PRICES.plinthPerMetre));

  // Workshop labour
  const rate = PRICES.labourPerHour;
  const L = PRICES_V2.labour;
  const labour = (ref, text, h) => {
    if (h <= 0) return;
    hours += h;
    line('Workshop labour', ref, text, r1(h * 100) / 100, 'h', cents(h * rate));
  };
  labour({ part: 'base' }, `${T.label} workshop time`, L.baseHours[piece.type] ?? 6);
  labour({ part: 'bays' }, 'Extra bays', (piece.bays.length - 1) * L.extraBayHours);
  if (piece.fronts.kind === 'sliding') labour({ part: 'sliding' }, 'Sliding doors', slidingPanels(piece) * L.slidingPanelHours);
  if (g.plinth > 0) labour({ part: 'plinth' }, 'Plinth', L.plinthHours);
  if (piece.worktop) labour({ part: 'worktop' }, 'Worktop', MATERIALS[piece.worktop].kind === 'stone' ? L.stoneWorktopHours : L.worktopHours);
  piece.bays.forEach((bay, bi) => {
    const d = bayDoor(piece, bay, g);
    if (d.count) labour({ bay: bi, part: 'doors' }, 'Doors', d.count * (L.doorHours + (piece.fronts.kind === 'glass' ? L.glassDoorHours : 0)));
    bay.items.forEach((it, ii) => {
      const def = ITEMS[it.kind];
      if (def) labour({ bay: bi, item: ii }, describeItem(it), def.minutes(it) / 60);
    });
  });

  // Fitting (placed pieces only)
  if (placement) {
    const F = PRICES_V2.fitting;
    line('Fitting', { part: 'fitting' }, 'Fitting', 1, 'pc', cents(F.base + (piece.width / 100) * F.perMetre));
    const room = project.room;
    const fp = footprintOf(project, placement);
    if (fp) {
      const lowest = Math.min(...fp.corners.map((c) => ceilingHeightAt(room, c.x, c.z)));
      if (room.slope && lowest < room.height - 0.5 && placement.elevation + piece.height > lowest - 25) {
        line('Fitting', { part: 'fitting' }, 'Scribing to the sloping ceiling', 1, 'pc', cents(F.slope));
      }
    }
    if (piece.radiatorCutout && placement.mode === 'wall') {
      const wall = wallById(room, placement.wallId);
      const hits = wall ? room.openings.filter((o) => o.type === 'radiator' && o.wallId === wall.id
        && placement.offset < o.offset + o.width && o.offset < placement.offset + piece.width
        && placement.elevation < o.bottom + o.height && o.bottom < placement.elevation + piece.height).length : 0;
      if (hits) line('Fitting', { part: 'fitting' }, 'Radiator cut-out', hits, 'pc', hits * cents(F.radiator));
    }
  }

  const total = lines.reduce((s, l) => s + l.cents, 0);
  const itemMap = new Map();
  for (const l of lines) {
    if (l.ref.item === undefined) continue;
    const key = `${l.ref.bay}:${l.ref.item}`;
    const e = itemMap.get(key);
    if (e) { e.cents += l.cents; e.amount = money(e.cents); }
    else itemMap.set(key, { ref: { pieceId: piece.id, bay: l.ref.bay, item: l.ref.item }, label: l.label, path: l.path, cents: l.cents, amount: money(l.cents) });
  }
  return { id: piece.id, label, lines, items: [...itemMap.values()], total: money(total), cents: total, hours, boards };
}

export function quoteProject(project, { vat = true } = {}) {
  const placements = new Map((project.placements || []).map((pl) => [pl.pieceId, pl]));
  const quotes = [];
  const unplaced = [];
  let hours = 0;
  for (const piece of project.pieces || []) {
    if (!TYPES[piece.type]) continue;
    const placement = placements.get(piece.id);
    if (!placement) unplaced.push(piece.id);
    const q = quotePiece(project, piece, pieceLabel(project, piece.id), placement);
    hours += q.hours;
    quotes.push(q);
  }

  const merged = new Map(), byMat = {};
  for (const q of quotes) {
    for (const b of q.boards) {
      const key = `${b.material}|${b.part}|${b.w}|${b.h}|${b.t}`;
      const e = merged.get(key);
      if (e) e.qty += b.qty; else merged.set(key, { material: b.material, part: b.part, w: b.w, h: b.h, t: b.t, qty: b.qty });
      byMat[b.material] = (byMat[b.material] || 0) + area(b);
    }
  }
  Object.keys(byMat).forEach((k) => { byMat[k] = r3(byMat[k]); });
  const cutList = [...merged.values()].sort((a, b) =>
    a.material.localeCompare(b.material) || a.part.localeCompare(b.part) || a.w - b.w || a.h - b.h);

  const lines = GROUPS.map((group) => {
    const c = quotes.reduce((s, q) => s + q.lines.filter((l) => l.group === group).reduce((t, l) => t + l.cents, 0), 0);
    return { label: group, amount: money(c), cents: c };
  });
  const fee = quotes.length ? cents(PRICES.designFee) : 0;
  lines.push({ label: 'Design fee', amount: money(fee), cents: fee });

  const subtotal = lines.reduce((s, l) => s + l.cents, 0);
  const vatC = vat ? Math.round(subtotal * PRICES.vat) : 0;
  return {
    pieces: quotes.map(({ boards, hours: h, ...rest }) => rest),
    lines,
    subtotal: money(subtotal), vat: money(vatC), total: money(subtotal + vatC),
    cents: { subtotal, vat: vatC, total: subtotal + vatC },
    cutList, boardM2ByMaterial: byMat,
    leadTimeWeeks: 4 + Math.ceil(hours / 40),
    unplaced
  };
}
