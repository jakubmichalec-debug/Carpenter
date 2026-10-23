// Step 3: Interior. A front elevation of the selected piece with the doors hidden, drawn to scale. Bays are set with a
// count, draggable dividers and number inputs. Items come from a palette (drag it in, or select a bay and press the
// tile), move up and down on the 32 mm grid (drag, arrow keys, or a number), and have an inspector for their options.
import {
  ITEMS, TYPES, LAYOUT_T, DOOR_SIDES, GRID, maxBaysFor, pieceGeometry, presetsFor, describeItem, normalizeItem, snapY, pieceLabel
} from '../model.js';
import { bayLayout, bayAt, suggestY, dragDivider, resizeBay, nudgeY, itemsProblems, changeBayCount } from '../interior-geom.js';
import { esc, clamp, fieldHtml, wireFields, syncFields, pieceChipsHtml, notesHtml, ICON_TRASH } from './shared.js';
import { drawItem, thumbSvg } from './interior-draw.js';
import { MATERIALS, materialsFor } from '../materials.js';
import { BACKS } from '../model.js';

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const cm = (n) => `${Math.round(n * 10) / 10}`;

const PARAM_LABEL = {
  material: 'Material', adjustable: 'Adjustable on pins', count: 'How many', front: 'Front height', lining: 'Lining colour', insert: 'Divider insert',
  rows: 'Rows', angled: 'Angled rows', lip: 'Toe lip on each row', side: 'Side', depth: 'Depth', bags: 'Bags', mode: 'Mirror type', height: 'Height',
  position: 'Distance from the left', tone: 'Light colour', trigger: 'Switched on', bins: 'Bins', size: 'Drawer height', face: 'Drawer front',
  length: 'Length', finish: 'Finish', shape: 'Shape', tiers: 'Tiers', baskets: 'Baskets', grid: 'Compartments'
};
const PARAM_UNIT = { front: 'cm', depth: 'cm', height: 'cm', position: 'cm' };
const VALUE_LABEL = {
  size: { low: 'Low, about 18 cm', medium: 'Medium, about 28 cm', deep: 'Deep, about 38 cm' },
  face: { same: 'Same as the doors', wood: 'Plain oak', glass: 'Glass in a slim frame' },
  insert: { none: 'None', cutlery: 'Cutlery tray', socks: 'Sock and underwear dividers', jewellery: 'Jewellery tray', felt: 'Felt lining' },
  length: { long: 'Long, hangs 150 cm', short: 'Short, hangs 95 cm' },
  trigger: { always: 'Always on', door: 'On when the door opens', motion: 'Motion sensor' },
  mode: { fixed: 'Fixed inside the door', swivel: 'Swivel', 'pull-out': 'Pull-out' },
  finish: { chrome: 'Chrome', nickel: 'Matt nickel', black: 'Black', white: 'White' },
  lining: { grey: 'Grey', sand: 'Sand', charcoal: 'Charcoal' },
  material: { body: 'Same as the inside', glass: 'Glass', wood: 'Wood', wire: 'Wire' },
  tone: { warm: 'Warm white', neutral: 'Neutral white' },
  shape: { round: 'Round', kidney: 'Kidney' }
};
const valueLabel = (name, v) => (VALUE_LABEL[name] && VALUE_LABEL[name][v]) || (String(v).charAt(0).toUpperCase() + String(v).slice(1));
const BACK_LABEL = { closed: 'Closed', open: 'Open to the wall', mirror: 'Mirror' };
const DOOR_LABEL = { left: 'Hinged on the left', right: 'Hinged on the right', double: 'Two doors', none: 'No door' };

export function createInteriorStep(root, { insideBox, dock, store, announce = () => {}, showInside = () => {} }) {
  let state = store.getState();
  let validation = { errors: [] };
  let chipsKey = '', baysKey = '', paletteKey = '', inspKey = '', notesKey = '', drawKey = '';
  let layoutPx = null;       // px transform of the current drawing
  let drag = null;           // an item or divider being dragged inside the drawing
  let pal = null;            // a palette tile being dragged in
  let hint = null;           // where a palette drag would drop: { bay, y, kind }
  let ghost = null;
  let suppressClick = false;

  root.innerHTML = `
    <header class="pl-sec__head">
      <p class="eyebrow">Step 3 of 5</p>
      <h2 id="pl-h-interior">Inside</h2>
      <p class="pl-lede" id="pl-i-lede">Pick a bay, then add what goes in it. Drag items up and down, or select one and use the arrow keys (Shift moves ten steps). One step is 32 mm.</p>
    </header>
    <p class="pl-skip"><button type="button" class="pl-link" id="pl-i-jump">Jump to the items you can add</button></p>
    <div id="pl-i-empty" hidden></div>
    <div id="pl-i-main">
      <ul class="pl-notes" id="pl-i-notes" aria-label="Interior checks"></ul>
      <section class="pl-sec" id="pl-i-pieces-sec" aria-labelledby="pl-i-h-piece">
        <header class="pl-sec__row"><h3 id="pl-i-h-piece">Piece</h3></header>
        <div class="pl-chips" id="pl-i-chips" role="group" aria-label="Choose a piece to edit"></div>
      </section>

      <section class="pl-sec" aria-labelledby="pl-i-h-bays">
        <header class="pl-sec__row">
          <h3 id="pl-i-h-bays">Bays</h3>
          <div class="pl-stepper2" role="group" aria-label="Number of bays">
            <button type="button" class="pl-icon" id="pl-i-less" aria-label="One bay fewer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            <output class="pl-stepper2__n" id="pl-i-count" aria-live="polite"></output>
            <button type="button" class="pl-icon" id="pl-i-more" aria-label="One bay more"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          </div>
        </header>
        <div class="pl-chips" id="pl-i-baychips" role="group" aria-label="Choose a bay"></div>
        <div class="pl-form pl-form--grid" id="pl-i-bayform"></div>
        <p class="pl-hint" id="pl-i-bayhint"></p>
      </section>

      <section class="pl-sec pl-sec--add" id="pl-i-addsec" aria-labelledby="pl-i-h-add">
        <header class="pl-sec__row"><h3 id="pl-i-h-add">Add to <span id="pl-i-addbay">bay 1</span></h3></header>
        <div class="pl-presetrow">
          <div class="pl-chips" id="pl-i-presets" role="group" aria-label="Start this bay from a preset"></div>
          <label class="pl-check pl-check--small"><input type="checkbox" id="pl-i-all"><span>Apply to all bays</span></label>
        </div>
        <div class="pl-palette" id="pl-i-palette" role="group" aria-label="Items you can add"></div>
        <p class="pl-hint" id="pl-i-palhint">Press an item to add it to the selected bay. On a computer you can also drag it into the drawing; on a phone drag it by its handle.</p>
      </section>

      <section class="pl-sec" id="pl-i-itemssec" aria-labelledby="pl-i-h-items">
        <header class="pl-sec__row"><h3 id="pl-i-h-items">In <span id="pl-i-itemsbay">bay 1</span></h3></header>
        <div class="pl-itemlist" id="pl-i-list" role="group" aria-label="Items in this bay"></div>
        <div class="pl-inspector" id="pl-i-insp"></div>
      </section>
    </div>`;
  insideBox.innerHTML = `<svg id="pl-in-svg" role="group" aria-label="Front view of the piece with the doors hidden" xmlns="http://www.w3.org/2000/svg"></svg>
    <p class="pl-canvas-hint" id="pl-in-hint">Drag items up and down, or select one and use the arrow keys. Drag the dividers to resize bays.</p>`;

  const $ = (sel) => root.querySelector(sel) || dock.querySelector(sel);
  const svg = insideBox.querySelector('#pl-in-svg');
  const palEl = $('#pl-i-palette');
  // on wide screens the palette sits in a strip under the drawing, so it is always in reach; on phones it stays in the flow
  const addSec = $('#pl-i-addsec'), itemsSec = $('#pl-i-itemssec');
  const wide = matchMedia('(min-width: 1280px)');
  const placePalette = () => {
    if (wide.matches) { if (addSec.parentNode !== dock) dock.appendChild(addSec); }
    else if (addSec.parentNode === dock) itemsSec.before(addSec);
  };
  wide.addEventListener('change', placePalette);
  placePalette();
  $('#pl-i-jump').addEventListener('click', () => {
    const first = palEl.querySelector('.pl-tile__add');
    if (first) { first.scrollIntoView({ block: 'nearest', inline: 'nearest' }); first.focus(); }
  });
  const inspEl = $('#pl-i-insp');
  const cur = () => state.project.pieces.find((p) => p.id === state.ui.pieceId) || null;
  const curBay = (p) => (p ? p.bays[clamp(state.ui.bay, 0, p.bays.length - 1)] : null);
  const hasInterior = (p) => !!p && TYPES[p.type].palette.length > 0;
  const problems = () => itemsProblems(validation.errors, state.ui.pieceId);
  const itemName = (it) => (ITEMS[it.kind] ? ITEMS[it.kind].label : it.kind);

  // ---------- helpers ----------
  const ctxOf = (p, bi) => ({ bayWidth: p.bays[bi].width, innerH: pieceGeometry(p).innerH });
  function rangeOf(p, bi, it) {
    const d = ITEMS[it.kind], g = pieceGeometry(p);
    const [blo, bhi] = d.body(it);
    const zone = d.zone(it);
    const lo = Math.max(0, -blo, zone ? -zone[0] : 0), hi = g.innerH - bhi;
    return [lo, Math.max(lo, hi)];
  }
  function addItem(kind, bay, y) {
    const p = cur();
    if (!p || !ITEMS[kind]) return;
    const at = y === undefined ? suggestY(p, bay, kind) : y;
    const n = p.bays[bay].items.length;
    store.dispatch({ type: 'piece/item/add', bay, item: { kind, y: at } });
    store.dispatch({ type: 'history/seal' });
    const q = cur();
    if (q && q.bays[bay].items.length > n) { announce(`${ITEMS[kind].label} added to bay ${bay + 1}.`); showInside(); }
    else announce(`Bay ${bay + 1} is full.`);
  }

  // ---------- numbers ----------
  const lookup = (bind) => {
    const p = cur();
    if (!p) return undefined;
    if (bind.startsWith('bayw:')) { const b = p.bays[Number(bind.slice(5))]; return b ? b.width : undefined; }
    const it = selectedItem(p);
    if (!it) return undefined;
    if (bind === 'item:y') return it.y;
    if (bind.startsWith('item:')) return it[bind.slice(5)];
    return undefined;
  };
  function selectedItem(p) {
    const b = p && p.bays[state.ui.bay];
    return b && state.ui.item !== null ? b.items[state.ui.item] || null : null;
  }
  wireFields(root, {
    current: lookup,
    seal: () => store.dispatch({ type: 'history/seal' }),
    apply(bind, v) {
      const p = cur();
      if (!p) return;
      if (bind.startsWith('bayw:')) {
        const k = Number(bind.slice(5));
        store.dispatch({ type: 'piece/bays', bays: resizeBay(p.bays.map((b) => b.width), k, v), coalesce: `bayw:${p.id}:${k}` });
      } else if (state.ui.item !== null) {
        const key = `item:${p.id}:${state.ui.bay}:${state.ui.item}:${bind}`;
        if (bind === 'item:y') store.dispatch({ type: 'piece/item/move', bay: state.ui.bay, index: state.ui.item, y: v, coalesce: key });
        else store.dispatch({ type: 'piece/item/update', bay: state.ui.bay, index: state.ui.item, patch: { [bind.slice(5)]: Math.round(v) }, coalesce: key });
      }
    }
  });

  // ---------- sidebar clicks ----------
  $('#pl-i-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-piece]');
    if (b) store.dispatch({ type: 'ui/piece', id: b.dataset.piece });
  });
  $('#pl-i-baychips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bay]');
    if (b) store.dispatch({ type: 'ui/bay', bay: Number(b.dataset.bay) });
  });
  const stepBays = (d) => {
    const p = cur();
    if (!p) return;
    const n = p.bays.length + d;
    store.dispatch({ type: 'piece/update', patch: { bays: changeBayCount(p, n) } });
    store.dispatch({ type: 'history/seal' });
    const q = cur();
    if (q.bays.length === p.bays.length) announce('The number of bays cannot change further.');
    else if (d > 0) announce(`${q.bays.length} bays. The widest bay was split in two.`);
    else {
      const lost = p.bays[p.bays.length - 1].items.length;
      announce(`${q.bays.length} bays. The last bay's width went to its neighbour${lost ? `, and its ${lost === 1 ? 'item was' : `${lost} items were`} removed. Undo brings ${lost === 1 ? 'it' : 'them'} back` : ''}.`);
    }
  };
  $('#pl-i-less').addEventListener('click', () => stepBays(-1));
  $('#pl-i-more').addEventListener('click', () => stepBays(1));
  $('#pl-i-bayform').addEventListener('change', (e) => {
    const el = e.target;
    const p = cur();
    if (p && el.dataset.bayopt) {
      const k = state.ui.bay;
      const bays = p.bays.map((b, i) => {
        if (i !== k) return b;
        const next = { ...b };
        if (el.dataset.bayopt === 'colour') { if (el.value) next.colour = el.value; else delete next.colour; }
        else if (el.value !== 'closed') next.back = el.value; else delete next.back;
        return next;
      });
      store.dispatch({ type: 'piece/update', patch: { bays } });
      store.dispatch({ type: 'history/seal' });
      announce(el.dataset.bayopt === 'colour' ? `Bay ${k + 1} colour changed.` : `Bay ${k + 1} back panel: ${BACK_LABEL[el.value].toLowerCase()}.`);
      return;
    }
    if (!p || !el.dataset.door) return;
    store.dispatch({ type: 'piece/update', patch: { bays: p.bays.map((b, i) => (i === state.ui.bay ? { ...b, door: el.value } : b)) } });
    store.dispatch({ type: 'history/seal' });
  });
  $('#pl-i-bayform').addEventListener('click', (e) => {
    const b = e.target.closest('[data-equal]');
    const p = cur();
    if (!b || !p) return;
    store.dispatch({ type: 'piece/bays', bays: p.bays.length });
    store.dispatch({ type: 'history/seal' });
    announce('Bays set to equal widths.');
  });
  $('#pl-i-presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    const p = cur();
    if (!b || !p) return;
    const all = $('#pl-i-all').checked && p.bays.length > 1;
    const keep = state.ui.bay;
    if (all) {
      for (let i = 0; i < p.bays.length; i++) store.dispatch({ type: 'piece/preset', bay: i, preset: b.dataset.preset, coalesce: 'preset:all' });
      store.dispatch({ type: 'ui/bay', bay: keep });
    } else store.dispatch({ type: 'piece/preset', bay: keep, preset: b.dataset.preset });
    store.dispatch({ type: 'history/seal' });
    announce(`${all ? 'Every bay' : `Bay ${keep + 1}`} started from "${b.textContent.trim()}". Undo brings the old layout back.`);
    showInside();
  });
  palEl.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const b = e.target.closest('[data-kind]');
    if (b && cur()) addItem(b.dataset.kind, state.ui.bay);
  });
  $('#pl-i-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) { store.dispatch({ type: 'ui/item', bay: state.ui.bay, index: Number(b.dataset.pick) }); showInside(); }
  });
  inspEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-delete]')) removeSelected();
  });
  inspEl.addEventListener('change', (e) => {
    const el = e.target;
    if (state.ui.item === null) return;
    let patch = null;
    if (el.dataset.psel) patch = { [el.dataset.psel]: el.value };
    else if (el.dataset.pchk) patch = { [el.dataset.pchk]: el.checked };
    if (!patch) return;
    store.dispatch({ type: 'piece/item/update', bay: state.ui.bay, index: state.ui.item, patch });
    store.dispatch({ type: 'history/seal' });
  });
  function removeSelected() {
    const p = cur(), it = selectedItem(p);
    if (!it) return;
    announce(`${itemName(it)} removed from bay ${state.ui.bay + 1}.`);
    store.dispatch({ type: 'piece/item/remove', bay: state.ui.bay, index: state.ui.item });
    store.dispatch({ type: 'history/seal' });
  }
  $('#pl-i-notes').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const p = cur();
    if (!b || !p) return;
    const d = b.dataset;
    if (d.show) { const [bay, idx] = d.show.split(':').map(Number); store.dispatch({ type: 'ui/item', bay, index: idx }); showInside(); }
    else if (d.bay) store.dispatch({ type: 'ui/bay', bay: Number(d.bay) });
    else if (d.door) {
      const bi = Number(d.door);
      const wide = p.bays[bi].width + LAYOUT_T > 65;
      store.dispatch({ type: 'piece/update', patch: { bays: p.bays.map((b2, i) => (i === bi ? { ...b2, door: wide ? 'double' : 'left' } : b2)) } });
      store.dispatch({ type: 'history/seal' });
    } else if (d.hinged) {
      store.dispatch({ type: 'piece/update', patch: { fronts: { kind: 'hinged' } } });
      store.dispatch({ type: 'history/seal' });
    }
  });

  // ---------- drawing ----------
  function layoutFor(p, W, H) {
    const g = pieceGeometry(p);
    const padL = W < 520 ? 40 : 56, padR = W < 520 ? 14 : 24, padT = 64, padB = 48;
    const total = p.height;
    const s = Math.max(0.2, Math.min((W - padL - padR) / p.width, (H - padT - padB) / total));
    const ox = padL + (W - padL - padR - p.width * s) / 2;
    const y0 = padT + (H - padT - padB + total * s) / 2;
    return { W, H, s, ox, y0, g, padT };
  }

  function renderInside() {
    const W = Math.round(insideBox.clientWidth), H = Math.round(insideBox.clientHeight);
    if (W < 120 || H < 120) return;
    const p = cur();
    const hintEl = insideBox.querySelector('#pl-in-hint');
    if (!p || !hasInterior(p)) {
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.innerHTML = `<text class="pl-empty-text" x="${W / 2}" y="${H / 2}" text-anchor="middle">${p ? `A ${esc(TYPES[p.type].label.toLowerCase())} has no inside to fit out.` : 'Pick a piece in step 2 first.'}</text>`;
      hintEl.hidden = true;
      layoutPx = null;
      return;
    }
    hintEl.hidden = false;
    const L = layoutFor(p, W, H);
    layoutPx = L;
    const { s, ox, y0, g } = L;
    const X = (v) => ox + v * s, Y = (v) => y0 - v * s;
    const lay = bayLayout(p);
    const T = LAYOUT_T;
    const ph = g.plinth, top = ph + g.Hc, yf = ph + T;
    const prob = problems();
    const out = [];
    const focusKey = document.activeElement && svg.contains(document.activeElement) ? document.activeElement.getAttribute('data-focus') : null;

    out.push(`<defs><pattern id="pl-wall-i" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" class="pl-wall-bg"/><path d="M0 8L8 0" class="pl-wall-line"/><circle cx="2" cy="2" r=".7" class="pl-wall-dot"/><circle cx="6" cy="6" r=".7" class="pl-wall-dot"/></pattern><pattern id="pl-hatch-i" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="pl-hatch-line"/></pattern>`
      + lay.map((b) => `<clipPath id="pl-clip-bay-${b.index}"><rect x="${f1(X(b.x0))}" y="${f1(Y(top - T))}" width="${f1(b.width * s)}" height="${f1(g.innerH * s)}"/></clipPath>`).join('') + '</defs>');

    // floor line and the piece
    out.push(`<path class="pl-floorline" d="M${f1(ox - 28)} ${f1(y0)}H${f1(ox + p.width * s + 28)}"/>`);
    if (g.slab > 0) out.push(`<rect class="pl-p-slab" x="${f1(X(-1))}" y="${f1(Y(top + g.slab))}" width="${f1((p.width + 2) * s)}" height="${f1(g.slab * s)}"/>`);
    if (ph > 0) out.push(`<rect class="pl-p-plinth" x="${f1(X(1))}" y="${f1(Y(ph))}" width="${f1((p.width - 2) * s)}" height="${f1(ph * s)}" fill="url(#pl-hatch-i)"/>`);
    out.push(`<rect class="pl-p-inner" x="${f1(X(0))}" y="${f1(Y(top))}" width="${f1(p.width * s)}" height="${f1(g.Hc * s)}"/>`);

    // bays: background, grid holes, items
    lay.forEach((b) => {
      const sel = b.index === state.ui.bay;
      const bp = prob.bays[b.index] || [];
      const over = hint && hint.bay === b.index;
      out.push(`<rect class="pl-bay${sel ? ' is-selected' : ''}${over ? ' is-over' : ''}${bp.length ? ' is-warn' : ''}" data-bay="${b.index}" x="${f1(X(b.x0))}" y="${f1(Y(top - T))}" width="${f1(b.width * s)}" height="${f1(g.innerH * s)}"/>`);
      if (sel) {
        const step = Math.max(1, Math.ceil(6 / (s * GRID)));
        let dots = '';
        for (let v = 0; v <= g.innerH; v = Math.round((v + step * GRID) * 10) / 10) {
          const yy = f1(Y(yf + v));
          dots += `M${f1(X(b.x0) + 4)} ${yy}h0.1M${f1(X(b.x1) - 4)} ${yy}h0.1`;
        }
        out.push(`<path class="pl-holes" d="${dots}" aria-hidden="true"/>`);
      }
    });
    // a bay's own colour and back: tint, mirror or the wall showing through
    lay.forEach((b) => {
      const bb = p.bays[b.index];
      const gx = f1(X(b.x0)), gy = f1(Y(top - T)), gw = f1(b.width * s), gh = f1(g.innerH * s);
      if (bb.colour && MATERIALS[bb.colour]) out.push(`<rect class="pl-bay-tint" x="${gx}" y="${gy}" width="${gw}" height="${gh}" style="fill:${MATERIALS[bb.colour].color}" aria-hidden="true"/>`);
      if (bb.back === 'mirror') out.push(`<rect class="pl-bay-mirror" x="${gx}" y="${gy}" width="${gw}" height="${gh}" aria-hidden="true"/><path class="pl-i-sheen" d="M${f1(X(b.x0) + b.width * s * 0.25)} ${gy}l-14 ${gh}M${f1(X(b.x0) + b.width * s * 0.42)} ${gy}l-14 ${gh}" aria-hidden="true"/>`);
      else if (bb.back === 'open') out.push(`<rect class="pl-bay-open" x="${gx}" y="${gy}" width="${gw}" height="${gh}" fill="url(#pl-wall-i)" aria-hidden="true"/>`);
    });
    lay.forEach((b) => {
      const bay = p.bays[b.index];
      out.push(`<g clip-path="url(#pl-clip-bay-${b.index})">`);
      bay.items.forEach((it, ii) => {
        const d = ITEMS[it.kind];
        if (!d) return;
        const [blo, bhi] = d.body(it);
        const zone = d.zone(it);
        const x = X(b.x0), w = b.width * s;
        const bodyTop = Y(yf + it.y + bhi), bodyH = (bhi - blo) * s;
        const bodyY = Y(yf + it.y + bhi);
        const zr = zone ? { x, y: Y(yf + it.y + zone[1]), w, h: (zone[1] - zone[0]) * s } : null;
        const selected = state.ui.bay === b.index && state.ui.item === ii;
        const ip = prob.items[`${b.index}:${ii}`];
        const [lo, hi] = rangeOf(p, b.index, it);
        const hitH = Math.max(bodyH, 16);
        const hitY = bodyY - (hitH - bodyH) / 2;
        const label = `${describeItem(it)}, bay ${b.index + 1}`;
        let g2 = '';
        if (zr && (zr.h > bodyH + 2)) g2 += `<rect class="pl-i-zone" x="${f1(zr.x + 1)}" y="${f1(zr.y)}" width="${f1(zr.w - 2)}" height="${f1(zr.h)}" rx="3"/>`;
        g2 += drawItem(it, { x, y: bodyTop, w, h: bodyH }, { zone: zr });
        g2 += `<rect class="pl-iv__hit" x="${f1(x)}" y="${f1(hitY)}" width="${f1(w)}" height="${f1(hitH)}"/>`;
        g2 += `<rect class="pl-iv__ring" x="${f1(x + 1)}" y="${f1(hitY - 1)}" width="${f1(w - 2)}" height="${f1(hitH + 2)}" rx="3"/>`;
        out.push(`<g class="pl-iv${selected ? ' is-selected' : ''}${ip ? ' is-warn' : ''}" data-item="${b.index}:${ii}" data-focus="item:${b.index}:${ii}" tabindex="0" role="slider" aria-orientation="vertical"`
          + ` aria-label="${esc(label)}" aria-valuemin="${f1(lo)}" aria-valuemax="${f1(hi)}" aria-valuenow="${cm(it.y)}" aria-valuetext="${esc(`${label}, ${cm(it.y)} cm above the bay floor`)}">`
          + `<title>${esc(describeItem(it))}${ip ? `: ${esc(ip.map((e) => e.message).join(' '))}` : ''}</title>${g2}</g>`);
      });
      out.push('</g>');
    });

    // the height of the selected item, parked under the floor line so it never covers the item or a divider
    const selB = p.bays[state.ui.bay], selIt = selB && state.ui.item !== null ? selB.items[state.ui.item] : null;
    // where the canvas hint shows (wide screens) it already carries the height, so the pill would only collide with it
    const hintShown = getComputedStyle(insideBox.querySelector('#pl-in-hint')).display !== 'none';
    if (selIt && !hintShown) {
      const lb = lay[state.ui.bay];
      const label = `${itemName(selIt)}, ${cm(selIt.y)} cm up`;
      const rw = label.length * 6.6 + 18;
      const rx = clamp(X(lb.x0) + (lb.width * s) / 2 - rw / 2, 4, W - rw - 4);
      out.push(`<g class="pl-readout" aria-hidden="true" transform="translate(${f1(rx)} ${f1(y0 + 17)})"><rect x="0" y="-9" width="${f1(rw)}" height="18" rx="9"/><text x="9" y="0">${esc(label)}</text></g>`);
    }

    // drop preview while a palette tile is dragged in
    if (hint) {
      const def = ITEMS[hint.kind];
      const it = normalizeItem({ kind: hint.kind, y: hint.y }, ctxOf(p, hint.bay));
      const b = lay[hint.bay];
      const [blo, bhi] = def.body(it);
      out.push(`<g class="pl-drop" aria-hidden="true">${drawItem(it, { x: X(b.x0), y: Y(yf + it.y + bhi), w: b.width * s, h: Math.max(3, (bhi - blo) * s) })}<rect class="pl-drop__line" x="${f1(X(b.x0))}" y="${f1(Y(yf + it.y + bhi))}" width="${f1(b.width * s)}" height="${f1(Math.max(3, (bhi - blo) * s))}" rx="2"/></g>`);
    }

    // carcass boards over the bays
    out.push(`<g class="pl-p-boards" aria-hidden="true">`
      + `<rect x="${f1(X(0))}" y="${f1(Y(top))}" width="${f1(T * s)}" height="${f1(g.Hc * s)}"/><rect x="${f1(X(p.width - T))}" y="${f1(Y(top))}" width="${f1(T * s)}" height="${f1(g.Hc * s)}"/>`
      + `<rect x="${f1(X(T))}" y="${f1(Y(top))}" width="${f1((p.width - 2 * T) * s)}" height="${f1(T * s)}"/><rect x="${f1(X(T))}" y="${f1(Y(ph + T))}" width="${f1((p.width - 2 * T) * s)}" height="${f1(T * s)}"/></g>`);

    // dividers with a grip
    lay.slice(0, -1).forEach((b) => {
      const dx = X(b.x1), w = Math.max(3, T * s), mid = Y(ph + g.Hc / 2);
      const next = lay[b.index + 1];
      out.push(`<rect class="pl-p-board" x="${f1(dx)}" y="${f1(Y(top - T))}" width="${f1(w)}" height="${f1(g.innerH * s)}" aria-hidden="true"/>`
        + `<g class="pl-div" data-div="${b.index}" data-focus="div:${b.index}" tabindex="0" role="slider" aria-orientation="horizontal" aria-label="Divider between bay ${b.index + 1} and bay ${b.index + 2}"`
        + ` aria-valuemin="20" aria-valuemax="${b.width + next.width - 20}" aria-valuenow="${b.width}" aria-valuetext="Bay ${b.index + 1} is ${b.width} cm wide, bay ${b.index + 2} is ${next.width} cm">`
        + `<title>Drag to resize bays ${b.index + 1} and ${b.index + 2}</title>`
        + `<rect class="pl-div__hit" x="${f1(dx + w / 2 - 12)}" y="${f1(Y(top - T))}" width="24" height="${f1(g.innerH * s)}"/>`
        + `<circle class="pl-div__dot" cx="${f1(dx + w / 2)}" cy="${f1(mid)}" r="11"/><path class="pl-div__arrows" d="M${f1(dx + w / 2 - 6)} ${f1(mid)}h12M${f1(dx + w / 2 - 6)} ${f1(mid)}l3 -3M${f1(dx + w / 2 - 6)} ${f1(mid)}l3 3M${f1(dx + w / 2 + 6)} ${f1(mid)}l-3 -3M${f1(dx + w / 2 + 6)} ${f1(mid)}l-3 3"/></g>`);
    });

    // bay tabs and widths above the piece
    const tabY = Y(top + g.slab) - 24;
    lay.forEach((b) => {
      const cx = X(b.x0) + (b.width * s) / 2;
      const sel = b.index === state.ui.bay;
      const wide = b.width * s >= 58;
      const bp = prob.bays[b.index];
      const label = wide ? `${b.index + 1} · ${b.width}` : `${b.index + 1}`;
      const tw = Math.max(24, label.length * 7.4 + 16);
      out.push(`<g class="pl-baytab${sel ? ' is-selected' : ''}${bp ? ' is-warn' : ''}" data-baytab="${b.index}" data-focus="tab:${b.index}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="Bay ${b.index + 1}, ${b.width} cm wide">`
        + `<rect x="${f1(cx - tw / 2)}" y="${f1(tabY - 12)}" width="${f1(tw)}" height="24" rx="12"/><text x="${f1(cx)}" y="${f1(tabY)}" text-anchor="middle" dominant-baseline="central">${label}</text></g>`);
    });
    // overall dimensions
    const dimY = tabY - 22;
    out.push(`<g class="pl-dim" aria-hidden="true"><path class="pl-dim-line" d="M${f1(X(0))} ${f1(dimY)}H${f1(X(p.width))}M${f1(X(0))} ${f1(dimY - 4)}v8M${f1(X(p.width))} ${f1(dimY - 4)}v8"/><text class="pl-dim-text" x="${f1(X(p.width / 2))}" y="${f1(dimY - 5)}" text-anchor="middle">${p.width} cm</text>`
      + `<path class="pl-dim-line" d="M${f1(ox - 18)} ${f1(Y(0))}V${f1(Y(p.height))}M${f1(ox - 22)} ${f1(Y(0))}h8M${f1(ox - 22)} ${f1(Y(p.height))}h8"/><text class="pl-dim-text" transform="translate(${f1(ox - 24)} ${f1(Y(p.height / 2))}) rotate(-90)" text-anchor="middle">${p.height} cm</text></g>`);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.innerHTML = out.join('');
    if (focusKey) {
      const key = focusKey.startsWith('item:') && state.ui.item !== null ? `item:${state.ui.bay}:${state.ui.item}` : focusKey;
      const el = svg.querySelector(`[data-focus="${key}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  // pointer to drawing coordinates
  const kPx = () => (svg.getBoundingClientRect().width / (Number(svg.getAttribute('width')) || 1)) * layoutPx.s;
  const toPx = (e) => {
    const r = svg.getBoundingClientRect();
    const sc = (Number(svg.getAttribute('width')) || 1) / (r.width || 1);
    return { x: (e.clientX - r.left) * sc, y: (e.clientY - r.top) * sc, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  };
  const cmX = (px) => (px - layoutPx.ox) / layoutPx.s;
  const cmFloorY = (py) => (layoutPx.y0 - py) / layoutPx.s;

  svg.addEventListener('pointerdown', (e) => {
    const p = cur();
    if (!p || !layoutPx || e.button > 0) return;
    const div = e.target.closest('[data-div]');
    const it = e.target.closest('[data-item]');
    if (div) {
      e.preventDefault();
      const k = Number(div.dataset.div);
      drag = { type: 'div', k, x0: e.clientX, widths: p.bays.map((b) => b.width), pointer: e.pointerId, last: '' };
      svg.setPointerCapture(e.pointerId);
      div.focus({ preventScroll: true });
      insideBox.classList.add('is-dragging');
      return;
    }
    if (it) {
      e.preventDefault();
      const [bay, idx] = it.dataset.item.split(':').map(Number);
      store.dispatch({ type: 'ui/item', bay, index: idx });
      const item = p.bays[bay].items[idx];
      drag = { type: 'item', y0: item.y, cy: e.clientY, pointer: e.pointerId, last: '', moved: false };
      svg.setPointerCapture(e.pointerId);
      const el = svg.querySelector(`[data-focus="item:${bay}:${idx}"]`);
      if (el) el.focus({ preventScroll: true });
      insideBox.classList.add('is-dragging');
      return;
    }
    const tab = e.target.closest('[data-baytab]');
    const bay = e.target.closest('[data-bay]');
    if (tab) store.dispatch({ type: 'ui/bay', bay: Number(tab.dataset.baytab) });
    else if (bay) store.dispatch({ type: 'ui/bay', bay: Number(bay.dataset.bay) });
    else if (state.ui.item !== null) store.dispatch({ type: 'ui/item', bay: state.ui.bay, index: null });
  });
  svg.addEventListener('pointermove', (e) => {
    const p = cur();
    if (!drag || !p || e.pointerId !== drag.pointer) return;
    const k = kPx();
    if (drag.type === 'div') {
      const widths = dragDivider(drag.widths, drag.k, (e.clientX - drag.x0) / k);
      const key = widths.join();
      if (key === drag.last) return;
      drag.last = key;
      store.dispatch({ type: 'piece/bays', bays: widths, coalesce: `drag:div:${p.id}` });
    } else {
      const lay = bayLayout(p);
      const y = snapY(drag.y0 + (drag.cy - e.clientY) / k);
      const px = toPx(e);
      const toBay = bayAt(lay, cmX(px.x));
      const key = `${toBay}:${y}`;
      if (key === drag.last) return;
      drag.last = key;
      store.dispatch({ type: 'piece/item/move', bay: state.ui.bay, index: state.ui.item, y, toBay: toBay !== state.ui.bay ? toBay : undefined, coalesce: `drag:item:${p.id}` });
    }
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.pointer)) return;
    try { svg.releasePointerCapture(drag.pointer); } catch { /* released */ }
    drag = null;
    insideBox.classList.remove('is-dragging');
    store.dispatch({ type: 'history/seal' });
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener('keydown', (e) => {
    const p = cur();
    if (!p) return;
    const t = e.target.closest && e.target.closest('[data-focus]');
    if (!t) return;
    const step = e.shiftKey ? 10 : 1;
    if (t.dataset.item) {
      const [bay, idx] = t.dataset.item.split(':').map(Number);
      const it = p.bays[bay] && p.bays[bay].items[idx];
      if (!it) return;
      let patch = null;
      if (e.key === 'ArrowUp') patch = { y: nudgeY(it.y, step) };
      else if (e.key === 'ArrowDown') patch = { y: nudgeY(it.y, -step) };
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const to = bay + (e.key === 'ArrowLeft' ? -1 : 1);
        if (to < 0 || to >= p.bays.length) { e.preventDefault(); return; }
        e.preventDefault();
        store.dispatch({ type: 'piece/item/move', bay, index: idx, toBay: to, coalesce: `key:item:${p.id}` });
        announce(`${itemName(it)} moved to bay ${to + 1}.`);
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
      else if (e.key === 'Escape') { e.preventDefault(); store.dispatch({ type: 'ui/item', bay, index: null }); return; }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.dispatch({ type: 'ui/item', bay, index: idx }); return; }
      if (!patch) return;
      e.preventDefault();
      if (state.ui.bay !== bay || state.ui.item !== idx) store.dispatch({ type: 'ui/item', bay, index: idx });
      store.dispatch({ type: 'piece/item/move', bay, index: idx, y: patch.y, coalesce: `key:item:${p.id}` });
    } else if (t.dataset.div) {
      const k = Number(t.dataset.div);
      let d = 0;
      if (e.key === 'ArrowLeft') d = -step; else if (e.key === 'ArrowRight') d = step; else return;
      e.preventDefault();
      store.dispatch({ type: 'piece/bays', bays: dragDivider(p.bays.map((b) => b.width), k, d), coalesce: `key:div:${p.id}` });
    } else if (t.dataset.baytab !== undefined && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      store.dispatch({ type: 'ui/bay', bay: Number(t.dataset.baytab) });
    }
  });
  svg.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) store.dispatch({ type: 'history/seal' }); });
  svg.addEventListener('focusin', (e) => {
    const t = e.target.closest && e.target.closest('[data-focus]');
    if (!t || drag) return;
    if (t.dataset.item) {
      const [bay, idx] = t.dataset.item.split(':').map(Number);
      if (state.ui.bay !== bay || state.ui.item !== idx) store.dispatch({ type: 'ui/item', bay, index: idx });
    } else if (t.dataset.baytab !== undefined && state.ui.bay !== Number(t.dataset.baytab)) store.dispatch({ type: 'ui/bay', bay: Number(t.dataset.baytab) });
  });

  // ---------- dragging a tile in from the palette ----------
  palEl.addEventListener('pointerdown', (e) => {
    const tile = e.target.closest('[data-kind]');
    if (!tile || e.button > 0 || !cur()) return;
    const grip = e.target.closest('.pl-tile__grip');
    if (e.pointerType !== 'mouse' && !grip) return; // a finger on the tile itself scrolls the page; the handle drags
    pal = { kind: tile.dataset.kind, x0: e.clientX, y0: e.clientY, started: false, pointer: e.pointerId };
  });
  palEl.addEventListener('pointermove', (e) => {
    if (!pal || e.pointerId !== pal.pointer) return;
    if (!pal.started) {
      if (Math.hypot(e.clientX - pal.x0, e.clientY - pal.y0) < 6) return;
      pal.started = true;
      try { palEl.setPointerCapture(pal.pointer); } catch { /* pointer gone */ }
      showInside();
      ghost = document.createElement('div');
      document.body.classList.add('is-tile-drag');
      ghost.className = 'pl-ghost';
      ghost.innerHTML = `${thumbSvg(pal.kind)}<span>${esc(ITEMS[pal.kind].label)}</span>`;
      document.body.appendChild(ghost);
    }
    ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
    updateHint(e);
  });
  function updateHint(e) {
    const p = cur();
    if (!p || !layoutPx) return;
    const px = toPx(e);
    let next = null;
    if (px.inside) {
      const lay = bayLayout(p);
      const bay = bayAt(lay, cmX(px.x));
      const d = ITEMS[pal.kind], base = normalizeItem({ kind: pal.kind, y: 0 }, ctxOf(p, bay));
      const [blo, bhi] = d.body(base);
      const y = snapY(cmFloorY(px.y) - (layoutPx.g.plinth + LAYOUT_T) - (blo + bhi) / 2);
      next = { bay, y, kind: pal.kind };
    }
    const same = (!hint && !next) || (hint && next && hint.bay === next.bay && hint.y === next.y);
    if (same) return;
    hint = next;
    drawKey = '';
    renderInside();
  }
  const endPal = (e, cancel) => {
    if (!pal || (e && e.pointerId !== pal.pointer)) return;
    const was = pal, h = hint;
    try { palEl.releasePointerCapture(pal.pointer); } catch { /* released */ }
    pal = null; hint = null;
    if (ghost) { ghost.remove(); ghost = null; }
    document.body.classList.remove('is-tile-drag');
    if (was.started) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (!cancel && h) {
        const p = cur();
        const n = p ? p.bays[h.bay].items.length : 0;
        store.dispatch({ type: 'ui/bay', bay: h.bay });
        store.dispatch({ type: 'piece/item/add', bay: h.bay, item: { kind: was.kind, y: h.y } });
        store.dispatch({ type: 'history/seal' });
        const q = cur();
        announce(q && q.bays[h.bay].items.length > n ? `${ITEMS[was.kind].label} added to bay ${h.bay + 1}.` : `Bay ${h.bay + 1} is full.`);
      }
      drawKey = '';
      renderInside();
    }
  };
  palEl.addEventListener('pointerup', (e) => endPal(e, false));
  palEl.addEventListener('pointercancel', (e) => endPal(e, true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pal && pal.started) endPal(null, true); });

  // ---------- sidebar rendering ----------
  function renderBays(p) {
    const lim = TYPES[p.type].limits.bays;
    const max = maxBaysFor(p.type, p.width);
    $('#pl-i-count').textContent = `${p.bays.length} ${p.bays.length === 1 ? 'bay' : 'bays'}`;
    $('#pl-i-less').disabled = p.bays.length <= lim[0];
    $('#pl-i-more').disabled = p.bays.length >= max;
    const key = JSON.stringify([p.id, p.bays.map((b) => [b.width, b.door, b.colour || '', b.back || '']), state.ui.bay, p.fronts.kind, problemsKey(p)]);
    if (key === baysKey) return;
    baysKey = key;
    const prob = problems();
    $('#pl-i-baychips').innerHTML = p.bays.map((b, i) => `<button type="button" class="pl-chip pl-chip--bay${prob.bays[i] ? ' is-warn' : ''}" title="${b.items.length} ${b.items.length === 1 ? 'item' : 'items'}" data-bay="${i}" aria-pressed="${i === state.ui.bay}"><b>${i + 1}</b><span>${b.width} cm</span><span class="visually-hidden">, ${b.items.length} ${b.items.length === 1 ? 'item' : 'items'}</span></button>`).join('');
    const b = curBay(p), k = clamp(state.ui.bay, 0, p.bays.length - 1);
    const hingedKind = p.fronts.kind === 'hinged' || p.fronts.kind === 'glass';
    $('#pl-i-bayform').innerHTML = (p.bays.length > 1 ? fieldHtml(`bayw:${k}`, `Width of bay ${k + 1}`, b.width, { min: 20, max: 400, slider: false, id: 'bayw' }) : '')
      + (hingedKind ? `<div class="pl-row pl-row--select"><label class="pl-row__label" for="pl-i-door">Door on bay ${k + 1}</label><select class="pl-select" id="pl-i-door" data-door="1">${DOOR_SIDES.map((d) => `<option value="${d}"${d === b.door ? ' selected' : ''}>${DOOR_LABEL[d]}</option>`).join('')}</select></div>` : '')
      + (p.bays.length > 1 ? '<button type="button" class="pl-link" data-equal="1">Make all bays the same width</button>' : '')
      + bayOptionsHtml(p, b, k);
    $('#pl-i-bayhint').textContent = p.bays.length > 1
      ? `Drag a divider in the drawing, or type a width. The other bays keep their size, only the neighbour gives or takes. Inside width ${pieceGeometry(p).innerW} cm.`
      : 'One bay. Add more with the plus button, up to ' + max + '.';
  }
  // Interior colour and back panel of the selected bay.
  function bayOptionsHtml(p, b, k) {
    const cur2 = b.colour || '';
    const colourOpt = (v, label, swatch) => `<label class="pl-mat" data-opt="bay-colour:${esc(v)}"><input type="radio" name="pl-bay-colour" data-bayopt="colour" value="${esc(v)}"${v === cur2 ? ' checked' : ''}>${swatch}<span class="pl-mat__name">${esc(label)}</span></label>`;
    const same = `<span class="pl-sw pl-sw--same" aria-hidden="true"></span>`;
    const colours = [colourOpt('', 'Same as the piece', same), ...materialsFor('bay').map((id) => colourOpt(id, MATERIALS[id].label, `<span class="pl-sw pl-sw--${MATERIALS[id].family}" style="--c:${MATERIALS[id].color}"></span>`))].join('');
    const back = b.back || 'closed';
    const backs = BACKS.map((v) => `<label class="pl-opt"><input type="radio" name="pl-bay-back" data-bayopt="back" value="${v}"${v === back ? ' checked' : ''}><span class="pl-opt__body">${BACK_LABEL[v]}</span></label>`).join('');
    return `<fieldset class="pl-fieldset pl-group pl-bayopt"><legend>Inside colour of bay ${k + 1}</legend><div class="pl-mats">${colours}</div></fieldset>`
      + `<fieldset class="pl-fieldset pl-group pl-bayopt"><legend>Back panel of bay ${k + 1}</legend><div class="pl-opts">${backs}</div><p class="pl-hint pl-group__hint">${back === 'open' ? 'No back board: the wall shows. Good for a shallow recess or to save money.' : back === 'mirror' ? 'A full-height mirror on the back wall of this bay.' : 'A back board in the inside colour.'}</p></fieldset>`;
  }
  function problemsKey(p) {
    const q = problems();
    return `${Object.keys(q.bays).join()}|${Object.keys(q.items).join()}`;
  }

  function renderPalette(p) {
    const key = `${p.type}:${state.ui.bay}`;
    const bay = clamp(state.ui.bay, 0, p.bays.length - 1);
    $('#pl-i-addbay').textContent = `bay ${bay + 1}`;
    $('#pl-i-itemsbay').textContent = `bay ${bay + 1}`;
    if (key === paletteKey) return;
    paletteKey = key;
    palEl.innerHTML = TYPES[p.type].palette.filter((k) => ITEMS[k]).map((k) => `
      <div class="pl-tile" data-kind="${k}">
        <button type="button" class="pl-tile__add" aria-label="Add ${esc(ITEMS[k].label)} to bay ${bay + 1}">${thumbSvg(k)}<span class="pl-tile__name">${esc(ITEMS[k].label)}</span></button>
        <span class="pl-tile__grip" title="Drag into the drawing" aria-hidden="true"><svg viewBox="0 0 12 18"><circle cx="3.5" cy="4" r="1.3"/><circle cx="8.5" cy="4" r="1.3"/><circle cx="3.5" cy="9" r="1.3"/><circle cx="8.5" cy="9" r="1.3"/><circle cx="3.5" cy="14" r="1.3"/><circle cx="8.5" cy="14" r="1.3"/></svg></span>
      </div>`).join('');
    const pres = presetsFor(p.type);
    $('#pl-i-presets').innerHTML = pres.length ? `<span class="pl-chips__label" id="pl-i-prelabel">Start from</span>${pres.map((x) => `<button type="button" class="pl-chip pl-chip--plain" data-preset="${x.id}">${esc(x.label)}</button>`).join('')}` : '';
  }

  function renderItems(p) {
    const bi = clamp(state.ui.bay, 0, p.bays.length - 1);
    const bay = p.bays[bi];
    const sel = selectedItem(p);
    const listKey = JSON.stringify([p.id, bi, bay.items.map((it) => [it.kind, it.y, it.count, it.rows]), state.ui.item, problemsKey(p)]);
    if (listKey !== inspKey.list) {
      inspKey = { ...inspKey, list: listKey };
      const prob = problems();
      const order = bay.items.map((it, i) => ({ it, i })).sort((a, b) => b.it.y - a.it.y);
      $('#pl-i-list').innerHTML = order.length
        ? order.map(({ it, i }) => `<button type="button" class="pl-li${prob.items[`${bi}:${i}`] ? ' is-warn' : ''}" data-pick="${i}" aria-pressed="${i === state.ui.item}"><span>${esc(describeItem(it))}</span><i>${cm(it.y)} cm</i></button>`).join('')
        : '<p class="pl-inspector__empty">Nothing in this bay yet. Press an item above to add it.</p>';
    }
    const enumKey = sel ? JSON.stringify(Object.entries(ITEMS[sel.kind].params).filter(([, sp]) => sp.type !== 'int').map(([n]) => sel[n])) : '';
    const ik = sel ? `${p.id}:${bi}:${state.ui.item}:${sel.kind}:${enumKey}` : 'none';
    if (ik === inspKey.insp) return;
    inspKey = { ...inspKey, insp: ik };
    if (!sel) { inspEl.innerHTML = ''; return; }
    const d = ITEMS[sel.kind];
    const [lo, hi] = rangeOf(p, bi, sel);
    const fields = [fieldHtml('item:y', 'Height above the bay floor', sel.y, { min: 0, max: Math.max(lo, hi), step: 0.1, sliderStep: GRID, id: 'item-y' })];
    for (const [name, spec] of Object.entries(d.params)) {
      if (d.when && d.when[name] && !d.when[name](sel)) continue;
      const label = PARAM_LABEL[name] || name;
      if (spec.type === 'int') {
        const max = name === 'position' ? Math.max(5, bay.width - 5) : spec.max;
        fields.push(fieldHtml(`item:${name}`, label, sel[name], { min: spec.min, max, slider: false, unit: PARAM_UNIT[name] || '', id: `item-${name}` }));
      } else if (spec.type === 'enum') {
        fields.push(`<div class="pl-row pl-row--select"><label class="pl-row__label" for="pl-ip-${name}">${esc(label)}</label><select class="pl-select" id="pl-ip-${name}" data-psel="${name}">${spec.values.map((v) => `<option value="${esc(v)}"${v === sel[name] ? ' selected' : ''}>${esc(valueLabel(name, v))}</option>`).join('')}</select></div>`);
      } else {
        fields.push(`<label class="pl-check"><input type="checkbox" data-pchk="${name}"${sel[name] ? ' checked' : ''}><span>${esc(label)}</span></label>`);
      }
    }
    inspEl.innerHTML = `
      <div class="pl-inspector__card">
        <div class="pl-inspector__head">
          <span class="pl-inspector__icon">${thumbSvg(sel.kind, 30, 22)}</span>
          <div><p class="pl-inspector__title">${esc(d.label)}</p><p class="pl-inspector__sub">Bay ${bi + 1}</p></div>
          <button type="button" class="pl-btn pl-btn--quiet" data-delete="1">${ICON_TRASH}Delete<span class="visually-hidden"> ${esc(d.label)}</span></button>
        </div>
        <div class="pl-form pl-form--grid">${fields.join('')}</div>
      </div>`;
  }
  inspKey = { list: '', insp: '' };

  function actionsFor(e) {
    const r = e.ref;
    const p = cur();
    const btn = (attr, v, text) => `<button type="button" class="pl-link" data-${attr}="${esc(v)}">${text}</button>`;
    if (r.type === 'item') {
      let a = btn('show', `${r.bay}:${r.index}`, 'Show');
      if (e.code === 'item-needs-door' && p) {
        const hinged = p.fronts.kind === 'hinged' || p.fronts.kind === 'glass';
        if (hinged) a = btn('door', r.bay, 'Add a door') + a;
        else if (TYPES[p.type].allowedFronts.includes('hinged')) a = btn('hinged', '1', 'Use hinged doors') + a;
      }
      return a;
    }
    if (r.type === 'bay') return btn('bay', r.bay, 'Show');
    return '';
  }

  // ---------- update ----------
  const empty = $('#pl-i-empty'), main = $('#pl-i-main');
  empty.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) store.dispatch({ type: 'ui/step', step: 1 });
  });

  function update(next, info = {}) {
    state = next;
    validation = info.validation || validation;
    const p = cur();
    const ok = hasInterior(p);
    main.hidden = !ok;
    empty.hidden = ok;
    if (!ok) {
      empty.innerHTML = p
        ? `<div class="pl-soon"><p class="pl-soon__text">A ${esc(TYPES[p.type].label.toLowerCase())} has no inside to fit out. You can go on and place it in the room.</p></div>`
        : `<div class="pl-soon"><p class="pl-soon__text">There is no piece to fit out yet. Pick a type in the furniture step first.</p><button type="button" class="pl-btn pl-btn--accent" data-go="1">Go to furniture</button></div>`;
    }
    if (ok) {
      const project = state.project;
      const ck = JSON.stringify([project.pieces.map((x) => [x.id, x.type, x.width, x.height]), project.placements.map((x) => x.pieceId), state.ui.pieceId]);
      if (ck !== chipsKey) { chipsKey = ck; $('#pl-i-chips').innerHTML = pieceChipsHtml(project, state.ui.pieceId); }
      $('#pl-i-pieces-sec').hidden = project.pieces.length < 2;
      renderBays(p);
      renderPalette(p);
      renderItems(p);
      syncFields(root, lookup);
      const door = root.querySelector('#pl-i-door');
      if (door) { const b = curBay(p); if (b && door.value !== b.door) door.value = b.door; }
      const list = problems();
      const flat = [...list.piece, ...Object.values(list.bays).flat(), ...Object.values(list.items).flat()];
      const html = flat.length ? notesHtml(flat, actionsFor) : '';
      if (html !== notesKey) { notesKey = html; $('#pl-i-notes').innerHTML = html; }
      const sel = selectedItem(p);
      insideBox.querySelector('#pl-in-hint').textContent = sel
        ? `${itemName(sel)}, ${cm(sel.y)} cm up. Arrow up and down move it one step (Shift: ten steps), left and right change bay. Delete removes it.`
        : 'Drag items up and down, or select one and use the arrow keys. Drag the dividers to resize bays.';
    }
    dock.hidden = !ok;
    const dk = JSON.stringify([p, state.ui.bay, state.ui.item, validation.errors.length, hint, insideBox.clientWidth, insideBox.clientHeight]);
    if (dk !== drawKey) { drawKey = dk; if (!root.hidden) renderInside(); }
  }

  const ro = new ResizeObserver(() => { drawKey = ''; if (!root.hidden) renderInside(); });
  ro.observe(insideBox);
  function show() { drawKey = ''; renderInside(); }

  update(state);
  return { update, show, destroy() { ro.disconnect(); } };
}
