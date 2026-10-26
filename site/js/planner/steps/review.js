// Step 3: Review. The live 3D view with preset views and a doors toggle, a Render button (path tracing, loaded only
// when it is pressed), the itemised quote, and the ways out: copy a link, print the quote, and send it to the workshop (the guided flow's last question).
// The DOM is built once; update(state) only touches what changed. Nothing here runs a loop except the render itself.
import { quoteProject } from '../pricing.js';
import { encodeProject } from '../share.js';
import * as R from '../review-logic.js';
import { presetList, frontPose } from '../studio.js';
import { esc, ICON_NOTE } from './shared.js';
import { createTabs, roving, scrollCue } from './ui.js';
import { prefs, setVat } from '../prefs.js';
import { hasPullouts } from '../ui-logic.js';

const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_PRINT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-7-6 15-3-6z M11 14l9-9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const eur = (cents) => R.formatEuro(cents / 100);

export function createReviewStep(root, { store, announce = () => {}, getViewer = () => null, getFronts = () => 'closed', setFronts = () => {}, rbar, stage, host, printBox, footSlot, onSend = () => {} }) {
  let state = store.getState();
  let validation = { errors: [] };
  let lastBlockers = [];
  let quoteKey = '', problemsKey = '', presetKey = '', printKey = '';
  let activePreset = 'all';
  let job = null;              // the render that is running
  let shown = null;            // { canvas, project, fronts, samples, seconds, settings } the picture on screen, or the last one
  let rendering = false;
  let active = false;          // the Review step is the current step
  let probe = null;
  let statusTimer = 0;
  let lastText = '', lastPct = -1;
  const openPieces = new Set();

  // ---------- DOM ----------
  root.innerHTML = `
    <section class="pl-sec" data-sec="quote">
      <h3 class="visually-hidden">Quote</h3>
      <div class="pl-sec__row">
        <p class="pl-sec__sub">Your quote</p>
        <label class="pl-switch"><input type="checkbox" id="pl-r-vat" checked><span class="pl-switch__track" aria-hidden="true"></span><span class="pl-switch__text">Include 21% VAT</span></label>
      </div>
      <div class="pl-q-wrap">
        <div class="pl-q-scroll" id="pl-r-scroll">
          <div id="pl-r-problems"></div>
          <div id="pl-r-quote"></div>
        </div>
        <div id="pl-r-pin"></div>
      </div>
    </section>

    <section class="pl-sec" data-sec="share">
      <h3 class="visually-hidden">Share and send</h3>
      <div class="pl-actions">
        <button type="button" class="pl-btn pl-btn--ghost" id="pl-r-copy">${ICON_LINK}Copy share link</button>
        <button type="button" class="pl-btn pl-btn--ghost" id="pl-r-print">${ICON_PRINT}Print the quote</button>
      </div>
      <p class="pl-addnote" id="pl-r-status" role="status"></p>
      <div class="pl-r-linkbox" id="pl-r-linkbox" hidden>
        <label for="pl-r-link">Your link</label>
        <input type="text" id="pl-r-link" readonly>
      </div>
      <p class="pl-hint">An estimate from your design, not a contract: the workshop confirms it after measuring your space.</p>
      <p class="pl-hint">Send to the workshop takes you to one last question for your contact details. On this concept site nothing is sent, so your details stay in your browser.</p>
    </section>`;

  rbar.innerHTML = `
    <div class="pl-rbar__views" id="pl-r-views" role="radiogroup" aria-label="Views"></div>
    <div class="pl-rbar__go">
      <button type="button" class="pl-btn pl-btn--ghost" id="pl-r-png">${ICON_DOWN}<span>Download PNG</span></button>
    </div>
    <p class="pl-rbar__note" id="pl-r-note" role="status"></p>`;

  footSlot.innerHTML = `
    <button type="button" class="pl-btn pl-btn--ghost" id="pl-r-render">${ICON_CAMERA}<span id="pl-r-render-label">Render</span></button>
    <button type="button" class="pl-btn pl-btn--primary" id="pl-r-send">${ICON_SEND}<span>Send to the workshop</span></button>`;

  host.innerHTML = `
    <div class="pl-render__img" id="pl-r-img"></div>
    <button type="button" class="pl-pill pl-render__back" id="pl-r-back">${ICON_BACK}<span>Back to live view</span></button>
    <div class="pl-render__status" id="pl-r-statusbox">
      <div class="pl-progress" id="pl-r-progress" role="progressbar" aria-label="Render progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <div class="pl-render__row">
        <p class="pl-render__text" id="pl-r-text"></p>
        <button type="button" class="pl-btn pl-btn--small pl-btn--ghost" id="pl-r-stop">${ICON_STOP}Stop</button>
      </div>
      <p class="pl-render__cap" id="pl-r-cap"></p>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const $r = (sel) => rbar.querySelector(sel);
  const $f = (sel) => footSlot.querySelector(sel);
  const $h = (sel) => host.querySelector(sel);
  const renderBtn = $f('#pl-r-render'), pngBtn = $r('#pl-r-png'), noteEl = $r('#pl-r-note'), viewsEl = $r('#pl-r-views');
  // Render sits in the bottom bar on a computer; a phone has no room there, so it joins the download button
  const narrow = matchMedia('(max-width: 899px)');
  function placeRender() {
    const go = rbar.querySelector('.pl-rbar__go');
    if (narrow.matches) go.insertBefore(renderBtn, go.firstChild);
    else footSlot.insertBefore(renderBtn, footSlot.firstChild);
  }
  narrow.addEventListener('change', placeRender);
  placeRender();
  const imgBox = $h('#pl-r-img'), backBtn = $h('#pl-r-back'), stopBtn = $h('#pl-r-stop');
  const sections = createTabs({
    root, prefix: 'pl-r2', label: 'Review sections',
    items: [{ id: 'quote', label: 'Quote' }, { id: 'share', label: 'Share & send' }]
  });
  sections.show('quote');
  roving(viewsEl, { selector: '[data-preset]', selects: true });
  scrollCue($('#pl-r-scroll'), 'y');
  scrollCue(viewsEl, 'x');
  const textEl = $h('#pl-r-text'), capEl = $h('#pl-r-cap'), progEl = $h('#pl-r-progress'), progBar = progEl.querySelector('i');

  // ---------- small helpers ----------
  const project = () => state.project;
  const pieceCount = () => project().pieces.length;
  function say(text, quiet = false) {
    const el = $('#pl-r-status');
    el.textContent = text;
    if (!quiet) announce(text);
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; }, 8000);
  }
  const stageSize = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  function link(encoded) { return `${location.href.split('#')[0]}#p=${encoded}`; }
  const quote = () => quoteProject(project(), { vat: prefs.vat });

  // ---------- problems and notes ----------
  function renderProblems() {
    const blockers = R.sendBlockers(project(), validation.errors || []);
    const advice = R.adviceList(validation.errors || []);
    const key = JSON.stringify([blockers.map((b) => [b.code, b.message, b.step, b.pieceId]), advice.map((a) => a.message)]);
    lastBlockers = blockers;
    if (key === problemsKey) return blockers;
    problemsKey = key;
    let html = '';
    if (blockers.length) {
      html += `<div class="pl-r-block"><h4 class="pl-sec__sub" id="pl-r-h-block">Fix these first</h4>
        <p class="pl-hint pl-hint--tight">You can look around and render as it is. Sending the design needs these sorted.</p>
        <ul class="pl-notes">${blockers.map((b, i) => `<li class="pl-note pl-note--block pl-note--stack"><span class="pl-note__icon">${ICON_NOTE}</span><span class="pl-note__text">${esc(b.message)}</span><span class="pl-note__actions"><button type="button" class="pl-link" data-fix="${i}">${esc(b.label)}</button></span></li>`).join('')}</ul></div>`;
    }
    if (advice.length) {
      html += `<details class="pl-r-advice"><summary>Good to know (${advice.length})</summary><ul class="pl-notes">${advice.map((a) => `<li class="pl-note pl-note--info"><span class="pl-note__icon">${ICON_NOTE}</span><span class="pl-note__text">${esc(a.message)}</span></li>`).join('')}</ul></details>`;
    }
    $('#pl-r-problems').innerHTML = html;
    $('#pl-r-problems').__blockers = blockers;
    return blockers;
  }

  function fixBlocker(b) {
    if (b.code === 'no-pieces') { store.dispatch({ type: 'ui/new-piece' }); return; }
    if (b.pieceId) store.dispatch({ type: 'ui/piece', id: b.pieceId });
    const r = b.ref;
    if (r && r.type === 'bay') store.dispatch({ type: 'ui/bay', bay: r.bay });
    if (r && r.type === 'item') store.dispatch({ type: 'ui/item', bay: r.bay, index: r.index });
    store.dispatch({ type: 'ui/step', step: b.step });
  }
  $('#pl-r-problems').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fix]');
    if (!b) return;
    const list = $('#pl-r-problems').__blockers || [];
    if (list[Number(b.dataset.fix)]) fixBlocker(list[Number(b.dataset.fix)]);
  });

  // ---------- the quote ----------
  const rowsHtml = (rows) => rows.map((r) => `<li><span>${esc(r.label)}</span><span class="pl-q-amt">${eur(r.cents)}</span></li>`).join('');
  function quoteHtml(view, { forPrint = false } = {}) {
    if (!view.pieces.length) {
      const msg = `<p class="pl-r-empty">There is nothing to quote yet. Design a piece and its price appears here.</p>`;
      return forPrint ? msg : { body: msg, pin: '' };
    }
    const pieces = view.pieces.map((p) => {
      const inner = `<div class="pl-q-body">
          ${p.sections.map((s) => `<section class="pl-q-sec"><h4><span>${esc(s.title)}</span><span class="pl-q-amt">${eur(s.cents)}</span></h4><ul class="pl-q-rows">${rowsHtml(s.rows)}</ul></section>`).join('')}
          <dl class="pl-q-groups">${p.groups.map((g) => `<div><dt>${esc(g.label)}</dt><dd>${eur(g.cents)}</dd></div>`).join('')}</dl>
        </div>`;
      if (forPrint) return `<section class="pl-q-piece pl-q-piece--print"><h4 class="pl-q-head"><span class="pl-q-name">${esc(p.label)} <small>${esc(p.size)}</small></span><span class="pl-q-amt">${eur(p.cents)}</span></h4>${inner}</section>`;
      return `<details class="pl-q-piece" data-piece="${esc(p.id)}"${openPieces.has(p.id) ? ' open' : ''}><summary><span class="pl-q-name">${esc(p.label)} <small>${esc(p.size)}</small></span><span class="pl-q-amt">${eur(p.cents)}</span></summary>${inner}</details>`;
    }).join('');
    const t = view.totals;
    const SUB = new Set(['Materials', 'Hardware', 'Workshop labour', 'Fitting']);
    const lines = t.lines.map((l) => `<div${SUB.has(l.label) ? ' class="pl-q-sub"' : ''}><dt>${esc(l.label)}</dt><dd>${eur(l.cents)}</dd></div>`).join('');
    const mats = view.materials.length ? `<p class="pl-q-mats">Boards: ${view.materials.map((m) => `${esc(m.label)} ${m.m2.toFixed(1)} m²`).join(', ')}.</p>` : '';
    const subtotal = `<div class="pl-q-rule"><dt>${t.vatOn ? 'Subtotal' : 'Total before VAT'}</dt><dd>${eur(t.subtotalCents)}</dd></div>
        ${t.vatOn ? `<div><dt>VAT 21%</dt><dd>${eur(t.vatCents)}</dd></div>` : ''}
        <div class="pl-q-total"><dt>${t.vatOn ? 'Total including VAT' : 'Total excluding VAT'}</dt><dd>${eur(t.totalCents)}</dd></div>
        <div class="pl-q-lead"><dt>Lead time</dt><dd>about ${t.leadTimeWeeks} weeks</dd></div>`;
    const sum = view.pieces.reduce((n, p) => n + p.cents, 0);
    if (forPrint) {
      return `${pieces}
      <dl class="pl-q-totals">
        <div class="pl-q-totals__head"><dt>All pieces</dt><dd>${eur(sum)}</dd></div>
        ${lines}
        ${subtotal}
      </dl>${mats}`;
    }
    return {
      body: `<div class="pl-q-pieces">${pieces}</div>
      <dl class="pl-q-totals">
        <div class="pl-q-totals__head"><dt>All pieces</dt><dd>${eur(sum)}</dd></div>
        ${lines}
      </dl>${mats}`,
      pin: `<dl class="pl-q-totals pl-q-totals--pin">${subtotal}</dl>`
    };
  }
  function renderQuote() {
    const q = quote();
    const key = JSON.stringify([q.cents, q.pieces.map((p) => [p.id, p.cents]), prefs.vat]);
    if (key === quoteKey) return;
    quoteKey = key;
    const html = quoteHtml(R.quoteView(q, project()));
    $('#pl-r-quote').innerHTML = html.body;
    $('#pl-r-pin').innerHTML = html.pin;
  }
  $('#pl-r-quote').addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches && d.matches('details.pl-q-piece')) { if (d.open) openPieces.add(d.dataset.piece); else openPieces.delete(d.dataset.piece); }
  }, true);
  $('#pl-r-vat').addEventListener('change', (e) => {
    setVat(e.target.checked);
    renderQuote();
    announce(prefs.vat ? 'Prices now include VAT.' : 'Prices now exclude VAT.');
  });

  // ---------- views ----------
  function renderPresets() {
    const list = presetList(project());
    const key = JSON.stringify(list.map((x) => x.id)) + activePreset;
    if (key === presetKey) return;
    presetKey = key;
    if (!list.some((x) => x.id === activePreset)) activePreset = 'all';
    viewsEl.innerHTML = list.map((x) => `<button type="button" role="radio" class="pl-chip pl-chip--plain" data-preset="${esc(x.id)}" aria-checked="${x.id === activePreset}" tabindex="-1">${esc(x.label)}</button>`).join('');
  }
  function markPreset(id) {
    activePreset = id;
    presetKey = '';
    viewsEl.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset === id)));
  }
  viewsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    const viewer = getViewer();
    if (!b || !viewer) return;
    if (shown && shown.visible) backToLive();
    const id = b.dataset.preset;
    markPreset(id);
    if (id === 'all') { viewer.resetView(); return; }
    const pieceId = id.slice('front:'.length);
    const { w, h } = stageSize();
    const pose = frontPose(viewer.layout, pieceId, { aspect: w && h ? w / h : 1.5 });
    if (pose) viewer.setPose(pose);
    // pull-outs (a larder, spice racks, baskets) only show with the doors open, so the front view opens them
    const piece = project().pieces.find((x) => x.id === pieceId);
    if (pose && hasPullouts(piece) && getFronts() === 'closed') {
      setFronts('ajar');
      announce('Doors opened, so the pull-outs show.');
    }
  });
  // the person took the camera: no preset is "current" any more
  stage.addEventListener('pointerdown', () => { if (active && !rendering && activePreset) { presetKey = ''; activePreset = ''; viewsEl.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-checked', 'false')); } });

  // ---------- the render ----------
  function setNote(text) { if (noteEl.textContent !== text) noteEl.textContent = text; noteEl.hidden = !text; }
  function ensureProbe() {
    if (probe) return probe;
    return import('../render.js').then((m) => { probe = m.probeRender(); updateButtons(); return probe; }).catch(() => { probe = { ok: false, reason: 'load' }; updateButtons(); return probe; });
  }
  function updateButtons() {
    const viewer = getViewer();
    const hasPieces = pieceCount() > 0;
    const unsupported = probe && !probe.ok;
    const label = rendering ? 'Stop render' : shown && shown.canvas ? 'Render again' : 'Render';
    const text = renderBtn.querySelector('#pl-r-render-label');
    if (text.textContent !== label) text.textContent = label;
    renderBtn.disabled = !viewer || (!rendering && (!hasPieces || unsupported));
    renderBtn.classList.toggle('is-busy', rendering);
    renderBtn.title = unsupported ? 'This browser cannot path-trace' : !hasPieces ? 'Design a piece first' : '';
    pngBtn.disabled = !viewer && !(shown && shown.canvas);
    const pngTitle = shown && shown.canvas && validShown() && shown.visible ? 'Save the render as a PNG' : 'Save the live view as a PNG';
    if (pngBtn.title !== pngTitle) { pngBtn.title = pngTitle; pngBtn.setAttribute('aria-label', `Download PNG: ${pngTitle.toLowerCase()}`); }
    if (!rendering) {
      if (unsupported) setNote(probe.reason === 'load' ? 'The realistic render could not load. The live view still works, and you can download it.'
        : 'This browser has no WebGL 2 with float textures, so it cannot path-trace. The live view has soft shadows and you can download it as a PNG.');
      else if (!hasPieces) setNote('Design a piece to render it.');
      else setNote('');
    }
  }
  const validShown = () => !!shown && !!shown.canvas && shown.project === project() && shown.fronts === (getFronts() === 'ajar' ? 'ajar' : 'closed');

  function setProgress(pct) {
    if (pct === lastPct) return;
    lastPct = pct;
    progBar.style.setProperty('--p', String(pct / 100));
    progEl.setAttribute('aria-valuenow', String(pct));
  }
  function setText(t) { if (t !== lastText) { lastText = t; textEl.textContent = t; } }
  function showHost(mode) {
    // mode: 'working' (status over the live view, picture appears when ready), 'picture', or null
    host.hidden = !mode;
    host.classList.toggle('is-working', mode === 'working');
    host.classList.toggle('is-picture', mode === 'picture');
    if (shown) shown.visible = mode === 'picture';
    stage.classList.toggle('is-rendered', mode === 'picture');
  }
  function backToLive() {
    showHost(null);
    imgBox.textContent = '';
    updateButtons();
  }
  backBtn.addEventListener('click', () => { backToLive(); announce('Back to the live view.'); });

  function showPicture() {
    imgBox.textContent = '';
    imgBox.appendChild(shown.canvas);
    shown.canvas.className = 'pl-render__canvas';
    shown.canvas.setAttribute('role', 'img');
    shown.canvas.setAttribute('aria-label', 'Your furniture, rendered');
    showHost('picture');
    $h('#pl-r-statusbox').hidden = false;
    host.classList.add('is-done');
  }

  async function startRenderNow() {
    const viewer = getViewer();
    if (!viewer || rendering) return;
    await ensureProbe();
    if (!probe.ok) return;
    const cs = viewer.getCameraState();
    if (!cs.size.w || !cs.size.h) return;
    const settings = R.renderSettings({
      screenWidth: screen.width, screenHeight: screen.height,
      pointerCoarse: matchMedia('(pointer: coarse)').matches,
      deviceMemory: navigator.deviceMemory || 0, cores: navigator.hardwareConcurrency || 0,
      maxTextureSize: probe.maxTextureSize || 16384, software: !!probe.software, aspect: cs.size.w / cs.size.h
    }, typeof window !== 'undefined' ? window.gjRenderLimits : null);
    rendering = true;
    shown = null;
    imgBox.textContent = '';
    host.classList.remove('is-done');
    lastText = ''; lastPct = -1;
    setProgress(0);
    setText('Getting the renderer ready. The first picture takes a few seconds.');
    capEl.textContent = settings.note;
    capEl.hidden = !settings.note;
    stopBtn.hidden = false;
    $h('#pl-r-statusbox').hidden = false;
    showHost('working');
    updateButtons();
    announce('Rendering. A rough picture appears first and gets cleaner.');
    const fronts = getFronts() === 'ajar' ? 'ajar' : 'closed';
    const renderedProject = project();
    let renderMod;
    try { renderMod = await import('../render.js'); } catch (err) { console.warn('The render module did not load.', err); finishFailed('The realistic render could not load. The live view still works.'); return; }
    let onScreen = false;
    job = renderMod.startRender({
      host: imgBox, project: renderedProject, camera: cs.camera, fronts, settings,
      onStage(name) {
        if (name === 'building') setText('Building the set for the renderer.');
        else if (name === 'compiling') setText('Compiling the light transport. This is the slow part on some devices.');
      },
      onProgress(p) {
        if (!onScreen && !p.compiling) { onScreen = true; host.classList.add('has-image'); }
        if (p.compiling) return;
        const pct = Math.round(R.progressFraction({ samples: p.samples, maxSamples: p.maxSamples, elapsed: p.elapsed, maxSeconds: p.maxSeconds }) * 100);
        setProgress(pct);
        setText(p.preview ? 'Rough preview. Refining…' : `Refining: sample ${p.samples} of ${p.maxSamples}, ${R.formatDuration(p.elapsed)}`);
      }
    });
    const result = await job.done;
    job = null;
    rendering = false;
    host.classList.remove('has-image');
    if (!active) return; // the person left the step
    if (result.reason === 'disposed') { updateButtons(); return; }
    if (result.reason === 'error' || !result.canvas) {
      console.warn('The render stopped.', result.error);
      const unsupported = result.error && /unsupported/.test(String(result.error.message));
      if (unsupported) probe = { ...probe, ok: false, reason: 'float' };
      finishFailed(unsupported ? '' : 'The render stopped before it could draw a picture. The live view still works.');
      return;
    }
    shown = { canvas: result.canvas, project: renderedProject, fronts, samples: result.samples, seconds: result.seconds, settings, visible: true };
    showPicture();
    stopBtn.hidden = true;
    setProgress(100);
    setText(result.reason === 'stopped' ? `Stopped at ${result.samples} samples.` : `Done: ${result.samples} samples in ${R.formatDuration(result.seconds)}.`);
    updateButtons();
    announce(`Render finished. ${result.samples} samples.`);
  }
  function finishFailed(message) {
    rendering = false;
    job = null;
    showHost(null);
    imgBox.textContent = '';
    updateButtons();
    if (message) { setNote(message); announce(message); }
  }
  function stopRenderNow() { if (job) job.stop(); }
  renderBtn.addEventListener('click', () => { if (rendering) stopRenderNow(); else startRenderNow(); });
  stopBtn.addEventListener('click', stopRenderNow);

  // ---------- pictures: download, thumbnail, print ----------
  function liveCanvas(maxWidth) {
    const viewer = getViewer();
    return viewer ? viewer.capture({ maxWidth }) : null;
  }
  function pictureCanvas(maxWidth) {
    if (validShown()) return shown.canvas;
    return liveCanvas(maxWidth);
  }
  function download() {
    const useRender = validShown() && shown.visible;
    const c = useRender ? shown.canvas : liveCanvas(1600);
    if (!c) { say('There is no picture to save yet.'); return; }
    const name = useRender ? 'grain-and-joint-render.png' : 'grain-and-joint-design.png';
    const done = (blob) => {
      if (!blob) { say('Your browser could not make the picture.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      say(useRender ? 'Saved the render as a PNG.' : 'Saved the live view as a PNG.');
    };
    if (c.toBlob) c.toBlob(done, 'image/png'); else done(null);
  }
  pngBtn.addEventListener('click', download);

  function jpegOf(c, width, quality) {
    if (!c) return null;
    const k = Math.min(1, width / c.width);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(c.width * k)); out.height = Math.max(1, Math.round(c.height * k));
    out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
    let q = quality, url = out.toDataURL('image/jpeg', q);
    while (url.length > R.THUMB_MAX && q > 0.4) { q -= 0.12; url = out.toDataURL('image/jpeg', q); }
    return url.length <= R.THUMB_MAX ? url : null;
  }

  // ---------- share, send ----------
  async function encoded() { store.flush(); return encodeProject(project()); }
  async function copyLink() {
    const enc = await encoded();
    const url = link(enc);
    const box = $('#pl-r-linkbox'), input = $('#pl-r-link');
    input.value = url;
    box.hidden = false;
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); ok = true; } } catch { ok = false; }
    if (!ok) { try { input.focus(); input.select(); ok = document.execCommand && document.execCommand('copy'); } catch { ok = false; } }
    say(ok ? 'Link copied. Anyone who opens it sees this design.' : 'Copy the link from the box below.');
    if (!ok) { input.focus(); input.select(); }
  }
  $('#pl-r-copy').addEventListener('click', copyLink);
  $('#pl-r-linkbox').addEventListener('focusin', (e) => { if (e.target.select) e.target.select(); });

  function send() {
    const blockers = R.sendBlockers(project(), validation.errors || []);
    if (blockers.length) {
      sections.show('quote');
      announce(`${blockers.length === 1 ? 'One thing needs' : `${blockers.length} things need`} fixing before you can send the design.`);
      const first = $('#pl-r-problems .pl-link');
      if (first) first.focus();
      return;
    }
    say('Opening the last question, where we ask how to reach you.');
    onSend();
  }
  $f('#pl-r-send').addEventListener('click', send);

  // ---------- print ----------
  function fillPrint() {
    if (!printBox) return;
    const prj = project();
    const q = quoteProject(prj, { vat: true }); // the printed quote always shows the price with VAT
    const view = R.quoteView(q, prj);
    const pic = prj.pieces.length ? jpegOf(pictureCanvas(1400), 1000, 0.85) : null;
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const key = JSON.stringify([q.cents, view.pieces.map((p) => p.id), !!pic && pic.length]);
    if (key === printKey && printBox.childElementCount) return;
    printKey = key;
    printBox.innerHTML = `
      <header class="pl-print__head">
        <p class="pl-print__brand">Grain <em>&amp;</em> Joint</p>
        <p class="pl-print__meta">Quote from the planner<br>${esc(date)}</p>
      </header>
      <h1 class="pl-print__title">Your built-in furniture</h1>
      ${pic ? `<img class="pl-print__img" src="${pic}" alt="Your pieces side by side">` : ''}
      ${view.pieces.length ? quoteHtml(view, { forPrint: true }) : '<p>There is nothing to quote yet.</p>'}
      <p class="pl-print__foot">An estimate from your design, not a contract: the workshop confirms it after measuring your space. Prices in euro, including 21% VAT. Grain &amp; Joint is a concept studio and this quote is not a real offer.</p>`;
    printBox.hidden = false;
  }
  $('#pl-r-print').addEventListener('click', () => { fillPrint(); window.print(); });
  window.addEventListener('beforeprint', () => { if (printBox) fillPrint(); });

  // ---------- lifecycle ----------
  function resetRenderUi() {
    if (job) { job.dispose(); job = null; }
    rendering = false;
    shown = null;
    imgBox.textContent = '';
    host.hidden = true;
    host.classList.remove('is-working', 'is-picture', 'has-image', 'is-done');
    stage.classList.remove('is-rendered');
  }
  function update(next, info = {}) {
    const before = state;
    state = next;
    validation = info.validation || validation;
    if (root.hidden || !active) return;
    if (before.project !== next.project && (shown || rendering)) {
      // the design changed under a render (undo, a pasted link): it no longer shows this design
      resetRenderUi();
      announce('The design changed, so the render was cleared.');
    }
    const blockers = renderProblems();
    renderQuote();
    renderPresets();
    $f('#pl-r-send').classList.toggle('is-blocked', blockers.length > 0);
    updateButtons();
  }
  function show() {
    active = true;
    rbar.hidden = false;
    problemsKey = ''; quoteKey = ''; presetKey = '';
    activePreset = 'all';
    update(state);
    ensureProbe();
    viewerReady();
  }
  function hide() {
    if (!active) return;
    active = false;
    resetRenderUi();
    rbar.hidden = true;
    $('#pl-r-linkbox').hidden = true;
  }
  function viewerReady() { if (active) updateButtons(); }
  // the doors toggle changes what a render would show, so a picture of the other state is put away
  function frontsChanged() { if (active && shown && shown.visible && !validShown()) backToLive(); if (active) updateButtons(); }

  return { update, show, hide, viewerReady, frontsChanged, fillPrint, sections, status: () => ({ count: lastBlockers.length, ok: pieceCount() > 0 && !lastBlockers.length, jump: 'quote' }), destroy: hide };
}
