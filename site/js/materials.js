// Materials page: tilting sample boards with canvas-generated textures, a detail dialog, and a two-material compare tool.
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
  oak: { used: ['Wardrobe and kitchen fronts', 'Tables, desks and benches', 'Window-seat tops'], dur: 4, moist: 3, repair: 5, make: 'Solid European oak, 19 mm, Janka hardness about 1,360 lbf', tone: 'Warm, honey-coloured, with an open grain.', finish: 'Hard-wax oil or matt water-based lacquer', care: 'Wipe with a damp cloth; re-oil every few years', kind: 'Solid wood' },
  walnut: { used: ['Desk tops and fronts', 'Dining tables', 'Statement doors'], dur: 3, moist: 3, repair: 5, make: 'Solid walnut, 19 mm, Janka hardness about 1,010 lbf', tone: 'Dark brown with a fairly even grain.', finish: 'Hard-wax oil, which deepens the colour', care: 'Keep out of strong sun to avoid fading; re-oil yearly at first', kind: 'Solid wood' },
  ash: { used: ['Shelving and wall units', 'Window seats', 'Light, modern fronts'], dur: 4, moist: 2, repair: 5, make: 'Solid European ash, 19 mm, Janka hardness about 1,320 lbf', tone: 'Pale, with a strong straight grain.', finish: 'Clear matt lacquer or white-pigmented oil', care: 'Wipe clean; avoid standing water', kind: 'Solid wood' },
  'birch-ply': { used: ['Carcasses and shelves', 'Drawer boxes', 'Exposed-edge desks'], dur: 4, moist: 3, repair: 3, make: 'Cross-laminated birch plywood, 18 mm, void-free core', tone: 'Pale, with a layered edge that we leave visible.', finish: 'Clear matt lacquer or natural oil', care: 'Wipe clean; seal cut edges near water', kind: 'Plywood' },
  'lacquer-white': { used: ['Kitchen and hall fronts', 'Tall cabinets', 'Painted shelving'], dur: 3, moist: 4, repair: 2, make: 'Birch plywood or MDF sprayed in three coats of water-based lacquer', tone: 'A warm white.', finish: 'Satin, sprayed and cured in the workshop', care: 'Mild soap and a soft cloth; touch-up kit supplied', kind: 'Lacquer' },
  'lacquer-sage': { used: ['Kitchen bases and islands', 'Wall units', 'Window seats'], dur: 3, moist: 4, repair: 2, make: 'Birch plywood or MDF sprayed in three coats of water-based lacquer', tone: 'A muted grey-green that goes well with oak.', finish: 'Satin, sprayed and cured in the workshop', care: 'Mild soap and a soft cloth; touch-up kit supplied', kind: 'Lacquer' },
  'lacquer-charcoal': { used: ['Kitchen islands', 'Feature walls', 'Studies'], dur: 3, moist: 4, repair: 2, make: 'Birch plywood or MDF sprayed in three coats of water-based lacquer', tone: 'A soft blue-black.', finish: 'Satin, sprayed and cured in the workshop', care: 'Dark finishes show dust and marks; wipe often with a soft cloth', kind: 'Lacquer' },
  'lacquer-clay': { used: ['Wardrobes and dressing rooms', 'Alcoves', 'Accent doors'], dur: 3, moist: 4, repair: 2, make: 'Birch plywood or MDF sprayed in three coats of water-based lacquer', tone: 'A warm terracotta.', finish: 'Satin, sprayed and cured in the workshop', care: 'Mild soap and a soft cloth; touch-up kit supplied', kind: 'Lacquer' },
  terrazzo: { used: ['Kitchen worktops and islands', 'Desk tops', 'Bench tops'], dur: 5, moist: 5, repair: 1, make: 'Cement matrix with marble chips, 30 mm, sealed', tone: 'Speckled grey with coloured chips.', finish: 'Honed and sealed', care: 'Reseal once a year; wipe up acids and oils quickly', kind: 'Stone' }
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
  $('[data-dlg-kind]', dlg).textContent = KIND_LABEL[m.kind];
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
  const use = $('[data-dlg-use]', dlg); use.href = 'planner.html';
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
      return `planner.html#design=${S.encodeDesign(d)}`;
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
  renderCompare(true);
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
}

/* ------------------------------------------------------------------ boot */
buildKinds();
buildGrid();
bindGrid();
buildCompare();
if (window.site && window.site.refresh) { window.site.refresh(); window.addEventListener('load', () => window.site.refresh()); }
