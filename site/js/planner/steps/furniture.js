// Step 1: Furniture. Four sections: Pieces (the list, "+ Add a piece", and the type cards while one is being added),
// Style, Look and Size. Leaving the step is always allowed.
import { TYPES, STYLES, updatePiece, pieceLabel } from '../model.js';
import { quoteProject } from '../pricing.js';
import { esc, pieceChipsHtml, notesHtml, ICON_TRASH } from './shared.js';
import { createLookPanel, styleCardHtml } from './look-panel.js';
import { createTabs, roving, scrollCue } from './ui.js';

const ICON = (d) => `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const TYPE_ICON = {
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

export function createFurnitureStep(root, { store, announce = () => {}, confirmAction, issues }) {
  let state = store.getState();
  let validation = { errors: [] };
  let styleKey = '', chipsKey = '', notesKey = '', priceTimer = 0;
  let issueCount = 0;
  let wasAdding = true;   // true while no piece is being edited: the next piece picked moves on to Style

  const typeCards = Object.entries(TYPES).map(([id, t]) => `
    <button type="button" class="pl-type" data-type="${id}">
      <span class="pl-type__icon">${TYPE_ICON[id] || ''}</span>
      <span class="pl-type__name">${esc(t.label)}</span>
      <span class="pl-type__size">${t.defaults.width} × ${t.defaults.height} cm</span>
    </button>`).join('');

  root.innerHTML = `
    <section class="pl-sec" data-sec="pieces">
      <h3 class="visually-hidden">Pieces</h3>
      <div class="pl-piecebox" id="pl-f-listbox">
        <div class="pl-chips" id="pl-f-chips" role="radiogroup" aria-label="Your pieces"></div>
        <div class="pl-actions">
          <button type="button" class="pl-btn pl-btn--accent" id="pl-f-add">${ICON_PLUS}Add a piece</button>
          <button type="button" class="pl-btn pl-btn--quiet" id="pl-f-delete">${ICON_TRASH}Delete<span class="visually-hidden"> this piece</span></button>
        </div>
        <p class="pl-summary" id="pl-f-summary"></p>
      </div>
      <div class="pl-typebox" id="pl-f-typebox">
        <div class="pl-sec__row">
          <h4 class="pl-sec__sub" id="pl-f-typeh">What do you want to build?</h4>
          <button type="button" class="pl-btn pl-btn--quiet pl-btn--small" id="pl-f-cancel">Cancel</button>
        </div>
        <div class="pl-types" id="pl-f-types" role="group" aria-labelledby="pl-f-typeh">${typeCards}</div>
        <p class="pl-hint" id="pl-f-typehint"></p>
      </div>
    </section>

    <section class="pl-sec" data-sec="style">
      <h3 class="visually-hidden">Style</h3>
      <p class="pl-hint">One click sets the whole look. A price is what the style adds or takes off.</p>
      <div class="pl-styles" id="pl-f-styles" role="radiogroup" aria-label="Style"></div>
    </section>

    <section class="pl-sec" data-sec="look">
      <h3 class="visually-hidden">Look</h3>
      <div class="pl-look" id="pl-f-look"></div>
    </section>

    <section class="pl-sec" data-sec="size">
      <h3 class="visually-hidden">Size</h3>
      <div class="pl-sizebox" id="pl-f-size"></div>
    </section>`;

  const $ = (sel) => root.querySelector(sel);
  const chipsEl = $('#pl-f-chips'), notesEl = issues, delBtn = $('#pl-f-delete'), stylesEl = $('#pl-f-styles');
  const sections = createTabs({
    root, prefix: 'pl-f', label: 'Furniture sections',
    items: [{ id: 'pieces', label: 'Pieces' }, { id: 'style', label: 'Style' }, { id: 'look', label: 'Look' }, { id: 'size', label: 'Size' }]
  });
  sections.show('pieces');
  roving(chipsEl, { selector: '[data-piece]', selects: true });
  roving($('#pl-f-types'), { selector: '[data-type]' });
  roving(stylesEl, { selector: '[data-style]', selects: true });
  scrollCue(stylesEl, 'y');
  scrollCue(chipsEl, 'y', { grow: false });
  const current = () => state.project.pieces.find((p) => p.id === state.ui.pieceId) || null;
  const look = createLookPanel($('#pl-f-look'), { store, announce, sizeHost: $('#pl-f-size') });

  // ---------- clicks ----------
  $('#pl-f-types').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    const before = state.project.pieces.length;
    store.dispatch({ type: 'piece/add', pieceType: b.dataset.type });
    store.dispatch({ type: 'history/seal' });
    const p = current();
    if (p) announce(`${pieceLabel(state.project, p.id)} ${state.project.pieces.length > before ? 'added' : 'chosen'}. Choose its style next.`);
    else announce('A design can hold up to 40 pieces, and you have reached that.');
  });
  $('#pl-f-add').addEventListener('click', () => { store.dispatch({ type: 'ui/new-piece' }); });
  $('#pl-f-cancel').addEventListener('click', () => {
    const p = current();
    if (p) { store.dispatch({ type: 'ui/piece', id: p.id }); $('#pl-f-add').focus(); }
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
    const ok = await confirmAction({
      title: `Delete ${name}?`,
      text: `This removes the ${name.toLowerCase()}, everything inside it. You can bring it back with Undo.`,
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
    if (!p || state.ui.starting || sections.current() !== 'style') return;
    const solo = (piece) => ({ v: 2, pieces: [piece] });
    const total = (piece) => quoteProject(solo(piece), { vat: true }).cents.total;
    const base = total(p);
    stylesEl.querySelectorAll('[data-style]').forEach((b) => {
      const el = b.querySelector('[data-price]');
      if (b.dataset.style === p.style) { el.textContent = ''; return; }
      const next = updatePiece(solo(p), p.id, { style: b.dataset.style }).pieces[0];
      const d = next ? total(next) - base : 0;
      const n = Math.round(Math.abs(d) / 100);
      el.textContent = n === 0 ? '' : `${d > 0 ? '+' : '−'}€${n.toLocaleString('en-IE')}`;
      el.classList.toggle('is-neg', d < 0);
    });
  }
  root.addEventListener('pl-section', (e) => { if (e.detail.id === 'style') { if (priceTimer) clearTimeout(priceTimer); priceTimer = setTimeout(stylePrices, 60); } });
  const summary = (p) => `${pieceLabel(state.project, p.id)}: ${p.width} × ${p.height} × ${p.depth} cm, ${STYLES[p.style] ? STYLES[p.style].label.toLowerCase() : 'your own mix'}.`;

  // ---------- update ----------
  function update(next, info = {}) {
    state = next;
    validation = info.validation || validation;
    const p = current();
    const project = state.project;
    const starting = !!state.ui.starting;
    const adding = starting || !project.pieces.length;

    const ck = JSON.stringify([project.pieces.map((x) => [x.id, x.type, x.width, x.height]), state.ui.pieceId, starting]);
    if (ck !== chipsKey) { chipsKey = ck; chipsEl.innerHTML = pieceChipsHtml(project, starting ? null : state.ui.pieceId); }
    $('#pl-f-listbox').hidden = !project.pieces.length;
    $('#pl-f-typebox').hidden = !adding;
    $('#pl-f-add').hidden = adding;
    $('#pl-f-cancel').hidden = !(starting && !!p);
    delBtn.disabled = !p || starting;
    delBtn.hidden = adding;
    $('#pl-f-summary').textContent = p && !adding ? summary(p) : '';
    $('#pl-f-typehint').textContent = !p ? 'Pick a type to add a piece. You can add as many as you need.'
      : state.ui.fresh ? 'Not the right type? Pick another and it replaces the piece you just added.'
        : 'The pieces you have made stay in your list.';

    // only the Pieces section means anything until a piece is being edited
    const editing = !!p && !adding;
    for (const id of ['style', 'look', 'size']) sections.setHidden(id, !editing);
    if (adding && sections.current() !== 'pieces') sections.show('pieces');
    else if (editing && wasAdding && sections.current() === 'pieces' && state.ui.fresh) { sections.show('style'); }
    wasAdding = adding;

    if (!editing) { notesEl.innerHTML = ''; notesKey = ''; issueCount = 0; return; }

    buildStyles(p);
    stylesEl.querySelectorAll('[data-style]').forEach((b) => {
      const on = String(p.style === b.dataset.style);
      if (b.getAttribute('aria-checked') !== on) b.setAttribute('aria-checked', on);
    });
    look.sync(p, state);
    if (sections.current() === 'style') { if (priceTimer) clearTimeout(priceTimer); priceTimer = setTimeout(stylePrices, 220); }

    const list = (validation.errors || []).filter((e) => e.ref && e.ref.type === 'piece' && e.ref.id === p.id);
    issueCount = list.length;
    const html = notesHtml(list);
    if (html !== notesKey) { notesKey = html; notesEl.innerHTML = html; }
  }

  update(state);
  return { update, show() { /* nothing to measure */ }, sections, status: () => ({ count: issueCount, ok: !!current() && !state.ui.starting }) };
}
