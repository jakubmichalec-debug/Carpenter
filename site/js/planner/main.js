// Planner page boot: store, stepper, step views and the live viewer. Three.js loads here and nowhere else.
import { createStore, loadInitialProject, STEP_IDS } from './store.js';
import { validateProject } from './validate.js';
import { createRoomStep } from './steps/room.js';
import { createPlaceholderStep } from './steps/placeholder.js';

const LABELS = ['Room', 'Furniture', 'Interior', 'Place', 'Review'];
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
function confirmShape(text) {
  $('#pl-confirm-text').textContent = text;
  dlg.returnValue = '';
  if (typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm(`Change the room shape? ${text}`));
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'change'), { once: true }));
}
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(''); });

// ---------- steps ----------
const panels = $$('[data-panel]').map((el) => el);
const views = [
  createRoomStep({ side: panels[0], plan: $('#pl-plan'), elev: $('#pl-elev') }, { store, announce, confirmShape }),
  ...STEP_IDS.slice(1).map((id, i) => createPlaceholderStep(panels[i + 1], id, i + 1))
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
const issueStep = (ref) => {
  const t = ref && ref.type;
  return t === 'room' || t === 'opening' ? 0 : t === 'piece' || t === 'bay' ? 1 : t === 'item' ? 2 : t === 'placement' ? 3 : 0;
};

function renderStepper() {
  const v = validated();
  const issues = [0, 0, 0, 0, 0];
  for (const e of v.errors) issues[issueStep(e.ref)]++;
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
  $('#pl-next-label').textContent = last ? '' : `Next: ${LABELS[s + 1]}`;
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
  app.dataset.pane = state.ui.pane;
  app.dataset.kind = state.ui.step === 0 ? 'room' : 'other';
  paneBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.paneBtn === state.ui.pane)));
}

// ---------- viewer ----------
let viewer = null;
let pendingRaf = 0;
const stage = $('#pl-stage');
function pushProject() {
  pendingRaf = 0;
  if (viewer) viewer.setProject(state.project);
}
function syncViewer(before) {
  if (!viewer) return;
  if (!before || state.project !== before.project) {
    if (!pendingRaf) pendingRaf = requestAnimationFrame(pushProject);
  }
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
  views[0].update(state, { validation: v });
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
