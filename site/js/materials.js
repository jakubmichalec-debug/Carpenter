// Materials page: tilting sample boards with canvas-generated textures, a detail dialog, a two-material compare tool and a hardware section.
// Textures are painted procedurally on <canvas>, so no image downloads and no WebGL contexts are needed.
import { MATERIALS } from './configurator/model.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lenis = () => (window.site && window.site.lenis) || null;
const live = $('[data-live]');
const say = (msg) => { if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); } };

/* ------------------------------------------------------------------ material facts (the model holds colour and price; the rest is editorial) */
const META = {
  oak: { used: ['Wardrobe and kitchen fronts', 'Tables, desks and benches', 'Window-seat tops'], dur: 4, moist: 3, repair: 5, make: 'Solid European oak, 19 mm, Janka hardness about 1,360 lbf', tone: 'Warm honey tones with a lively, open grain.', finish: 'Hard-wax oil or matt water-based lacquer', care: 'Wipe with a damp cloth; re-oil every few years', kind: 'Solid wood' },
  walnut: { used: ['Desk tops and fronts', 'Dining tables', 'Statement doors'], dur: 3, moist: 3, repair: 5, make: 'Solid walnut, 19 mm, Janka hardness about 1,010 lbf', tone: 'Deep chocolate brown with a calm, flowing figure.', finish: 'Hard-wax oil, which deepens the colour', care: 'Keep out of strong sun to avoid fading; re-oil yearly at first', kind: 'Solid wood' },
  ash: { used: ['Shelving and wall units', 'Window seats', 'Light, modern fronts'], dur: 4, moist: 2, repair: 5, make: 'Solid European ash, 19 mm, Janka hardness about 1,320 lbf', tone: 'Pale and creamy with a strong, straight grain that brightens small rooms.', finish: 'Clear matt lacquer or white-pigmented oil', care: 'Wipe clean; avoid standing water', kind: 'Solid wood' },
  'birch-ply': { used: ['Carcasses and shelves', 'Drawer boxes', 'Exposed-edge desks'], dur: 4, moist: 3, repair: 3, make: 'Cross-laminated birch plywood, 18 mm, void-free core', tone: 'Pale and quiet, with a striped layered edge that we leave on show.', finish: 'Clear matt lacquer or natural oil', care: 'Wipe clean; seal cut edges near water', kind: 'Plywood' },
  'lacquer-white': { used: ['Kitchen and hall fronts', 'Tall cabinets', 'Painted shelving'], dur: 3, moist: 4, repair: 2, make: 'Birch plywood or MDF sprayed in three coats of water-based lacquer', tone: 'Soft warm white that reads as clean without turning clinical.', finish: 'Satin, sprayed and cured in the workshop', care: 'Mild soap and a soft cloth; touch-up kit supplied', kind: 'Lacquer' },
  'lacquer-sage': { used: ['Kitchen bases and islands', 'Wall units', 'Window seats'], dur: 3, moist: 4, repair: 2, make: 'Birch plywood or MDF sprayed in three coats of water-based lacquer', tone: 'A muted, grey-green that sits well beside oak.', finish: 'Satin, sprayed and cured in the workshop', care: 'Mild soap and a soft cloth; touch-up kit supplied', kind: 'Lacquer' },
  'lacquer-charcoal': { used: ['Kitchen islands', 'Feature walls', 'Studies'], dur: 3, moist: 4, repair: 2, make: 'Birch plywood or MDF sprayed in three coats of water-based lacquer', tone: 'Deep blue-black with just enough softness to avoid looking harsh.', finish: 'Satin, sprayed and cured in the workshop', care: 'Dark finishes show dust and marks; wipe often with a soft cloth', kind: 'Lacquer' },
  'lacquer-clay': { used: ['Wardrobes and dressing rooms', 'Alcoves', 'Accent doors'], dur: 3, moist: 4, repair: 2, make: 'Birch plywood or MDF sprayed in three coats of water-based lacquer', tone: 'A warm terracotta that glows in evening light.', finish: 'Satin, sprayed and cured in the workshop', care: 'Mild soap and a soft cloth; touch-up kit supplied', kind: 'Lacquer' },
  terrazzo: { used: ['Kitchen worktops and islands', 'Desk tops', 'Bench tops'], dur: 5, moist: 5, repair: 1, make: 'Cement matrix with marble chips, 30 mm, sealed', tone: 'Speckled and cool, a calm counterpoint to warm timber.', finish: 'Honed and sealed', care: 'Reseal once a year; wipe up acids and oils quickly', kind: 'Stone' }
};
const KIND_LABEL = { wood: 'Solid wood', ply: 'Plywood', lacquer: 'Lacquer', stone: 'Stone' };
const IDS = Object.keys(MATERIALS).filter((id) => MATERIALS[id].pickable !== false);
const tier = (m) => (m.pricePerM2 < 100 ? 1 : m.pricePerM2 < 200 ? 2 : m.pricePerM2 < 400 ? 3 : 4);
const euro = (n) => '€' + Math.round(n).toLocaleString('en-US');
const frontCost = (id) => Math.round((4.8 * MATERIALS[id].pricePerM2 * 1.12) / 10) * 10; // 200 x 240 cm of fronts plus waste

/* ------------------------------------------------------------------ canvas texture painters */
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 7;
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex, amt) {
  const [r, g, b] = rgb(hex); const t = amt < 0 ? 0 : 255; const p = Math.abs(amt);
  return `rgb(${Math.round((t - r) * p + r)},${Math.round((t - g) * p + g)},${Math.round((t - b) * p + b)})`;
}

function paintWood(g, W, H, color, seed, plyEdge) {
  const r = rng(seed); const dark = shade(color, -0.5); const light = shade(color, 0.2);
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) { g.globalAlpha = 0.05 + r() * 0.07; g.fillStyle = r() > 0.5 ? light : dark; g.fillRect(0, r() * H, W, 20 + r() * H * 0.2); }
  const warp = (x, y) => Math.sin(x * 0.006 + y * 0.012 + seed) * (H * 0.02) + Math.sin(x * 0.017 + y * 0.03 + seed * 2) * (H * 0.008);
  const lines = Math.round(H / 2.6);
  for (let i = 0; i < lines; i++) {
    const y0 = (i / lines) * H + r() * 3; g.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = y0 + warp(x, y0); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = dark; g.globalAlpha = 0.05 + r() * 0.2; g.lineWidth = 0.5 + r() * 1.9; g.stroke();
  }
  // a pair of cathedral arches
  for (let a = 0; a < 2; a++) {
    const cx = W * (0.25 + r() * 0.5); const cy = H * (0.25 + r() * 0.5);
    for (let k = 1; k < 16; k++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 8) { const y = cy + k * (H * 0.014) - ((x - cx) ** 2) * (0.00002 * k + 0.00001) * (H / 360); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = dark; g.globalAlpha = 0.04 + r() * 0.09; g.lineWidth = 0.6 + r() * 1.2; g.stroke();
    }
  }
  for (let i = 0; i < W * 1.4; i++) { g.globalAlpha = 0.28 * r(); g.fillStyle = dark; g.fillRect(r() * W, r() * H, 3 + r() * 11, 1); }
  g.globalAlpha = 1;
  if (plyEdge) {
    const eh = Math.round(H * 0.13); g.fillStyle = shade(color, 0.35); g.fillRect(0, H - eh, W, eh);
    const n = 9; const lh = eh / n;
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? shade(color, -0.12) : shade(color, 0.28); g.globalAlpha = 0.95; g.fillRect(0, H - eh + i * lh, W, lh - 0.6 - r() * 0.8); }
    g.globalAlpha = 0.12; g.fillStyle = '#000'; g.fillRect(0, H - eh - 1, W, 1.5); g.globalAlpha = 1;
  }
}
function paintLacquer(g, W, H, color, seed) {
  const r = rng(seed);
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.14)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < W * 5; i++) { g.globalAlpha = 0.035 * r(); g.fillStyle = r() > 0.5 ? '#fff' : '#000'; g.fillRect(r() * W, r() * H, 1.4, 1.4); }
  g.globalAlpha = 1;
}
function paintTerrazzo(g, W, H, color, seed) {
  const r = rng(seed); const pal = ['#f4efe6', '#8d8579', '#c9a47e', '#3b3a38', '#b9715a', '#dcd6ca', '#a7a89a'];
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  const n = Math.round((W * H) / 900);
  for (let i = 0; i < n; i++) {
    const cx = r() * W; const cy = r() * H; const rad = (r() ** 2.2) * (W * 0.05) + 2.5; const sides = 5 + Math.floor(r() * 3); const rot = r() * 6.28;
    g.beginPath();
    for (let k = 0; k < sides; k++) { const a = rot + (k / sides) * 6.283; const rr = rad * (0.6 + r() * 0.55); k ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.globalAlpha = 0.92; g.fillStyle = pal[Math.floor(r() * pal.length)]; g.fill();
    g.globalAlpha = 0.18; g.strokeStyle = '#000'; g.lineWidth = 0.6; g.stroke();
  }
  for (let i = 0; i < W * 3; i++) { g.globalAlpha = 0.3 * r(); g.fillStyle = r() > 0.5 ? '#fff' : '#555'; g.fillRect(r() * W, r() * H, 1.3, 1.3); }
  g.globalAlpha = 1;
}
function paint(canvas, id, opts = {}) {
  const m = MATERIALS[id]; const g = canvas.getContext('2d'); const W = canvas.width; const H = canvas.height; const seed = hash(id);
  if (m.kind === 'wood' || m.kind === 'ply') paintWood(g, W, H, m.color, seed, m.kind === 'ply' && opts.edge !== false);
  else if (m.kind === 'stone') paintTerrazzo(g, W, H, m.color, seed);
  else paintLacquer(g, W, H, m.color, seed);
}
const tileCache = {};
function tile(id) { // small repeating tile used as a canvas pattern
  if (!tileCache[id]) { const c = document.createElement('canvas'); c.width = c.height = 360; paint(c, id, { edge: false }); tileCache[id] = c; }
  return tileCache[id];
}

/* ------------------------------------------------------------------ sample library */
const grid = $('[data-grid]');
const kindsEl = $('[data-kinds]');
let kindFilter = 'all';
const cmp = ['oak', 'walnut'];
let nextSlot = 0;

function buildKinds() {
  const kinds = ['all', ...new Set(IDS.map((id) => MATERIALS[id].kind))];
  kindsEl.innerHTML = kinds.map((k) => `<button type="button" class="mt-kind" data-kind="${k}" aria-pressed="${k === 'all'}">${k === 'all' ? 'All' : KIND_LABEL[k]}</button>`).join('');
  kindsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.mt-kind'); if (!b) return;
    kindFilter = b.dataset.kind;
    $$('.mt-kind', kindsEl).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    let n = 0;
    $$('.mt-card', grid).forEach((li) => {
      const show = kindFilter === 'all' || MATERIALS[li.dataset.id].kind === kindFilter;
      li.hidden = !show;
      if (show && !reduced) li.animate([{ opacity: 0, transform: 'translateY(26px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: n++ * 55, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    });
    say(`Showing ${n} materials`);
  });
}

function buildGrid() {
  grid.innerHTML = IDS.map((id, i) => {
    const m = MATERIALS[id]; const t = tier(m);
    return `<li class="mt-card" data-id="${id}" style="--edge:${shade(m.color, -0.4)};--i:${i}">
      <button type="button" class="mt-card__btn" aria-haspopup="dialog" aria-label="${m.label}: open details" data-cursor="Open">
        <span class="mt-board"><span class="mt-board__spin" style="--delay:${(i * -1.3).toFixed(1)}s"><canvas width="480" height="360" aria-hidden="true"></canvas><span class="mt-board__sheen"></span></span></span>
        <span class="mt-card__meta"><strong>${m.label}</strong><span>${KIND_LABEL[m.kind]} <i aria-hidden="true">·</i> <b class="mt-tier" aria-label="Price tier ${t} of 4">${'€'.repeat(t)}</b></span></span>
      </button>
      <button type="button" class="mt-card__cmp" aria-pressed="false" aria-label="Add ${m.label} to compare"><span aria-hidden="true">+</span></button>
    </li>`;
  }).join('');
  $$('.mt-card', grid).forEach((li) => { paint($('canvas', li), li.dataset.id); });
  syncCompareButtons();
}

function bindGrid() {
  // tilt + sheen follow the pointer; keyboard focus gets a gentle fixed tilt
  grid.addEventListener('pointermove', (e) => {
    if (reduced || e.pointerType === 'touch') return;
    const btn = e.target.closest('.mt-card__btn'); if (!btn) return;
    const board = $('.mt-board', btn); const r = btn.getBoundingClientRect();
    const px = clamp((e.clientX - r.left) / r.width, 0, 1); const py = clamp((e.clientY - r.top) / r.height, 0, 0.8) / 0.8;
    board.style.setProperty('--ry', `${((px - 0.5) * 24).toFixed(1)}deg`);
    board.style.setProperty('--rx', `${(-(py - 0.5) * 18).toFixed(1)}deg`);
    board.style.setProperty('--mx', `${(px * 100).toFixed(0)}%`);
    board.style.setProperty('--my', `${(py * 100).toFixed(0)}%`);
    board.classList.add('is-hot');
  });
  grid.addEventListener('pointerout', (e) => {
    const btn = e.target.closest('.mt-card__btn'); if (!btn || btn.contains(e.relatedTarget)) return;
    const board = $('.mt-board', btn); board.classList.remove('is-hot');
    board.style.setProperty('--rx', '0deg'); board.style.setProperty('--ry', '0deg');
  });
  grid.addEventListener('click', (e) => {
    const c = e.target.closest('.mt-card__cmp');
    if (c) { addToCompare(c.closest('.mt-card').dataset.id); return; }
    const b = e.target.closest('.mt-card__btn');
    if (b) openDialog(b.closest('.mt-card').dataset.id, b);
  });
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
    $$('.mt-card', grid).forEach((li) => io.observe(li));
  } else $$('.mt-card', grid).forEach((li) => li.classList.add('is-in'));
}

function syncCompareButtons() {
  $$('.mt-card', grid).forEach((li) => {
    const on = cmp.includes(li.dataset.id); const b = $('.mt-card__cmp', li);
    li.classList.toggle('is-compared', on);
    b.setAttribute('aria-pressed', String(on));
    const label = MATERIALS[li.dataset.id].label;
    b.setAttribute('aria-label', on ? `${label} is in the compare tool (slot ${cmp.indexOf(li.dataset.id) ? 'B' : 'A'})` : `Add ${label} to compare`);
    $('span', b).textContent = on ? (cmp.indexOf(li.dataset.id) ? 'B' : 'A') : '+';
  });
}

function addToCompare(id) {
  if (cmp.includes(id)) { say(`${MATERIALS[id].label} is already being compared.`); return; }
  cmp[nextSlot] = id; const slot = nextSlot ? 'B' : 'A'; nextSlot = 1 - nextSlot;
  renderCompare(); syncCompareButtons();
  say(`${MATERIALS[id].label} added as material ${slot}. Jump to the compare tool to see it.`);
  toast(`${MATERIALS[id].label} added as ${slot}`);
}

let toastEl = null; let toastT = 0;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div'); toastEl.className = 'mt-toast';
    toastEl.innerHTML = '<span></span><a href="#compare">Compare now</a>'; document.body.appendChild(toastEl);
  }
  $('span', toastEl).textContent = msg; toastEl.classList.add('is-on'); clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('is-on'), 3600);
}

/* ------------------------------------------------------------------ details dialog */
const dlg = $('[data-dialog]');
let dlgId = null; let dlgOrigin = null;
const bar = (label, v) => `<div class="mt-bar"><span>${label}</span><i style="--v:${v / 5}"><b></b></i><em>${v}/5</em></div>`;

function openDialog(id, origin) {
  const m = MATERIALS[id]; const x = META[id]; dlgId = id; dlgOrigin = origin;
  paint($('[data-dlg-canvas]', dlg), id);
  $('[data-dlg-kind]', dlg).textContent = `${KIND_LABEL[m.kind]} · ${x.kind === KIND_LABEL[m.kind] ? 'In stock weekly' : ''}`.replace(/ · $/, '');
  $('[data-dlg-title]', dlg).textContent = m.label;
  $('[data-dlg-tone]', dlg).textContent = x.tone;
  const t = tier(m);
  $('[data-dlg-tier]', dlg).textContent = '€'.repeat(t);
  $('[data-dlg-price]', dlg).textContent = `${euro(m.pricePerM2)} per m² of board, price tier ${t} of 4`;
  $('[data-dlg-bars]', dlg).innerHTML = bar('Durability', x.dur) + bar('Moisture resistance', x.moist) + bar('Easy to repair', x.repair);
  $('[data-dlg-used]', dlg).innerHTML = x.used.map((u) => `<span class="mt-pill">${u}</span>`).join('');
  $('[data-dlg-make]', dlg).textContent = x.make;
  $('[data-dlg-finish]', dlg).textContent = x.finish;
  $('[data-dlg-care]', dlg).textContent = x.care;
  const cb = $('[data-dlg-compare]', dlg);
  cb.textContent = cmp.includes(id) ? 'In the compare tool' : 'Add to compare'; cb.disabled = cmp.includes(id);
  const use = $('[data-dlg-use]', dlg); use.href = 'configurator.html';
  configuratorLink(id).then((h) => { if (h && dlgId === id) use.href = h; });
  const l = lenis(); if (l) l.stop();
  dlg.showModal();
  requestAnimationFrame(() => dlg.classList.add('is-open'));
}
function closeDialog() {
  if (!dlg.open) return;
  dlg.classList.remove('is-open');
  const done = () => { dlg.close(); };
  if (reduced) done(); else setTimeout(done, 380);
}
dlg.addEventListener('close', () => { const l = lenis(); if (l) l.start(); if (dlgOrigin && dlgOrigin.isConnected) dlgOrigin.focus({ preventScroll: true }); });
dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(); });
dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) closeDialog(); });
$('[data-dlg-compare]', dlg).addEventListener('click', () => { addToCompare(dlgId); closeDialog(); });

let sharePromise = null;
function configuratorLink(id) {
  sharePromise = sharePromise || Promise.all([import('./configurator/model.js'), import('./configurator/share.js')]).catch(() => null);
  return sharePromise.then((libs) => {
    if (!libs) return null;
    try {
      const [M, S] = libs; let d = M.createDesign(); const m = MATERIALS[id];
      if (m.kind === 'stone') d = M.updateModule(d, 'm2', { worktop: id });
      else d = M.updateModule(d, 'm1', { front: id });
      return `configurator.html#design=${S.encodeDesign(d)}`;
    } catch (err) { return null; }
  });
}

/* ------------------------------------------------------------------ compare tool */
const cmpRoot = $('[data-compare]');
function buildCompare() {
  const opts = IDS.map((id) => `<option value="${id}">${MATERIALS[id].label}</option>`).join('');
  $$('[data-pick]', cmpRoot).forEach((sel) => {
    sel.innerHTML = opts;
    sel.addEventListener('change', () => { cmp[Number(sel.dataset.pick)] = sel.value; if (cmp[0] === cmp[1]) { const other = 1 - Number(sel.dataset.pick); cmp[other] = IDS.find((i) => i !== sel.value); } renderCompare(); syncCompareButtons(); });
  });
  $('[data-swap]', cmpRoot).addEventListener('click', () => { cmp.reverse(); renderCompare(); syncCompareButtons(); });
  renderCompare(true);
}

function drawCombo(front, body) {
  const c = $('[data-combo]', cmpRoot); const g = c.getContext('2d'); const W = c.width; const H = c.height;
  g.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  g.fillStyle = css.getPropertyValue('--paper-3').trim() || '#e0d5c3'; g.fillRect(0, 0, W, H);
  g.fillStyle = css.getPropertyValue('--paper-2').trim() || '#ebe3d6'; g.fillRect(0, 0, W, H * 0.8);
  g.fillStyle = 'rgba(0,0,0,.13)'; g.beginPath(); g.ellipse(W / 2, H * 0.86, 190, 14, 0, 0, 7); g.fill();
  const x = 90; const y = 40; const w = W - 180; const h = H - 120;
  const pat = (id) => { const p = g.createPattern(tile(id), 'repeat'); return p; };
  // carcass (body material) with a visible side and top
  g.fillStyle = pat(body); g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y, w, 8);
  // plinth
  g.fillStyle = pat(body); g.fillRect(x + 8, y + h, w - 16, 18); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + 8, y + h, w - 16, 18);
  // two doors + a drawer band (front material)
  const gap = 5; const dh = h - 70; const dw = (w - 3 * gap - 8) / 2;
  [[x + gap + 4, y + gap + 4], [x + 2 * gap + 4 + dw, y + gap + 4]].forEach(([dx, dy]) => {
    g.fillStyle = pat(front); g.fillRect(dx, dy, dw, dh);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.5; g.strokeRect(dx, dy, dw, dh);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(dx, dy, dw * 0.35, dh);
  });
  g.fillStyle = pat(front); g.fillRect(x + gap + 4, y + dh + 2 * gap + 4, w - 2 * gap - 8, 50); g.strokeRect(x + gap + 4, y + dh + 2 * gap + 4, w - 2 * gap - 8, 50);
  g.fillStyle = '#1c1d1f';
  g.fillRect(x + w / 2 - 14, y + 60, 4, 70); g.fillRect(x + w / 2 + 10, y + 60, 4, 70);
  g.fillRect(x + w / 2 - 36, y + dh + 2 * gap + 22, 72, 5);
}

function renderCompare(first) {
  const [a, b] = cmp; const A = MATERIALS[a]; const B = MATERIALS[b]; const xa = META[a]; const xb = META[b];
  $$('[data-pick]', cmpRoot).forEach((sel, i) => { sel.value = cmp[i]; });
  [0, 1].forEach((i) => {
    const c = $(`[data-cmp-canvas="${i}"]`, cmpRoot); paint(c, cmp[i]);
    $(`[data-cmp-name="${i}"]`, cmpRoot).textContent = `${i ? 'B' : 'A'} · ${MATERIALS[cmp[i]].label}`;
    c.setAttribute('aria-label', `Sample of ${MATERIALS[cmp[i]].label}`);
    if (!first && !reduced) c.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
  });
  const rowBar = (va, vb) => {
    const bw = (v, o) => `<div class="mt-cbar${v > o ? ' is-best' : ''}"><i style="--v:${v / 5}"><b></b></i><span>${v}/5${v > o ? ' <em>better</em>' : ''}</span></div>`;
    return [bw(va, vb), bw(vb, va)];
  };
  const cell = (v, better) => `<div class="mt-cell${better ? ' is-best' : ''}">${v}</div>`;
  const rows = [
    ['Kind', cell(KIND_LABEL[A.kind]), cell(KIND_LABEL[B.kind])],
    ['Board price', cell(`${euro(A.pricePerM2)} / m²${A.pricePerM2 < B.pricePerM2 ? ' <em>lower</em>' : ''}`, A.pricePerM2 < B.pricePerM2), cell(`${euro(B.pricePerM2)} / m²${B.pricePerM2 < A.pricePerM2 ? ' <em>lower</em>' : ''}`, B.pricePerM2 < A.pricePerM2)],
    ['Fronts for a 200 × 240 cm wardrobe', cell(`about ${euro(frontCost(a))}`), cell(`about ${euro(frontCost(b))}`)],
    ['Durability', ...rowBar(xa.dur, xb.dur)],
    ['Moisture resistance', ...rowBar(xa.moist, xb.moist)],
    ['Easy to repair', ...rowBar(xa.repair, xb.repair)],
    ['Made from', cell(xa.make), cell(xb.make)],
    ['Best for', cell(xa.used.join(', ')), cell(xb.used.join(', '))]
  ];
  const table = $('[data-table]', cmpRoot);
  table.innerHTML = `<div class="mt-row mt-row--head"><span></span><strong>A · ${A.label}</strong><strong>B · ${B.label}</strong></div>` + rows.map((r) => `<div class="mt-row"><span class="mt-row__l">${r[0]}</span>${r[1]}${r[2]}</div>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => table.classList.add('is-on')));
  table.classList.remove('is-on'); void table.offsetWidth; requestAnimationFrame(() => table.classList.add('is-on'));
  drawCombo(a, b);
  $('[data-combo-text]', cmpRoot).textContent = `Fronts in ${A.label.toLowerCase()}, carcass in ${B.label.toLowerCase()}. The fronts for a 200 × 240 cm wardrobe come to about ${euro(frontCost(a))}; in ${B.label.toLowerCase()} they would be about ${euro(frontCost(b))}.`;
}

/* ------------------------------------------------------------------ hardware */
const HW = (P) => {
  const p = P || { hingePair: 18, drawerRunner: 46, slidingTrack: 140, handle: { bar: 14, knob: 9, push: 22, groove: 0 }, ledPerMetre: 38, rail: 24 };
  return [
    { id: 'hinge', t: 'Concealed hinges', s: 'Soft-close, 110° opening', d: 'Hidden inside the door, with three-way adjustment so every gap can be set to an even 3 mm.', price: `${euro(p.hingePair)} per pair`,
      svg: '<svg viewBox="0 0 200 140" aria-hidden="true"><rect x="20" y="20" width="10" height="100" class="hw-fill"/><path d="M30 70 A 60 60 0 0 1 90 10" class="hw-arc"/><g class="hw-door" style="transform-origin:30px 70px"><rect x="30" y="64" width="86" height="8" rx="2" class="hw-ink"/><circle cx="30" cy="70" r="6" class="hw-pin"/></g></svg>' },
    { id: 'runner', t: 'Soft-close runners', s: 'Full extension, 40 kg load', d: 'Steel runners that let the drawer pull out completely and close itself the last few centimetres.', price: `${euro(p.drawerRunner)} per drawer`,
      svg: '<svg viewBox="0 0 200 140" aria-hidden="true"><rect x="24" y="30" width="110" height="84" rx="3" class="hw-line"/><g class="hw-drawer"><rect x="40" y="62" width="100" height="40" rx="3" class="hw-fill"/><rect x="36" y="58" width="108" height="8" rx="2" class="hw-ink"/><path d="M44 80 H136" class="hw-line"/></g></svg>' },
    { id: 'track', t: 'Sliding track', s: 'Floor-guided, top-hung', d: 'Doors glide on a concealed track and stop with a damped catch. Useful where a swinging door has no room.', price: `${euro(p.slidingTrack)} per metre`,
      svg: '<svg viewBox="0 0 200 140" aria-hidden="true"><path d="M20 22 H180 M20 118 H180" class="hw-line"/><rect class="hw-p2 hw-fill" x="100" y="26" width="76" height="88"/><g class="hw-p1"><rect x="24" y="30" width="76" height="80" class="hw-ink hw-panel"/></g></svg>' },
    { id: 'handle', t: 'Handles', s: 'Four styles', d: 'Choose how the front opens. The groove costs nothing, because it is cut into the door itself.', price: null, handles: p.handle },
    { id: 'led', t: 'LED strips', s: 'Warm 2,700 K, dimmable', d: 'Recessed in a routed channel so you see the light but never the strip. Switches on when a door opens.', price: `${euro(p.ledPerMetre)} per metre`,
      svg: '<svg viewBox="0 0 200 140" aria-hidden="true"><defs><linearGradient id="hwg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><rect x="24" y="24" width="152" height="92" class="hw-line"/><polygon class="hw-cone" points="40,34 160,34 188,116 12,116" fill="url(#hwg)"/><rect x="40" y="30" width="120" height="5" rx="2.5" class="hw-led"/></svg>' },
    { id: 'rail', t: 'Hanging rails', s: 'Oval steel, 25 kg per metre', d: 'Rails sit at the height that suits your longest garment, with a pull-down option for high wardrobes.', price: `${euro(p.rail)} per rail`,
      svg: '<svg viewBox="0 0 200 140" aria-hidden="true"><path d="M20 30 H180" class="hw-rail"/><g class="hw-hang h1"><path d="M60 30 V38 L45 56 H75 Z M45 56 V112 H75 V56" class="hw-line"/></g><g class="hw-hang h2"><path d="M100 30 V38 L85 56 H115 Z M85 56 V100 H115 V56" class="hw-fill hw-ink2"/></g><g class="hw-hang h3"><path d="M140 30 V38 L125 56 H155 Z M125 56 V116 H155 V56" class="hw-line"/></g></svg>' }
  ];
};
const handleSvg = {
  bar: '<svg viewBox="0 0 200 140" aria-hidden="true"><rect x="40" y="20" width="120" height="100" rx="4" class="hw-fill"/><rect x="146" y="40" width="7" height="60" rx="3.5" class="hw-ink"/><path d="M146 48 H136 M146 92 H136" class="hw-line"/></svg>',
  knob: '<svg viewBox="0 0 200 140" aria-hidden="true"><rect x="40" y="20" width="120" height="100" rx="4" class="hw-fill"/><circle cx="140" cy="70" r="10" class="hw-ink"/><circle cx="137" cy="67" r="3" fill="var(--paper)" opacity=".5"/></svg>',
  push: '<svg viewBox="0 0 200 140" aria-hidden="true"><rect x="40" y="20" width="120" height="100" rx="4" class="hw-fill"/><path d="M40 70 H160" class="hw-line" stroke-dasharray="3 5"/><path d="M100 54 l10 16 -10 16" class="hw-arc2"/></svg>',
  groove: '<svg viewBox="0 0 200 140" aria-hidden="true"><rect x="40" y="20" width="120" height="100" rx="4" class="hw-fill"/><rect x="150" y="38" width="5" height="64" rx="2.5" fill="var(--ink)" opacity=".75"/></svg>'
};
const handleName = { bar: 'Bar', knob: 'Knob', push: 'Push-to-open', groove: 'Groove' };

async function buildHardware() {
  const root = $('[data-hw]');
  let P = null;
  try { P = (await import('./configurator/pricing.js')).PRICES; } catch (err) { /* static fallback prices */ }
  root.innerHTML = HW(P).map((h) => {
    if (h.id === 'handle') {
      const keys = Object.keys(h.handles);
      return `<article class="mt-hwcard" data-hwcard="handle">
        <div class="mt-hwcard__art" data-handle-art>${handleSvg.bar}</div>
        <h3>${h.t}</h3><p class="mt-hwcard__s">${h.s}</p><p>${h.d}</p>
        <div class="mt-hwcard__tabs" role="group" aria-label="Handle style">${keys.map((k, i) => `<button type="button" aria-pressed="${i === 0}" data-handle="${k}">${handleName[k]}</button>`).join('')}</div>
        <p class="mt-hwcard__price" data-handle-price>${h.handles.bar ? euro(h.handles.bar) : 'Free'} each</p>
      </article>`;
    }
    return `<article class="mt-hwcard" data-hwcard="${h.id}"><div class="mt-hwcard__art">${h.svg}</div><h3>${h.t}</h3><p class="mt-hwcard__s">${h.s}</p><p>${h.d}</p><p class="mt-hwcard__price">${h.price}</p></article>`;
  }).join('');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-handle]'); if (!b) return;
    const card = b.closest('.mt-hwcard'); const k = b.dataset.handle;
    $$('[data-handle]', card).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const art = $('[data-handle-art]', card); art.innerHTML = handleSvg[k];
    if (!reduced) art.animate([{ opacity: 0, transform: 'translateY(8px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.16,1,.3,1)' });
    const price = P ? P.handle[k] : { bar: 14, knob: 9, push: 22, groove: 0 }[k];
    $('[data-handle-price]', card).textContent = price ? `${euro(price)} each` : 'Free, cut into the door';
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((en) => en.target.classList.toggle('is-live', en.isIntersecting)), { threshold: 0.3 });
    $$('.mt-hwcard', root).forEach((c) => io.observe(c));
  }
  $$('.mt-hwcard', root).forEach((c, i) => { c.style.setProperty('--i', i); });
  if (window.site && window.site.scan) window.site.scan(root);
  if ('IntersectionObserver' in window && !reduced) {
    const io2 = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io2.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
    $$('.mt-hwcard', root).forEach((c) => io2.observe(c));
  } else $$('.mt-hwcard', root).forEach((c) => c.classList.add('is-in'));
}

/* ------------------------------------------------------------------ boot */
buildKinds();
buildGrid();
bindGrid();
buildCompare();
buildHardware();
if (window.site && window.site.refresh) { window.site.refresh(); window.addEventListener('load', () => window.site.refresh()); }
