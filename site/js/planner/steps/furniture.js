// Step 2: Furniture. Pick a type (which adds an unplaced piece), a style and a size. A switcher lists the pieces
// already made, so one can be picked again, edited or deleted. Leaving the step is always allowed.
import { TYPES, STYLES, MATERIALS, updatePiece, pieceLabel } from '../model.js';
import { quoteProject } from '../pricing.js';
import { esc, pieceChipsHtml, notesHtml, ICON_TRASH } from './shared.js';
import { createLookPanel, styleCardHtml } from './look-panel.js';

const HANDLE_LABEL = { bar: 'bar handles', knob: 'knobs', cup: 'cup pulls', edge: 'finger pulls', push: 'push to open' };

const ICON = (d) => `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TYPE_ICON = {
  wardrobe: ICON('<rect x="4" y="3" width="24" height="25" rx="1.5"/><path d="M16 3v25M13 15v3M19 15v3M6 28v2M26 28v2"/>'),
  'kitchen-base': ICON('<path d="M4 11h24M5 11v17h22V11M5 19h22M12 15h8M12 24h8"/>'),
  'kitchen-wall': ICON('<path d="M3 5h26M5 5v14h22V5M16 5v14M12 12v3M20 12v3"/>'),
  'tall-cabinet': ICON('<rect x="9" y="2.5" width="14" height="26" rx="1.5"/><path d="M16 2.5v26M13 15v3M19 15v3M10 28.5v1.5M22 28.5v1.5"/>'),
  'wall-unit': ICON('<rect x="3" y="4" width="26" height="22" rx="1"/><path d="M16 4v22M3 12h13M16 18h13M3 19h13"/>'),
  desk: ICON('<path d="M3 9h26M6 9v18M26 9v18M18 14h8v8h-8zM18 18h8M8 14h6"/>'),
  table: ICON('<path d="M4 11h24M7 11v16M25 11v16M9 14h14"/>'),
  'window-seat': ICON('<path d="M4 12h24v4H4zM5 16v10h22V16M16 16v10M10 12c0-3 12-3 12 0"/>'),
  'under-stairs': ICON('<path d="M3 28V5l26 23zM3 28h26M8 24v-8h8M8 20h6"/>'),
  island: ICON('<path d="M2 10h28M4 10v18h24V10M12 10v18M20 10v18M7 17h2M15 17h2M23 17h2"/>')
};

export function createFurnitureStep(root, { store, announce = () => {}, confirmAction }) {
  let state = store.getState();
  let validation = { errors: [] };
  let styleKey = '', chipsKey = '', notesKey = '', priceTimer = 0;

  const typeCards = Object.entries(TYPES).map(([id, t]) => `
    <button type="button" class="pl-type" data-type="${id}" aria-pressed="false">
      <span class="pl-type__icon">${TYPE_ICON[id] || ''}</span>
      <span class="pl-type__name">${esc(t.label)}</span>
      <span class="pl-type__size">${t.defaults.width} \u00d7 ${t.defaults.height} cm</span>
    </button>`).join('');

  root.innerHTML = `
    <header class="pl-sec__head">
      <p class="eyebrow">Step 2 of 5</p>
      <h2 id="pl-h-furniture">Furniture</h2>
      <p class="pl-lede">Pick what you want built, choose its look and set its size. You place it in the room later.</p>
    </header>
    <ul class="pl-notes" id="pl-f-notes" aria-label="Piece checks"></ul>

    <section class="pl-sec" aria-labelledby="pl-h-pieces" id="pl-f-pieces-sec">
      <header class="pl-sec__row">
        <h3 id="pl-h-pieces">Your pieces</h3>
        <button type="button" class="pl-btn pl-btn--quiet" id="pl-f-delete">${ICON_TRASH}Delete<span class="visually-hidden"> this piece</span></button>
      </header>
      <div class="pl-chips" id="pl-f-chips" role="group" aria-label="Choose a piece to edit"></div>
    </section>

    <section class="pl-sec" aria-labelledby="pl-h-type">
      <header class="pl-sec__row"><h3 id="pl-h-type">Type</h3></header>
      <div class="pl-types" id="pl-f-types" role="group" aria-label="Piece type">${typeCards}</div>
      <p class="pl-hint" id="pl-f-typehint"></p>
    </section>

    <div id="pl-f-rest">
      <section class="pl-sec" aria-labelledby="pl-h-style">
        <header class="pl-sec__row"><h3 id="pl-h-style">Style</h3></header>
        <p class="pl-hint pl-hint--tight">One click sets the whole look. A price shows what the style adds to or takes off this piece.</p>
        <div class="pl-styles" id="pl-f-styles" role="group" aria-label="Style"></div>
      </section>

      <section class="pl-sec" aria-labelledby="pl-h-tune">
        <header class="pl-sec__row"><h3 id="pl-h-tune">Fine-tune the look</h3></header>
        <p class="pl-summary" id="pl-f-summary"></p>
        <p class="pl-hint pl-hint--tight">Prices show what an option adds to or takes off this piece, VAT included. No price means no change.</p>
        <div class="pl-look" id="pl-f-look"></div>
      </section>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const chipsEl = $('#pl-f-chips'), notesEl = $('#pl-f-notes'), rest = $('#pl-f-rest'), delBtn = $('#pl-f-delete'), stylesEl = $('#pl-f-styles');
  const current = () => state.project.pieces.find((p) => p.id === state.ui.pieceId) || null;
  const look = createLookPanel($('#pl-f-look'), { store, announce });

  // ---------- clicks ----------
  $('#pl-f-types').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    const before = state.project.pieces.length;
    store.dispatch({ type: 'piece/add', pieceType: b.dataset.type });
    store.dispatch({ type: 'history/seal' });
    const p = current();
    if (p) announce(`${pieceLabel(state.project, p.id)} ${state.project.pieces.length > before ? 'added' : 'chosen'}.`);
    else announce('There is no room for another piece.');
  });
  stylesEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-style]');
    if (!b || !current()) return;
    store.dispatch({ type: 'piece/update', patch: { style: b.dataset.style } });
    store.dispatch({ type: 'history/seal' });
    announce(`Style: ${STYLES[b.dataset.style].label}.`);
  });
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-piece]');
    if (b) store.dispatch({ type: 'ui/piece', id: b.dataset.piece });
  });
  delBtn.addEventListener('click', async () => {
    const p = current();
    if (!p) return;
    const name = pieceLabel(state.project, p.id);
    const placed = state.project.placements.some((pl) => pl.pieceId === p.id);
    const ok = await confirmAction({
      title: `Delete ${name}?`,
      text: `This removes the ${name.toLowerCase()}, everything inside it${placed ? ' and its place in the room' : ''}. You can bring it back with Undo.`,
      yes: `Delete ${name.toLowerCase()}`, no: 'Keep it'
    });
    if (!ok) return;
    store.dispatch({ type: 'piece/remove', id: p.id });
    store.dispatch({ type: 'history/seal' });
    announce(`${name} deleted.`);
  });

  // ---------- style cards and their prices ----------
  function buildStyles(p) {
    const ids = Object.keys(STYLES).filter((id) => !STYLES[id].legacy || id === p.style);
    const key = `${p.type}|${ids.join(',')}`;
    if (key === styleKey) return;
    styleKey = key;
    stylesEl.innerHTML = ids.map((id) => styleCardHtml(id, p.type)).join('');
  }
  function stylePrices() {
    priceTimer = 0;
    const p = current();
    if (!p || state.ui.starting) return;
    const solo = (piece) => ({ v: 2, room: state.project.room, pieces: [piece], placements: [] });
    const total = (piece) => quoteProject(solo(piece), { vat: true }).cents.total;
    const base = total(p);
    stylesEl.querySelectorAll('[data-style]').forEach((b) => {
      const el = b.querySelector('[data-price]');
      if (b.dataset.style === p.style) { el.textContent = ''; return; }
      const next = updatePiece(solo(p), p.id, { style: b.dataset.style }).pieces[0];
      const d = next ? total(next) - base : 0;
      const n = Math.round(Math.abs(d) / 100);
      el.textContent = n === 0 ? '' : `${d > 0 ? '+' : '\u2212'}\u20ac${n.toLocaleString('en-IE')}`;
      el.classList.toggle('is-neg', d < 0);
    });
  }
  const label = (id) => (MATERIALS[id] ? MATERIALS[id].label : id);
  function summary(p) {
    const fronts = p.look.upper ? `${label(p.fronts.material)} below, ${label(p.look.upper.material)} above` : label(p.fronts.material);
    const handle = p.fronts.kind === 'open' || p.fronts.kind === 'none' ? '' : `, ${HANDLE_LABEL[p.fronts.handle] || p.fronts.handle}`;
    const custom = p.style === 'custom' ? ' Your own mix: pick a style to start again.' : '';
    return `${p.width} \u00d7 ${p.height} \u00d7 ${p.depth} cm, ${fronts.toLowerCase().replace(/^./, (c) => c.toUpperCase())}${handle}.${custom}`;
  }

  // ---------- update ----------
  function update(next, info = {}) {
    state = next;
    validation = info.validation || validation;
    const p = current();
    const project = state.project;

    const ck = JSON.stringify([project.pieces.map((x) => [x.id, x.type, x.width, x.height]), project.placements.map((x) => x.pieceId), state.ui.pieceId, !!state.ui.starting]);
    if (ck !== chipsKey) { chipsKey = ck; chipsEl.innerHTML = pieceChipsHtml(project, state.ui.starting ? null : state.ui.pieceId) || '<p class="pl-hint">No pieces yet. Pick a type below to start.</p>'; }
    $('#pl-f-pieces-sec').hidden = !project.pieces.length;
    delBtn.disabled = !p;
    const starting = !!state.ui.starting;
    rest.hidden = !p || starting;

    root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(!!p && !starting && p.type === b.dataset.type)));
    $('#pl-f-typehint').textContent = !p ? 'Pick a type to add a piece. You can add as many as you need.'
      : starting ? 'Pick a type for your next piece. The ones you have made stay in your list.'
      : state.ui.fresh ? 'Not the right type? Pick another and it replaces this one.'
        : 'Picking a type adds a new piece. The ones you have shaped stay in your list.';
    if (!p || starting) { notesEl.innerHTML = ''; notesKey = ''; return; }

    buildStyles(p);
    stylesEl.querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String(p.style === b.dataset.style)));
    $('#pl-f-summary').textContent = summary(p);
    look.sync(p, state);
    if (priceTimer) clearTimeout(priceTimer);
    priceTimer = setTimeout(stylePrices, 220);

    const list = (validation.errors || []).filter((e) => e.ref && e.ref.type === 'piece' && e.ref.id === p.id && e.code !== 'piece-unplaced');
    const html = notesHtml(list);
    if (html !== notesKey) { notesKey = html; notesEl.innerHTML = html; }
  }

  update(state);
  return { update, show() { /* nothing to measure */ } };
}
