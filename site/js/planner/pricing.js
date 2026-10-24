// Planner v2 pricing: cut list and quote built from the project. Pure; money in integer cents.
import { PRICES } from '../configurator/pricing.js';
import {
  ITEMS, TYPES, MATERIALS, LAYOUT_T, pieceGeometry, describeItem, pieceLabel, visibleFrontHeight,
  footprintOf, ceilingHeightAt, wallById, surfacesOf, roleSegments, legCount, SCRIBE, TOP_CAP
} from './model.js';
import { pricePerM2, canonicalId, isStone } from './materials.js';

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
    keyboardRunner: { label: 'Keyboard runner',       unit: 'pc',  price: 58 },
    railFinish:     { label: 'Rail finish',           unit: 'EUR', price: 1 },       // qty is the extra EUR (metres x the finish's price per metre)
    swivelFitting:  { label: 'Swivel mirror fitting', unit: 'pc',  price: 58 },
    ledDoorSwitch:  { label: 'Door switch for LED',   unit: 'pc',  price: 18 },
    feltInsert:     { label: 'Felt tray insert',      unit: 'pc',  price: 16 },
    shoeLip:        { label: 'Shoe rack toe lip',     unit: 'pc',  price: 3 },
    spiceRack:      { label: 'Spice pull-out frame',  unit: 'pc',  price: 96 },
    spiceTier:      { label: 'Spice tier',            unit: 'pc',  price: 9 },
    larderFrame:    { label: 'Larder pull-out frame', unit: 'pc',  price: 340 }
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
  slabThickness: { desk: 3.8, table: 3.8, 'window-seat': 3.2 },
  // Looks: handle by style (EUR each, medium size, black), multiplied by size and finish; legs; extra workshop time per front.
  handle: { bar: 14, knob: 9, cup: 16, edge: 0, push: 22 },
  handleSize: { short: 0.8, medium: 1, long: 1.5 },
  leg: { wood: 24, metal: 16 },
  look: {
    designHours: { slab: 0, shaker: 0.6, ribbed: 0.9, glass: 0 },   // per front
    edgeHours: { square: 0, chamfer: 0.2, round: 0.35 },            // per front
    routedPullHours: 0.15,                                            // per front with a routed finger pull
    overhangHours: 0.5, corniceHours: 0.9, corniceMetre: 36, scribeHours: 0.4, twoToneHours: 0.6, gableHours: 0.3, legHours: 0.3,
    interiorHours: 0.5                                                // a separate inside material: extra edging and sorting
  }
};

// ---------- helpers ----------
const BOARD = 1.8, BACK = 0.8, FRONT = 1.9;
const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;
const area = (b) => (b.w * b.h * b.qty) / 10000;
const cents = (euros) => Math.round(euros * 100);
const money = (c) => c / 100;
const boardCents = (b) => cents(area(b) * pricePerM2({ material: b.material, finish: b.finish }, b.role) * PRICES.wasteFactor);
const handleCents = (piece) => {
  const f = piece.fronts;
  const fin = MATERIALS[canonicalId(f.handleFinish)];
  const finishF = f.handle === 'push' || f.handle === 'edge' ? 1 : (fin && fin.factor) || 1;
  return cents((PRICES_V2.handle[f.handle] ?? 0) * (PRICES_V2.handleSize[f.handleSize] ?? 1) * finishF);
};

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
// Every board of a piece: { ref, part, w, h, t, qty, material, finish }. `ref.part` says where it belongs.
export function cutListFor(piece) {
  const g = pieceGeometry(piece);
  const out = [];
  const S = surfacesOf(piece);
  const look = piece.look || {};
  const body = S.carcass, inside = S.interior, front = S.front;
  const W = piece.width, D = piece.depth;
  const add = (ref, part, w, h, t, qty, spec) => {
    if (qty > 0 && w > 0 && h > 0) {
      const role = spec === front || spec === topSpec || spec === woodSpec || (S.upper && spec === S.upper) ? 'front' : 'board';
      out.push({ ref: { pieceId: piece.id, ...ref }, part, w: r1(w), h: r1(h), t: r1(t), qty, material: spec.material, finish: spec.finish || 'matte', role });
    }
  };
  const n = piece.bays.length;
  const type = piece.type;
  const woodSpec = { material: 'oak', finish: 'matte' };
  const topSpec = piece.worktop ? { material: piece.worktop, finish: 'matte' } : front;

  if (type === 'table') {
    add({ part: 'worktop' }, piece.worktop ? 'worktop' : 'top', W, D, g.slab, 1, topSpec);
    add({ part: 'frame' }, 'leg', 5.5, piece.height - g.slab, 5.5, 4, front);
    add({ part: 'frame' }, 'apron', W - 11, 8, 2.2, 2, front);
    add({ part: 'frame' }, 'apron', D - 11, 8, 2.2, 2, front);
    if (W > 200) add({ part: 'frame' }, 'stretcher', D - 11, 8, 2.2, 1, front);
    return out;
  }
  const legged = type === 'desk' && piece.bays.every((b) => !b.items.length) && piece.fronts.kind === 'none';
  if (type === 'desk') {
    add({ part: 'worktop' }, piece.worktop ? 'worktop' : 'top', W, D, g.slab, 1, topSpec);
    if (legged) {
      add({ part: 'frame' }, 'leg', 5, g.Hc, 5, 4, front);
      add({ part: 'frame' }, 'apron', W - 10, 8, 2.2, 2, front);
      add({ part: 'frame' }, 'apron', D - 10, 8, 2.2, 2, front);
      return out;
    }
  }

  const innerH = g.innerH;
  add({ part: 'carcass' }, 'side', type === 'desk' ? D - 2 : D, g.Hc, BOARD, 2, look.gables ? front : body);
  if (type === 'window-seat') add({ part: 'worktop' }, 'top', W, D, g.slab, 1, front);
  else if (type === 'kitchen-base' || type === 'island') add({ part: 'carcass' }, 'stretcher', W - 2 * LAYOUT_T, 8, BOARD, 2, body);
  else if (type !== 'desk') add({ part: 'carcass' }, 'top', W - 2 * LAYOUT_T, D - 1, BOARD, 1, body);
  if (type !== 'desk') add({ part: 'carcass' }, 'bottom', W - 2 * LAYOUT_T, D - 1, BOARD, 1, body);
  // a bay may have its own colour (a neutral from the table) and its own back: closed, open to the wall, or a mirror
  const bayInside = (bi) => (piece.bays[bi] && piece.bays[bi].colour ? { material: piece.bays[bi].colour, finish: 'matte' } : inside);
  const plainBacks = piece.bays.every((b) => !b.colour && (!b.back || b.back === 'closed'));
  if (plainBacks || type === 'desk') {
    add({ part: 'carcass' }, 'back', W - 2 * LAYOUT_T, type === 'desk' ? 35 : innerH, type === 'desk' ? BOARD : BACK, 1, inside);
    add({ part: 'carcass' }, 'divider', D - 1.5, innerH, BOARD, n - 1, inside);
  } else {
    piece.bays.forEach((b, bi) => {
      if (!b.back || b.back === 'closed') add({ bay: bi, part: 'back' }, 'back', b.width + LAYOUT_T, innerH, BACK, 1, bayInside(bi));
      if (bi < n - 1) add({ part: 'carcass' }, 'divider', D - 1.5, innerH, BOARD, 1, bayInside(bi));
    });
  }
  if (g.plinth > 0 && look.base !== 'legs') {
    add({ part: 'carcass' }, 'plinth', W - 4, g.plinth, BOARD, 1, body);
    add({ part: 'carcass' }, 'plinth', D - 8, g.plinth, BOARD, 2, body);
  }
  if (type === 'kitchen-base' && piece.worktop) add({ part: 'worktop' }, 'worktop', W, D + 2, g.slab, 1, topSpec);
  if (type === 'island' && piece.worktop) add({ part: 'worktop' }, 'worktop', W + 6, D + 30, g.slab, 1, topSpec);

  // top treatment and scribe strips (front material)
  if (look.top === 'overhang' && g.cap) add({ part: 'trim' }, 'top cap', W, D + 2, g.cap, 1, front);
  if (look.top === 'cornice' && g.cap) {
    add({ part: 'trim' }, 'cornice front', W, g.cap, 2.2, 1, front);
    add({ part: 'trim' }, 'cornice returns', 3.5, g.cap, 2.2, 2, front);
  }
  if (look.scribe && type !== 'desk') {
    add({ part: 'trim' }, 'scribe top', W, SCRIBE.top, 1.2, 1, front);
    add({ part: 'trim' }, 'scribe side', SCRIBE.side, g.Hc, 1.2, 2, front);
  }

  // doors
  const roles = (hLo, hHi) => roleSegments(hLo, hHi, piece);
  if (piece.fronts.kind === 'sliding') {
    const count = slidingPanels(piece);
    const stack = Math.max(0, ...piece.bays.map((b) => visibleFrontHeight(b.items)));
    add({ part: 'sliding' }, 'door', (W + (count - 1) * 3) / count, g.Hc - 0.4 - stack, FRONT, count, front);
  } else {
    piece.bays.forEach((bay, bi) => {
      const d = bayDoor(piece, bay, g);
      if (!d.count) return;
      const ref = { bay: bi, part: 'doors' };
      for (const seg of doorParts(piece, bay, d, g)) {
        const spec = seg.role === 'upper' && S.upper ? S.upper : front;
        if (piece.fronts.kind === 'glass') {
          add(ref, 'door', 5.5, seg.h, FRONT, 2 * d.count, spec);
          add(ref, 'door', d.w - 11, 5.5, FRONT, 2 * d.count, spec);
        } else {
          add(ref, 'door', d.w, seg.h, FRONT, d.count, spec);
        }
      }
    });
  }
  void roles;

  // items
  piece.bays.forEach((bay, bi) => {
    bay.items.forEach((it, ii) => {
      const def = ITEMS[it.kind];
      if (!def) return;
      const ctx = { bayW: bay.width, depth: D, innerH, outerW: g.outerBayW };
      def.boards(it, ctx).forEach((b) => {
        let spec = b.use === 'front' ? front : b.use === 'wood' ? woodSpec : bayInside(bi);
        if ((b.use === 'front' || b.use === 'wood') && S.upper && b.use === 'front') {
          const y = g.plinth + LAYOUT_T + (it.y || 0);
          if (y >= piece.look.split) spec = S.upper;
        }
        add({ bay: bi, item: ii }, b.part, b.w, b.h, b.t, b.qty, spec);
      });
    });
  });
  return out;
}

// The pieces a bay's door is made of: one, or two stacked when the piece is two-tone. [{ h, role }]
function doorParts(piece, bay, d, g) {
  if (!piece.look || !piece.look.upper) return [{ h: d.h, role: 'front' }];
  const lo = g.plinth + visibleFrontHeight(bay.items), hi = g.plinth + g.Hc;
  const segs = roleSegments(lo, hi, piece);
  if (segs.length < 2) return [{ h: d.h, role: segs[0].role }];
  const total = segs.reduce((s, x) => s + (x.hi - x.lo), 0);
  return segs.map((x) => ({ h: r1(d.h * ((x.hi - x.lo) / total)), role: x.role }));
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
    if (ref.bay !== undefined) parts.push(`Section ${ref.bay + 1}`);
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
  const hC = handleCents(piece);
  const look = piece.look || {};

  // Materials: boards grouped by where they belong
  const boards = cutListFor(piece);
  const groupBoards = (match) => boards.filter(match);
  const sumBoards = (bs) => ({ c: bs.reduce((s, b) => s + boardCents(b), 0), m2: bs.reduce((s, b) => s + area(b), 0) });
  for (const [part, text] of [['carcass', 'Carcass boards'], ['frame', 'Frame'], ['worktop', piece.type === 'desk' || piece.type === 'table' ? 'Top' : piece.type === 'window-seat' ? 'Seat lid' : 'Worktop'], ['sliding', 'Sliding doors'], ['trim', 'Top and trim']]) {
    const s = sumBoards(groupBoards((b) => b.ref.part === part && b.ref.bay === undefined));
    line('Materials', { part }, text, r3(s.m2), 'm²', s.c);
  }
  piece.bays.forEach((bay, bi) => {
    const s = sumBoards(groupBoards((b) => b.ref.bay === bi && b.ref.part === 'doors'));
    line('Materials', { bay: bi, part: 'doors' }, 'Doors', r3(s.m2), 'm²', s.c);
    if (piece.fronts.kind === 'glass') {
      const d = bayDoor(piece, bay, g);
      const m2 = (d.count * Math.max(0, d.w - 11) * Math.max(0, d.h - 11)) / 10000;
      line('Materials', { bay: bi, part: 'doors' }, 'Door glass', r3(m2), 'm²', cents(m2 * pricePerM2({ material: look.glass })));
    }
    const back = sumBoards(groupBoards((b) => b.ref.bay === bi && b.ref.part === 'back'));
    line('Materials', { bay: bi, part: 'back' }, 'Back panel', r3(back.m2), 'm²', back.c);
    if (bay.back === 'mirror') {
      const m2 = (bay.width * g.innerH) / 10000;
      line('Materials', { bay: bi, part: 'back' }, 'Mirror back panel', r3(m2), 'm²', hw('mirrorM2', m2));
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
      const parts = doorParts(piece, bay, d, g);
      const hinges = parts.reduce((sum, x) => sum + d.count * hingesFor(x.h), 0);
      line('Hardware', { bay: bi, part: 'doors' }, 'Hinges', hinges, 'pc', cents(hinges * PRICES_V2.hinge));
      line('Hardware', { bay: bi, part: 'doors' }, 'Door handles', d.count * parts.length, 'pc', d.count * parts.length * hC);
    }
    const ctxBase = { bayW: bay.width, depth: piece.depth, innerH: g.innerH, outerW: g.outerBayW };
    bay.items.forEach((it, ii) => {
      const def = ITEMS[it.kind];
      if (!def) return;
      const c = def.hardware(it, ctxBase).reduce((s, h) => s + hw(h.key, h.qty), 0) + def.handles(it) * hC;
      line('Hardware', { bay: bi, item: ii }, describeItem(it), 1, 'set', c);
    });
  });
  if (piece.fronts.kind === 'sliding') {
    const count = slidingPanels(piece);
    line('Hardware', { part: 'sliding' }, 'Sliding track', r1(piece.width / 100), 'm', cents((piece.width / 100) * PRICES.slidingTrack));
    line('Hardware', { part: 'sliding' }, 'Door handles', count, 'pc', count * hC);
  }
  if (g.plinth > 0 && look.base === 'legs') {
    const n = legCount(piece.width), metal = look.legs !== 'wood';
    const fin = MATERIALS[canonicalId(look.legs)];
    const each = metal ? PRICES_V2.leg.metal * ((fin && fin.factor) || 1) : PRICES_V2.leg.wood;
    line('Hardware', { part: 'plinth' }, metal ? 'Metal legs' : 'Wooden legs', n, 'pc', cents(each * n));
  } else if (g.plinth > 0) line('Hardware', { part: 'plinth' }, 'Plinth feet', r1(piece.width / 100), 'm', cents((piece.width / 100) * PRICES.plinthPerMetre));

  // Workshop labour
  const rate = PRICES.labourPerHour;
  const L = PRICES_V2.labour;
  const labour = (ref, text, h) => {
    if (h <= 0) return;
    hours += h;
    line('Workshop labour', ref, text, r1(h * 100) / 100, 'h', cents(h * rate));
  };
  labour({ part: 'base' }, `${T.label} workshop time`, L.baseHours[piece.type] ?? 6);
  labour({ part: 'bays' }, 'Extra sections', (piece.bays.length - 1) * L.extraBayHours);
  if (piece.fronts.kind === 'sliding') labour({ part: 'sliding' }, 'Sliding doors', slidingPanels(piece) * L.slidingPanelHours);
  if (g.plinth > 0) labour({ part: 'plinth' }, look.base === 'legs' ? 'Legs' : 'Plinth', look.base === 'legs' ? PRICES_V2.look.legHours : L.plinthHours);
  // look: front design, edges, routed pulls, top, scribe, two-tone, separate inside, end panels
  {
    const V = PRICES_V2.look;
    let fronts = piece.fronts.kind === 'sliding' ? slidingPanels(piece) : 0;
    piece.bays.forEach((bay) => {
      const d = bayDoor(piece, bay, g);
      if (d.count) fronts += d.count * doorParts(piece, bay, d, g).length;
      bay.items.forEach((it) => { const def = ITEMS[it.kind]; if (def) fronts += def.handles(it); });
    });
    const design = piece.fronts.kind === 'glass' ? 'glass' : look.design;
    const designName = { shaker: 'Shaker frames', ribbed: 'Ribbed fronts' }[design];
    if (fronts && designName) labour({ part: 'look' }, designName, fronts * (V.designHours[design] || 0));
    if (fronts && look.edge && look.edge !== 'square') labour({ part: 'look' }, look.edge === 'round' ? 'Rounded front edges' : 'Chamfered front edges', fronts * V.edgeHours[look.edge]);
    if (fronts && piece.fronts.handle === 'edge' && piece.fronts.kind !== 'open' && piece.fronts.kind !== 'none') labour({ part: 'look' }, 'Routed finger pulls', fronts * V.routedPullHours);
    if (look.top === 'overhang' && g.cap) labour({ part: 'trim' }, 'Top with overhang', V.overhangHours);
    if (look.top === 'cornice' && g.cap) {
      line('Materials', { part: 'trim' }, 'Crown moulding', r1(piece.width / 100), 'm', cents((piece.width / 100) * V.corniceMetre));
      labour({ part: 'trim' }, 'Crown moulding', V.corniceHours);
    }
    if (look.scribe && piece.type !== 'desk') labour({ part: 'trim' }, 'Scribe strips', V.scribeHours);
    if (look.upper) labour({ part: 'look' }, 'Two-tone fronts', V.twoToneHours);
    if (look.gables) labour({ part: 'look' }, 'End panels', V.gableHours);
    if (piece.interior) labour({ part: 'look' }, 'Separate inside material', V.interiorHours);
  }
  if (piece.worktop) labour({ part: 'worktop' }, 'Worktop', isStone(piece.worktop) ? L.stoneWorktopHours : L.worktopHours);
  piece.bays.forEach((bay, bi) => {
    if (bay.back === 'mirror') labour({ bay: bi, part: 'back' }, 'Fitting the mirror back panel', 0.6);
    if (bay.colour) labour({ bay: bi, part: 'back' }, 'Section colour', 0.3);
    const d = bayDoor(piece, bay, g);
    if (d.count) labour({ bay: bi, part: 'doors' }, 'Doors', d.count * doorParts(piece, bay, d, g).length * (L.doorHours + (piece.fronts.kind === 'glass' ? L.glassDoorHours : 0)));
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
