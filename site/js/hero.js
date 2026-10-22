/*
 * Home hero: wires the scroll track, chapters and copy to the wardrobe assembly.
 *
 * Preferred: hero-frames.js plays the Cycles-rendered image sequence. A preloader (#preloader in index.html)
 * covers the page until every frame has loaded, so the first scroll is smooth instead of scrubbing through
 * a half-loaded sequence; it gives up waiting after PRELOAD_MAX_MS and lets the rest stream in.
 * Fallbacks: the live Three.js scene (hero3d.js, imported only when needed), then the still render.
 */
import { createFramePlayer, FRAME_COUNT } from './hero-frames.js';

const root = document.querySelector('[data-hero]');
const preloader = document.getElementById('preloader');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PRELOAD_MAX_MS = 12000;
const PRELOAD_MIN_MS = 500;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const range = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------ preloader */
const doc = document.documentElement;
const preload = (() => {
  if (!preloader) return { progress() {}, done: () => Promise.resolve() };
  const bar = preloader.querySelector('.preloader__bar i');
  const pct = preloader.querySelector('.preloader__pct');
  const started = performance.now();
  doc.classList.add('is-preloading');
  // hold the page still while it loads (Lenis may arrive after us)
  let holding = true;
  const hold = () => { if (!holding) return; if (window.site && window.site.lenis) window.site.lenis.stop(); requestAnimationFrame(hold); };
  hold();
  let shown = 0;
  return {
    progress(f) {
      const v = Math.round(clamp(f, 0, 1) * 100);
      if (v <= shown) return;
      shown = v;
      if (bar) bar.style.transform = `scaleX(${v / 100})`;
      if (pct) pct.textContent = `${v}%`;
      preloader.setAttribute('aria-valuenow', String(v));
    },
    async done() {
      const wait = PRELOAD_MIN_MS - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.progress(1);
      holding = false;
      window.scrollTo(0, 0);
      if (window.site && window.site.lenis) { window.site.lenis.scrollTo(0, { immediate: true }); window.site.lenis.start(); }
      doc.classList.remove('is-preloading');
      preloader.classList.add('is-done');
      preloader.addEventListener('transitionend', () => preloader.remove(), { once: true });
      setTimeout(() => preloader.remove(), 1500);
    },
  };
})();

/* ------------------------------------------------------------ hero */
async function initHero() {
  const canvas = root.querySelector('.hero__canvas');
  const track = root.querySelector('.hero__track');
  const stage = root.querySelector('.hero__stage');
  const copy = root.querySelector('.hero__copy');
  const hint = root.querySelector('.hero__scroll');
  const chapters = root.querySelector('.hero__chapters');
  const chapterItems = [...root.querySelectorAll('[data-chapter]')];
  const bar = root.querySelector('.hero__bar i');
  const end = root.querySelector('.hero__end');

  // write a style only when its value changes: the scroll handler runs every frame
  const last = new Map();
  const put = (el, prop, value) => {
    if (!el) return;
    const key = el; let rec = last.get(key);
    if (!rec) { rec = {}; last.set(key, rec); }
    if (rec[prop] === value) return;
    rec[prop] = value;
    if (prop.startsWith('--')) el.style.setProperty(prop, value); else el.style[prop] = value;
  };

  let lastChapter = -1;
  function onProgress(p) {
    const pe = clamp(p / 0.97, 0, 1);
    if (copy) {
      const f = smooth(range(p, 0.025, 0.12));
      put(copy, 'opacity', (1 - f).toFixed(3));
      put(copy, 'transform', `translate3d(0, ${(-f * 48).toFixed(1)}px, 0)`);
      const inert = f > 0.5; if (copy.inert !== inert) copy.inert = inert;
    }
    put(stage, '--vig', (1 - smooth(range(p, 0.02, 0.16))).toFixed(3));
    put(hint, 'opacity', (1 - smooth(range(p, 0.005, 0.04))).toFixed(3));
    if (chapters) {
      const f = (smooth(range(p, 0.1, 0.18)) * (1 - smooth(range(p, 0.86, 0.92)))).toFixed(3);
      put(chapters, 'opacity', f);
      if (bar) put(bar.parentElement, 'opacity', f);
    }
    if (end) {
      const f = smooth(range(p, 0.88, 0.97));
      put(end, 'opacity', f.toFixed(3));
      put(end, 'transform', `translate3d(0, ${((1 - f) * 36).toFixed(1)}px, 0)`);
      const inert = f < 0.5; if (end.inert !== inert) end.inert = inert;
    }
    put(bar, 'transform', `scaleY(${pe.toFixed(3)})`);
    const ch = pe < 0.25 ? 0 : pe < 0.59 ? 1 : pe < 0.87 ? 2 : 3;
    if (ch !== lastChapter) {
      lastChapter = ch;
      chapterItems.forEach((li, i) => { li.classList.toggle('is-active', i === ch); li.classList.toggle('is-done', i < ch); });
    }
  }

  let hero;
  const ground = (getComputedStyle(doc).getPropertyValue('--paper-2') || '').trim() || '#e9e8e3';
  try {
    hero = await createFramePlayer(canvas, {
      still: reducedMotion,
      onFrame: reducedMotion ? null : onProgress,
      background: ground,
      // reduced motion only ever shows the last frame, which is already loaded
      eager: !reducedMotion,
      onLoad: (n) => preload.progress(0.08 + 0.92 * (n / FRAME_COUNT)),
    });
    root.classList.add('hero--frames');
    preload.progress(0.08 + 0.92 * (2 / FRAME_COUNT));
    if (!reducedMotion) await Promise.race([hero.loaded, new Promise((r) => setTimeout(r, PRELOAD_MAX_MS))]);
  } catch (frameErr) {
    console.warn('Hero frames unavailable, using the live 3D scene.', frameErr);
    try {
      const { createHero } = await import('./hero3d.js');
      hero = createHero(canvas, { still: reducedMotion, small: window.innerWidth < 700, onFrame: reducedMotion ? null : onProgress });
    } catch (err) {
      console.warn('Hero 3D unavailable, showing the still composition.', err);
      root.classList.add('hero--still');
      preload.done();
      return;
    }
  }

  const ro = new ResizeObserver(() => hero.resize());
  ro.observe(stage);
  hero.resize();
  root.classList.add('hero--ready');
  preload.done();

  if (reducedMotion) {
    root.classList.add('hero--static');
    hero.jump(1);
    return;
  }

  const io = new IntersectionObserver((es) => es.forEach((e) => hero.setVisible(e.isIntersecting)), { rootMargin: '10% 0px' });
  io.observe(track);

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    hero.pointer((e.clientX / window.innerWidth - 0.5) * 2, (e.clientY / window.innerHeight - 0.5) * 2);
  }, { passive: true });

  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.ScrollTrigger.create({ trigger: track, start: 'top top', end: 'bottom bottom', onUpdate: (self) => hero.setTarget(self.progress), onRefresh: (self) => hero.setTarget(self.progress) });
  } else {
    const drive = () => {
      const r = track.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      hero.setTarget(total > 0 ? clamp(-r.top / total, 0, 1) : 0);
    };
    window.addEventListener('scroll', drive, { passive: true });
    drive();
  }
  window.__hero = hero;
}

if (root) {
  const start = () => initHero().catch((err) => { console.warn('Hero failed to start.', err); preload.done(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
} else {
  preload.done();
}
