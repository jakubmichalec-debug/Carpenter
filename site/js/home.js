/*
 * Home page interactions that are not the hero: horizontal "how it works" scroll, before/after slider,
 * testimonials carousel. Shared behaviour (Lenis, reveals, cursor, tilt, counters, marquee) is in app.js.
 */
import { site } from './app.js';

const reduced = site.reduced;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* scroll progress of a tall section (0 when its top meets the viewport top, 1 when its bottom meets the viewport bottom) */
function sectionProgress(section, cb) {
  const run = () => {
    const r = section.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    cb(total > 0 ? clamp(-r.top / total, 0, 1) : 0);
  };
  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.ScrollTrigger.create({ trigger: section, start: 'top top', end: 'bottom bottom', onUpdate: (s) => cb(s.progress), onRefresh: (s) => cb(s.progress) });
  } else {
    window.addEventListener('scroll', run, { passive: true });
    window.addEventListener('resize', run);
    run();
  }
}

/* ------------------------------------------------------------ 4. horizontal process */
function initProcess() {
  const sec = $('[data-process]');
  if (!sec) return;
  const track = $('.process__track', sec);
  const bar = $('.process__bar i', sec);
  const steps = $$('[data-step]', sec);
  if (reduced) { steps.forEach((s) => s.classList.add('is-active')); return; }
  let dist = 0; let target = 0; let current = 0; let raf = 0;
  const measure = () => {
    dist = Math.max(0, track.scrollWidth - window.innerWidth);
    sec.style.height = `${dist + window.innerHeight * 1.05}px`;
  };
  measure();
  if (window.ScrollTrigger) window.ScrollTrigger.addEventListener('refreshInit', measure);
  window.addEventListener('resize', measure);
  const paint = () => {
    raf = 0;
    current = Math.abs(target - current) < 0.0004 ? target : lerp(current, target, 0.14);
    track.style.transform = `translate3d(${(-current * dist).toFixed(1)}px, 0, 0)`;
    if (bar) bar.style.transform = `scaleX(${current.toFixed(4)})`;
    // active step = the one whose centre is closest to the viewport centre
    let best = 0; let bestD = Infinity;
    steps.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - window.innerWidth * 0.5);
      if (d < bestD) { bestD = d; best = i; }
    });
    steps.forEach((s, i) => s.classList.toggle('is-active', i === best));
    if (current !== target) raf = requestAnimationFrame(paint);
  };
  sectionProgress(sec, (p) => { target = p; if (!raf) raf = requestAnimationFrame(paint); });
  paint();
}

/* ------------------------------------------------------------ 5. before / after */
function initBeforeAfter() {
  const ba = $('[data-ba]');
  if (!ba) return;
  const handle = $('.ba__handle', ba);
  // the two Cycles renders (assets/3d/ba-*.webp) are plain lazy images; reveal the slider once both are decoded
  let renderDone;
  const rendered = new Promise((r) => { renderDone = r; });
  const imgs = [$('#ba-before'), $('#ba-after')];
  Promise.all(imgs.map((im) => (im.complete && im.naturalWidth ? Promise.resolve() : new Promise((r) => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); }))))
    .then(() => { ba.classList.add('is-rendered'); renderDone(); });
  let pos = 50; let raf = 0; let userTouched = false;
  const set = (v, fromUser) => {
    pos = clamp(v, 0, 100);
    ba.style.setProperty('--pos', `${pos}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    handle.setAttribute('aria-valuetext', pos > 97 ? 'Showing the before photo' : pos < 3 ? 'Showing the after photo' : `Showing ${Math.round(pos)}% before`);
    if (fromUser) { userTouched = true; cancelAnimationFrame(raf); }
  };
  const fromX = (x) => { const r = ba.getBoundingClientRect(); return ((x - r.left) / r.width) * 100; };
  ba.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    ba.setPointerCapture(e.pointerId);
    ba.classList.add('is-dragging');
    set(fromX(e.clientX), true);
  });
  ba.addEventListener('pointermove', (e) => { if (ba.classList.contains('is-dragging')) set(fromX(e.clientX), true); });
  const end = (e) => { ba.classList.remove('is-dragging'); try { ba.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ } };
  ba.addEventListener('pointerup', end);
  ba.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    const map = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -10, PageUp: 10 };
    if (e.key in map) { e.preventDefault(); set(pos + map[e.key], true); }
    else if (e.key === 'Home') { e.preventDefault(); set(0, true); }
    else if (e.key === 'End') { e.preventDefault(); set(100, true); }
  });
  // a one-off demonstration sweep when the slider scrolls into view
  if (reduced) return;
  const io = new IntersectionObserver((es) => {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    rendered.then(() => setTimeout(() => {
      if (userTouched || ba.classList.contains('ba--nogl')) return;
      const keys = [[50, 22, 1100], [22, 76, 1500], [76, 50, 1000]];
      let k = 0; let t0 = 0;
      const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const tick = (now) => {
        if (userTouched) return;
        if (!t0) t0 = now;
        const [a, b, dur] = keys[k];
        const t = clamp((now - t0) / dur, 0, 1);
        set(lerp(a, b, ease(t)), false);
        if (t < 1) raf = requestAnimationFrame(tick);
        else if (++k < keys.length) { t0 = 0; raf = requestAnimationFrame(tick); }
      };
      raf = requestAnimationFrame(tick);
    }, 900));
  }, { threshold: 0.55 });
  io.observe(ba);
}

/* ------------------------------------------------------------ 7. testimonials carousel */
function initCarousel() {
  const vp = $('[data-carousel]');
  if (!vp) return;
  const section = vp.closest('section');
  const track = $('.t-track', vp);
  const slides = $$('.t-slide', vp);
  const prev = $('[data-prev]', section); const next = $('[data-next]', section); const pauseBtn = $('[data-pause]', section);
  const cur = $('[data-current]', section); const tot = $('[data-total]', section);
  const prog = $('.t-progress i', section);
  let idx = 0; let x = 0; let minX = 0; let offsets = [];
  let paused = reduced; let hovering = false; let dragging = false; let timer = 0; let userPaused = reduced;
  const pad = (n) => String(n).padStart(2, '0');
  if (tot) tot.textContent = pad(slides.length);

  const measure = () => {
    const base = slides[0].offsetLeft;
    offsets = slides.map((s) => s.offsetLeft - base);
    minX = -Math.max(0, track.scrollWidth - (vp.clientWidth - parseFloat(getComputedStyle(vp).paddingLeft)));
  };
  const snapX = (i) => clamp(-offsets[i], minX, 0);
  const lastIdx = () => { let l = 0; offsets.forEach((o, i) => { if (-o >= minX - 1) l = i; }); return Math.min(slides.length - 1, l + (snapX(l) > minX + 1 ? 1 : 0)); };
  const render = () => {
    track.style.transform = `translate3d(${x}px, 0, 0)`;
    if (cur) cur.textContent = pad(idx + 1);
    if (prog) prog.style.transform = `scaleX(${((idx + 1) / slides.length).toFixed(3)})`;
    if (prev) prev.disabled = idx === 0;
    if (next) next.disabled = idx >= slides.length - 1 || x <= minX + 1;
    slides.forEach((s, i) => s.setAttribute('aria-label', `${i + 1} of ${slides.length}`));
  };
  const goTo = (i) => {
    idx = clamp(i, 0, slides.length - 1);
    x = snapX(idx);
    render();
  };
  const nearest = (px) => { let b = 0; let bd = Infinity; offsets.forEach((o, i) => { const d = Math.abs(clamp(-o, minX, 0) - px); if (d < bd) { bd = d; b = i; } }); return b; };

  const schedule = () => {
    clearInterval(timer);
    if (reduced || userPaused) return;
    timer = setInterval(() => {
      if (hovering || dragging || document.hidden || paused) return;
      if (x <= minX + 1) goTo(0); else goTo(idx + 1);
    }, 5200);
  };
  const onResize = () => { measure(); goTo(idx); };
  window.addEventListener('resize', onResize);
  measure(); goTo(0); schedule();
  // images/fonts can change widths after load
  window.addEventListener('load', onResize, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);

  prev && prev.addEventListener('click', () => goTo(idx - 1));
  next && next.addEventListener('click', () => goTo(idx + 1));
  pauseBtn && pauseBtn.addEventListener('click', () => {
    userPaused = !userPaused;
    pauseBtn.setAttribute('aria-pressed', String(userPaused));
    pauseBtn.textContent = userPaused ? 'Play' : 'Pause';
    schedule();
  });
  if (reduced && pauseBtn) pauseBtn.hidden = true;
  section.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovering = true; });
  section.addEventListener('pointerleave', () => { hovering = false; });
  section.addEventListener('focusin', () => { hovering = true; });
  section.addEventListener('focusout', () => { hovering = false; });
  vp.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') goTo(idx - 1); if (e.key === 'ArrowRight') goTo(idx + 1); });

  // drag
  let startX = 0; let startPos = 0; let lastX = 0; let lastT = 0; let vx = 0; let moved = 0; let pid = null;
  vp.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; pid = e.pointerId; moved = 0;
    startX = lastX = e.clientX; startPos = x; lastT = performance.now(); vx = 0;
  });
  vp.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pid) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    if (moved > 6 && !vp.hasPointerCapture(pid)) { vp.setPointerCapture(pid); vp.classList.add('is-dragging'); track.classList.add('is-dragging'); }
    if (!track.classList.contains('is-dragging')) return;
    let nx = startPos + dx;
    if (nx > 0) nx *= 0.35; else if (nx < minX) nx = minX + (nx - minX) * 0.35;
    x = nx;
    const now = performance.now();
    vx = lerp(vx, (e.clientX - lastX) / Math.max(1, now - lastT), 0.4);
    lastX = e.clientX; lastT = now;
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  });
  const up = (e) => {
    if (!dragging || (e && e.pointerId !== pid)) return;
    dragging = false;
    const was = track.classList.contains('is-dragging');
    vp.classList.remove('is-dragging'); track.classList.remove('is-dragging');
    try { vp.releasePointerCapture(pid); } catch (err) { /* ignore */ }
    if (!was) return;
    const projected = x + vx * 320;
    idx = nearest(projected);
    goTo(idx);
  };
  vp.addEventListener('pointerup', up);
  vp.addEventListener('pointercancel', up);
  vp.addEventListener('dragstart', (e) => e.preventDefault());
}

initProcess();
initBeforeAfter();
initCarousel();
site.ready.then(() => site.refresh());
