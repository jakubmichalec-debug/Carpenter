// The guided flow: the planner as one question per screen. It does not draw the editors itself. Every question shows the
// sections of the planner's own step editors (room, furniture, interior, place, review) that answer it, hides their tab
// bars, and adds the few things only a question needs: Yes/No answers, big type and preset cards, a short list of colours,
// the list of pieces and the contact form. The store, the editors and every action stay the same; "Edit everything"
// switches back to the tabbed view without losing anything.
import * as F from '../flow.js';
import {
  TYPES, STYLES, HANDLES, ITEMS, OPENING_TYPES, pieceLabel, updatePiece, applyPreset, presetsFor, pieceGeometry, wallsOf
} from '../model.js';
import { MATERIALS, materialsFor, handleFinishes } from '../materials.js';
import { quoteProject } from '../pricing.js';
import * as G from '../place-geom.js';
import * as R from '../review-logic.js';
import { esc, ICON_NOTE, ICON_TRASH } from './shared.js';
import { TYPE_ICON } from './furniture.js';
import { drawItem } from './interior-draw.js';
import { roving } from './ui.js';

const VIEW_KEY = 'gj.planner.view';
const HANDLE_LABEL = { bar: 'Bar', knob: 'Knob', cup: 'Cup pull', edge: 'Finger pull', push: 'Push to open' };
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const OPEN_ICON = {
  door: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V3h9v18M3 21h18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12.5" cy="12.5" r="1" fill="currentColor"/></svg>',
  window: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="15" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3.5v15M4 11h16M2.5 21h19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  radiator: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM8 6v12M12 6v12M16 6v12M6 20v1M18 20v1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  socket: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9.5" cy="12" r="1.1" fill="currentColor"/><circle cx="14.5" cy="12" r="1.1" fill="currentColor"/></svg>'
};
const wallNo = (id) => String(id).replace(/^w/, '');
const eur = (cents) => {
  const n = Math.round(Math.abs(cents) / 100);
  return `${cents > 0 ? '+' : cents < 0 ? '−' : ''}€${n.toLocaleString('en-IE')}`;
};

export function savedMode() {
  try { return localStorage.getItem(VIEW_KEY) === 'expert' ? 'expert' : 'guided'; } catch { return 'guided'; }
}
function saveMode(m) { try { localStorage.setItem(VIEW_KEY, m); } catch { /* private window */ } }

export function createGuided({ store, announce = () => {}, confirmAction, views, app, host, refresh = () => {}, focusTitle = () => {}, getValidation = () => ({ errors: [] }) }) {
  let state = store.getState();
  let active = savedMode() === 'guided';
  let q = 'shape';
  let entry = state.project;          // the project when this question was opened: "nothing changed yet" means still the same object
  let navigating = false;             // true while go() dispatches, so the step change it causes is not taken for an outside one
  let userNav = false;                // false until the person has moved, so the first paint does not steal focus
  const flags = { openings: null, arrange: false, lookMore: false, scope: 'all' };
  const chosen = {};                  // interior preset picked in this visit, by section ("all" or an index)
  const reached = new Set([0]);
  const placedTried = new Set();
  const contact = { name: '', email: '', phone: '', postcode: '', message: '', consent: false };
  let contactErr = {};
  let sent = null;                    // { ref, name } after the contact form
  let touchedBlock = false;           // the form was submitted once, so its errors update as you type
  const keys = { type: '', look: '', inside: '', more: '', open: '', send: '' };
  let priceTimer = 0;
  let returnTo = null;                // 'more' while a second piece is being chosen: Back goes back to the list

  const $ = (sel) => host.querySelector(sel);
  const piece = () => state.project.pieces.find((p) => p.id === state.ui.pieceId) || null;
  const insideOf = () => (piece() ? F.hasInside(piece()) : true);
  const ctx = () => ({ hasInside: insideOf() });
  const placedCount = () => state.project.placements.filter((pl) => state.project.pieces.some((p) => p.id === pl.pieceId)).length;
  const vflags = () => ({ openings: openingsYes(), arrange: flags.arrange, lookMore: flags.lookMore });
  const openingsYes = () => F.openingsAnswer(state.project, flags.openings) === true;
  const seal = () => store.dispatch({ type: 'history/seal' });
  const touched = () => state.project !== entry;
  const isCompact = () => matchMedia('(max-width: 1279px)').matches;

  // ---------- the markup the questions add ----------
  host.innerHTML = `
    <section class="pl-gq" data-gq="openings" hidden>
      <div class="pl-yn" id="pl-g-yn" role="group" aria-label="Does the room have doors, windows or radiators?">
        <button type="button" class="pl-ynbtn" data-yn="yes" aria-pressed="false"><b>Yes</b><span>I will add them</span></button>
        <button type="button" class="pl-ynbtn" data-yn="no" aria-pressed="false"><b>No</b><span>Just bare walls</span></button>
      </div>
      <div class="pl-g-open" id="pl-g-open" hidden>
        <div class="pl-addrow" id="pl-g-add" role="group" aria-label="Add to the room">
          ${Object.entries(OPENING_TYPES).map(([k, t]) => `<button type="button" class="pl-addbtn" data-add="${k}">${OPEN_ICON[k]}<span><span aria-hidden="true">+ </span>${t.label}</span></button>`).join('')}
        </div>
        <div class="pl-chips pl-chips--row pl-g-oplist" id="pl-g-oplist" role="radiogroup" aria-label="Your doors, windows and radiators" hidden></div>
      </div>
    </section>

    <section class="pl-gq" data-gq="type" hidden>
      <div class="pl-types pl-types--big" id="pl-g-types" role="group" aria-label="What to build">
        ${Object.entries(TYPES).map(([id, t]) => `
          <button type="button" class="pl-type" data-type="${id}" aria-pressed="false">
            <span class="pl-type__icon">${TYPE_ICON[id] || ''}</span>
            <span class="pl-type__name">${esc(t.label)}</span>
            <span class="pl-type__size">${t.defaults.width} × ${t.defaults.height} cm</span>
          </button>`).join('')}
      </div>
    </section>

    <section class="pl-gq" data-gq="look" hidden>
      <div id="pl-g-simple">
        <div class="pl-gblock" id="pl-g-colour-b"><div class="pl-gblock__row"><h3 class="pl-gblock__h" id="pl-g-colour-h">Front colour</h3><button type="button" class="pl-link pl-gmore" id="pl-g-more">More options</button></div><div class="pl-gsws" id="pl-g-colour" role="radiogroup" aria-labelledby="pl-g-colour-h"></div></div>
        <div class="pl-gblock" id="pl-g-handle-b"><h3 class="pl-gblock__h" id="pl-g-handle-h">Handles</h3><div class="pl-chips pl-chips--row pl-g-handles" id="pl-g-handle" role="radiogroup" aria-labelledby="pl-g-handle-h"></div></div>
        <div class="pl-gblock" id="pl-g-finish-b"><h3 class="pl-gblock__h" id="pl-g-finish-h">Handle finish</h3><div class="pl-gsws" id="pl-g-finish" role="radiogroup" aria-labelledby="pl-g-finish-h"></div></div>
      </div>
      <button type="button" class="pl-link pl-gless" id="pl-g-less" hidden>‹ Fewer options</button>
    </section>

    <section class="pl-gq" data-gq="inside" hidden>
      <div class="pl-chips pl-chips--row pl-g-scope" id="pl-g-scope" role="radiogroup" aria-label="Which section to start from" hidden></div>
      <div class="pl-presets" id="pl-g-presets" role="group" aria-label="Ways to fit out the inside"></div>
    </section>

    <section class="pl-gq" data-gq="arrange" hidden>
      <div class="pl-yn" id="pl-g-arrange" role="group" aria-label="Arrange the inside yourself?">
        <button type="button" class="pl-ynbtn" data-arr="no"><b>No, that’s fine</b><span>Keep what we suggested</span></button>
        <button type="button" class="pl-ynbtn" data-arr="yes" aria-pressed="false"><b>Yes, I’ll arrange it</b><span>Open the inside editor</span></button>
      </div>
    </section>

    <section class="pl-gq" data-gq="more" hidden>
      <ul class="pl-gpieces" id="pl-g-pieces" aria-label="Your pieces"></ul>
      <div class="pl-yn pl-yn--stack" role="group" aria-label="What next?">
        <button type="button" class="pl-ynbtn pl-ynbtn--add" data-more="add" id="pl-g-add-piece"><b>Yes, add another piece</b><span>Back to choosing a type</span></button>
        <button type="button" class="pl-ynbtn pl-ynbtn--go" data-more="done"><b>No, show me the result</b><span>See your room in 3D and the price</span></button>
      </div>
    </section>

    <section class="pl-gq" data-gq="send" hidden>
      <div id="pl-g-blockers"></div>
      <form class="pl-gform" id="pl-g-form" novalidate autocomplete="on">
        <div class="pl-gform__grid">
          <div class="pl-gfield"><label for="pl-g-name">Name</label><input id="pl-g-name" name="name" type="text" autocomplete="name" aria-describedby="pl-g-name-e"><p class="pl-gerr" id="pl-g-name-e" data-err="name" hidden>Please tell us your name.</p></div>
          <div class="pl-gfield"><label for="pl-g-email">Email</label><input id="pl-g-email" name="email" type="email" autocomplete="email" inputmode="email" aria-describedby="pl-g-email-e"><p class="pl-gerr" id="pl-g-email-e" data-err="email" hidden>Please enter a valid email address.</p></div>
          <div class="pl-gfield"><label for="pl-g-phone">Phone <span>(optional)</span></label><input id="pl-g-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel"></div>
          <div class="pl-gfield"><label for="pl-g-post">Postcode</label><input id="pl-g-post" name="postcode" type="text" autocomplete="postal-code" inputmode="numeric" placeholder="e.g. 2000" aria-describedby="pl-g-post-e"><p class="pl-gerr" id="pl-g-post-e" data-err="postcode" hidden>Please enter your postcode.</p></div>
          <div class="pl-gfield pl-gfield--wide"><label for="pl-g-msg">Anything else we should know? <span>(optional)</span></label><textarea id="pl-g-msg" name="message" rows="2"></textarea></div>
        </div>
        <label class="pl-check pl-gconsent"><input type="checkbox" name="consent" aria-describedby="pl-g-consent-e"><span>I understand this is a concept website: nothing I enter here is sent or stored anywhere.</span></label>
        <p class="pl-gerr" id="pl-g-consent-e" data-err="consent" hidden>Please tick the box to continue.</p>
      </form>
      <div class="pl-gdone" id="pl-g-done" tabindex="-1" hidden>
        <p class="pl-gdone__tick">${ICON_CHECK}</p>
        <p class="pl-gdone__ref">Reference <strong id="pl-g-ref"></strong></p>
        <p class="pl-hint"><strong>Nothing was sent.</strong> Your details stayed in your browser. In a real build they would reach the workshop, and we would reply within two working days.</p>
        <div class="pl-actions"><button type="button" class="pl-btn pl-btn--ghost" id="pl-g-backdesign">Back to my design</button></div>
      </div>
    </section>`;

  roving($('#pl-g-types'), { selector: '[data-type]' });
  roving($('#pl-g-add'), { selector: '[data-add]' });
  roving($('#pl-g-oplist'), { selector: '[data-op]', selects: true });
  roving($('#pl-g-yn'), { selector: '[data-yn]' });
  roving($('#pl-g-arrange'), { selector: '[data-arr]' });
  roving($('#pl-g-colour'), { selector: '[data-front]', selects: true });
  roving($('#pl-g-handle'), { selector: '[data-handle]', selects: true });
  roving($('#pl-g-finish'), { selector: '[data-finish]', selects: true });
  roving($('#pl-g-scope'), { selector: '[data-scope]', selects: true });
  roving($('#pl-g-presets'), { selector: '[data-preset]' });

  // ---------- going from question to question ----------
  function ensurePlaced() {
    const p = piece();
    if (!p || state.project.placements.some((pl) => pl.pieceId === p.id) || placedTried.has(p.id)) return;
    placedTried.add(p.id);
    store.dispatch({ type: 'place/set', id: p.id, spec: { ...G.suggestPlacement(state.project, p.id), snap: false } });
    seal();
  }

  function go(id, { quiet = false } = {}) {
    id = F.settle(id, { pieces: state.project.pieces.length, placed: placedCount(), hasInside: insideOf() });
    const v = F.view(id, vflags());
    navigating = true;
    userNav = userNav || !quiet;
    q = id;
    entry = state.project;
    if (id === 'look') flags.lookMore = false;
    if (id === 'arrange') flags.arrange = false;
    if (id === 'inside') flags.scope = 'all';
    if (id === 'place') placedTried.clear();
    if (id !== 'send') sent = null;
    if (id !== 'type') returnTo = null;
    reached.add(F.chapterOf(id));
    if (id !== 'type' && state.ui.starting && piece()) store.dispatch({ type: 'ui/piece', id: piece().id });
    if (state.ui.step !== v.step) store.dispatch({ type: 'ui/step', step: v.step });
    if (id === 'place') ensurePlaced();
    navigating = false;
    refresh();
    if (!quiet) { focusTitle(); announce(F.announcement(id, ctx())); }
  }

  function next() {
    if (q === 'send') { submit(); return; }
    if (q === 'type' && !piece()) return;
    const to = F.nextId(q, ctx());
    if (to) go(to);
  }
  function back() {
    if (q === 'type' && returnTo && state.ui.starting) { go(returnTo); return; }
    const to = F.prevId(q, ctx());
    if (to) go(to);
  }
  function goChapter(i) {
    const cur = F.chapterOf(q);
    if (i === cur) { focusTitle(); return; }
    const to = F.firstOfChapter(i, ctx());
    if (!to || !reached.has(i)) { announce('Answer the questions in order first.'); return; }
    go(to);
  }
  function skip() { next(); }

  // ---------- the state the page needs from us ----------
  function footer() {
    const meta = F.byId(q);
    let label = meta.next, hidden = false;
    const p = piece();
    switch (q) {
      case 'openings': hidden = F.openingsAnswer(state.project, flags.openings) !== true; break;
      case 'type': hidden = !p || !!state.ui.starting; break;
      case 'inside': label = touched() ? 'Continue' : 'Use your suggestion'; break;
      case 'arrange': hidden = !flags.arrange; label = 'Done arranging'; break;
      case 'more': hidden = true; break;
      case 'send': hidden = !!sent; break;
      default: break;
    }
    const skipShown = !!meta.optional && q !== 'arrange' && !touched();
    return {
      label, nextHidden: hidden, skipHidden: !skipShown,
      backDisabled: F.prevId(q, ctx()) === null || (q === 'send' && false),
      review: q === 'review', last: q === 'send'
    };
  }
  function head() {
    const meta = F.byId(q);
    const pos = F.position(q, ctx());
    if (q === 'send' && sent) return { prefix: '', title: `Thank you, ${sent.name.split(/\s+/)[0]}.`, help: 'Here is your reference. This is a concept site, so nothing left your browser.', key: 'sent' };
    // with more than one piece, the help line says which one the question is about
    const p = piece();
    const about = p && state.project.pieces.length > 1 && ['style', 'look', 'piece-size', 'inside', 'arrange', 'place'].includes(q) ? `${pieceLabel(state.project, p.id)}. ` : '';
    return { prefix: `Question ${pos.n} of ${pos.total}: `, title: meta.title, help: about + meta.help, key: `${q}|${pos.n}|${pos.total}|${about}` };
  }
  const elevation = () => q === 'openings' && openingsYes();

  // the questions of the current chapter as dots under the title; any question up to the furthest one reached can be
  // jumped to (later ones stay shut so nobody lands on a question whose earlier answers are missing)
  let furthest = 0;
  function dots() {
    const c = ctx();
    furthest = Math.max(furthest, F.IDS.indexOf(q));
    const ch = F.chapterOf(q);
    const items = F.activeIds(c).filter((id) => F.chapterOf(id) === ch).map((id, k) => ({
      id, k: k + 1, title: F.byId(id).title, current: id === q, enabled: F.IDS.indexOf(id) <= furthest
    }));
    return { items, key: items.map((x) => `${x.id}${x.current ? '*' : ''}${x.enabled ? '' : '-'}`).join() };
  }

  function renderStepper(buttons, issues) {
    const c = ctx();
    const cur = F.chapterOf(q);
    const sub = F.chapterProgress(q, c);
    buttons.forEach((b, i) => {
      const li = b.closest('.pl-step');
      const current = i === cur;
      const skipped = i === 2 && !c.hasInside;
      const ok = current || reached.has(i) || skipped;
      const warn = issues[i] > 0 && reached.has(i) && !current;
      const done = !current && (reached.has(i) || i < cur) && !warn;
      const complete = current && i === 4 && placedCount() > 0;
      li.classList.toggle('is-current', current);
      li.classList.toggle('is-warn', warn);
      li.classList.toggle('is-done', done || (skipped && cur > 2));
      li.classList.toggle('is-complete', complete);
      li.classList.toggle('is-skipped', skipped);
      const q2 = li.querySelector('.pl-step__q');
      if (q2) { const t = current && sub ? sub : skipped ? 'Not needed' : ''; if (q2.textContent !== t) q2.textContent = t; }
      if (current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      const lock = !ok || skipped;
      if (lock) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      const status = warn ? 'needs attention' : current ? `current chapter, ${sub.toLowerCase()}` : skipped ? 'not needed for this piece' : done ? 'done' : ok ? 'ready' : 'not reached yet';
      b.querySelector('.pl-step__state').textContent = `, ${status}`;
    });
  }

  // ---------- applying a question to the editors ----------
  function applyView() {
    const v = F.view(q, vflags());
    if (state.ui.step !== v.step) return;
    const view = views[v.step];
    if (view && view.sections) view.sections.showMany(v.sections);
    const set = (k, val) => { if (app.dataset[k] !== val) app.dataset[k] = val; };
    set('q', q);
    set('arrange', flags.arrange ? '1' : '0');
    set('more', flags.lookMore ? '1' : '0');
    set('answered', q === 'openings' ? (openingsYes() ? 'yes' : F.openingsAnswer(state.project, flags.openings) === false ? 'no' : '') : '');
  }

  function settleWithState() {
    // an outside step change (a link in the quote, an editor button) lands on that step's question
    if (!navigating) {
      const v = F.view(q, vflags());
      if (v.step !== state.ui.step) {
        const p = piece();
        const item = p && state.ui.item !== null;
        const to = F.questionForStep(state.ui.step, { openingId: state.ui.openingId, itemSelected: item, starting: state.ui.starting, hasPiece: !!p });
        if (to === 'openings') flags.openings = true;
        if (to === 'arrange' && item) flags.arrange = true;
        q = F.settle(to, { pieces: state.project.pieces.length, placed: placedCount(), hasInside: p ? F.hasInside(p) : true });
        entry = state.project;
        reached.add(F.chapterOf(q));
        if (userNav) { focusTitle(); announce(F.announcement(q, ctx())); }
      }
    }
    // the piece the question is about is gone (undo): back to choosing one
    const needs = F.byId(q).needs;
    if (needs && !piece() && !state.project.pieces.length) {
      q = 'type';
      queueMicrotask(() => { if (active && state.ui.step !== 1) { navigating = true; store.dispatch({ type: 'ui/step', step: 1 }); navigating = false; } });
    } else if (q === 'inside' || q === 'arrange') {
      if (!F.hasInside(piece())) q = 'place';
    }
    if (q === 'place' && piece() && !state.project.placements.some((pl) => pl.pieceId === piece().id) && !placedTried.has(piece().id)) {
      queueMicrotask(() => { if (active && q === 'place') ensurePlaced(); });
    }
    reached.add(F.chapterOf(q));
  }

  // ---------- Yes / No answers ----------
  $('#pl-g-yn').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-yn]');
    if (!b) return;
    if (b.dataset.yn === 'yes') {
      flags.openings = true;
      refresh();
      announce('Add the doors, windows and radiators of the room.');
      const first = $('#pl-g-add [data-add]');
      if (first) first.focus();
      return;
    }
    const n = state.project.room.openings.length;
    if (n) {
      const ok = await confirmAction({
        title: 'Remove them from the room?',
        text: `You have ${n} ${n === 1 ? 'opening' : 'openings'} in the room. Saying no takes ${n === 1 ? 'it' : 'them'} out again. Undo brings ${n === 1 ? 'it' : 'them'} back.`,
        yes: 'Remove', no: 'Keep them'
      });
      if (!ok) return;
      for (const o of [...state.project.room.openings]) store.dispatch({ type: 'room/opening/remove', id: o.id });
      seal();
    }
    flags.openings = false;
    go(F.nextId('openings', ctx()));
  });
  $('#pl-g-add').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const before = state.project.room.openings.length;
    store.dispatch({ type: 'room/opening/add', opening: { type: b.dataset.add } });
    seal();
    if (state.project.room.openings.length > before) {
      announce(`${OPENING_TYPES[b.dataset.add].label} added to wall ${wallNo(state.ui.wallId)}.`);
    }
  });
  $('#pl-g-oplist').addEventListener('click', (e) => {
    const b = e.target.closest('[data-op]');
    if (b) store.dispatch({ type: 'ui/opening', id: b.dataset.op });
  });
  function renderOpenings() {
    const room = state.project.room;
    const ans = F.openingsAnswer(state.project, flags.openings);
    const yn = $('#pl-g-yn');
    yn.classList.toggle('is-answered', ans !== null);
    yn.querySelector('[data-yn="yes"]').setAttribute('aria-pressed', String(ans === true));
    yn.querySelector('[data-yn="no"]').setAttribute('aria-pressed', String(ans === false));
    $('#pl-g-open').hidden = ans !== true;
    const list = $('#pl-g-oplist');
    list.hidden = !room.openings.length;
    const key = JSON.stringify(room.openings.map((o) => [o.id, o.type, o.wallId]));
    if (key !== keys.open) {
      keys.open = key;
      list.innerHTML = room.openings.map((o) => {
        const same = room.openings.filter((x) => x.type === o.type);
        const name = `${OPENING_TYPES[o.type].label}${same.length > 1 ? ` ${same.indexOf(o) + 1}` : ''}`;
        return `<button type="button" role="radio" class="pl-chip pl-chip--plain" data-op="${esc(o.id)}" aria-checked="false" tabindex="-1">${esc(name)}<i>${wallNo(o.wallId)}</i><span class="visually-hidden"> on wall ${wallNo(o.wallId)}</span></button>`;
      }).join('');
    }
    list.querySelectorAll('[data-op]').forEach((b) => { const on = String(b.dataset.op === state.ui.openingId); if (b.getAttribute('aria-checked') !== on) b.setAttribute('aria-checked', on); });
  }

  // ---------- "What would you like us to build?" ----------
  $('#pl-g-types').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    const type = b.dataset.type;
    const p = piece();
    const adding = !!state.ui.starting || !p;
    if (!adding && p.type === type) { go('style'); return; }
    const n = state.project.pieces.length;
    // coming back to change the type of the piece in hand replaces it; adding another one keeps the others
    if (!adding) store.dispatch({ type: 'piece/remove', id: p.id });
    store.dispatch({ type: 'piece/add', pieceType: type });
    seal();
    const made = piece();
    if (!made || (adding && state.project.pieces.length <= n)) { announce('There is no room for another piece.'); return; }
    announce(`${pieceLabel(state.project, made.id)} added. Choose its look next.`);
    go('style', { quiet: true });
    focusTitle();
    announce(`${pieceLabel(state.project, made.id)} added. ${F.announcement('style', ctx())}`);
  });
  function renderTypes() {
    const p = piece();
    const key = `${p ? p.type : ''}|${state.ui.starting}`;
    if (key === keys.type) return;
    keys.type = key;
    host.querySelectorAll('#pl-g-types [data-type]').forEach((b) => {
      const on = !!p && !state.ui.starting && b.dataset.type === p.type;
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ---------- "Want to change the colour or handles?" ----------
  const solo = (pc) => ({ v: 2, room: state.project.room, pieces: [pc], placements: [] });
  const totalOf = (pc) => quoteProject(solo(pc), { vat: true }).cents.total;
  function patchPiece(patch) {
    store.dispatch({ type: 'piece/update', patch: { ...patch, style: 'custom' } });
    seal();
  }
  function buildLook(p) {
    const fronts = F.commonFronts(materialsFor('front'), p.fronts.material);
    $('#pl-g-colour').innerHTML = fronts.map((id) => {
      const m = MATERIALS[id];
      return `<button type="button" role="radio" class="pl-gsw" data-front="${esc(id)}" aria-checked="false" tabindex="-1" title="${esc(m.note || '')}"><span class="pl-sw pl-sw--${m.family}${m.edgeGrain ? ' pl-sw--edge' : ''}" style="--c:${m.color}"></span><span class="pl-gsw__name">${esc(m.label)}</span><em class="pl-opt__price" data-price></em></button>`;
    }).join('');
    $('#pl-g-handle').innerHTML = HANDLES.map((h) => `<button type="button" role="radio" class="pl-chip pl-chip--plain" data-handle="${h}" aria-checked="false" tabindex="-1">${HANDLE_LABEL[h]}<em class="pl-opt__price" data-price></em></button>`).join('');
    $('#pl-g-finish').innerHTML = handleFinishes().map((id) => {
      const m = MATERIALS[id];
      return `<button type="button" role="radio" class="pl-gsw" data-finish="${esc(id)}" aria-checked="false" tabindex="-1" title="${esc(m.note || '')}"><span class="pl-sw pl-sw--handle" style="--c:${m.color}"></span><span class="pl-gsw__name">${esc(m.label)}</span><em class="pl-opt__price" data-price></em></button>`;
    }).join('');
  }
  function syncLook(p) {
    const sig = `${p.id}|${p.type}|${F.commonFronts(materialsFor('front'), p.fronts.material).join()}`;
    if (sig !== keys.look) { keys.look = sig; buildLook(p); }
    const set = (el, on) => { const v = String(on); if (el.getAttribute('aria-checked') !== v) el.setAttribute('aria-checked', v); };
    host.querySelectorAll('#pl-g-colour [data-front]').forEach((b) => set(b, b.dataset.front === p.fronts.material));
    host.querySelectorAll('#pl-g-handle [data-handle]').forEach((b) => set(b, b.dataset.handle === p.fronts.handle));
    host.querySelectorAll('#pl-g-finish [data-finish]').forEach((b) => set(b, b.dataset.finish === p.fronts.handleFinish));
    const handleless = p.fronts.handle === 'push' || p.fronts.handle === 'edge';
    $('#pl-g-finish-b').hidden = handleless;
    const none = p.fronts.kind === 'open' || p.fronts.kind === 'none';
    $('#pl-g-colour-h').textContent = none ? 'Colour of the drawers and sides' : 'Front colour';
    $('#pl-g-simple').hidden = flags.lookMore;
    $('#pl-g-less').hidden = !flags.lookMore;
    schedulePrices();
  }
  function schedulePrices() {
    if (priceTimer) clearTimeout(priceTimer);
    priceTimer = setTimeout(refreshPrices, 160);
  }
  function refreshPrices() {
    priceTimer = 0;
    const p = piece();
    if (!p || q !== 'look' || flags.lookMore) return;
    const base = totalOf(p);
    const price = (el, patch, current) => {
      const out = el.querySelector('[data-price]');
      if (!out) return;
      if (current) { out.textContent = ''; return; }
      const next = updatePiece(solo(p), p.id, { ...patch, style: 'custom' }).pieces[0];
      const d = next ? totalOf(next) - base : 0;
      out.textContent = Math.round(Math.abs(d) / 100) === 0 ? '' : eur(d);
      out.classList.toggle('is-neg', d < 0);
    };
    host.querySelectorAll('#pl-g-colour [data-front]').forEach((b) => price(b, { fronts: { material: b.dataset.front } }, b.dataset.front === p.fronts.material));
    host.querySelectorAll('#pl-g-handle [data-handle]').forEach((b) => price(b, { fronts: { handle: b.dataset.handle } }, b.dataset.handle === p.fronts.handle));
    host.querySelectorAll('#pl-g-finish [data-finish]').forEach((b) => price(b, { fronts: { handleFinish: b.dataset.finish } }, b.dataset.finish === p.fronts.handleFinish));
  }
  $('#pl-g-colour').addEventListener('click', (e) => {
    const b = e.target.closest('[data-front]');
    if (b && piece()) { patchPiece({ fronts: { material: b.dataset.front } }); announce(`Front colour: ${MATERIALS[b.dataset.front].label}.`); }
  });
  $('#pl-g-handle').addEventListener('click', (e) => {
    const b = e.target.closest('[data-handle]');
    if (b && piece()) { patchPiece({ fronts: { handle: b.dataset.handle } }); announce(`Handles: ${HANDLE_LABEL[b.dataset.handle]}.`); }
  });
  $('#pl-g-finish').addEventListener('click', (e) => {
    const b = e.target.closest('[data-finish]');
    if (b && piece()) { patchPiece({ fronts: { handleFinish: b.dataset.finish } }); announce(`Handle finish: ${MATERIALS[b.dataset.finish].label}.`); }
  });
  $('#pl-g-more').addEventListener('click', () => {
    flags.lookMore = true;
    refresh();
    const first = host.ownerDocument.querySelector('[data-panel="1"] .pl-ltab[aria-selected="true"], [data-panel="1"] .pl-ltab');
    $('#pl-g-less').focus();
    void first;
    announce('All the look options are open.');
  });
  $('#pl-g-less').addEventListener('click', () => {
    flags.lookMore = false;
    refresh();
    $('#pl-g-more').focus();
  });

  // ---------- "What should go inside?" ----------
  function presetPicture(p, id) {
    const next = applyPreset(solo(p), p.id, 0, id).pieces[0];
    const bay = next && next.bays[0];
    if (!bay) return '';
    const g = pieceGeometry(p);
    const W = 60, H = 76, pad = 3;
    const s = Math.min((W - 2 * pad) / bay.width, (H - 2 * pad) / g.innerH);
    const bw = bay.width * s, bh = g.innerH * s;
    const x0 = (W - bw) / 2, y1 = (H + bh) / 2;
    let inner = '';
    for (const it of bay.items) {
      const d = ITEMS[it.kind];
      if (!d) continue;
      const [lo, hi] = d.body(it);
      const top = y1 - (it.y + hi) * s, h = Math.max(2, (hi - lo) * s);
      inner += drawItem(it, { x: x0, y: top, w: bw, h });
    }
    return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect class="pl-pre__bay" x="${x0.toFixed(1)}" y="${(y1 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"/>${inner}</svg>`;
  }
  function renderInside() {
    const p = piece();
    if (!p) return;
    const pres = presetsFor(p.type);
    const scope = flags.scope === 'all' || Number(flags.scope) < p.bays.length ? flags.scope : 'all';
    const key = JSON.stringify([p.id, p.type, p.width, p.height, p.depth, p.bays.map((b) => b.width), pres.map((x) => x.id), scope, chosen[scope] || '']);
    if (key === keys.inside) return;
    keys.inside = key;
    // the cards are drawn again when a choice is made: keyboard focus stays on the same one
    const act = document.activeElement;
    const again = act && host.contains(act) ? (act.dataset.scope !== undefined ? `[data-scope="${act.dataset.scope}"]` : act.dataset.preset ? `[data-preset="${act.dataset.preset}"]` : null) : null;
    const scopeEl = $('#pl-g-scope');
    scopeEl.hidden = p.bays.length < 2;
    scopeEl.innerHTML = p.bays.length < 2 ? '' : `<span class="pl-g-scope__l" aria-hidden="true">Section</span>${[['all', 'All', 'Every section'], ...p.bays.map((_, i) => [String(i), String(i + 1), `Section ${i + 1}`])]
      .map(([v, l, name]) => `<button type="button" role="radio" class="pl-chip pl-chip--plain" data-scope="${v}" aria-label="${name}" aria-checked="${String(v) === String(scope)}" tabindex="-1">${l}</button>`).join('')}`;
    $('#pl-g-presets').innerHTML = pres.map((x) => `
      <button type="button" class="pl-preset" data-preset="${x.id}" aria-pressed="${chosen[scope] === x.id}">
        <span class="pl-preset__pic">${presetPicture(p, x.id)}</span>
        <span class="pl-preset__name">${esc(x.label)}</span>
      </button>`).join('');
    if (again) { const el = host.querySelector(again); if (el) el.focus(); }
  }
  $('#pl-g-scope').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (b) { flags.scope = b.dataset.scope; keys.inside = ''; refresh(); }
  });
  $('#pl-g-presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    const p = piece();
    if (!b || !p) return;
    const scope = flags.scope === 'all' || Number(flags.scope) < p.bays.length ? flags.scope : 'all';
    const keep = state.ui.bay;
    if (scope === 'all') {
      for (let i = 0; i < p.bays.length; i++) store.dispatch({ type: 'piece/preset', bay: i, preset: b.dataset.preset, coalesce: 'preset:all' });
      store.dispatch({ type: 'ui/bay', bay: keep });
    } else store.dispatch({ type: 'piece/preset', bay: Number(scope), preset: b.dataset.preset });
    seal();
    chosen[scope] = b.dataset.preset;
    keys.inside = '';
    const label = b.querySelector('.pl-preset__name').textContent;
    announce(`${scope === 'all' ? 'Every section' : `Section ${Number(scope) + 1}`} started from ${label}. Undo brings the old layout back.`);
  });

  // ---------- "Want to arrange it yourself?" ----------
  $('#pl-g-arrange').addEventListener('click', (e) => {
    const b = e.target.closest('[data-arr]');
    if (!b) return;
    if (b.dataset.arr === 'no') { go(F.nextId('arrange', ctx())); return; }
    flags.arrange = true;
    refresh();
    const first = document.querySelector('[data-panel="2"] [role="tab"][aria-selected="true"]');
    if (first) first.focus();
    announce('The inside editor is open. Drag items up and down, or use the arrow keys.');
  });

  // ---------- "Would you like anything else built?" ----------
  function renderMore() {
    const prj = state.project;
    const key = JSON.stringify([prj.pieces.map((p) => [p.id, p.type, p.width, p.height, p.depth]), prj.placements.map((pl) => [pl.pieceId, pl.mode, pl.wallId]), state.ui.pieceId]);
    if (key === keys.more) return;
    keys.more = key;
    $('#pl-g-pieces').innerHTML = prj.pieces.map((p) => {
      const pl = prj.placements.find((x) => x.pieceId === p.id);
      const where = !pl ? 'Not placed yet' : pl.mode === 'free' ? 'Free-standing' : `Wall ${wallNo(pl.wallId)}`;
      const name = pieceLabel(prj, p.id);
      return `<li class="pl-gpiece${pl ? '' : ' is-unplaced'}"><span class="pl-gpiece__t"><b>${esc(name)}</b><span>${p.width} × ${p.height} × ${p.depth} cm · ${esc(where)}</span></span>
        <span class="pl-gpiece__a">${pl ? '' : `<button type="button" class="pl-btn pl-btn--small pl-btn--accent" data-place="${esc(p.id)}">Place<span class="visually-hidden"> ${esc(name)}</span></button>`}<button type="button" class="pl-btn pl-btn--small pl-btn--ghost" data-edit="${esc(p.id)}">Edit<span class="visually-hidden"> ${esc(name)}</span></button><button type="button" class="pl-btn pl-btn--small pl-btn--ghost pl-btn--del" data-remove="${esc(p.id)}">${ICON_TRASH}<span class="pl-btn__t">Remove</span><span class="visually-hidden"> ${esc(name)}</span></button></span></li>`;
    }).join('');
  }
  $('[data-gq="more"]').addEventListener('click', async (e) => {
    const m = e.target.closest('[data-more]');
    if (m) {
      if (m.dataset.more === 'add') {
        navigating = true;
        store.dispatch({ type: 'ui/new-piece' });
        navigating = false;
        go('type');
        returnTo = 'more';
      } else go('review');
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) { store.dispatch({ type: 'ui/piece', id: ed.dataset.edit }); go('style'); return; }
    const pl = e.target.closest('[data-place]');
    if (pl) { store.dispatch({ type: 'ui/piece', id: pl.dataset.place }); go('place'); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const id = rm.dataset.remove;
      const name = pieceLabel(state.project, id);
      const ok = await confirmAction({
        title: `Remove ${name}?`,
        text: `This takes the ${name.toLowerCase()} and its place in the room out of your design. Undo brings it back.`,
        yes: `Remove ${name.toLowerCase()}`, no: 'Keep it'
      });
      if (!ok) return;
      store.dispatch({ type: 'piece/remove', id });
      seal();
      announce(`${name} removed.`);
      if (!state.project.pieces.length) go('type');
    }
  });

  // ---------- "Where should we send your design?" ----------
  const form = $('#pl-g-form');
  const showErr = (name, bad) => {
    const msg = form.querySelector(`[data-err="${name}"]`) || $(`[data-err="${name}"]`);
    if (msg) msg.hidden = !bad;
    const input = form.elements[name];
    if (input) { if (bad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  };
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.name) return;
    contact[t.name] = t.type === 'checkbox' ? t.checked : t.value;
    if (touchedBlock) { const c = F.checkContact(contact); if (t.name in c) showErr(t.name, c[t.name]); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  function renderBlockers() {
    const blockers = R.sendBlockers(state.project, getValidation().errors || []);
    const key = JSON.stringify(blockers.map((b) => [b.code, b.message, b.step]));
    if (key === keys.send) return blockers;
    keys.send = key;
    $('#pl-g-blockers').innerHTML = blockers.length ? `<div class="pl-r-sendnote" role="group" aria-label="Fix these first"><p><strong>Fix these first</strong></p><ul class="pl-notes">${blockers.map((b, i) => `<li class="pl-note pl-note--block pl-note--stack"><span class="pl-note__icon">${ICON_NOTE}</span><span class="pl-note__text">${esc(b.message)}</span><span class="pl-note__actions"><button type="button" class="pl-link" data-fix="${i}">${esc(b.label)}</button></span></li>`).join('')}</ul></div>` : '';
    $('#pl-g-blockers').__blockers = blockers;
    return blockers;
  }
  $('#pl-g-blockers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fix]');
    const list = $('#pl-g-blockers').__blockers || [];
    const item = b && list[Number(b.dataset.fix)];
    if (!item) return;
    if (item.code === 'no-pieces') { navigating = true; store.dispatch({ type: 'ui/new-piece' }); navigating = false; go('type'); return; }
    if (item.pieceId) store.dispatch({ type: 'ui/piece', id: item.pieceId });
    if (item.openingId) { flags.openings = true; store.dispatch({ type: 'ui/opening', id: item.openingId }); }
    const r = item.ref;
    if (r && r.type === 'bay') store.dispatch({ type: 'ui/bay', bay: r.bay });
    if (r && r.type === 'item') { flags.arrange = true; store.dispatch({ type: 'ui/item', bay: r.bay, index: r.index }); }
    const to = F.questionForStep(item.step, { openingId: item.openingId, itemSelected: r && r.type === 'item', hasPiece: !!piece() });
    if (to === 'arrange' && r && r.type === 'item') flags.arrange = true;
    go(to);
    if (to === 'arrange') flags.arrange = !!(r && r.type === 'item');
    refresh();
  });

  function submit() {
    if (sent) return;
    touchedBlock = true;
    const blockers = renderBlockers();
    const bad = F.checkContact(contact);
    for (const k of F.FIELD_ORDER) showErr(k, bad[k]);
    const first = F.firstBadField(contact);
    if (blockers.length) {
      announce(`${blockers.length === 1 ? 'One thing needs' : `${blockers.length} things need`} fixing before you can send the design.`);
      const fix = $('#pl-g-blockers .pl-link');
      if (fix) fix.focus();
      return;
    }
    if (first) {
      announce('Please check the highlighted details.');
      const el = form.elements[first];
      if (el) el.focus();
      return;
    }
    sent = { ref: F.referenceNumber(), name: contact.name.trim() };
    $('#pl-g-ref').textContent = sent.ref;
    keys.send = '';
    refresh();
    announce(`Thank you, ${sent.name}. Your reference is ${sent.ref}. Nothing was sent, because this is a concept site.`);
    focusTitle();
  }
  $('#pl-g-backdesign').addEventListener('click', () => { sent = null; go('review'); });

  function renderSend() {
    const done = !!sent;
    form.hidden = done;
    $('#pl-g-done').hidden = !done;
    $('#pl-g-blockers').hidden = done;
    if (done) return;
    renderBlockers();
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') { if (el.checked !== contact.consent) el.checked = contact.consent; }
      else if (el !== document.activeElement && el.value !== contact[el.name]) el.value = contact[el.name];
    }
  }

  // ---------- update ----------
  // a new question fades and slides in; with reduced motion it just appears
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  let shownQ = null;
  function animateIn() {
    const box = host.parentElement;
    if (!box || calm.matches || typeof box.animate !== 'function') return;
    box.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  function update(next) {
    state = next;
    if (!active) return;
    settleWithState();
    applyView();
    if (q !== shownQ) { if (shownQ !== null && userNav) animateIn(); shownQ = q; }
    host.hidden = false;
    host.querySelectorAll('[data-gq]').forEach((s) => { const on = s.dataset.gq === q; if (s.hidden === on) s.hidden = !on; });
    switch (q) {
      case 'openings': renderOpenings(); break;
      case 'type': renderTypes(); break;
      case 'look': if (piece()) syncLook(piece()); break;
      case 'inside': renderInside(); break;
      case 'more': renderMore(); break;
      case 'send': renderSend(); break;
      default: break;
    }
    // the answer buttons that open an editor show which one is open
    $('#pl-g-arrange').classList.toggle('is-answered', flags.arrange);
    $('#pl-g-arrange [data-arr="yes"]').setAttribute('aria-pressed', String(flags.arrange));
  }

  // ---------- switching between the guided and the tabbed view ----------
  const DEFAULT_SEC = F.DEFAULT_SECTIONS;
  function setMode(mode, { save = true } = {}) {
    const on = mode === 'guided';
    if (on === active) return;
    active = on;
    if (save) saveMode(on ? 'guided' : 'expert');
    if (on) {
      const p = piece();
      q = F.questionForStep(state.ui.step, { openingId: state.ui.openingId, itemSelected: p && state.ui.item !== null, starting: state.ui.starting, hasPiece: !!p });
      q = F.settle(q, { pieces: state.project.pieces.length, placed: placedCount(), hasInside: p ? F.hasInside(p) : true });
      for (let i = 0; i <= state.ui.step; i++) reached.add(i);
      entry = state.project;
      app.dataset.mode = 'guided';
      host.hidden = false;
    } else {
      app.dataset.mode = 'expert';
      delete app.dataset.q; delete app.dataset.arrange; delete app.dataset.more; delete app.dataset.answered;
      host.hidden = true;
      // every step goes back to one section at a time, the one that answers the question on show for this step
      views.forEach((v, i) => {
        if (!v.sections) return;
        const sec = i === state.ui.step ? (F.expertSection(q) || DEFAULT_SEC[i]) : DEFAULT_SEC[i];
        v.sections.show(sec);
      });
    }
    refresh();
  }

  function init({ landing } = {}) {
    app.dataset.mode = active ? 'guided' : 'expert';
    if (landing) {
      q = F.settle(landing, { pieces: state.project.pieces.length, placed: placedCount(), hasInside: insideOf() });
      const ch = F.chapterOf(q);
      for (let i = 0; i <= ch; i++) reached.add(i);
      if (q === 'review') for (let i = 0; i < 5; i++) reached.add(i);
      entry = state.project;
      const v = F.view(q, vflags());
      // the tabbed view opens on the first step, as it always has; only the questions land on the review
      if (active && state.ui.step !== v.step) { navigating = true; store.dispatch({ type: 'ui/step', step: v.step }); navigating = false; }
    }
  }

  return {
    get active() { return active; },
    get q() { return q; },
    get mode() { return active ? 'guided' : 'expert'; },
    setMode, init, update, go, next, back, skip, goChapter, footer, head, dots, elevation, renderStepper,
    moved() { userNav = true; },
    isCompact
  };
}
