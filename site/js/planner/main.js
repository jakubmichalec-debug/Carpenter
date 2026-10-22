// Planner page boot: store, stepper, step views and the live viewer. Three.js loads here and nowhere else.
import { createStore, loadInitialProject, STEP_IDS } from './store.js';
import { validateProject } from './validate.js';
import { createRoomStep } from './steps/room.js';
import { createFurnitureStep } from './steps/furniture.js';
import { createInteriorStep } from './steps/interior.js';
import { createPlaceholderStep } from './steps/placeholder.js';

const LABELS = ['Room', 'Furniture', 'Interior', 'Place', 'Review'];
const NEXT = ['Next: furniture', 'Next: interior', 'Next: place it', 'Next: review', ''];
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const project = await loadInitialProject();
const store = createStore(project, { persist: true });
let state = store.getState();

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
const panels = $$('[data-panel]').map((el) => el);
const compact = matchMedia('(max-width: 1279px)');
const showInside = () => { if (compact.matches && state.ui.pane !== 'plan') store.dispatch({ type: 'ui/pane', pane: 'plan' }); };
const views = [
  createRoomStep({ side: panels[0], plan: $('#pl-plan'), elev: $('#pl-elev') }, { store, announce, confirmShape }),
  createFurnitureStep(panels[1], { store, announce, confirmAction }),
  createInteriorStep(panels[2], { insideBox: $('#pl-inside'), store, announce, showInside }),
  ...STEP_IDS.slice(3).map((id, i) => createPlaceholderStep(panels[i + 3], id, i + 3))
];

// validation is cached per project object
let vProject = null, validation = { errors: [] };
function validated() {
  if (state.project !== vProject) { vProject = state.project; validation = validateProject(state.project); }
  return validation;
}

const stepButtons = $$('.pl-step__btn');
let maxReached = state.ui.step;
const visited = new Set([state.ui.step]);
const issueStep = (ref, code) => {
  const t = ref && ref.type;
  if (code === 'piece-unplaced') return 3; // a piece that is not placed yet is the Place step's business
  return t === 'room' || t === 'opening' ? 0 : t === 'piece' || t === 'bay' ? 1 : t === 'item' ? 2 : t === 'placement' ? 3 : 0;
};

function renderStepper() {
  const v = validated();
  const issues = [0, 0, 0, 0, 0];
  for (const e of v.errors) issues[issueStep(e.ref, e.code)]++;
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

const next = $('#pl-next'), back = $('#pl-back'), undoBtn = $('#pl-undo'), redoBtn = $('#pl-redo');
function renderFooter() {
  const s = state.ui.step;
  back.disabled = s === 0;
  const last = s === LABELS.length - 1;
  next.hidden = last;
  $('#pl-next-label').textContent = NEXT[s];
  undoBtn.disabled = !state.past.length;
  redoBtn.disabled = !state.future.length;
}

function showStep() {
  const s = state.ui.step;
  maxReached = Math.max(maxReached, s);
  visited.add(s);
  panels.forEach((p, i) => { p.hidden = i !== s; });
  views[s].show();
  $('#pl-scroll').scrollTop = 0;
}

stepButtons.forEach((b, i) => b.addEventListener('click', () => store.dispatch({ type: 'ui/step', step: i })));
next.addEventListener('click', () => store.dispatch({ type: 'ui/step', step: state.ui.step + 1 }));
back.addEventListener('click', () => store.dispatch({ type: 'ui/step', step: state.ui.step - 1 }));
undoBtn.addEventListener('click', () => { store.dispatch({ type: 'history/undo' }); announce('Undone.'); });
redoBtn.addEventListener('click', () => { store.dispatch({ type: 'history/redo' }); announce('Redone.'); });

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const t = e.target;
  if (t && t.closest && t.closest('input:not([type=range]), textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { e.preventDefault(); store.dispatch({ type: e.shiftKey ? 'history/redo' : 'history/undo' }); }
  else if (k === 'y') { e.preventDefault(); store.dispatch({ type: 'history/redo' }); }
});

// phone toggle: Plan or 3D
const paneBtns = $$('[data-pane-btn]');
paneBtns.forEach((b) => b.addEventListener('click', () => store.dispatch({ type: 'ui/pane', pane: b.dataset.paneBtn })));
function renderPane() {
  const app = $('.pl-app');
  const s = state.ui.step;
  const kind = s === 0 ? 'room' : s === 2 ? 'interior' : 'other';
  // on the Interior step "plan" is the front view of the piece and there is no wall view
  const pane = kind === 'interior' && state.ui.pane === 'wall' ? 'plan' : state.ui.pane;
  app.dataset.pane = pane;
  app.dataset.kind = kind;
  paneBtns.forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.paneBtn === pane));
    if (b.dataset.paneBtn === 'wall') b.hidden = kind === 'interior';
    if (b.dataset.paneBtn === 'plan') b.textContent = kind === 'interior' ? 'Inside' : 'Plan';
  });
}

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
let frontsMode = 'closed';
const doorsBtn = $('#pl-doors');
function pushPiece() {
  pendingRaf = 0;
  if (!viewer) return;
  const s = state.ui.step;
  const piece = s === 1 || s === 2 ? state.project.pieces.find((p) => p.id === state.ui.pieceId) : null;
  viewer.setPiece(piece || null, { fronts: frontsMode });
  if (!piece) viewer.setProject(state.project);
}
function syncViewer(before) {
  if (!viewer) return;
  const s = state.ui.step;
  const inPiece = s === 1 || s === 2;
  if (!before || before.ui.step !== s) {
    if (inPiece) frontsMode = s === 1 ? 'closed' : 'hidden';
    doorsBtn.hidden = !inPiece;
    $('.pl-viewer__hint').textContent = inPiece ? 'Drag to orbit \u00b7 scroll to zoom' : 'Drag to orbit \u00b7 scroll to zoom \u00b7 click a wall to select it';
    $('#pl-top').hidden = inPiece;
    $('#pl-doors-label').textContent = FRONT_LABEL[frontsMode];
    doorsBtn.setAttribute('aria-pressed', String(frontsMode !== 'closed'));
    if (inPiece && viewer.getView() === 'plan') viewer.setView('3d');
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
    viewer = createViewer(canvas, { onWallPick: (id) => store.dispatch({ type: 'ui/wall', wallId: id }) });
    viewer.setProject(state.project);
    viewer.highlightWall(state.ui.step === 0 ? state.ui.wallId : null);
    syncViewer(null);
    doorsBtn.addEventListener('click', () => {
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
    window.gjPlanner = { store, viewer };
  } catch (err) {
    console.warn('The 3D view could not start.', err);
    stage.classList.add('is-failed');
  }
}

// ---------- subscriptions ----------
function render(before) {
  const v = validated();
  views.forEach((view) => view.update(state, { validation: v }));
  renderStepper();
  renderFooter();
  renderPane();
  if (!before || before.ui.step !== state.ui.step) showStep();
  syncViewer(before);
}
store.subscribe((s, before) => { state = s; render(before); });

// a pasted link with a different #p= in the same tab loads that project
window.addEventListener('hashchange', async () => {
  if (location.hash === store.lastHash || !/^#p=/.test(location.hash)) return;
  const { decodeProject } = await import('./share.js');
  const p = await decodeProject(location.hash);
  if (p) store.dispatch({ type: 'project/load', project: p });
});
window.addEventListener('pagehide', () => { store.flush(); });

render(null);
showStep();
window.gjPlanner = { store, viewer: null };
bootViewer();
