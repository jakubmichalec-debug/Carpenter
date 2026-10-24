/*
 * Grain & Joint shared behaviour. Loaded on every page as <script type="module" src="js/app.js">.
 *
 * Public API (also on window.site):
 *   site.lenis            Lenis instance (null until loaded, and always null under reduced motion)
 *   site.reduced          true when prefers-reduced-motion is on
 *   site.fine             true on hover-capable fine pointers
 *   site.ready            Promise that resolves when the page has finished its entrance (wipe lifted, fonts loaded). Wait on it before starting hero animations.
 *   site.refresh()        ScrollTrigger.refresh() + Lenis resize. Call after layout changes (images loaded, accordions, injected content).
 *   site.scan(root)       Initialise data-reveal / data-split / data-count / data-magnetic / data-tilt inside new DOM.
 *   site.scrollTo(t, o)   Smooth scroll to a selector, element or pixel offset (instant under reduced motion).
 *   site.navigate(href)   Go to a page with the wipe transition.
 *
 * Only this file starts Lenis; page modules must not create their own.
 */

const doc = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Entering from another page of the site through the wipe? */
let cameFromWipe = false;
try { cameFromWipe = sessionStorage.getItem('gj.wipe') === '1'; sessionStorage.removeItem('gj.wipe'); } catch (e) { /* storage blocked */ }
const entering = cameFromWipe && !reduced;
doc.classList.add('js');
if (reduced) doc.classList.add('reduced-motion');
if (entering) doc.classList.add('is-entering');

let resolveReady;
export const site = {
  lenis: null,
  reduced,
  fine,
  ready: new Promise((r) => { resolveReady = r; }),
  refresh() {
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    if (site.lenis) site.lenis.resize();
  },
  scan(root = document) { scanReveals(root); scanCounts(root); scanMagnetic(root); scanTilt(root); },
  scrollTo(target, opts = {}) {
    const offset = opts.offset ?? -(parseFloat(getComputedStyle(doc).getPropertyValue('--header-h')) || 72) - 8;
    if (site.lenis) site.lenis.scrollTo(target, { offset, duration: 1.4, ...opts });
    else {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      const y = typeof el === 'number' ? el : el ? el.getBoundingClientRect().top + window.scrollY + offset : 0;
      window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
    }
  },
  navigate(href) { go(href); },
};
window.site = site;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function boot() {
  initWipeEntrance();
  initLenis();
  initHeader();
  initMenu();
  initLinks();
  initSplitAndReveals();
  initCursor();
  initPeek();
  scanMagnetic(document);
  scanTilt(document);
  scanCounts(document);
  initMarquees();
  initOffscreenPause();
  doc.classList.add('js-ready');
  window.addEventListener('load', () => site.refresh(), { once: true });
}

/* ------------------------------------------------------------------ Lenis */
function initLenis() {
  // pages with <html data-scroll="native"> (the planner: the page itself never scrolls, only its inner lists, whose
  // wheel events Lenis would swallow) keep native scrolling and no endless rAF loop
  if (reduced || document.documentElement.dataset.scroll === 'native') return;
  import('lenis').then((mod) => {
    const Lenis = mod.default || mod.Lenis;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    site.lenis = lenis;
    const gsap = window.gsap;
    if (gsap && window.ScrollTrigger) {
      gsap.registerPlugin(window.ScrollTrigger);
      lenis.on('scroll', window.ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const loop = (t) => { lenis.raf(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    if (location.hash.length > 1) {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el) setTimeout(() => site.scrollTo(el, { immediate: true }), 60);
    }
  }).catch((err) => console.warn('Lenis failed to load, using native scroll.', err));
}

/* ------------------------------------------------------------------ Page wipe */
const wipe = $('.page-wipe');
function initWipeEntrance() {
  if (!wipe) { resolveReady(); return; }
  const fontsReady = (document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1400))]) : Promise.resolve());
  if (entering) {
    fontsReady.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => {
      wipe.classList.add('is-leaving');
      doc.classList.remove('is-entering');
      setTimeout(resolveReady, 380);
      setTimeout(() => wipe.classList.remove('is-leaving'), 1100);
    });
  } else {
    fontsReady.then(() => setTimeout(resolveReady, 60));
  }
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && wipe) { wipe.classList.remove('is-covering', 'is-leaving'); doc.classList.remove('is-entering'); if (site.lenis) site.lenis.start(); }
  });
}

let leaving = false;
function go(href) {
  if (leaving) return;
  if (reduced || !wipe) { location.href = href; return; }
  leaving = true;
  closeMenu(true);
  if (site.lenis) site.lenis.stop();
  try { sessionStorage.setItem('gj.wipe', '1'); } catch (e) { /* ignore */ }
  wipe.classList.add('is-covering');
  setTimeout(() => { location.href = href; }, 760);
  setTimeout(() => { leaving = false; }, 3000);
}

function initLinks() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    const samePath = url.pathname === location.pathname;
    if (samePath && url.hash) {
      const el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (el) { e.preventDefault(); closeMenu(); site.scrollTo(el); history.pushState(null, '', url.hash); }
      return;
    }
    if (samePath && !url.hash && url.search === location.search) { e.preventDefault(); closeMenu(); site.scrollTo(0, { offset: 0 }); return; }
    if (!(url.pathname.endsWith('.html') || url.pathname.endsWith('/'))) return;
    e.preventDefault();
    go(url.href);
  });
}

/* ------------------------------------------------------------------ Header */
let header = null;
function initHeader() {
  header = $('.site-header');
  if (!header) return;
  let lastY = window.scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const dy = y - lastY;
    header.classList.toggle('is-scrolled', y > 24);
    if (!header.classList.contains('menu-open')) {
      if (dy > 4 && y > 240) header.classList.add('is-hidden');
      else if (dy < -4 || y < 120) header.classList.remove('is-hidden');
    }
    if (Math.abs(dy) > 4) lastY = y; else if (y < 120) lastY = y;
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  update();
}

/* ------------------------------------------------------------------ Mobile menu */
let menuToggle = null;
let menu = null;
let menuHideTimer = 0;
function menuFocusables() { return menu ? [menuToggle, ...$$('a[href]', menu)] : []; }
function openMenu() {
  if (!menu || menu.classList.contains('is-open')) return;
  clearTimeout(menuHideTimer);
  menu.hidden = false;
  header.classList.remove('is-hidden');
  header.classList.add('menu-open');
  menuToggle.setAttribute('aria-expanded', 'true');
  doc.classList.add('menu-open');
  if (site.lenis) site.lenis.stop();
  void menu.offsetWidth;
  menu.classList.add('is-open');
  const first = $('a[href]', menu);
  setTimeout(() => first && first.focus({ preventScroll: true }), 120);
}
function closeMenu(skipFocus) {
  if (!menu || !menu.classList.contains('is-open')) return;
  menu.classList.remove('is-open');
  header.classList.remove('menu-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  doc.classList.remove('menu-open');
  if (site.lenis && !leaving) site.lenis.start();
  menuHideTimer = setTimeout(() => { menu.hidden = true; }, reduced ? 0 : 950);
  if (!skipFocus) menuToggle.focus({ preventScroll: true });
}
function initMenu() {
  menuToggle = $('.menu-toggle');
  menu = $('.mobile-menu');
  if (!menuToggle || !menu) return;
  menuToggle.addEventListener('click', () => (menu.classList.contains('is-open') ? closeMenu() : openMenu()));
  document.addEventListener('keydown', (e) => {
    if (!menu.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
    if (e.key === 'Tab') {
      const items = menuFocusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) closeMenu(true); });
}

/* ------------------------------------------------------------------ Split text + reveals */
function whenVisible(el, cb, start = 'top 90%') {
  const wait = () => site.ready.then(cb);
  if (window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.ScrollTrigger.create({ trigger: el, start, once: true, onEnter: wait });
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { io.disconnect(); wait(); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
  } else wait();
}

function splitEl(el) {
  if (el.classList.contains('is-split')) return;
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  el.setAttribute('aria-label', label);
  const words = [];
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        // punctuation straight after an inline element (</em>.) joins the word before it, so no gap opens up
        let text = n.textContent;
        const lead = text.match(/^\S+/);
        if (lead && n.previousSibling && n.previousSibling.nodeType === 1 && words.length) {
          words[words.length - 1].firstChild.appendChild(document.createTextNode(lead[0]));
          text = text.slice(lead[0].length);
        }
        text.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span');
          w.className = 'split-word';
          w.setAttribute('aria-hidden', 'true');
          const inner = document.createElement('span');
          inner.className = 'split-word__in';
          inner.textContent = part;
          w.appendChild(inner);
          frag.appendChild(w);
          words.push(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
  };
  walk(el);
  el._words = words;
  el.classList.add('is-split');
  layoutSplit(el);
}
function layoutSplit(el) {
  const base = parseFloat(el.dataset.splitDelay || '0');
  let line = -1; let idx = 0; let lastTop = null;
  (el._words || []).forEach((w) => {
    const top = w.offsetTop;
    if (lastTop === null || Math.abs(top - lastTop) > 6) { line += 1; idx = 0; lastTop = top; }
    w.firstChild.style.setProperty('--d', `${(base + line * 0.13 + idx * 0.05).toFixed(3)}s`);
    idx += 1;
  });
}

const seen = new WeakSet();
function scanReveals(root) {
  $$('[data-split]', root).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const run = () => {
      splitEl(el);
      if (reduced) { el.classList.add('is-in'); return; }
      whenVisible(el, () => el.classList.add('is-in'), el.dataset.splitStart || 'top 92%');
    };
    if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]).then(run); else run();
  });
  $$('[data-reveal-group]', root).forEach((group) => {
    if (seen.has(group)) return;
    seen.add(group);
    const step = parseFloat(group.dataset.revealGroup) || 0.09;
    [...group.children].forEach((child, i) => {
      if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', 'up');
      child.style.setProperty('--reveal-delay', `${(i * step).toFixed(2)}s`);
    });
  });
  $$('[data-reveal]', root).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const d = parseFloat(el.dataset.revealDelay);
    if (!Number.isNaN(d)) el.style.setProperty('--reveal-delay', `${d}s`);
    if (reduced) { el.classList.add('is-in'); return; }
    whenVisible(el, () => el.classList.add('is-in'), el.dataset.revealStart || 'top 90%');
  });
}
function initSplitAndReveals() {
  scanReveals(document);
  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => $$('[data-split].is-split').forEach(layoutSplit), 200);
  });
}

/* ------------------------------------------------------------------ Count-up */
function scanCounts(root) {
  $$('[data-count]', root).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const pre = el.dataset.prefix || '';
    const suf = el.dataset.suffix || '';
    const fmt = (v) => pre + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    el.setAttribute('aria-label', fmt(target));
    if (reduced) { el.textContent = fmt(target); return; }
    el.textContent = fmt(0);
    whenVisible(el, () => {
      const dur = parseFloat(el.dataset.duration || '2.2') * 1000;
      const t0 = performance.now();
      const tick = (now) => {
        const p = clamp((now - t0) / dur, 0, 1);
        const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        el.textContent = fmt(target * e);
        if (p < 1) requestAnimationFrame(tick); else el.textContent = fmt(target);
      };
      requestAnimationFrame(tick);
    }, 'top 88%');
  });
}

/* ------------------------------------------------------------------ Cursor */
function initCursor() {
  if (!fine || reduced) return;
  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="cursor__ring"><div class="cursor__ring-in"><span class="cursor__label"></span></div></div><div class="cursor__dot"></div>';
  document.body.appendChild(el);
  const ring = $('.cursor__ring', el);
  const dot = $('.cursor__dot', el);
  const label = $('.cursor__label', el);
  doc.classList.add('has-cursor');
  let mx = -100; let my = -100; let rx = -100; let ry = -100; let shown = false; let raf = 0;
  const loop = () => {
    rx = lerp(rx, mx, 0.16); ry = lerp(ry, my, 0.16);
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    raf = (Math.abs(rx - mx) > 0.1 || Math.abs(ry - my) > 0.1) ? requestAnimationFrame(loop) : 0;
  };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    mx = e.clientX; my = e.clientY;
    if (!shown) { shown = true; rx = mx; ry = my; el.classList.add('is-visible'); }
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest ? e.target : e.target.parentElement;
    if (!t) return;
    const cur = t.closest('[data-cursor]');
    const hover = t.closest('a, button, summary, label, [role="button"], [role="slider"], [data-cursor]');
    const text = t.closest('input, textarea, select');
    el.classList.toggle('is-hover', !!hover && !cur);
    el.classList.toggle('is-label', !!cur);
    el.classList.toggle('is-text', !!text);
    if (cur) label.textContent = cur.dataset.cursor;
  });
  document.addEventListener('pointerdown', () => el.classList.add('is-down'));
  document.addEventListener('pointerup', () => el.classList.remove('is-down'));
  document.documentElement.addEventListener('pointerleave', () => { el.classList.remove('is-visible'); shown = false; });
}

/* ------------------------------------------------------------------ Cursor-following image preview
   Any element with data-peek-src (and optional data-peek-label) shows a small photo that trails the pointer.
   Works for elements added later (event delegation). Fine pointers only, off for reduced motion. */
function initPeek() {
  if (!fine || reduced) return;
  const el = document.createElement('div');
  el.className = 'peek'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<img alt="" decoding="async"><span class="peek__label"></span>';
  document.body.appendChild(el);
  const img = $('img', el); const label = $('.peek__label', el);
  let tx = 0; let ty = 0; let x = 0; let y = 0; let rot = 0; let raf = 0; let on = false; let current = null;
  const loop = () => {
    const px = x; x = lerp(x, tx, 0.14); y = lerp(y, ty, 0.14);
    rot = lerp(rot, Math.max(-9, Math.min(9, (x - px) * 0.6)), 0.15);
    el.style.transform = `translate3d(${(x + 28).toFixed(1)}px, ${(y - el.offsetHeight / 2).toFixed(1)}px, 0) scale(${on ? 1 : 0.86}) rotate(${rot.toFixed(2)}deg)`;
    raf = (on || Math.abs(x - tx) > 0.2 || Math.abs(y - ty) > 0.2) ? requestAnimationFrame(loop) : 0;
  };
  const place = (e) => {
    tx = e.clientX; ty = e.clientY;
    const w = el.offsetWidth; if (tx + 28 + w > window.innerWidth - 8) tx = e.clientX - w - 56;
    if (!raf) raf = requestAnimationFrame(loop);
  };
  document.addEventListener('pointermove', (e) => { if (on && (e.pointerType === 'mouse' || e.pointerType === 'pen')) place(e); }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const t = e.target.closest && e.target.closest('[data-peek-src]');
    if (t === current) return;
    current = t;
    if (!t) { on = false; el.classList.remove('is-on'); return; }
    if (img.getAttribute('src') !== t.dataset.peekSrc) img.src = t.dataset.peekSrc;
    label.textContent = t.dataset.peekLabel || '';
    label.hidden = !t.dataset.peekLabel;
    const first = !on; on = true; el.classList.add('is-on');
    if (first) { x = tx = e.clientX; y = ty = e.clientY; }
    place(e);
  });
  document.documentElement.addEventListener('pointerleave', () => { on = false; current = null; el.classList.remove('is-on'); });
  window.addEventListener('scroll', () => { if (on && !raf) raf = requestAnimationFrame(loop); }, { passive: true });
}

/* ------------------------------------------------------------------ Magnetic */
const magnets = new Set();
let magRaf = 0;
function magLoop() {
  let busy = false;
  magnets.forEach((m) => {
    m.x = lerp(m.x, m.tx, 0.14); m.y = lerp(m.y, m.ty, 0.14);
    if (Math.abs(m.x - m.tx) > 0.05 || Math.abs(m.y - m.ty) > 0.05) busy = true;
    m.el.style.transform = `translate3d(${m.x.toFixed(2)}px, ${m.y.toFixed(2)}px, 0)`;
  });
  magRaf = busy ? requestAnimationFrame(magLoop) : 0;
}
function scanMagnetic(root) {
  if (!fine || reduced) return;
  $$('[data-magnetic]', root).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const strength = parseFloat(el.dataset.magnetic) || 0.35;
    const m = { el, x: 0, y: 0, tx: 0, ty: 0, strength };
    magnets.add(m);
    m.el._mag = m;
  });
  if (!scanMagnetic.bound) {
    scanMagnetic.bound = true;
    window.addEventListener('pointermove', (e) => {
      let any = false;
      magnets.forEach((m) => {
        if (!m.el.isConnected) { magnets.delete(m); return; }
        const r = m.el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - m.x; const cy = r.top + r.height / 2 - m.y;
        const dx = e.clientX - cx; const dy = e.clientY - cy;
        const reach = Math.max(r.width, r.height) * 0.5 + 38;
        if (Math.hypot(dx, dy) < reach) { m.tx = dx * m.strength; m.ty = dy * m.strength; any = true; }
        else if (m.tx || m.ty) { m.tx = 0; m.ty = 0; any = true; }
      });
      if (any && !magRaf) magRaf = requestAnimationFrame(magLoop);
    }, { passive: true });
  }
}

/* ------------------------------------------------------------------ Tilt */
function scanTilt(root) {
  if (!fine || reduced) return;
  $$('[data-tilt]', root).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    const max = parseFloat(el.dataset.tilt) || 8;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width; const py = (e.clientY - r.top) / r.height;
      el.classList.add('is-tilting');
      el.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-(py - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
    });
  });
}

/* ------------------------------------------------------------------ Marquee: speed follows scroll velocity */
function initMarquees() {
  const items = $$('.marquee').map((m) => {
    const track = $('.marquee__track', m);
    if (!track) return null;
    if (m.dataset.speed) m.style.setProperty('--marquee-duration', `${m.dataset.speed}s`);
    return { m, track, anim: null };
  }).filter(Boolean);
  if (!items.length || reduced) return;
  let lastY = window.scrollY; let vel = 0; let rate = 1; let dir = 1;
  const visible = new Set();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))) : null;
  items.forEach((it) => { if (io) io.observe(it.m); else visible.add(it.m); });
  // runs only while the page scrolls and the speed is still settling, then sleeps until the next scroll
  let raf = 0;
  const tick = () => {
    const y = window.scrollY; const dy = y - lastY; lastY = y;
    vel = lerp(vel, dy, 0.12);
    if (Math.abs(dy) > 0.5) dir = dy > 0 ? 1 : -1;
    const target = dir * (1 + Math.min(10, Math.abs(vel) * 0.45));
    rate = lerp(rate, target, 0.07);
    const settled = Math.abs(vel) < 0.05 && Math.abs(rate - target) < 0.01;
    if (settled) rate = target;
    items.forEach((it) => {
      if (!visible.has(it.m)) return;
      if (!it.anim) it.anim = it.track.getAnimations()[0] || null;
      if (it.anim && Math.abs(it.anim.playbackRate - rate) > 0.005) it.anim.playbackRate = rate;
    });
    raf = settled ? 0 : requestAnimationFrame(tick);
  };
  window.addEventListener('scroll', () => { if (!raf) { lastY = window.scrollY; raf = requestAnimationFrame(tick); } }, { passive: true });
}

/* ------------------------------------------------------------------ Pause looping CSS animations off screen */
// Infinite CSS animations keep ticking (and restyling) while scrolled away; pause the subtree until it is near view.
function initOffscreenPause() {
  const els = $$('.marquee, .cab, [data-pause-offscreen]');
  if (!els.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('is-offscreen', !e.isIntersecting)), { rootMargin: '120px 0px' });
  els.forEach((el) => io.observe(el));
}

/* start (at the end of the module so every const above is initialised) */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
