// Materials page: "What we offer". The catalogue is built from the planner's one material table, so the page can
// never show a finish the studio does not stock. Photos live in assets/materials/ (credits in credits.html).
import { LIBRARY, materialsFor } from './planner/materials.js';

const $ = (s, r = document) => r.querySelector(s);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const eur = (n) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;

// Sections, in page order. `ids` come from the table; nothing is listed that the table does not offer.
const SECTIONS = [
  { key: 'paint', title: 'Paint colours', lead: 'Matt lacquer on the fronts, mixed to the colour on the card.', ids: () => materialsFor().filter((id) => LIBRARY[id].family === 'painted'), unit: 'front' },
  { key: 'veneer', title: 'Wood veneers', lead: 'Real wood veneer, hard-wax oiled.', ids: () => materialsFor().filter((id) => LIBRARY[id].family === 'wood'), unit: 'front' },
  { key: 'ply', title: 'Plywood', lead: 'Birch plywood with the layers left showing on the edges.', ids: () => materialsFor().filter((id) => LIBRARY[id].family === 'ply'), unit: 'front' },
  { key: 'laminate', title: 'Laminate', lead: 'Supermatte and fingerprint-resistant, for fronts.', ids: () => materialsFor().filter((id) => LIBRARY[id].family === 'laminate'), unit: 'front' },
  { key: 'glass', title: 'Glass', lead: 'For door inserts.', ids: () => materialsFor('glass'), unit: 'glass' },
  { key: 'worktops', title: 'Worktops', lead: 'For desks, kitchen runs and window seats. Solid oak is the oak above.', ids: () => materialsFor('top'), unit: 'top' },
  { key: 'handles', title: 'Handle finishes', lead: 'Priced as a step on the handle itself.', ids: () => materialsFor('handle'), unit: 'handle' }
];

// What each photo shows, for the alt text.
const ALT = {
  'chalk-white': 'Chalk white matt paint, shown as a tinted plaster texture',
  'pebble-grey': 'Pebble grey matt paint, shown as a tinted plaster texture',
  sand: 'Sand matt paint, shown as a tinted plaster texture',
  sage: 'Sage green-grey matt paint, shown as a tinted plaster texture',
  'dark-green': 'Dark green matt paint, shown as a tinted plaster texture',
  'ink-blue': 'Ink blue matt paint, shown as a tinted plaster texture',
  clay: 'Clay terracotta matt paint, shown as a tinted plaster texture',
  black: 'Soft black matt paint, shown as a tinted plaster texture',
  oak: 'Close-up of natural oak planks with an open grain',
  'oak-smoked': 'Smoked oak, dark brown with the grain still visible',
  walnut: 'Close-up of dark walnut grain',
  ash: 'Close-up of pale, straight-grained ash',
  'birch-ply': 'Pale birch plywood sheets with layered edges',
  'laminate-black': 'Black supermatte laminate surface',
  'laminate-grey': 'Light grey supermatte laminate surface',
  'quartz-white': 'White quartz with soft grey veining',
  'stone-black': 'Honed black stone with a fine light vein',
  'laminate-worktop': 'Matt grey laminate worktop surface',
  'glass-clear': 'Clear glass cabinet door with a black frame and oak shelves behind',
  'glass-smoked': 'Grey-tinted glass cabinet door, vases visible behind',
  brass: 'Brushed brass cabinet pulls',
  'handle-black': 'Matte black round bar handle on a white wall',
  brushed: 'Brushed steel surface catching the light',
  wood: 'Oak grain, the wood used for turned oak handles'
};

// Where a photo is not a literal sample, say so.
const NOTE = {
  paint: 'One plaster photo tinted to each paint colour, so the texture is shown, not the exact shade. Ask for a painted sample board.',
  'oak-smoked': 'The oak photo graded to a smoked brown. A real smoked-oak sample comes with the sample box.',
  laminate: 'A matt stand-in surface. The real laminate sample comes with the sample box.',
  'laminate-worktop': 'A matt stand-in surface. The real laminate sample comes with the sample box.',
  wood: 'An oak grain scan standing in for the turned handle.',
  'handle-black': 'A plain matt black bar, the closest photo to the handle.',
  'birch-ply': 'Shows the layered edge of birch plies. Surfaces are oiled.'
};

const CREDITS = {
  "chalk-white": { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  "pebble-grey": { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  sand: { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  sage: { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  "dark-green": { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  "ink-blue": { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  clay: { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  black: { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  "paint-base": { title: "White plaster wall texture", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8", source: "unsplash" },
  oak: { title: "Light oak wood plank texture background", author: "simon", authorUrl: "https://unsplash.com/@simon_berger", url: "https://unsplash.com/photos/light-oak-wood-plank-texture-background-JH_R66BihvA", source: "unsplash" },
  "oak-smoked": { title: "Light oak wood plank texture background", author: "simon", authorUrl: "https://unsplash.com/@simon_berger", url: "https://unsplash.com/photos/light-oak-wood-plank-texture-background-JH_R66BihvA", source: "unsplash" },
  walnut: { title: "Close-up of dark wood grain", author: "The Cleveland Museum of Art", authorUrl: "https://unsplash.com/@clevelandart", url: "https://unsplash.com/photos/KKKHaEA4coc", source: "unsplash" },
  ash: { title: "Light brown wood grain texture background", author: "Compagnons", authorUrl: "https://unsplash.com/@sigmund", url: "https://unsplash.com/photos/light-brown-wood-grain-texture-background-2ZX2HqdxcC8", source: "unsplash" },
  "birch-ply": { title: "A stack of wooden boards stacked on top of each other", author: "Tim Meyer", authorUrl: "https://unsplash.com/@tim_meijer", url: "https://unsplash.com/photos/a-stack-of-wooden-boards-stacked-on-top-of-each-other-NDQIHPA9Iv0", source: "unsplash" },
  "laminate-black": { title: "Dark textured plaster wall", author: "Annie Spratt", authorUrl: "https://unsplash.com/@anniespratt", url: "https://unsplash.com/photos/dark-textured-plaster-wall-6a3nqQ1YwBw", source: "unsplash" },
  "laminate-grey": { title: "Monochrome concrete wall", author: "Yan Ots", authorUrl: "https://unsplash.com/@yanots", url: "https://unsplash.com/photos/UuBR5kbvt4Y", source: "unsplash" },
  "quartz-white": { title: "A close up of a white marble surface", author: "Augustine Wong", authorUrl: "https://unsplash.com/@augustinewong", url: "https://unsplash.com/photos/a-close-up-of-a-white-marble-surface-li0iC0rjvvg", source: "unsplash" },
  "stone-black": { title: "A close up of a black marble surface", author: "Kanishk Jain", authorUrl: "https://unsplash.com/@kanishkjain_123", url: "https://unsplash.com/photos/OQDOskPJEMY", source: "unsplash" },
  "laminate-worktop": { title: "Close-up of gray concrete", author: "Annie Spratt", authorUrl: "https://unsplash.com/@anniespratt", url: "https://unsplash.com/photos/ctXf1GVyf9A", source: "unsplash" },
  "glass-clear": { title: "Arched black cabinet with glass doors", author: "Franco Debartolo", authorUrl: "https://unsplash.com/@francotheshooter", url: "https://unsplash.com/photos/POcDzpLZnB8", source: "unsplash" },
  "glass-smoked": { title: "Black glass cabinet displaying decorative vases and artwork", author: "Franco Debartolo", authorUrl: "https://unsplash.com/@francotheshooter", url: "https://unsplash.com/photos/ZdPylmn6gBc", source: "unsplash" },
  brass: { title: "A close up of a metal object on a table", author: "Zain Khan", authorUrl: "https://unsplash.com/@aabedeen51", url: "https://unsplash.com/photos/a-close-up-of-a-metal-object-on-a-table-OO_2w0sJD3A", source: "unsplash" },
  "handle-black": { title: "Black handrail casting a shadow on a white wall", author: "Alexander Van Steenberge", authorUrl: "https://unsplash.com/@lexerium", url: "https://unsplash.com/photos/9vKF96cs7KU", source: "unsplash" },
  brushed: { title: "Brushed metal surface with light reflection", author: "apryan widodo", authorUrl: "https://unsplash.com/@apryan_cahyo", url: "https://unsplash.com/photos/brushed-metal-surface-with-light-reflection-tRrIXmtOmL4", source: "unsplash" },
  wood: { title: "Oak Wood Planks", author: "Poly Haven", authorUrl: "https://polyhaven.com", url: "https://polyhaven.com/a/oak_wood_planks", source: "polyhaven" },
};
const creditFor = (id) => CREDITS[id];
const noteFor = (id, def) => NOTE[id] || (def.family === 'painted' ? NOTE.paint : def.family === 'laminate' ? NOTE.laminate : '');

// Plain-words price. Same numbers as the planner's table.
function priceOf(id, unit) {
  const m = LIBRARY[id];
  if (unit === 'handle') {
    const pct = Math.round((m.factor - 1) * 100);
    return { main: pct === 0 ? 'Standard handle price' : `+${pct}% on the handle price`, tier: pct === 0 ? '€' : pct < 50 ? '€' : '€€' };
  }
  const p = m.pricePerM2;
  const tier = p < 100 ? '€' : p < 160 ? '€€' : p < 300 ? '€€€' : '€€€€';
  const what = unit === 'glass' ? 'of glass' : unit === 'top' ? 'of worktop' : 'of front';
  return { main: `${eur(p)} per m² ${what}`, tier };
}
const boardPrice = (id) => {
  const m = LIBRARY[id];
  return m.uses.includes('carcass') ? m.boardPricePerM2 ?? m.pricePerM2 : null;
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const root = $('[data-catalogue]');
const jump = $('[data-jump]');
const dlg = $('[data-dialog]');
const live = $('[data-live]');
const cards = new Map();

function build() {
  let n = 0;
  for (const s of SECTIONS) {
    const ids = s.ids().filter((id) => LIBRARY[id] && creditFor(id));
    if (!ids.length) continue;
    const sec = el('section', 'mt-sec');
    sec.id = s.key;
    sec.setAttribute('aria-labelledby', `h-${s.key}`);
    const head = el('div', 'mt-sec__head');
    const h = el('h2', 'mt-sec__title', s.title);
    h.id = `h-${s.key}`;
    head.append(h, el('p', 'mt-sec__lead', s.lead));
    const ul = el('ul', 'mt-grid');
    ul.setAttribute('role', 'list');
    for (const id of ids) {
      const m = LIBRARY[id];
      const pr = priceOf(id, s.unit);
      const li = el('li', 'mt-card');
      li.style.setProperty('--i', n++);
      const b = el('button', 'mt-card__btn');
      b.type = 'button';
      b.dataset.id = id;
      b.dataset.unit = s.unit;
      b.dataset.section = s.title;
      const fig = el('span', 'mt-card__ph');
      const img = new Image();
      img.src = `assets/materials/${id}.webp`;
      img.width = 600; img.height = 600;
      img.loading = 'lazy'; img.decoding = 'async';
      img.alt = ALT[id] || m.label;
      fig.append(img);
      const meta = el('span', 'mt-card__meta');
      meta.append(el('strong', '', m.label), el('span', 'mt-card__note', m.note || ''));
      const price = el('span', 'mt-card__price');
      price.append(el('i', 'mt-tier', pr.tier), document.createTextNode(` ${pr.main}`));
      b.append(fig, meta, price);
      b.setAttribute('aria-haspopup', 'dialog');
      li.append(b);
      ul.append(li);
      cards.set(id, li);
    }
    sec.append(head, ul);
    root.append(sec);
    if (jump) {
      const a = el('a', 'mt-chip', s.title);
      a.href = `#${s.key}`;
      jump.append(a);
    }
  }
}

/* ---------- reveal ---------- */
function reveal() {
  const all = [...cards.values()];
  if (reduced || !('IntersectionObserver' in window)) { all.forEach((c) => c.classList.add('is-in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  all.forEach((c) => io.observe(c));
  setTimeout(() => all.forEach((c) => c.classList.add('is-in')), 4000);
}

/* ---------- lightbox ---------- */
let opener = null;
function open(btn) {
  const id = btn.dataset.id;
  const m = LIBRARY[id];
  const unit = btn.dataset.unit;
  const pr = priceOf(id, unit);
  const c = creditFor(id);
  const img = $('[data-dlg-img]', dlg);
  img.src = `assets/materials/${id}.webp`;
  img.alt = ALT[id] || m.label;
  $('[data-dlg-kind]', dlg).textContent = btn.dataset.section;
  $('[data-dlg-title]', dlg).textContent = m.label;
  $('[data-dlg-note]', dlg).textContent = m.note || '';
  $('[data-dlg-tier]', dlg).textContent = pr.tier;
  const bp = boardPrice(id);
  $('[data-dlg-price]', dlg).textContent = pr.main + (bp != null && unit === 'front' ? `. As the box itself (sides, shelves): ${eur(bp)} per m².` : '.');
  const pn = $('[data-dlg-photo]', dlg);
  pn.textContent = noteFor(id, m);
  pn.hidden = !pn.textContent;
  const cr = $('[data-dlg-credit]', dlg);
  cr.textContent = '';
  const a = el('a', '', c.author); a.href = c.authorUrl; a.rel = 'noopener';
  const w = el('a', '', c.source === 'polyhaven' ? 'Poly Haven' : 'Unsplash'); w.href = c.source === 'polyhaven' ? 'https://polyhaven.com' : 'https://unsplash.com'; w.rel = 'noopener';
  const lic = el('a', '', c.source === 'polyhaven' ? 'CC0' : 'Unsplash License');
  lic.href = c.source === 'polyhaven' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://unsplash.com/license'; lic.rel = 'noopener';
  const t = el('a', '', c.title); t.href = c.url; t.rel = 'noopener';
  cr.append('Photo ', t, ' by ', a, ' on ', w, ', ', lic, '. ');
  const more = el('a', '', 'All credits'); more.href = 'credits.html';
  cr.append(more);
  opener = btn;
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  requestAnimationFrame(() => dlg.classList.add('is-open'));
  if (live) live.textContent = `${m.label} opened`;
}
function close() {
  dlg.classList.remove('is-open');
  const done = () => { if (dlg.open) dlg.close(); if (opener) opener.focus(); };
  if (reduced) done(); else setTimeout(done, 280);
}

function init() {
  if (!root) return;
  build();
  reveal();
  root.addEventListener('click', (e) => { const b = e.target.closest('.mt-card__btn'); if (b) open(b); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
  const lone = $('[data-nojs]');
  if (lone) lone.hidden = true;
}
init();
