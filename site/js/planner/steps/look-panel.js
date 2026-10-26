// The "Fine-tune the look" panel of step 2: five tabs (Fronts, Colour and material, Handles, Base and top, Size).
// Every control is built once per piece type and then only synced, so keyboard focus stays where it is while the
// piece changes. Each option shows what it adds to (or takes off) the price of this piece, worked out with the real
// quote. Options come from the tables in model.js and materials.js, so a change of stock needs no change here.
import {
  TYPES, STYLES, HANDLES, LIMITS, updatePiece
} from '../model.js';
import { MATERIALS, familiesFor, materialsFor, glassTypes, handleFinishes, FAMILIES } from '../materials.js';
import { quoteProject } from '../pricing.js';
import { fitToSpace, spaceCheck, spaceMessage } from '../fit.js';
import { swatchSvg, DESIGN_ICONS } from '../style-swatch.js';
import { styleBundle } from '../model.js';
import { esc, fieldHtml, wireFields, syncFields } from './shared.js';
import { roving, scrollCue } from './ui.js';

// Size is its own section of the Furniture step now; the look has four tabs.
// Each tab holds only what fits the sidebar without scrolling.
const TABS = [['fronts', 'Fronts'], ['detail', 'Detail', 'Edges, gaps and two-tone'], ['colour', 'Colour'], ['handles', 'Handles'], ['base', 'Base'], ['top', 'Top', 'Top, end panels and trim']];
const COLOUR_TARGETS = [['frontMat', 'Fronts'], ['upperMat', 'Upper fronts'], ['glass', 'Glass'], ['carcassMat', 'Sides and top'], ['inside', 'Inside'], ['worktop', 'Worktop']];
const KIND_LABEL = { hinged: 'Hinged doors', sliding: 'Sliding doors', open: 'Open, no doors', glass: 'Glass doors', none: 'No fronts' };
const DESIGN_LABEL = { slab: 'Slab', shaker: 'Shaker frame', glass: 'Slim frame with glass', ribbed: 'Ribbed' };
const DESIGN_NOTE = {
  slab: 'Flat and plain.', shaker: 'A frame with a recessed centre panel.', glass: 'Narrow frames with a glass pane.', ribbed: 'Fine vertical ribs.'
};
const EDGE_LABEL = { square: 'Square', chamfer: 'Chamfered', round: 'Rounded' };
const HANDLE_LABEL = { bar: 'Bar', knob: 'Knob', cup: 'Cup pull', edge: 'Finger pull', push: 'Push to open' };
const HANDLE_NOTE = {
  bar: 'A straight bar on two posts.', knob: 'A round knob.', cup: 'A half-round scoop you hook your fingers into.',
  edge: 'A groove routed into the edge. No hardware.', push: 'A touch opens it. Nothing on the front.'
};
const SIZE_LABEL = { short: 'Short', medium: 'Medium', long: 'Long' };
const DOOR_POS_LABEL = { auto: 'Standard', top: 'Near the top', middle: 'Middle', bottom: 'Near the bottom', full: 'Full length' };
const DRAWER_POS_LABEL = { centre: 'Centre', top: 'Top edge' };
const BASE_LABEL = { none: 'No base', recessed: 'Recessed base', flush: 'Flush base', legs: 'Legs' };
const TOP_LABEL = { flush: 'Flush', overhang: 'Overhang', cornice: 'Crown moulding' };
const TOP_NOTE = { flush: 'The top is level with the sides.', overhang: 'A top that sticks out 2 cm at the front.', cornice: 'A stepped crown along the top front.' };
const BASE_NOTE = { none: 'Sits on the floor.', recessed: 'A base (plinth) set back 8 cm, so toes fit underneath.', flush: 'A base (plinth) in line with the doors.', legs: 'Raised on legs, with air underneath.' };
const LEG_LABEL = (id) => (id === 'wood' ? 'Wood' : (MATERIALS[id] || { label: id }).label);

// ---------- binds: what each control reads and changes ----------
const BIND = {
  kind: { get: (p) => p.fronts.kind, set: (v) => ({ fronts: { kind: v } }) },
  design: { get: (p) => p.look.design, set: (v) => ({ look: { design: v } }) },
  edge: { get: (p) => p.look.edge, set: (v) => ({ look: { edge: v } }) },
  gap: { get: (p) => String(p.look.gap), set: (v) => ({ look: { gap: Number(v) } }) },
  glass: { get: (p) => p.look.glass, set: (v) => ({ look: { glass: v } }) },
  frontMat: { get: (p) => p.fronts.material, set: (v) => ({ fronts: { material: v } }) },
  upperMat: { get: (p) => (p.look.upper ? p.look.upper.material : ''), set: (v) => ({ look: { upper: { material: v, finish: 'matte' } } }) },
  carcassMat: { get: (p) => p.carcass.material, set: (v) => ({ carcass: { material: v } }) },
  inside: { get: (p) => (!p.interior ? 'same' : p.interior.material === 'front' ? 'front' : p.interior.material), set: (v) => ({ interior: v === 'same' ? null : { material: v } }) },
  worktop: { get: (p) => p.worktop || 'none', set: (v) => ({ worktop: v === 'none' ? null : v }) },
  handle: { get: (p) => p.fronts.handle, set: (v) => ({ fronts: { handle: v } }) },
  handleFinish: { get: (p) => p.fronts.handleFinish, set: (v) => ({ fronts: { handleFinish: v } }) },
  handleSize: { get: (p) => p.fronts.handleSize, set: (v) => ({ fronts: { handleSize: v } }) },
  doorHandle: { get: (p) => p.fronts.doorHandle, set: (v) => ({ fronts: { doorHandle: v } }) },
  drawerHandle: { get: (p) => p.fronts.drawerHandle, set: (v) => ({ fronts: { drawerHandle: v } }) },
  base: {
    get: (p) => p.look.base,
    set: (v, p) => (v === 'none' ? { plinth: 0 } : { plinth: p.plinth > 0 ? (v === 'legs' ? Math.max(5, p.plinth) : p.plinth) : v === 'legs' ? 15 : 10, look: { base: v } })
  },
  legs: { get: (p) => p.look.legs, set: (v) => ({ look: { legs: v } }) },
  top: { get: (p) => p.look.top, set: (v) => ({ look: { top: v } }) }
};
const TOGGLE = {
  twotone: { get: (p) => !!p.look.upper, set: (v, p) => ({ look: { upper: v ? { material: otherFront(p), finish: 'matte' } : null } }) },
  gables: { get: (p) => !!p.look.gables, set: (v) => ({ look: { gables: v } }) },
  scribe: { get: (p) => !!p.look.scribe, set: (v) => ({ look: { scribe: v } }) }
};
// a sensible second colour for the upper fronts: the next front material in the table
function otherFront(p) {
  const list = materialsFor('front');
  const i = list.indexOf(p.fronts.material);
  return list[(i + 1) % list.length];
}

const eur = (cents) => {
  const n = Math.round(Math.abs(cents) / 100);
  return `${cents > 0 ? '+' : cents < 0 ? '−' : ''}€${n.toLocaleString('en-IE')}`;
};

// ---------- html helpers ----------
const opt = (key, value, label, { note, icon = '' } = {}) => `
  <label class="pl-opt" data-opt="${key}:${esc(value)}"${note ? ` title="${esc(note)}"` : ''}>
    <input type="radio" name="o-${key}" data-k="${key}" value="${esc(value)}">
    <span class="pl-opt__body">${icon}<span class="pl-opt__label">${esc(label)}</span><em class="pl-opt__price" data-price></em></span>
  </label>`;
const group = (key, legend, inner, { hint = '', cls = '' } = {}) => `
  <fieldset class="pl-fieldset pl-group ${cls}" data-group="${key}">
    <legend>${esc(legend)}</legend>
    ${inner}
    <p class="pl-hint pl-group__hint" data-hint${hint ? '' : ' hidden'}>${esc(hint)}</p>
  </fieldset>`;
const row = (key, legend, entries, o = {}) => group(key, legend, `<div class="pl-opts">${entries.map(([v, l, n, icon]) => opt(key, v, l, { note: n, icon })).join('')}</div>`, o);
// A short list in a select: the options carry their price in their text (an <option> cannot hold markup).
const selectRow = (key, legend, entries, o = {}) => group(key, legend,
  `<select class="pl-select" data-k="${key}" aria-label="${esc(legend)}">${entries.map(([v, l]) => `<option value="${esc(v)}" data-label="${esc(l)}">${esc(l)}</option>`).join('')}</select>`, o);
const toggle = (key, label, hint = '') => `
  <div class="pl-group" data-group="${key}">
    <label class="pl-check"><input type="checkbox" data-t="${key}"><span>${esc(label)}</span><em class="pl-opt__price" data-price></em></label>
    ${hint ? `<p class="pl-hint">${esc(hint)}</p>` : ''}
  </div>`;

function matOpt(key, id) {
  const m = MATERIALS[id];
  return `<label class="pl-mat" data-opt="${key}:${esc(id)}" title="${esc(m.note || '')}">
    <input type="radio" name="o-${key}" data-k="${key}" value="${esc(id)}">
    <span class="pl-sw pl-sw--${m.family}${m.edgeGrain ? ' pl-sw--edge' : ''}${m.veined ? ' pl-sw--veined' : ''}" style="--c:${m.color}"></span>
    <span class="pl-mat__name">${esc(m.label)}</span><em class="pl-opt__price" data-price></em>
  </label>`;
}
// A swatch grid grouped by family. `lead` are plain options placed first (such as "Same as the sides").
function picker(key, legend, ids, { lead = [], hint = '' } = {}) {
  const fams = [];
  for (const id of ids) { const f = MATERIALS[id].family; if (!fams.includes(f)) fams.push(f); }
  const leadHtml = lead.length ? `<div class="pl-opts">${lead.map(([v, l, n]) => opt(key, v, l, { note: n })).join('')}</div>` : '';
  const body = fams.map((f) => `<div class="pl-fam"><h4 class="pl-fam__name">${esc((FAMILIES[f] || { label: f }).label)}</h4><div class="pl-mats">${ids.filter((id) => MATERIALS[id].family === f).map((id) => matOpt(key, id)).join('')}</div></div>`).join('');
  return group(key, legend, `${leadHtml}<div data-scrollbox>${body}</div><p class="pl-hint pl-note-line" data-matnote="${key}"></p>`, { hint, cls: 'pl-group--mats' });
}

export function createLookPanel(host, { store, announce = () => {}, sizeHost }) {
  let tab = 'colour';
  let colourTarget = 'frontMat';
  let builtFor = null;       // piece type the panels were built for
  let piece = null, state = null;
  let priceTimer = 0, baseCents = 0;
  let spaceMsg = '';

  host.innerHTML = `
    <div class="pl-ltabs" role="tablist" aria-label="What to fine-tune">
      ${TABS.map(([id, label, title]) => `<button type="button" role="tab" class="pl-ltab" id="pl-tab-${id}" data-tab="${id}"${title ? ` title="${esc(title)}"` : ''} aria-controls="pl-tabp-${id}" aria-selected="false" tabindex="-1">${esc(label)}</button>`).join('')}
    </div>
    ${TABS.map(([id]) => `<div class="pl-ltabpanel" role="tabpanel" id="pl-tabp-${id}" aria-labelledby="pl-tab-${id}" data-lpanel="${id}" hidden></div>`).join('')}`;
  // the size controls live in their own section of the step, so every lookup covers both hosts
  const hosts = [host, sizeHost];
  const all = (sel) => hosts.flatMap((h) => [...h.querySelectorAll(sel)]);
  const one = (sel) => host.querySelector(sel) || sizeHost.querySelector(sel);
  const panel = (id) => host.querySelector(`[data-lpanel="${id}"]`);
  const tabs = [...host.querySelectorAll('[data-tab]')];
  const tabsEl = host.querySelector('.pl-ltabs');
  scrollCue(tabsEl, 'x');

  function selectTab(id, focus = false) {
    tab = id;
    for (const b of tabs) { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
    host.querySelectorAll('[data-lpanel]').forEach((p) => { p.hidden = p.dataset.lpanel !== id; });
    schedulePrices();
  }
  host.querySelector('.pl-ltabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) selectTab(b.dataset.tab); });
  host.querySelector('.pl-ltabs').addEventListener('keydown', (e) => {
    const i = tabs.findIndex((b) => b.dataset.tab === tab);
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    selectTab(tabs[n].dataset.tab, true);
  });

  // ---------- build the panels for a piece type ----------
  function build(p) {
    const T = TYPES[p.type];
    const kinds = T.allowedFronts;
    const hasFronts = (id) => kinds.includes(id);
    panel('fronts').innerHTML = [
      row('kind', 'Doors', kinds.map((k) => [k, KIND_LABEL[k]])),
      row('design', 'Front design', ['slab', 'shaker', 'glass', 'ribbed'].map((d) => [d, DESIGN_LABEL[d], DESIGN_NOTE[d], DESIGN_ICONS[d]]), { cls: 'pl-group--designs' })
    ].join('');
    panel('detail').innerHTML = [
      row('edge', 'Edges', ['square', 'chamfer', 'round'].map((e) => [e, EDGE_LABEL[e]])),
      row('gap', 'Gap between fronts', [[2, '2 mm'], [3, '3 mm'], [4, '4 mm']].map(([v, l]) => [String(v), l])),
      toggle('twotone', 'Two-tone: a second colour above a line', 'The fronts above the line become separate doors, so a two-tone piece costs a little more.'),
      `<div class="pl-group" data-group="split">${fieldHtml('split', 'Line height from the floor', p.look.split, { min: 40, max: p.height - 20, sliderStep: 1 })}</div>`
    ].join('');
    const lead = [['same', 'Same as the sides', 'Use the sides material for the inside too.'], ['front', 'Same as the fronts', 'Use the fronts material for the inside too.']];
    const targets = COLOUR_TARGETS.filter(([k]) => k !== 'worktop' || T.allowWorktop);
    panel('colour').innerHTML = [
      `<div class="pl-chips pl-chips--tight" role="radiogroup" aria-label="Colour of" data-ctargets>${targets.map(([k, l]) => `<button type="button" role="radio" class="pl-chip pl-chip--tight" data-ctarget="${k}" aria-checked="${k === colourTarget}" tabindex="-1"${k === 'upperMat' || k === 'glass' ? ' hidden' : ''}>${esc(l)}</button>`).join('')}</div>`,
      picker('frontMat', 'Fronts', materialsFor('front')),
      picker('upperMat', 'Upper fronts', materialsFor('front'), { hint: 'The fronts above the two-tone line.' }),
      picker('glass', 'Glass', glassTypes()),
      picker('carcassMat', 'Sides and top', materialsFor('carcass'), { hint: 'The box itself, seen from outside.' }),
      picker('inside', 'Inside', materialsFor('interior'), { lead, hint: 'Shelves, back and drawer boxes. A contrast colour inside is a nice surprise.' }),
      T.allowWorktop ? picker('worktop', 'Worktop', materialsFor('top'), { lead: [['none', 'No worktop']] }) : ''
    ].join('');
    roving(panel('colour').querySelector('[data-ctargets]'), { selector: '[data-ctarget]', selects: true });
    panel('colour').querySelectorAll('[data-scrollbox]').forEach((b) => scrollCue(b, 'y'));
    panel('handles').innerHTML = [
      `<div class="pl-pair">${selectRow('handle', 'Handle style', HANDLES.map((h) => [h, HANDLE_LABEL[h], HANDLE_NOTE[h]]))}${selectRow('handleSize', 'Size', ['short', 'medium', 'long'].map((x) => [x, SIZE_LABEL[x]]))}</div>`,
      picker('handleFinish', 'Finish', handleFinishes()),
      `<div class="pl-pair">${selectRow('doorHandle', 'Position on doors', ['auto', 'top', 'middle', 'bottom', 'full'].map((x) => [x, DOOR_POS_LABEL[x]]))}${selectRow('drawerHandle', 'On drawers', ['centre', 'top'].map((x) => [x, DRAWER_POS_LABEL[x]]))}</div>`
    ].join('');
    const legIds = ['wood', ...handleFinishes().filter((id) => id !== 'wood')];
    panel('base').innerHTML = T.allowPlinth
      ? [
        row('base', 'Base', ['none', 'recessed', 'flush', 'legs'].map((b) => [b, BASE_LABEL[b], BASE_NOTE[b]])),
        `<div class="pl-group" data-group="plinth">${fieldHtml('plinth', 'Base height', p.plinth, { min: 4, max: 30, sliderStep: 1 })}</div>`,
        row('legs', 'Legs', legIds.map((id) => [id, LEG_LABEL(id)]))
      ].join('')
      : `<p class="pl-hint">A ${esc(T.label.toLowerCase())} has no base to choose.</p>`;
    panel('top').innerHTML = [
      T.allowTop ? row('top', 'Top', ['flush', 'overhang', 'cornice'].map((t) => [t, TOP_LABEL[t], TOP_NOTE[t]])) : '',
      toggle('gables', 'End panels in the front material', 'The outer sides match the fronts.'),
      toggle('scribe', 'Scribe strips at the ceiling and sides', 'Filler strips that take up uneven walls and ceilings.')
    ].join('');
    const L = T.limits;
    const presets = T.sizePresets || [];
    sizeHost.innerHTML = [
      presets.length ? `<fieldset class="pl-fieldset pl-group"><legend>Standard sizes</legend><div class="pl-opts">${presets.map((s, i) => `<button type="button" class="pl-chip pl-chip--plain" data-preset="${i}">${esc(s.label)}</button>`).join('')}</div></fieldset>` : '',
      `<div class="pl-form">${[
        fieldHtml('size:width', 'Width', p.width, { min: L.width[0], max: L.width[1], sliderStep: 1 }),
        fieldHtml('size:height', 'Height', p.height, { min: L.height[0], max: L.height[1], sliderStep: 1 }),
        fieldHtml('size:depth', 'Depth', p.depth, { min: L.depth[0], max: L.depth[1], sliderStep: 1 }),
        L.elevation[1] > 0 ? fieldHtml('size:elevation', 'Height above the floor', p.elevation, { min: L.elevation[0], max: L.elevation[1], sliderStep: 1 }) : ''
      ].join('')}</div>`,
      `<fieldset class="pl-fieldset pl-group pl-space" data-group="space">
        <legend>How much space do you have? <span class="pl-space__opt">Optional</span></legend>
        <div class="pl-space__row">
          <label class="pl-space__f" for="pl-space-w"><span>Wall width</span><span class="pl-field"><input class="pl-field__input" type="number" inputmode="numeric" id="pl-space-w" data-space="width" min="${LIMITS.space.width[0]}" max="${LIMITS.space.width[1]}" step="1" aria-describedby="pl-space-msg"><span class="pl-field__unit" aria-hidden="true">cm</span></span></label>
          <label class="pl-space__f" for="pl-space-h"><span>Ceiling height</span><span class="pl-field"><input class="pl-field__input" type="number" inputmode="numeric" id="pl-space-h" data-space="height" min="${LIMITS.space.height[0]}" max="${LIMITS.space.height[1]}" step="1" aria-describedby="pl-space-msg"><span class="pl-field__unit" aria-hidden="true">cm</span></span></label>
        </div>
        <div class="pl-space__out"><p class="pl-hint pl-space__msg" id="pl-space-msg" data-spacemsg role="status"></p><button type="button" class="pl-btn pl-btn--accent pl-btn--small" data-fit="space" hidden>Fit to the space</button></div>
      </fieldset>`,
      `<p class="pl-hint">Limits: ${L.width[0]} to ${L.width[1]} cm wide, ${L.height[0]} to ${L.height[1]} high, ${L.depth[0]} to ${L.depth[1]} deep.</p>`
    ].join('');
    void hasFronts;
    for (const g of sizeHost.querySelectorAll('.pl-opts')) roving(g, { selector: 'button' });
    builtFor = p.type;
    spaceMsg = '';
    if (!(COLOUR_TARGETS.some(([k]) => k === colourTarget && (k !== 'worktop' || T.allowWorktop)))) colourTarget = 'frontMat';
    selectTab(tab);
  }

  // ---------- change handlers ----------
  const patchFor = (el) => {
    if (el.dataset.k) { const b = BIND[el.dataset.k]; return b ? b.set(el.value, piece) : null; }
    if (el.dataset.t) { const t = TOGGLE[el.dataset.t]; return t ? t.set(el.checked, piece) : null; }
    return null;
  };
  const onChange = (e) => {
    const el = e.target;
    if (!piece || !el.matches) return;
    if (el.matches('[data-bind]')) return; // numbers: handled by wireFields
    const patch = patchFor(el);
    if (!patch) return;
    store.dispatch({ type: 'piece/update', patch: { ...patch, style: 'custom' } });
    store.dispatch({ type: 'history/seal' });
  };
  hosts.forEach((h) => h.addEventListener('change', onChange));
  // which material list is showing in the Colour tab
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ctarget]');
    if (!t) return;
    colourTarget = t.dataset.ctarget;
    applyTargets();
    schedulePrices();
  });
  const lookup = (bind) => {
    if (!piece) return undefined;
    if (bind.startsWith('size:')) return piece[bind.slice(5)];
    if (bind === 'split') return piece.look.split;
    if (bind === 'plinth') return piece.plinth;
    return undefined;
  };
  hosts.forEach((h) => wireFields(h, {
    current: lookup,
    seal: () => store.dispatch({ type: 'history/seal' }),
    apply(bind, v) {
      if (!piece) return;
      const n = Math.round(v);
      let patch = null;
      if (bind.startsWith('size:')) patch = { [bind.slice(5)]: n };
      else if (bind === 'split') patch = { look: { split: n }, style: 'custom' };
      else if (bind === 'plinth') patch = { plinth: n, style: 'custom' };
      if (!patch) return;
      store.dispatch({ type: 'piece/update', patch, coalesce: `f:${piece.id}:${bind}` });
    }
  }));
  sizeHost.addEventListener('click', (e) => {
    if (!piece) return;
    const pre = e.target.closest('[data-preset]');
    if (pre) {
      const s = (TYPES[piece.type].sizePresets || [])[Number(pre.dataset.preset)];
      if (s) { store.dispatch({ type: 'piece/update', patch: { width: s.width, height: s.height, depth: s.depth } }); store.dispatch({ type: 'history/seal' }); announce(`Size set to ${s.label}.`); }
      return;
    }
    const fit = e.target.closest('[data-fit]');
    if (fit) doFit();
  });
  // the space the person has: committed while typing once the number is a valid one, so a half-typed "2" waits for "220"
  sizeHost.addEventListener('input', (e) => {
    const el = e.target;
    if (!piece || !el.matches || !el.matches('[data-space]')) return;
    const lim = LIMITS.space[el.dataset.space];
    const v = Number(el.value);
    if (el.value !== '' && (!Number.isFinite(v) || v < lim[0] || v > lim[1])) return;
    commitSpace();
  });
  sizeHost.addEventListener('change', (e) => {
    const el = e.target;
    if (!piece || !el.matches || !el.matches('[data-space]')) return;
    commitSpace();
    store.dispatch({ type: 'history/seal' });
    syncSpace(true);
  });
  function commitSpace() {
    const read = (k) => { const el = sizeHost.querySelector(`[data-space="${k}"]`); return el && el.value !== '' ? Number(el.value) : null; };
    const space = { width: read('width'), height: read('height') };
    store.dispatch({ type: 'piece/update', patch: { space: space.width === null && space.height === null ? null : space }, coalesce: `f:${piece.id}:space` });
  }
  function doFit() {
    const msg = one('[data-spacemsg]');
    const say = (t) => { msg.textContent = t; announce(t); };
    const r = fitToSpace(piece);
    if (!r) return;
    store.dispatch({ type: 'piece/update', patch: { width: r.width, height: r.height } });
    store.dispatch({ type: 'history/seal' });
    say(`Size set to ${r.width} × ${r.height} cm to fit your space.${r.exact ? '' : ' That is as close as this piece can get.'}`);
  }

  // ---------- prices ----------
  const solo = (p) => ({ v: 2, pieces: [p] });
  const totalOf = (p) => quoteProject(solo(p), { vat: true }).cents.total;
  function deltaOf(patch) {
    const next = updatePiece(solo(piece), piece.id, { ...patch, style: 'custom' }).pieces[0];
    return next ? totalOf(next) - baseCents : 0;
  }
  function refreshPrices() {
    priceTimer = 0;
    if (!piece || !state) return;
    const panelEl = panel(tab);
    if (!panelEl || panelEl.hidden || panelEl.closest('[hidden]')) return;
    baseCents = totalOf(piece);
    for (const sel of panelEl.querySelectorAll('select[data-k]')) {
      if (sel.closest('[hidden]')) continue;
      for (const o of sel.options) {
        const patch = o.value === sel.value ? null : BIND[sel.dataset.k].set(o.value, piece);
        const d = patch ? deltaOf(patch) : 0;
        const t = o.dataset.label + (Math.round(Math.abs(d) / 100) === 0 ? '' : ` ${eur(d)}`);
        if (o.textContent !== t) o.textContent = t;
      }
    }
    for (const label of panelEl.querySelectorAll('[data-opt], .pl-check')) {
      const el = label.querySelector('[data-price]');
      if (label.closest('[hidden]')) continue; // only the choices on show are priced
      const input = label.querySelector('input');
      if (!el || !input || input.disabled) { if (el) el.textContent = ''; continue; }
      if (input.type === 'radio' && input.checked) { el.textContent = ''; continue; }
      const patch = input.type === 'checkbox' ? TOGGLE[input.dataset.t].set(!input.checked, piece) : patchFor(input);
      if (!patch) { el.textContent = ''; continue; }
      const d = deltaOf(patch);
      el.textContent = Math.round(Math.abs(d) / 100) === 0 ? '' : eur(d);
      el.classList.toggle('is-neg', d < 0);
    }
  }
  function schedulePrices() {
    if (priceTimer) clearTimeout(priceTimer);
    priceTimer = setTimeout(refreshPrices, 140);
  }

  // ---------- sync ----------
  // a group is hidden by the rules of the piece (no doors, no two-tone) and, in the Colour tab, when it is not the one chosen
  const syncHidden = (el) => { el.hidden = el.dataset.off === '1' || el.dataset.target === '0'; };
  const show = (key, on) => { const el = host.querySelector(`[data-group="${key}"]`); if (!el) return; el.dataset.off = on ? '' : '1'; syncHidden(el); };
  function applyTargets() {
    const chips = [...host.querySelectorAll('[data-ctarget]')];
    const groupOf = (k) => host.querySelector(`[data-group="${k}"]`);
    for (const c of chips) {
      const g = groupOf(c.dataset.ctarget);
      const on = !!g && g.dataset.off !== '1';
      if (c.hidden === on) c.hidden = !on;
    }
    const cur = groupOf(colourTarget);
    if (!cur || cur.dataset.off === '1') colourTarget = 'frontMat';
    chips.forEach((c) => { const on = String(c.dataset.ctarget === colourTarget); if (c.getAttribute('aria-checked') !== on) c.setAttribute('aria-checked', on); });
    for (const [k] of COLOUR_TARGETS) {
      const el = groupOf(k);
      if (!el) continue;
      el.dataset.target = k === colourTarget ? '1' : '0';
      syncHidden(el);
    }
  }

  const disable = (key, on, why = '') => {
    const el = host.querySelector(`[data-group="${key}"]`);
    if (!el) return;
    el.querySelectorAll('input, select').forEach((i) => { i.disabled = on; });
    el.classList.toggle('is-disabled', on);
    const h = el.querySelector('[data-hint]');
    if (h) { h.textContent = on ? why : (h.dataset.base || ''); h.hidden = !(on ? why : h.dataset.base); }
  };
  const disableOpt = (key, value, on) => {
    const i = host.querySelector(`input[data-k="${key}"][value="${value}"]`);
    if (i) { i.disabled = on; i.closest('label').classList.toggle('is-disabled', on); }
  };

  function sync(p, st) {
    piece = p; state = st;
    if (!p) return;
    if (builtFor !== p.type) build(p);
    const T = TYPES[p.type];
    host.querySelectorAll('[data-hint]').forEach((h) => { if (h.dataset.base === undefined) h.dataset.base = h.hidden ? '' : h.textContent; });
    // radios and checkboxes
    host.querySelectorAll('input[data-k]').forEach((i) => { i.checked = BIND[i.dataset.k] ? BIND[i.dataset.k].get(p) === i.value : false; });
    host.querySelectorAll('select[data-k]').forEach((sel) => { const v = BIND[sel.dataset.k] ? BIND[sel.dataset.k].get(p) : ''; if (sel.value !== v) sel.value = v; });
    host.querySelectorAll('input[data-t]').forEach((i) => { i.checked = TOGGLE[i.dataset.t].get(p); });
    host.querySelectorAll('[data-matnote]').forEach((n) => {
      const b = BIND[n.dataset.matnote];
      const v = b ? b.get(p) : '';
      n.textContent = MATERIALS[v] ? `${MATERIALS[v].label}: ${MATERIALS[v].note}` : '';
    });
    // rules
    const noFronts = p.fronts.kind === 'open' || p.fronts.kind === 'none';
    const design = p.look.design;
    disable('design', noFronts, 'This piece has no doors, so there is no front design to choose.');
    disableOpt('design', 'glass', !T.allowedFronts.includes('glass'));
    disable('edge', noFronts || design === 'ribbed' || design === 'glass', noFronts ? 'This piece has no doors, so there are no edges to shape.' : 'Edges apply to slab and shaker fronts.');
    disable('gap', noFronts);
    show('glass', design === 'glass' && p.fronts.kind === 'glass');
    show('split', !!p.look.upper);
    show('upperMat', !!p.look.upper);
    const hg = p.height - 20, lo = Math.min(hg, Math.max(40, p.plinth + 20));
    all('[data-bind="split"]').forEach((el) => { el.min = lo; el.max = hg; el.dataset.min = lo; el.dataset.max = hg; });
    const hasDrawers = p.bays.some((b) => b.items.some((it) => /drawer|cutlery|pan-drawer|hamper/.test(it.kind)));
    const handleless = p.fronts.handle === 'push' || p.fronts.handle === 'edge';
    show('handleFinish', !handleless);
    show('handleSize', !handleless);
    show('doorHandle', p.fronts.handle !== 'push' && !noFronts);
    show('drawerHandle', p.fronts.handle !== 'push' && (hasDrawers || p.fronts.kind === 'none'));
    show('plinth', p.plinth > 0);
    show('legs', p.look.base === 'legs');
    // numbers
    hosts.forEach((h) => syncFields(h, lookup));
    applyTargets();
    syncSpace(false);
    schedulePrices();
  }

  // the space inputs show what is stored (never overwriting a box being typed in); the message says whether the piece fits
  function syncSpace(force) {
    if (!piece) return;
    const sp = piece.space || {};
    for (const el of sizeHost.querySelectorAll('[data-space]')) {
      const v = sp[el.dataset.space] == null ? '' : String(sp[el.dataset.space]);
      if (el.value !== v && (force || el !== document.activeElement)) el.value = v;
    }
    const check = spaceCheck(piece);
    const msg = one('[data-spacemsg]');
    const text = spaceMessage(piece) || 'We will tell you if the piece does not fit.';
    if (text !== spaceMsg) { spaceMsg = text; msg.textContent = text; }
    msg.classList.toggle('is-warn', check.has && !check.fits);
    const btn = one('[data-fit="space"]');
    if (btn && btn.hidden === (check.has && !check.fits)) btn.hidden = !(check.has && !check.fits);
  }

  return { sync, selectTab, refreshPrices };
}

// A style card: a generated picture, the name and what it does to the price. The one-line description is the tooltip
// and is read out with the name. The cards are radios in one roving group.
export function styleCardHtml(id, type) {
  const s = STYLES[id];
  const b = styleBundle(type, id);
  return `
    <button type="button" role="radio" class="pl-style" data-style="${id}" aria-checked="false" tabindex="-1" title="${esc(s.blurb)}" aria-describedby="pl-sd-${id}">
      <span class="pl-style__pic">${swatchSvg(b)}</span>
      <span class="pl-style__name">${esc(s.label)}</span>
      <span class="visually-hidden" id="pl-sd-${id}">${esc(s.blurb)}</span>
      <em class="pl-opt__price pl-style__price" data-price></em>
    </button>`;
}
