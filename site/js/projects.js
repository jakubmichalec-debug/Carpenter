// Projects page: masonry grid, FLIP filter animation, lightbox with prev/next, swipe, keyboard and Esc.
// Four projects are configurator presets ("Open in configurator").

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const EASE = 'cubic-bezier(.16, 1, .3, 1)';
const lenis = () => (window.site && window.site.lenis) || null;

const data = JSON.parse($('#pj-data').textContent);
const wrap = $('.pj-gridwrap');
const stash = $('[data-stash]');
const grid = $('[data-grid]');
const status = $('[data-status]');
const filtersEl = $('[data-filters]');
const listEl = $('[data-list]');
const viewBtns = $$('.pj-view__b');
let view = 'grid';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pill = $('.pj-filters__pill');
const items = data.map((p) => stash.querySelector(`[data-id="${p.id}"]`));

let filter = 'all';
let cols = 0;
let busy = false;

/* ------------------------------------------------------------------ masonry */
const colCount = () => {
  const w = grid.clientWidth || wrap.clientWidth;
  return w >= 980 ? 3 : w >= 600 ? 2 : 1;
};
const matches = (p) => filter === 'all' || p.cat === filter;
const visibleIdx = () => data.map((p, i) => i).filter((i) => matches(data[i]));

function distribute() {
  cols = Math.min(colCount(), Math.max(1, visibleIdx().length));
  grid.textContent = '';
  const colEls = Array.from({ length: cols }, () => {
    const ul = document.createElement('ul');
    ul.className = 'pj-col';
    ul.setAttribute('role', 'list');
    grid.appendChild(ul);
    return ul;
  });
  const gap = parseFloat(getComputedStyle(colEls[0]).rowGap) || 24;
  const colW = (grid.clientWidth - (cols - 1) * 24) / cols;
  const capH = 76 + gap; // caption plus gap under each card
  const vis = data.map((p, i) => i).filter((i) => matches(data[i]));
  data.forEach((p, i) => { if (!matches(p)) { items[i].hidden = true; stash.appendChild(items[i]); } });
  // greedy shortest-column placement, then a few swap/move passes to even out the columns
  const hOf = (i) => colW * data[i].ratio + capH;
  let assign = vis.map(() => 0); const heights = Array(cols).fill(0);
  vis.forEach((i, n) => { let k = 0; heights.forEach((h, j) => { if (h < heights[k] - 1) k = j; }); assign[n] = k; heights[k] += hOf(i); });
  const spread = (a) => { const hs = Array(cols).fill(0); a.forEach((k, n) => { hs[k] += hOf(vis[n]); }); return Math.max(...hs) - Math.min(...hs); };
  for (let pass = 0; pass < 3; pass++) {
    vis.forEach((_, n) => {
      for (let k = 0; k < cols; k++) {
        if (k === assign[n]) continue;
        const t = assign.slice(); t[n] = k;
        if (spread(t) < spread(assign) - 1) assign = t;
      }
    });
  }
  const colItems = Array.from({ length: cols }, () => []); const colH = Array(cols).fill(0);
  vis.forEach((i, n) => { colItems[assign[n]].push(i); colH[assign[n]] += hOf(i); items[i].hidden = false; });
  // stretch the image crop a little in shorter columns so every column ends on the same line
  const target = Math.max(...colH);
  const singles = colItems.every((l) => l.length === 1) && cols > 1;
  const meanRatio = singles ? vis.reduce((s, i) => s + data[i].ratio, 0) / vis.length : 0;
  colItems.forEach((list, k) => {
    if (singles) { list.forEach((i) => $('.pj-card__media', items[i]).style.setProperty('--ratio', meanRatio.toFixed(4))); list.forEach((i) => colEls[k].appendChild(items[i])); return; }
    list.forEach((i) => { $('.pj-card__media', items[i]).style.setProperty('--ratio', data[i].ratio.toFixed(4)); });
    const imgH = colH[k] - list.length * capH; const extra = target - colH[k];
    if (list.length && extra > 1 && extra / imgH < 0.45) {
      list.forEach((i) => { const h = colW * data[i].ratio; $('.pj-card__media', items[i]).style.setProperty('--ratio', (data[i].ratio * (1 + extra / imgH)).toFixed(4)); });
    }
    list.forEach((i) => colEls[k].appendChild(items[i]));
  });
  $('[data-empty]').hidden = visibleIdx().length > 0;
}

/* ------------------------------------------------------------------ list view: rows with a cursor-following preview */
function renderList() {
  listEl.innerHTML = visibleIdx().map((i, n) => {
    const p = data[i];
    const cap = `${p.materials.split(',').slice(0, 2).join(',')} \u00b7 ${p.room.split(',').pop().trim()}`;
    return `<li><a class="pj-row" href="#p-${p.id}" data-project="${i}" data-peek-src="${esc(p.thumb)}" data-peek-label="${esc(cap)}"><span class="pj-row__n">${String(i + 1).padStart(2, '0')}</span><span class="pj-row__t">${esc(p.title)}</span><span class="pj-row__m">${esc(p.materials)}</span><span class="pj-row__r">${esc(p.room.split(',').pop().trim())}</span><span class="pj-row__a" aria-hidden="true">\u2197</span></a></li>`;
  }).join('');
}
function setView(next) {
  if (next === view) return;
  view = next;
  viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === next)));
  wrap.classList.toggle('is-list', next === 'list');
  grid.hidden = next === 'list'; listEl.hidden = next !== 'list';
  if (next === 'list') renderList(); else { distribute(); items.forEach((li) => { if (!li.hidden) li.classList.add('is-in'); }); }
  if (window.site && window.site.refresh) window.site.refresh();
}
viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

function updateStatus() {
  const n = visibleIdx().length;
  status.textContent = filter === 'all' ? `Showing all ${data.length} projects` : `Showing ${n} of ${data.length} projects`;
}

function movePill() {
  const active = $('.pj-filter[aria-pressed="true"]', filtersEl);
  if (!active || !pill) return;
  pill.style.setProperty('--x', `${active.offsetLeft}px`);
  pill.style.setProperty('--w', `${active.offsetWidth}px`);
}

/* ------------------------------------------------------------------ FLIP filtering */
async function setFilter(next) {
  if (next === filter) return;
  $$('.pj-filter', filtersEl).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === next)));
  // finish anything still running so measurements are honest
  items.forEach((li) => li.getAnimations().forEach((a) => a.finish()));
  grid.getAnimations().forEach((a) => a.finish());
  const prevVisible = new Set(visibleIdx());
  filter = next;
  movePill();
  updateStatus();
  if (view === 'list') { renderList(); return; }
  if (reduced) { distribute(); items.forEach((li, i) => { if (!li.hidden) li.classList.add('is-in'); }); return; }
  busy = true;
  const stay = []; const leave = []; const enter = [];
  data.forEach((p, i) => {
    if (prevVisible.has(i) && matches(p)) stay.push(i);
    else if (prevVisible.has(i)) leave.push(i);
    else if (matches(p)) enter.push(i);
  });
  // 1. leaving cards fade out
  if (leave.length) {
    await Promise.all(leave.map((i) => items[i].animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.94)' }],
      { duration: 240, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {})));
  }
  // 2. First: where the staying cards are now
  const first = new Map(stay.map((i) => [i, items[i].getBoundingClientRect()]));
  const h0 = grid.offsetHeight;
  leave.forEach((i) => items[i].getAnimations().forEach((a) => a.cancel()));
  // 3. re-layout, then Last, Invert, Play
  distribute();
  items.forEach((li, i) => { if (!li.hidden) li.classList.add('is-in'); });
  const h1 = grid.offsetHeight;
  stay.forEach((i) => {
    const a = first.get(i); const b = items[i].getBoundingClientRect();
    const dx = a.left - b.left; const dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    items[i].animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 820, easing: EASE });
  });
  enter.forEach((i, n) => {
    items[i].animate(
      [{ opacity: 0, transform: 'translateY(28px) scale(.96)' }, { opacity: 1, transform: 'none' }],
      { duration: 800, delay: 40 + Math.min(n, 8) * 50, easing: EASE, fill: 'backwards' });
  });
  if (h0 !== h1) grid.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 820, easing: EASE });
  busy = false;
}

filtersEl.addEventListener('click', (e) => {
  const b = e.target.closest('.pj-filter');
  if (b) setFilter(b.dataset.filter);
});

/* ------------------------------------------------------------------ entrance on scroll */
function observeEntrance() {
  if (!('IntersectionObserver' in window)) { items.forEach((li) => li.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    const batch = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    batch.forEach((e, n) => {
      e.target.style.transitionDelay = `${n * 90}ms`;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
      setTimeout(() => { e.target.style.transitionDelay = ''; }, 1500 + n * 90);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((li) => { if (!li.classList.contains('is-in')) io.observe(li); });
}

/* ------------------------------------------------------------------ presets for the four configurator projects */
let libsPromise = null;
const loadLibs = () => libsPromise || (libsPromise = Promise.all([
  import('./configurator/model.js'), import('./configurator/share.js')
]).then(([model, share]) => ({ model, share })).catch((err) => { console.warn('Configurator modules unavailable.', err); return null; }));

const presetCache = {};
async function presetHash(key) {
  if (presetCache[key] !== undefined) return presetCache[key];
  const libs = await loadLibs();
  let out = null;
  if (libs) {
    try {
      const M = libs.model;
      const blank = (room) => { let d = M.createDesign(); d.modules.slice().forEach((m) => { d = M.removeModule(d, m.id); }); return M.updateRoom(d, room); };
      let d;
      if (key === 'wardrobe') {
        d = blank({ width: 360, height: 260, depth: 380, openings: [] });
        d = M.addModule(d, 'wardrobe', { x: 0, width: 320, height: 250, depth: 60, sections: 4, doors: 'hinged', drawers: 4, interior: 'mixed', front: 'oak', body: 'birch-ply', handle: 'bar' });
      } else if (key === 'kitchen') {
        d = blank({ width: 560, height: 260, depth: 460, openings: [{ id: 'o1', type: 'window', x: 380, y: 110, w: 140, h: 110 }] });
        d = M.addModule(d, 'tall-cabinet', { front: 'oak' });
        for (let i = 0; i < 7; i++) d = M.addModule(d, 'kitchen-base', { front: 'oak', worktop: 'terrazzo' });
        for (let i = 0; i < 4; i++) d = M.addModule(d, 'kitchen-wall', { front: 'oak' });
        d = M.addModule(d, 'island', { width: 220, depth: 95, front: 'oak', worktop: 'terrazzo' });
      } else if (key === 'window-seat') {
        d = blank({ width: 420, height: 260, depth: 380, openings: [{ id: 'o1', type: 'window', x: 90, y: 85, w: 240, h: 150 }] });
        d = M.addModule(d, 'window-seat', { x: 80, width: 260, front: 'ash', body: 'birch-ply', doors: 'hinged', drawers: 0, sections: 2 });
      } else if (key === 'desk') {
        d = blank({ width: 360, height: 260, depth: 380, openings: [{ id: 'o1', type: 'window', x: 40, y: 100, w: 150, h: 100 }] });
        d = M.addModule(d, 'desk', { x: 0, width: 220, depth: 70, sections: 2, drawers: 2, front: 'oak', worktop: null });
      }
      out = d ? libs.share.encodeDesign(d) : null;
    } catch (err) { console.warn('Preset failed', key, err); }
  }
  presetCache[key] = out;
  return out;
}

/* ------------------------------------------------------------------ lightbox */
const lb = $('[data-lb]');
const stage = $('[data-stage]', lb);
const lbImg = $('[data-lb-img]', lb);
const info = $('[data-lb-info]', lb);
const lbOpen = $('[data-lb-open]', lb);
const lbQuote = $('[data-lb-quote]', lb);
let lbList = [];
let lbPos = 0;
let lastFocus = null;
let isOpen = false;
let navToken = 0;

const cardImg = (i) => $('img', items[i]);

function fillInfo(i, swap) {
  const p = data[i];
  $('[data-lb-cat]', lb).textContent = `${String(i + 1).padStart(2, '0')} · ${p.catLabel}`;
  $('[data-lb-title]', lb).textContent = p.title;
  $('[data-lb-note]', lb).textContent = p.note;
  $('[data-lb-room]', lb).textContent = p.room;
  $('[data-lb-mat]', lb).textContent = p.materials;
  $('[data-lb-size]', lb).textContent = p.size;
  $('[data-lb-weeks]', lb).textContent = p.weeks;
  $('[data-lb-count]', lb).textContent = `${String(lbPos + 1).padStart(2, '0')} / ${String(lbList.length).padStart(2, '0')}`;
  lb.setAttribute('aria-label', `${p.title}, project details`);
  lbOpen.hidden = !p.preset;
  lbOpen.href = 'planner.html';
  lbQuote.href = 'contact.html';
  lbQuote.textContent = p.preset ? 'Get a quote for this design' : 'Discuss a project';
  $('[data-lb-timber]', lb).textContent = `${p.materials.split(',').slice(0, 2).join(',')} \u00b7 ${p.room.split(',').pop().trim()}`;
  if (p.preset) {
    presetHash(p.preset).then((h) => {
      if (!h || data[lbList[lbPos]] !== p) return;
      lbOpen.href = `planner.html#design=${h}`;
      lbQuote.href = `contact.html#design=${h}`;
    });
  }
  if (swap && !reduced) {
    $$('.eyebrow, .pj-lb__title, .pj-lb__note, .pj-lb__spec, .pj-lb__actions', info).forEach((el, n) => {
      el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: n * 50, easing: EASE, fill: 'backwards' });
    });
  }
}

function setImage(i) {
  const p = data[i];
  lbImg.alt = p.alt;
  lbImg.src = p.thumb; // already cached from the grid, so the transition never shows an empty frame
  const big = new Image();
  big.onload = () => { if (data[lbList[lbPos]] === p) lbImg.src = p.img; };
  big.src = p.img;
}

function morphRect(from) {
  const to = stage.getBoundingClientRect();
  return {
    transform: `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${from.width / to.width}, ${from.height / to.height})`
  };
}

function openLightbox(dataIdx, originLi) {
  if (isOpen) return;
  isOpen = true;
  lastFocus = document.activeElement;
  lbList = visibleIdx();
  lbPos = Math.max(0, lbList.indexOf(dataIdx));
  const l = lenis();
  if (l) l.stop(); else document.documentElement.style.overflow = 'hidden';
  fillInfo(dataIdx, false);
  setImage(dataIdx);
  lb.hidden = false;
  void lb.offsetWidth;
  lb.classList.add('is-open');
  const origin = originLi && $('img', originLi);
  if (!reduced && origin) {
    const from = origin.getBoundingClientRect();
    if (from.width && from.bottom > 0 && from.top < window.innerHeight) {
      lbImg.animate([morphRect(from), { transform: 'none' }], { duration: 850, easing: EASE });
    }
  } else if (!reduced) {
    lbImg.animate([{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: EASE });
  }
  if (!reduced) {
    $$('.eyebrow, .pj-lb__title, .pj-lb__note, .pj-lb__spec, .pj-lb__actions', info).forEach((el, n) => {
      el.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 280 + n * 70, easing: EASE, fill: 'backwards' });
    });
  }
  try { history.replaceState(null, '', `#p-${data[dataIdx].id}`); } catch (e) { /* ignore */ }
  setTimeout(() => $('[data-lb-close]', info).focus({ preventScroll: true }), 60);
}

function closeLightbox() {
  if (!isOpen) return;
  isOpen = false;
  const idx = lbList[lbPos];
  const originLi = items[idx];
  const origin = originLi && !originLi.hidden && $('img', originLi);
  const finish = () => {
    lb.hidden = true;
    lb.classList.remove('is-open');
    const l = lenis();
    if (l) l.start(); else document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
    else if (originLi) $('a', originLi).focus({ preventScroll: true });
  };
  lb.classList.remove('is-open');
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  if (reduced) { finish(); return; }
  const from = origin && origin.getBoundingClientRect();
  if (from && from.width && from.bottom > 0 && from.top < window.innerHeight) {
    const a = lbImg.animate([{ transform: 'none' }, morphRect(from)], { duration: 600, easing: EASE, fill: 'forwards' });
    a.finished.then(() => { a.cancel(); finish(); }).catch(finish);
  } else {
    setTimeout(finish, 420);
  }
}

async function go(dir, fromX = 0) {
  if (!isOpen || lbList.length < 2) return;
  const token = ++navToken;
  lbPos = (lbPos + dir + lbList.length) % lbList.length;
  const i = lbList[lbPos];
  history.replaceState && history.replaceState(null, '', `#p-${data[i].id}`);
  if (!reduced) {
    const out = lbImg.animate([{ transform: `translateX(${fromX}px)`, opacity: 1 - Math.min(0.7, Math.abs(fromX) / 500) }, { transform: `translateX(${-dir * 70}px)`, opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    await out.finished.catch(() => {});
    if (token !== navToken) return;
  }
  setImage(i);
  fillInfo(i, true);
  lbImg.getAnimations().forEach((a) => a.cancel());
  if (!reduced) lbImg.animate([{ transform: `translateX(${dir * 70}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: EASE });
  // warm up the neighbours
  [1, -1].forEach((d) => { const j = lbList[(lbPos + d + lbList.length) % lbList.length]; new Image().src = data[j].img; });
}

// Open from cards (also keyboard: they are real links)
grid.addEventListener('click', (e) => {
  const a = e.target.closest('.pj-card');
  if (!a) return;
  e.preventDefault();
  openLightbox(Number(a.dataset.project), a.closest('.pj-item'));
});
listEl.addEventListener('click', (e) => {
  const a = e.target.closest('.pj-row');
  if (!a) return;
  e.preventDefault();
  openLightbox(Number(a.dataset.project), null);
});

lb.addEventListener('click', (e) => {
  if (e.target.closest('[data-lb-close]')) closeLightbox();
  else if (e.target.closest('[data-lb-prev]')) go(-1);
  else if (e.target.closest('[data-lb-next]')) go(1);
});

document.addEventListener('keydown', (e) => {
  if (!isOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  else if (e.key === 'Tab') {
    const f = $$('button:not([hidden]), a[href]:not([hidden])', lb).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !lb.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// Swipe / drag on the image
(() => {
  let startX = 0; let startY = 0; let dx = 0; let dragging = false; let t0 = 0; let id = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragging = true; startX = e.clientX; startY = e.clientY; dx = 0; t0 = performance.now(); id = e.pointerId;
    lbImg.getAnimations().forEach((a) => a.cancel());
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== id) return;
    dx = e.clientX - startX;
    if (Math.abs(dx) > 8 && !stage.hasPointerCapture(id)) { try { stage.setPointerCapture(id); } catch (err) { /* ignore */ } }
    if (Math.abs(e.clientY - startY) > Math.abs(dx) * 1.4 && Math.abs(dx) < 12) return;
    lbImg.style.transform = `translateX(${dx * 0.9}px)`;
    lbImg.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 700));
  });
  const end = (e) => {
    if (!dragging || (e && e.pointerId !== id)) return;
    dragging = false;
    const v = dx / Math.max(1, performance.now() - t0);
    lbImg.style.transform = ''; lbImg.style.opacity = '';
    if (Math.abs(dx) > 70 || Math.abs(v) > 0.55 && Math.abs(dx) > 25) go(dx < 0 ? 1 : -1, dx * 0.9);
    else if (Math.abs(dx) > 2 && !reduced) lbImg.animate([{ transform: `translateX(${dx * 0.9}px)` }, { transform: 'none' }], { duration: 500, easing: EASE });
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
})();

/* ------------------------------------------------------------------ sticky filter bar sits under the header */
(() => {
  const bar = $('.pj-bar'); const header = $('.site-header');
  if (!bar || !header || !('MutationObserver' in window)) return;
  const sync = () => bar.style.setProperty('--bar-top', header.classList.contains('is-hidden') ? '0px' : 'var(--header-h)');
  new MutationObserver(sync).observe(header, { attributes: true, attributeFilter: ['class'] });
  sync();
})();

/* ------------------------------------------------------------------ boot */
function fromHash() {
  const m = location.hash.match(/^#p-([\w-]+)$/);
  if (!m) return;
  const i = data.findIndex((p) => p.id === m[1]);
  if (i >= 0) openLightbox(i, items[i]);
}

distribute();
wrap.classList.add('is-ready');
updateStatus();
movePill();
observeEntrance();
fromHash();
window.addEventListener('hashchange', () => { if (!isOpen) fromHash(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(movePill);

let rz = 0;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { movePill(); if (Math.min(colCount(), Math.max(1, visibleIdx().length)) !== cols && !busy && view === 'grid') { distribute(); items.forEach((li) => { if (!li.hidden) li.classList.add('is-in'); }); } if (window.site && window.site.refresh) window.site.refresh(); }, 150);
});
window.addEventListener('load', () => { movePill(); if (window.site && window.site.refresh) window.site.refresh(); });
