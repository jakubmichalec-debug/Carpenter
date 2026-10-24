// Planner page boot: store, stepper, step views and the live viewer. Three.js loads here and nowhere else.
// The page is one screen: the sidebar shows one section of a step at a time, the bottom bar always shows Back, Next
// and the running price, and nothing scrolls.
import { createStore, loadStart } from './store.js';
import { createBlankProject } from './model.js';
import { validateProject } from './validate.js';
import { quoteProject } from './pricing.js';
import * as R from './review-logic.js';
import { createRoomStep } from './steps/room.js';
import { createFurnitureStep } from './steps/furniture.js';
import { createInteriorStep } from './steps/interior.js';
import { createPlaceStep } from './steps/place.js';
import { createReviewStep } from './steps/review.js';
import { createGuided } from './steps/guided.js';
import * as F from './flow.js';
import { roving, disclosure } from './steps/ui.js';
import { issueStep } from './review-logic.js';
import { clashesByPiece } from './place-geom.js';
import { STEP_NAMES, NEXT_LABELS, stepAnnouncement, priceSummary, elevationVisible, hasPullouts } from './ui-logic.js';
import { prefs, onPrefs } from './prefs.js';

const LABELS = STEP_NAMES;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// What each step says about itself: one sentence, and the keyboard tips behind the (?) button.
const META = [
  {
    lede: 'Pick a shape, size it, add doors and windows.',
    tips: [
      'Click a wall in the plan to select it, or pick it under Walls and openings.',
      'Round handles on the plan: drag them, or Tab to one and use the arrow keys (1 cm, with Shift 10 cm).',
      'On the wall drawing, Tab to a door or window and use the arrow keys to move it. Delete removes it.'
    ]
  },
  {
    lede: 'Choose a piece, then its style, look and size.',
    tips: [
      'In a row of pieces, styles or swatches, Tab goes in once and the arrow keys move between the choices.',
      'A price on an option is what it adds to or takes off this piece, VAT included.',
      'Fit to wall fills the free length of the wall the piece stands on.'
    ]
  },
  {
    lede: 'Arrange the inside, or keep the suggestion.',
    tips: [
      'Drag an item up or down in the drawing, or select it and press the arrow keys. Shift moves ten steps; one step is 32 mm.',
      'Left and right arrow keys move a selected item to the next section. Delete removes it.',
      'Page Up and Page Down select the previous or next item in the section.',
      'Drag a divider, or focus it and use the arrow keys, to change the section widths.',
      'On a computer you can also drag an item from Add items into the drawing.'
    ]
  },
  {
    lede: 'Put each piece where it will stand.',
    tips: [
      'Drag a piece on the plan, or click a wall to put the selected piece there.',
      'With a piece focused, the arrow keys move it 1 cm (Shift: 10 cm). R turns a free-standing piece. Delete takes it out of the room.'
    ]
  },
  {
    lede: 'Check the room and the price, then send it.',
    tips: [
      'Drag to orbit the 3D view and scroll to zoom. The row under it jumps to the room, the top or the front of a piece.',
      'Render makes a realistic picture. It starts rough and gets cleaner for up to a minute.'
    ]
  }
];

// First visit: a short choice before step 1. A saved design or a link skips it.
function askStart() {
  const box = $('#pl-start'), app = $('#pl-app'), stepper = $('#pl-stepper');
  box.hidden = false; app.hidden = true; stepper.inert = true;
  $('#pl-start-h').focus({ preventScroll: true });
  return new Promise((resolve) => {
    const pick = (kind) => { box.hidden = true; app.hidden = false; stepper.inert = false; resolve(kind); };
    $('#pl-start-empty').addEventListener('click', () => pick('empty'), { once: true });
    $('#pl-start-example').addEventListener('click', () => pick('example'), { once: true });
  });
}

const start = await loadStart();
let project = start.project;
let exampleBase = null; // the example project while it is untouched: it is labelled in the sidebar until the first edit
if (start.kind === 'new') {
  if (await askStart() === 'empty') project = createBlankProject();
  else exampleBase = project;
}
const store = createStore(project, { persist: true });
let state = store.getState();
let userNav = false; // true once the person has moved between steps, so the first paint does not steal focus

// ---------- live region ----------
const live = $('#pl-live');
let liveTimer = 0;
function announce(msg) {
  if (!live) return;
  live.textContent = '';
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { live.textContent = msg; }, 60);
}

// ---------- confirm dialog ----------
const dlg = $('#pl-confirm');
function confirmAction({ title, text, yes, no }) {
  $('#pl-confirm-title').textContent = title;
  $('#pl-confirm-text').textContent = text;
  $('#pl-confirm-yes').textContent = yes;
  $('#pl-confirm-no').textContent = no;
  dlg.returnValue = '';
  if (typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm(`${title} ${text}`));
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true }));
}
const confirmShape = (text) => confirmAction({ title: 'Change the room shape?', text, yes: 'Change shape', no: 'Keep this room' });
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(''); });

// ---------- steps ----------
const panels = $$('[data-panel]');
const compact = matchMedia('(max-width: 1279px)');
const phone = matchMedia('(max-width: 899px)');
const showInside = () => { if (compact.matches && state.ui.pane !== 'plan') store.dispatch({ type: 'ui/pane', pane: 'plan' }); };
// each step may list things to check; they open from the mark next to the title, over the controls
const issueLists = LABELS.map((_, i) => {
  const ul = document.createElement('ul');
  ul.className = 'pl-notes';
  ul.dataset.issues = String(i);
  ul.setAttribute('aria-label', `${LABELS[i]} checks`);
  ul.hidden = true;
  $('#pl-issues').appendChild(ul);
  return ul;
});
const setFronts = (mode) => applyFronts(mode);
const views = [
  createRoomStep({ side: panels[0], plan: $('#pl-plan'), elev: $('#pl-elev') }, { store, announce, confirmShape, issues: issueLists[0] }),
  createFurnitureStep(panels[1], { store, announce, confirmAction, issues: issueLists[1] }),
  createInteriorStep(panels[2], { insideBox: $('#pl-inside'), store, announce, showInside, issues: issueLists[2] }),
  createPlaceStep(panels[3], { plan: $('#pl-place'), store, announce, confirmAction, showPlan: showInside }),
  createReviewStep(panels[4], {
    store, announce, getViewer: () => viewer, getFronts: () => frontsMode, setFronts,
    rbar: $('#pl-rbar'), stage: $('#pl-stage'), host: $('#pl-render'), printBox: $('#pl-print'), footSlot: $('#pl-foot-review')
  })
];
const review = views[4];
// The guided flow asks one question per screen using these same step views; "Edit everything" switches to their tabs.
const guided = createGuided({
  store, announce, confirmAction, views, app: $('#pl-app'), host: $('#pl-gpanel'),
  refresh: () => render(state), focusTitle: () => titleEl.focus({ preventScroll: true }), getValidation: () => validated()
});
guided.init({ landing: start.kind !== 'new' || exampleBase ? F.landing(state.project) : null });
state = store.getState();
let wallPicked = false;
const sectionOf = {}; // the open section of each step, told by the steps' tabs

// validation is cached per project object
let vProject = null, validation = { errors: [] };
function validated() {
  if (state.project !== vProject) { vProject = state.project; validation = validateProject(state.project); }
  return validation;
}

const stepButtons = $$('.pl-step__btn');
let maxReached = state.ui.step;
const visited = new Set([state.ui.step]);

function renderStepper() {
  const v = validated();
  const issues = [0, 0, 0, 0, 0];
  for (const e of v.errors) issues[issueStep(e.ref, e.code)]++;
  if (guided.active) { guided.renderStepper(stepButtons, issues); return; }
  stepButtons.forEach((b, i) => {
    const li = b.closest('.pl-step');
    const current = i === state.ui.step;
    const warn = issues[i] > 0 && i <= maxReached;
    const done = visited.has(i) && !current;
    li.classList.toggle('is-current', current);
    li.classList.toggle('is-warn', warn);
    li.classList.toggle('is-done', done && !warn);
    if (current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    const status = warn ? (current ? 'current step, needs attention' : 'needs attention') : current ? 'current step' : done ? 'done' : 'not started';
    $('.pl-step__state', b).textContent = `, ${status}`;
  });
}

// ---------- title, intro, tips and the state mark ----------
const titleEl = $('#pl-title'), ledeEl = $('#pl-lede'), tipsBtn = $('#pl-tips-btn'), tipsPop = $('#pl-tips');
const statusBtn = $('#pl-status'), issuesPop = $('#pl-issues');
const tipsDisc = disclosure(tipsBtn, tipsPop, { onOpen: () => issuesDisc.close() });
const issuesDisc = disclosure(statusBtn, issuesPop, { bind: false, onOpen: () => tipsDisc.close() });
const ICON_TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".16"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
let headStep = -1;
let headKey = '';
function renderGuidedHead() {
  const h = guided.head();
  if (h.key === headKey) return;
  headKey = h.key;
  titleEl.innerHTML = `${h.prefix ? `<span class="visually-hidden">${esc(h.prefix)}</span>` : ''}${esc(h.title)}`;
  ledeEl.textContent = h.help;
}
function renderHead() {
  const s = state.ui.step;
  if (guided.active) renderGuidedHead(); else headKey = '';
  if (s !== headStep) {
    headStep = s;
    if (!guided.active) { titleEl.textContent = LABELS[s]; ledeEl.textContent = META[s].lede; }
    tipsPop.innerHTML = `<h3>Keyboard tips</h3><ul>${META[s].tips.map((t) => `<li>${t}</li>`).join('')}<li>Ctrl+Z undoes, Ctrl+Shift+Z redoes.</li></ul>`;
    tipsDisc.close(); issuesDisc.close();
    issueLists.forEach((ul, i) => { ul.hidden = i !== s; });
  }
  const st = views[s].status ? views[s].status() : { count: 0, ok: false };
  const key = `${s}|${st.count}|${st.ok}|${st.jump || ''}`;
  if (statusBtn.dataset.key === key) return;
  statusBtn.dataset.key = key;
  if (st.count > 0) {
    statusBtn.hidden = false;
    statusBtn.className = 'pl-status is-warn';
    statusBtn.innerHTML = `${ICON_WARN}<span aria-hidden="true">${st.count}</span><span class="visually-hidden">${st.count} ${st.count === 1 ? 'thing' : 'things'} to check${st.jump ? ', go to the list' : ', show the list'}</span>`;
    statusBtn.disabled = false;
    if (st.jump) { statusBtn.removeAttribute('aria-controls'); statusBtn.removeAttribute('aria-expanded'); }
    else { statusBtn.setAttribute('aria-controls', 'pl-issues'); statusBtn.setAttribute('aria-expanded', String(issuesDisc.isOpen())); }
  } else if (st.ok) {
    statusBtn.hidden = false;
    statusBtn.className = 'pl-status';
    statusBtn.innerHTML = `${ICON_TICK}<span class="visually-hidden">All good</span>`;
    statusBtn.disabled = true;
    statusBtn.removeAttribute('aria-controls'); statusBtn.removeAttribute('aria-expanded');
    issuesDisc.close();
  } else {
    statusBtn.hidden = true;
    issuesDisc.close();
  }
}
statusBtn.addEventListener('click', () => {
  const s = state.ui.step;
  const st = views[s].status ? views[s].status() : { count: 0 };
  if (!st.count) return;
  if (st.jump && guided.active) { const t = document.querySelector(`[data-panel="${s}"] [data-sec="${st.jump}"] .pl-link`); if (t) t.focus(); return; }
  if (st.jump && views[s].sections) { views[s].sections.show(st.jump, { focus: true }); return; }
  issuesDisc.toggle();
});

// ---------- bottom bar ----------
const next = $('#pl-next'), back = $('#pl-back'), undoBtn = $('#pl-undo'), redoBtn = $('#pl-redo');
const set0 = (el) => { if (!el.hidden) el.hidden = true; };
const skipBtn = $('#pl-skip');
function renderGuidedFooter() {
  const f = guided.footer();
  back.disabled = f.backDisabled;
  const set = (el, hidden) => { if (el.hidden !== hidden) el.hidden = hidden; };
  set(next, f.nextHidden);
  set(skipBtn, f.skipHidden);
  set($('#pl-foot-review'), !f.review);
  const label = $('#pl-next-label');
  if (label.textContent !== f.label) label.textContent = f.label;
  undoBtn.disabled = !state.past.length;
  redoBtn.disabled = !state.future.length;
}
function renderFooter() {
  if (guided.active) { renderGuidedFooter(); return; }
  set0(skipBtn);
  const s = state.ui.step;
  back.disabled = s === 0;
  const last = s === LABELS.length - 1;
  next.hidden = last;
  $('#pl-foot-review').hidden = !last;
  $('#pl-next-label').textContent = NEXT_LABELS[s];
  undoBtn.disabled = !state.past.length;
  redoBtn.disabled = !state.future.length;
}
// undo and redo sit in the bottom bar on a computer and beside the title on a phone, where the bar is tight
const hist = $('#pl-hist');
function placeHistory() {
  const host = phone.matches ? $('#pl-main-tools') : $('#pl-foot');
  if (hist.parentNode === host) return;
  if (phone.matches) host.insertBefore(hist, host.firstChild);
  else host.insertBefore(hist, $('#pl-pricebox'));
}
// the Edit everything link sits at the end of the chapter bar on a computer and beside the question on a phone, where the bar is full
function placeTips() {
  // keyboard tips: in the chapter bar next to Edit everything on a computer, in the head on a phone
  const host = phone.matches ? $('#pl-head-tools') : $('#pl-mode-slot');
  const btn = $('#pl-tips-btn');
  if (btn.parentNode !== host) host.appendChild(btn);
}
function placeMode() {
  const host = phone.matches ? $('#pl-head-tools') : $('#pl-mode-slot');
  const btn = $('#pl-mode');
  if (btn.parentNode !== host) { host.insertBefore(btn, host.firstChild); }
}
phone.addEventListener('change', () => { placeHistory(); placeMode(); placeTips(); });
placeHistory();
placeMode();
placeTips();
roving(hist, { selector: '.pl-histbtn' });

function showStep() {
  const s = state.ui.step;
  maxReached = Math.max(maxReached, s);
  visited.add(s);
  panels.forEach((p, i) => { p.hidden = i !== s; });
  views.forEach((v, i) => { if (i !== s && v.hide) v.hide(); }); // the Review step frees its render and GPU resources here
  views[s].show();
}

stepButtons.forEach((b, i) => b.addEventListener('click', () => { if (guided.active) guided.goChapter(i); else store.dispatch({ type: 'ui/step', step: i }); }));
next.addEventListener('click', () => { if (guided.active) guided.next(); else store.dispatch({ type: 'ui/step', step: state.ui.step + 1 }); });
back.addEventListener('click', () => { if (guided.active) guided.back(); else store.dispatch({ type: 'ui/step', step: state.ui.step - 1 }); });
$('#pl-skip').addEventListener('click', () => guided.skip());
// the person can pick the tabbed editors ("Edit everything") or the questions; the choice is remembered
const modeBtn = $('#pl-mode');
function renderMode() {
  const g = guided.active;
  const t = g ? 'Edit everything' : 'Guided questions';
  if (modeBtn.textContent !== t) modeBtn.textContent = t;
  modeBtn.setAttribute('aria-label', g ? 'Edit everything: switch to the tabbed editor' : 'Guided questions: go back to one question at a time');
}
modeBtn.addEventListener('click', () => {
  guided.setMode(guided.active ? 'expert' : 'guided');
  announce(guided.active ? 'Guided questions.' : 'All the editors are open. Your design is unchanged.');
  titleEl.focus({ preventScroll: true });
});
// Enter moves on from a question, unless it is pressed on something that has its own meaning for Enter
document.addEventListener('keydown', (e) => {
  if (!guided.active || e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
  const t = e.target;
  if (document.querySelector('dialog[open]')) return;
  const ok = t === document.body || t === titleEl || (t.matches && t.matches('input[type="radio"], .pl-panel, .pl-gpanel, #pl-main, main'));
  if (!ok || next.hidden || next.disabled) return;
  e.preventDefault();
  next.click();
});
undoBtn.addEventListener('click', () => { store.dispatch({ type: 'history/undo' }); announce('Undone.'); });
redoBtn.addEventListener('click', () => { store.dispatch({ type: 'history/redo' }); announce('Redone.'); });
$('#pl-skip-controls').addEventListener('click', (e) => {
  e.preventDefault();
  const panel = panels[state.ui.step];
  if (guided.active) {
    // the first control of the question: its own answers, or the editor under them
    const first = [...document.querySelectorAll('#pl-gpanel [data-gq]:not([hidden]) :is(button, input, select, textarea, [tabindex="0"]), [data-panel]:not([hidden]) [data-sec]:not([hidden]) :is(button, input, select, [tabindex="0"])')]
      .find((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
    (first || titleEl).focus({ preventScroll: true });
    return;
  }
  const tab = panel.querySelector('[role="tab"][aria-selected="true"]:not([hidden])');
  const target = (tab && !tab.closest('[hidden]') && tab) || panel.querySelector('[role="tabpanel"]:not([hidden]) :is(button, input, select, [tabindex="0"]):not([disabled])') || titleEl;
  target.focus({ preventScroll: true });
});

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const t = e.target;
  if (t && t.closest && t.closest('input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { e.preventDefault(); store.dispatch({ type: e.shiftKey ? 'history/redo' : 'history/undo' }); }
  else if (k === 'y') { e.preventDefault(); store.dispatch({ type: 'history/redo' }); }
});

// ---------- the running price ----------
const priceBtn = $('#pl-price'), pricePop = $('#pl-price-pop');
const priceDisc = disclosure(priceBtn, pricePop, { onOpen: renderPricePop });
let priceKey = null, priceTimer = 0, lastQuote = null;
const eur = (cents) => R.formatEuro(cents / 100);
function quoteNow() {
  if (!lastQuote || lastQuote.project !== state.project || lastQuote.vat !== prefs.vat) {
    lastQuote = { project: state.project, vat: prefs.vat, quote: quoteProject(state.project, { vat: prefs.vat }) };
  }
  return lastQuote.quote;
}
function renderPrice() {
  priceTimer = 0;
  const sum = priceSummary(state.project, quoteNow(), prefs.vat);
  if (priceKey !== sum.text) {
    priceKey = sum.text;
    // the amount and its VAT note are two spans, so a phone can stack them
    const cut = sum.empty ? sum.text.length : sum.text.indexOf(' ');
    $('#pl-price-amt').textContent = sum.text.slice(0, cut);
    $('#pl-price-sfx').textContent = sum.text.slice(cut + 1);
    priceBtn.classList.toggle('is-empty', sum.empty);
    priceBtn.setAttribute('aria-label', sum.empty ? 'Price: no pieces yet' : `Price ${sum.text}. Show the breakdown`);
  }
  if (!pricePop.hidden) renderPricePop();
}
function schedulePrice() {
  if (priceTimer) return;
  priceTimer = setTimeout(renderPrice, 160);
}
function renderPricePop() {
  const q = quoteNow();
  const view = R.quoteView(q, state.project);
  if (!view.pieces.length) {
    pricePop.innerHTML = '<p>No pieces yet. Choose what to build and its price appears here.</p>';
    return;
  }
  const t = view.totals;
  pricePop.innerHTML = `<h3>Price so far</h3>
    <ul class="pl-pp">${view.pieces.map((p) => `<li><span>${esc(p.label)}</span><span>${eur(p.cents)}</span></li>`).join('')}
      <li><span>Design fee and fitting extras</span><span>${eur(t.subtotalCents - view.pieces.reduce((n, p) => n + p.cents, 0))}</span></li>
      ${t.vatOn ? `<li><span>VAT 21%</span><span>${eur(t.vatCents)}</span></li>` : ''}
      <li class="pl-pp__total"><span>${t.vatOn ? 'Total including VAT' : 'Total excluding VAT'}</span><span>${eur(t.totalCents)}</span></li></ul>
    <p class="pl-hint">Lead time about ${t.leadTimeWeeks} weeks. An estimate, not a contract.</p>
    <button type="button" class="pl-link" id="pl-pp-quote">See the full quote</button>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
pricePop.addEventListener('click', (e) => {
  if (!e.target.closest('#pl-pp-quote')) return;
  priceDisc.close();
  store.dispatch({ type: 'ui/step', step: 4 });
  if (review.sections) review.sections.show('quote');
});
onPrefs(() => { renderPrice(); });

// phone toggle: Plan, Wall or 3D
const paneBtns = $$('[data-pane-btn]');
paneBtns.forEach((b) => b.addEventListener('click', () => store.dispatch({ type: 'ui/pane', pane: b.dataset.paneBtn })));
roving($('.pl-tabs'), { selector: '[data-pane-btn]', selects: true });
function elevOn() {
  if (guided.active) return guided.elevation();
  const room = state.project.room;
  return elevationVisible({
    section: sectionOf[0], wallPicked, openingId: state.ui.openingId,
    openingsOnWall: room.openings.filter((o) => o.wallId === state.ui.wallId).length
  });
}
function renderPane() {
  const app = $('.pl-app');
  const s = state.ui.step;
  const kind = s === 0 ? 'room' : s === 2 ? 'interior' : s === 3 ? 'place' : 'other';
  const elev = kind === 'room' && elevOn();
  // only the Room step has a wall view; on the Interior step "plan" is the front view of the piece
  const pane = (kind !== 'room' || !elev) && state.ui.pane === 'wall' ? 'plan' : state.ui.pane;
  const set = (k, v) => { if (app.dataset[k] !== v) app.dataset[k] = v; };
  set('pane', pane); set('kind', kind); set('step', String(s)); set('elev', elev || kind !== 'room' ? 'on' : 'off');
  paneBtns.forEach((b) => {
    const on = String(b.dataset.paneBtn === pane);
    if (b.getAttribute('aria-checked') !== on) b.setAttribute('aria-checked', on);
    if (b.dataset.paneBtn === 'wall') b.hidden = !elev;
    if (b.dataset.paneBtn === 'plan') { const t = kind === 'interior' ? 'Drawing' : 'Plan'; if (b.textContent !== t) b.textContent = t; }
  });
}
document.addEventListener('pl-section', (e) => {
  const panel = e.target.closest && e.target.closest('[data-panel]');
  if (!panel) return;
  sectionOf[Number(panel.dataset.panel)] = e.detail.id;
  renderPane();
});

// ---------- viewer ----------
let viewer = null;
let pendingRaf = 0;
const stage = $('#pl-stage');
function pushProject() {
  pendingRaf = 0;
  if (viewer) viewer.setProject(state.project);
}
// fronts shown on the piece: closed on the Furniture step, hidden on the Interior step, and the pill cycles them
const FRONT_LABEL = { closed: 'Doors closed', ajar: 'Doors ajar', hidden: 'Doors hidden' };
const REVIEW_FRONT_LABEL = { closed: 'Doors closed', ajar: 'Doors open' };
let frontsMode = 'closed';
const doorsBtn = $('#pl-doors');
// on the Place step the selected piece is outlined and pieces with a blocking problem get a red mark on the floor
function placeMarks() {
  if (state.ui.step !== 3) return {};
  const by = clashesByPiece(state.project, validated().errors);
  return { selected: state.ui.pieceId, clashes: Object.keys(by).filter((id) => by[id].blocking.length) };
}
function pushPiece() {
  pendingRaf = 0;
  if (!viewer) return;
  const s = state.ui.step;
  const piece = s === 1 || s === 2 ? state.project.pieces.find((p) => p.id === state.ui.pieceId) : null;
  viewer.setPiece(piece || null, { fronts: frontsMode });
  if (!piece) viewer.setProject(state.project, placeMarks());
}
// Review: the doors of everything in the room are closed or open. The "Front of" views open them when the piece has
// pull-outs, which only show with the doors open.
function applyFronts(mode) {
  if (state.ui.step !== 4) return;
  frontsMode = mode === 'ajar' ? 'ajar' : 'closed';
  doorsBtn.setAttribute('aria-pressed', String(frontsMode !== 'closed'));
  $('#pl-doors-label').textContent = REVIEW_FRONT_LABEL[frontsMode];
  if (viewer) viewer.setPlacedFronts(frontsMode);
  review.frontsChanged();
}
function syncViewer(before) {
  if (!viewer) return;
  const s = state.ui.step;
  const inPiece = s === 1 || s === 2;
  const inReview = s === 4;
  if (!before || before.ui.step !== s) {
    if (inPiece) frontsMode = s === 1 ? 'closed' : 'hidden';
    if (inReview) frontsMode = 'closed';
    doorsBtn.hidden = !(inPiece || inReview);
    $('.pl-viewer__hint').textContent = inPiece || inReview ? 'Drag to orbit · scroll to zoom'
      : s === 3 ? 'Drag to orbit · scroll to zoom · click a piece to select it'
        : 'Drag to orbit · scroll to zoom · click a wall to select it';
    viewer.setPiecePicking(s === 3);
    $('#pl-top').hidden = inPiece || inReview; // Review has its own Top preset
    $('#pl-doors-label').textContent = (inReview ? REVIEW_FRONT_LABEL : FRONT_LABEL)[frontsMode];
    doorsBtn.setAttribute('aria-pressed', String(frontsMode !== 'closed'));
    if (inPiece && viewer.getView() === 'plan') viewer.setView('3d');
    viewer.setPlacedFronts(inReview ? frontsMode : 'closed'); // pieces in the room have their doors open only in Review
  }
  if (!before || state.project !== before.project || before.ui.step !== s || before.ui.pieceId !== state.ui.pieceId) {
    if (!pendingRaf) pendingRaf = requestAnimationFrame(pushPiece);
  }
  if (inPiece) return;
  const wall = state.ui.step === 0 ? state.ui.wallId : null;
  const was = before ? (before.ui.step === 0 ? before.ui.wallId : null) : undefined;
  if (wall !== was) {
    if (wall && (!before || before.ui.wallId !== wall)) viewer.focusWall(wall); else viewer.highlightWall(wall);
  }
}

async function bootViewer() {
  const canvas = $('#pl-canvas');
  try {
    const { createViewer } = await import('./viewer.js');
    viewer = createViewer(canvas, {
      onWallPick: (id) => store.dispatch({ type: 'ui/wall', wallId: id }),
      onPiecePick: (id) => { if (state.ui.step === 3) store.dispatch({ type: 'ui/piece', id }); }
    });
    viewer.setProject(state.project);
    viewer.highlightWall(state.ui.step === 0 ? state.ui.wallId : null);
    syncViewer(null);
    doorsBtn.addEventListener('click', () => {
      if (state.ui.step === 4) { applyFronts(frontsMode === 'closed' ? 'ajar' : 'closed'); return; }
      frontsMode = frontsMode === 'closed' ? 'ajar' : frontsMode === 'ajar' ? 'hidden' : 'closed';
      doorsBtn.setAttribute('aria-pressed', String(frontsMode !== 'closed'));
      $('#pl-doors-label').textContent = FRONT_LABEL[frontsMode];
      pushPiece();
    });
    const top = $('#pl-top');
    top.addEventListener('click', () => viewer.setView(viewer.getView() === 'plan' ? '3d' : 'plan'));
    viewer.onViewChange((m) => top.setAttribute('aria-pressed', String(m === 'plan')));
    $('#pl-reset').addEventListener('click', () => viewer.resetView());
    stage.classList.add('is-ready');
    window.gjPlanner = { store, viewer, review, guided };
    review.viewerReady();
  } catch (err) {
    console.warn('The 3D view could not start.', err);
    stage.classList.add('is-failed');
  }
}

// ---------- subscriptions ----------
function render(before) {
  const v = validated();
  views.forEach((view) => view.update(state, { validation: v }));
  guided.update(state);
  renderMode();
  renderStepper();
  renderFooter();
  renderPane();
  const stepChanged = !before || before.ui.step !== state.ui.step;
  if (stepChanged) showStep();
  renderHead();
  if (!before || before.project !== state.project) schedulePrice();
  $('#pl-example').hidden = !exampleBase || state.project !== exampleBase;
  syncViewer(before);
  if (stepChanged && before && userNav && !guided.active) {
    // a new step: the heading takes focus and the live region says where we are
    titleEl.focus({ preventScroll: true });
    announce(stepAnnouncement(state.ui.step));
  }
}
store.subscribe((s, before, action) => {
  state = s;
  if (action && (action.type === 'ui/step')) { userNav = true; guided.moved(); }
  if (action && (action.type === 'ui/wall' || (action.type === 'ui/opening' && action.id))) wallPicked = true;
  if (action && action.type === 'project/load') wallPicked = false;
  render(before);
});

// a pasted link with a different #p= in the same tab loads that project
window.addEventListener('hashchange', async () => {
  if (location.hash === store.lastHash || !/^#(p|design)=/.test(location.hash)) return;
  const { decodeProject } = await import('./share.js');
  const p = await decodeProject(location.hash);
  if (p) { exampleBase = null; store.dispatch({ type: 'project/load', project: p }); }
});
window.addEventListener('pagehide', () => { store.flush(); });

render(null);
renderPrice();
window.gjPlanner = { store, viewer: null, review, guided };
bootViewer();
