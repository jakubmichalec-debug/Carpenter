// Step 2: Furniture. Pick a type (which adds an unplaced piece), a style and a size. A switcher lists the pieces
// already made, so one can be picked again, edited or deleted. Leaving the step is always allowed.
import { TYPES, STYLES, MATERIALS, HANDLES, FRONT_KINDS, pieceLabel } from '../model.js';
import { esc, fieldHtml, wireFields, syncFields, pieceChipsHtml, notesHtml, ICON_TRASH } from './shared.js';

const FRONT_LABEL = { hinged: 'Hinged doors', sliding: 'Sliding doors', open: 'Open, no doors', glass: 'Glass doors', none: 'No fronts' };
const HANDLE_LABEL = { bar: 'Bar', knob: 'Knob', push: 'Push to open', groove: 'Finger groove' };
const HANDLE_PHRASE = { bar: 'bar handles', knob: 'knobs', push: 'push to open', groove: 'finger grooves' };
const WORKTOP_NONE = 'none';

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

const SELECTABLE = Object.entries(MATERIALS).filter(([, m]) => m.pickable !== false);
const FRONT_MATERIALS = SELECTABLE.filter(([, m]) => m.kind !== 'stone');
const CARCASS_MATERIALS = SELECTABLE.filter(([, m]) => m.kind === 'wood' || m.kind === 'ply');

export function createFurnitureStep(root, { store, announce = () => {}, confirmAction }) {
  let state = store.getState();
  let validation = { errors: [] };
  let tuneType = null, chipsKey = '', notesKey = '';

  const typeCards = Object.entries(TYPES).map(([id, t]) => `
    <button type="button" class="pl-type" data-type="${id}" aria-pressed="false">
      <span class="pl-type__icon">${TYPE_ICON[id] || ''}</span>
      <span class="pl-type__name">${esc(t.label)}</span>
      <span class="pl-type__size">${t.defaults.width} × ${t.defaults.height} cm</span>
    </button>`).join('');
  const styleCards = Object.entries(STYLES).map(([id, s]) => `
    <button type="button" class="pl-style" data-style="${id}" aria-pressed="false">
      <span class="pl-style__chip" style="--chip:${MATERIALS[s.fronts.material].color}"></span>
      <span class="pl-style__name">${esc(s.label)}</span>
      <span class="pl-style__what">${esc(FRONT_LABEL[s.fronts.kind])}, ${HANDLE_PHRASE[s.fronts.handle]}</span>
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
        <div class="pl-styles" id="pl-f-styles" role="group" aria-label="Style">${styleCards}</div>
        <details class="pl-more" id="pl-f-tune">
          <summary>Fine-tune the look</summary>
          <div class="pl-more__body" id="pl-f-tune-body"></div>
        </details>
      </section>

      <section class="pl-sec" aria-labelledby="pl-h-size">
        <header class="pl-sec__row"><h3 id="pl-h-size">Size</h3></header>
        <div class="pl-form" id="pl-f-size"></div>
        <p class="pl-hint" id="pl-f-sizehint"></p>
      </section>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const chipsEl = $('#pl-f-chips'), notesEl = $('#pl-f-notes'), rest = $('#pl-f-rest'), delBtn = $('#pl-f-delete');
  const current = () => state.project.pieces.find((p) => p.id === state.ui.pieceId) || null;

  // ---------- numbers ----------
  const lookup = (bind) => {
    const p = current();
    if (!p) return undefined;
    if (bind.startsWith('size:')) return p[bind.slice(5)];
    if (bind === 'plinth') return p.plinth;
    return undefined;
  };
  wireFields(root, {
    current: lookup,
    seal: () => store.dispatch({ type: 'history/seal' }),
    apply(bind, v) {
      const p = current();
      if (!p) return;
      const patch = bind.startsWith('size:') ? { [bind.slice(5)]: Math.round(v) } : bind === 'plinth' ? { plinth: Math.round(v), style: 'custom' } : null;
      if (patch) store.dispatch({ type: 'piece/update', patch, coalesce: `f:${p.id}:${bind}` });
    }
  });

  function buildSize(p) {
    const L = TYPES[p.type].limits;
    $('#pl-f-size').innerHTML = [
      fieldHtml('size:width', 'Width', p.width, { min: L.width[0], max: L.width[1], sliderStep: 5 }),
      fieldHtml('size:height', 'Height', p.height, { min: L.height[0], max: L.height[1], sliderStep: 5 }),
      fieldHtml('size:depth', 'Depth', p.depth, { min: L.depth[0], max: L.depth[1], sliderStep: 5 })
    ].join('');
    $('#pl-f-sizehint').textContent = `A ${TYPES[p.type].label.toLowerCase()} is ${L.width[0]} to ${L.width[1]} cm wide, ${L.height[0]} to ${L.height[1]} cm high and ${L.depth[0]} to ${L.depth[1]} cm deep.`;
  }

  function buildTune(p) {
    const T = TYPES[p.type];
    const sel = (name, label, opts, value) => `<div class="pl-row pl-row--select"><label class="pl-row__label" for="pl-t-${name}">${label}</label><select class="pl-select" id="pl-t-${name}" data-sel="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    const parts = [
      sel('kind', 'Fronts', FRONT_KINDS.filter((k) => T.allowedFronts.includes(k)).map((k) => [k, FRONT_LABEL[k]]), p.fronts.kind),
      sel('handle', 'Handles', HANDLES.map((h) => [h, HANDLE_LABEL[h]]), p.fronts.handle),
      `<fieldset class="pl-fieldset"><legend>Front material</legend><div class="pl-swatches" id="pl-t-mats">${FRONT_MATERIALS.map(([id, m]) => `<label class="pl-swatch"><input type="radio" name="pl-t-front" value="${id}"><span class="pl-swatch__chip" style="--chip:${m.color}"></span><span class="pl-swatch__name">${esc(m.label)}</span></label>`).join('')}</div></fieldset>`,
      sel('carcass', 'Sides and inside', CARCASS_MATERIALS.map(([id, m]) => [id, m.label]), p.carcass.material)
    ];
    if (T.allowWorktop) parts.push(sel('worktop', 'Worktop', [[WORKTOP_NONE, 'None'], ...SELECTABLE.map(([id, m]) => [id, m.label])], p.worktop || WORKTOP_NONE));
    if (T.allowPlinth) parts.push(fieldHtml('plinth', 'Plinth height', p.plinth, { min: 0, max: 20, sliderStep: 1 }));
    $('#pl-f-tune-body').innerHTML = parts.join('');
  }
  $('#pl-f-tune-body').addEventListener('change', (e) => {
    const p = current();
    if (!p) return;
    const el = e.target;
    let patch = null;
    if (el.dataset.sel === 'kind') patch = { fronts: { kind: el.value } };
    else if (el.dataset.sel === 'handle') patch = { fronts: { handle: el.value } };
    else if (el.dataset.sel === 'carcass') patch = { carcass: { material: el.value } };
    else if (el.dataset.sel === 'worktop') patch = { worktop: el.value === WORKTOP_NONE ? null : el.value };
    else if (el.name === 'pl-t-front') patch = { fronts: { material: el.value } };
    if (!patch) return;
    store.dispatch({ type: 'piece/update', patch: { ...patch, style: 'custom' } });
    store.dispatch({ type: 'history/seal' });
  });

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
  $('#pl-f-styles').addEventListener('click', (e) => {
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

  // ---------- update ----------
  function update(next, info = {}) {
    state = next;
    validation = info.validation || validation;
    const p = current();
    const project = state.project;

    const ck = JSON.stringify([project.pieces.map((x) => [x.id, x.type, x.width, x.height]), project.placements.map((x) => x.pieceId), state.ui.pieceId]);
    if (ck !== chipsKey) { chipsKey = ck; chipsEl.innerHTML = pieceChipsHtml(project, state.ui.pieceId) || '<p class="pl-hint">No pieces yet. Pick a type below to start.</p>'; }
    $('#pl-f-pieces-sec').hidden = !project.pieces.length;
    delBtn.disabled = !p;
    rest.hidden = !p;

    root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(!!p && p.type === b.dataset.type)));
    $('#pl-f-typehint').textContent = !p ? 'Pick a type to add a piece. You can add as many as you need.'
      : state.ui.fresh ? 'Not the right type? Pick another and it replaces this one.'
        : 'Picking a type adds a new piece. The ones you have shaped stay in your list.';
    if (!p) { notesEl.innerHTML = ''; notesKey = ''; return; }

    if (tuneType !== p.type) { tuneType = p.type; buildSize(p); buildTune(p); }
    root.querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String(p.style === b.dataset.style)));
    syncFields(root, lookup);
    root.querySelectorAll('input[name="pl-t-front"]').forEach((i) => { i.checked = i.value === p.fronts.material; });
    for (const [name, v] of [['kind', p.fronts.kind], ['handle', p.fronts.handle], ['carcass', p.carcass.material], ['worktop', p.worktop || WORKTOP_NONE]]) {
      const s = root.querySelector(`[data-sel="${name}"]`);
      if (s && s.value !== v) s.value = v;
    }

    const list = (validation.errors || []).filter((e) => e.ref && e.ref.type === 'piece' && e.ref.id === p.id && e.code !== 'piece-unplaced');
    const html = notesHtml(list);
    if (html !== notesKey) { notesKey = html; notesEl.innerHTML = html; }
  }

  update(state);
  return { update, show() { /* nothing to measure */ } };
}
