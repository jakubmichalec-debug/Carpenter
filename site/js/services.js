// Services page: pinned horizontal galleries, tunable option chips, "Start from this" presets.
// Everything here is progressive: without GSAP the galleries are native swipe carousels, and without the
// configurator modules the CTA stays a plain link to planner.html.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ presets */
const ALL = ['wardrobe', 'kitchen-base', 'kitchen-wall', 'tall-cabinet', 'island', 'shelving', 'desk', 'table', 'bench', 'window-seat'];

// An option patches every module of the listed types. `g` is an exclusive group; chips with the same group act like radios.
const setOn = (types, set) => (d, M) => {
  let next = d;
  d.modules.filter((m) => types === '*' || types.includes(m.type)).forEach((m) => { next = M.updateModule(next, m.id, set); });
  return next;
};

const SERVICES = {
  wardrobes: {
    base: (M) => {
      let d = blank(M, { width: 420, height: 260, depth: 380 });
      d = M.addModule(d, 'wardrobe', { x: 0, width: 250, height: 250, sections: 3, doors: 'hinged', drawers: 3, interior: 'mixed', front: 'oak', body: 'birch-ply', handle: 'groove' });
      return d;
    },
    opts: [
      { g: 'doors', apply: setOn(['wardrobe'], { doors: 'sliding' }) },
      { g: 'doors', apply: setOn(['wardrobe'], { doors: 'glass' }) },
      { g: 'interior', apply: setOn(['wardrobe'], { interior: 'rail' }) },
      { g: 'interior', apply: setOn(['wardrobe'], { interior: 'shoe' }) },
      { g: 'led', apply: setOn(['wardrobe'], { led: true }) },
      { g: 'handle', apply: setOn(['wardrobe'], { handle: 'knob' }) },
      { g: 'handle', apply: setOn(['wardrobe'], { handle: 'push' }) }
    ]
  },
  kitchens: {
    base: (M) => {
      let d = blank(M, { width: 500, height: 260, depth: 420, openings: [{ id: 'o1', type: 'window', x: 330, y: 110, w: 140, h: 110 }] });
      d = M.addModule(d, 'tall-cabinet', { front: 'lacquer-sage' });
      for (let i = 0; i < 4; i++) d = M.addModule(d, 'kitchen-base', { front: 'lacquer-sage', worktop: 'terrazzo' });
      for (let i = 0; i < 2; i++) d = M.addModule(d, 'kitchen-wall', { front: 'lacquer-sage' });
      d = M.addModule(d, 'island', { front: 'lacquer-charcoal', worktop: 'terrazzo' });
      return d;
    },
    opts: [
      { g: 'front', apply: setOn(['kitchen-base', 'kitchen-wall', 'tall-cabinet', 'island'], { front: 'lacquer-charcoal' }) },
      { g: 'front', apply: setOn(['kitchen-base', 'kitchen-wall', 'tall-cabinet', 'island'], { front: 'oak' }) },
      { g: 'worktop', apply: setOn(['kitchen-base', 'island'], { worktop: 'oak' }) },
      { g: 'wall', apply: setOn(['kitchen-wall'], { doors: 'open' }) },
      { g: 'led', apply: setOn(['kitchen-wall'], { led: true }) },
      { g: 'handle', apply: setOn(['kitchen-base', 'kitchen-wall', 'tall-cabinet', 'island'], { handle: 'knob' }) }
    ]
  },
  'wall-units': {
    base: (M) => {
      let d = blank(M, { width: 420, height: 260, depth: 380, openings: [] });
      d = M.addModule(d, 'shelving', { width: 100, height: 240, sections: 3, front: 'ash', body: 'ash' });
      d = M.addModule(d, 'tall-cabinet', { width: 80, height: 240, front: 'lacquer-sage', doors: 'hinged' });
      d = M.addModule(d, 'shelving', { width: 100, height: 240, sections: 3, front: 'ash', body: 'ash' });
      d = M.addModule(d, 'bench', { width: 140, front: 'oak' });
      return d;
    },
    opts: [
      { g: 'front', apply: setOn(['tall-cabinet', 'shelving', 'bench'], { front: 'oak' }) },
      { g: 'front', apply: setOn(['tall-cabinet', 'shelving', 'bench'], { front: 'walnut' }) },
      { g: 'doors', apply: setOn(['tall-cabinet'], { doors: 'glass' }) },
      { g: 'shelf', apply: setOn(['shelving'], { doors: 'hinged' }) },
      { g: 'led', apply: setOn(['tall-cabinet', 'shelving'], { led: true }) }
    ]
  },
  desks: {
    base: (M) => {
      let d = blank(M, { width: 360, height: 260, depth: 380, openings: [{ id: 'o1', type: 'window', x: 130, y: 100, w: 130, h: 120 }] });
      d = M.addModule(d, 'desk', { x: 0, width: 200, sections: 2, front: 'walnut', drawers: 2 });
      d = M.addModule(d, 'shelving', { x: 0, width: 100, height: 110, elevation: 110, sections: 1, front: 'ash', body: 'ash' });
      d = M.addModule(d, 'tall-cabinet', { x: 280, width: 60, height: 220, front: 'lacquer-sage' });
      return d;
    },
    opts: [
      { g: 'front', apply: setOn(['desk'], { front: 'oak' }) },
      { g: 'front', apply: setOn(['desk'], { front: 'lacquer-charcoal' }) },
      { g: 'drawers', apply: setOn(['desk'], { drawers: 4 }) },
      { g: 'top', apply: setOn(['desk'], { worktop: 'terrazzo' }) },
      { g: 'shelf', apply: setOn(['shelving'], { doors: 'hinged' }) }
    ]
  },
  tables: {
    base: (M) => {
      let d = blank(M, { width: 420, height: 260, depth: 420 });
      d = M.addModule(d, 'table', { width: 200, depth: 95, front: 'oak', z: 150 });
      d = M.addModule(d, 'bench', { x: 110, width: 200, front: 'oak' });
      return d;
    },
    opts: [
      { g: 'wood', apply: setOn(['table', 'bench'], { front: 'walnut' }) },
      { g: 'wood', apply: setOn(['table', 'bench'], { front: 'ash' }) },
      { g: 'top', apply: setOn(['table'], { worktop: 'terrazzo' }) },
      { g: 'size', apply: setOn(['table'], { width: 240 }) }
    ]
  },
  'window-seats': {
    base: (M) => {
      let d = blank(M, { width: 420, height: 260, depth: 380, openings: [{ id: 'o1', type: 'window', x: 90, y: 85, w: 240, h: 150 }] });
      d = M.addModule(d, 'window-seat', { x: 80, width: 260, front: 'ash', doors: 'hinged', drawers: 0, sections: 2 });
      return d;
    },
    opts: [
      { g: 'front', apply: setOn(['window-seat'], { front: 'oak' }) },
      { g: 'front', apply: setOn(['window-seat'], { front: 'lacquer-sage' }) },
      { g: 'drawers', apply: setOn(['window-seat'], { drawers: 4, doors: 'none' }) },
      { g: 'wings', apply: (d, M) => {
        let n = M.addModule(d, 'shelving', { x: 0, width: 70, height: 220, sections: 1, front: 'ash', body: 'ash' });
        n = M.addModule(n, 'shelving', { x: 350, width: 70, height: 220, sections: 1, front: 'ash', body: 'ash' });
        return n;
      } },
      { g: 'led', apply: setOn(['window-seat'], { led: true }) }
    ]
  },
  'under-stairs': {
    base: (M) => {
      let d = blank(M, { width: 320, height: 260, depth: 380, openings: [] });
      d = M.addModule(d, 'wardrobe', { x: 0, width: 140, height: 190, depth: 55, sections: 2, drawers: 3, interior: 'mixed', front: 'lacquer-white', body: 'birch-ply' });
      d = M.addModule(d, 'bench', { x: 150, width: 110, front: 'oak' });
      d = M.addModule(d, 'shelving', { x: 150, width: 110, height: 110, elevation: 70, sections: 1, front: 'ash', body: 'ash' });
      return d;
    },
    opts: [
      { g: 'drawers', apply: setOn(['wardrobe'], { drawers: 6 }) },
      { g: 'interior', apply: setOn(['wardrobe'], { interior: 'shoe' }) },
      { g: 'interior', apply: setOn(['wardrobe'], { interior: 'rail' }) },
      { g: 'handle', apply: setOn('*', { handle: 'push' }) },
      { g: 'front', apply: setOn(['wardrobe'], { front: 'lacquer-clay' }) }
    ]
  }
};

function blank(M, roomPatch) {
  let d = M.createDesign();
  d.modules.slice().forEach((m) => { d = M.removeModule(d, m.id); });
  return M.updateRoom(d, roomPatch);
}

async function loadModules() {
  try {
    const [model, share, pricing] = await Promise.all([
      import('./configurator/model.js'),
      import('./configurator/share.js'),
      import('./configurator/pricing.js')
    ]);
    return { model, share, pricing };
  } catch (err) {
    console.warn('Configurator modules unavailable, "Start from this" falls back to a plain link.', err);
    return null;
  }
}

const fmtEuro = (n) => '€' + Math.round(n).toLocaleString('en-US');

function tweenNumber(el, to, from) {
  if (reduced || from == null || from === to) { el.textContent = fmtEuro(to); return; }
  const t0 = performance.now(); const dur = 650;
  const tick = (now) => {
    const p = clamp((now - t0) / dur, 0, 1);
    const e = 1 - Math.pow(1 - p, 4);
    el.textContent = fmtEuro(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function initService(section, libs) {
  const id = section.dataset.service;
  const spec = SERVICES[id];
  const chips = $$('.svc-chip', section);
  const priceEl = $('[data-price]', section);
  const weeksEl = $('[data-weeks]', section);
  const go = $('[data-start]', section);
  if (!spec || !libs || !go) return;
  const { model: M, share: S, pricing: P } = libs;
  const selected = new Set();
  let shown = null;

  let base;
  try { base = spec.base(M); } catch (err) { console.warn('Preset failed for', id, err); return; }

  const compute = () => {
    let d = base;
    [...selected].sort((a, b) => a - b).forEach((i) => { d = spec.opts[i].apply(d, M); });
    return d;
  };
  const refresh = (animate) => {
    try {
      const d = compute();
      const q = P.quoteDesign(d);
      const rounded = Math.round(q.total / 50) * 50;
      go.href = `planner.html#design=${S.encodeDesign(d)}`;
      tweenNumber(priceEl, rounded, animate ? shown : null);
      shown = rounded;
      weeksEl.textContent = q.leadTimeWeeks;
      if (animate) {
        priceEl.parentElement.classList.remove('is-bump');
        void priceEl.offsetWidth;
        priceEl.parentElement.classList.add('is-bump');
      }
    } catch (err) {
      console.warn('Could not build the preset for', id, err);
      go.href = 'planner.html';
    }
  };

  chips.forEach((chip) => {
    const i = Number(chip.dataset.opt);
    const group = spec.opts[i] && spec.opts[i].g;
    chip.addEventListener('click', () => {
      const on = !selected.has(i);
      if (on) {
        spec.opts.forEach((o, j) => { if (o.g === group && j !== i) { selected.delete(j); const c = chips[j]; if (c) c.setAttribute('aria-pressed', 'false'); } });
        selected.add(i);
      } else selected.delete(i);
      chip.setAttribute('aria-pressed', String(on));
      refresh(true);
    });
  });
  refresh(false);
}

/* ------------------------------------------------------------------ galleries */
function updateHud(gallery, cur, p) {
  const c = $('[data-cur]', gallery); const bar = $('[data-bar]', gallery);
  if (c) c.textContent = String(cur);
  if (bar) bar.style.setProperty('--p', p.toFixed(3));
}

function initCarousel(gallery) {
  const track = $('.svc-track', gallery);
  const panels = $$('.svc-panel', gallery);
  if (!track || !panels.length) return;
  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    const p = max > 0 ? track.scrollLeft / max : 0;
    const cur = Math.round(p * (panels.length - 1)) + 1;
    updateHud(gallery, cur, Math.max(p, 1 / panels.length));
  };
  track.addEventListener('scroll', update, { passive: true });
  // keyboard: arrows move one panel when the track has focus
  track.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const step = panels[0].getBoundingClientRect().width + 16;
    track.scrollBy({ left: e.key === 'ArrowRight' ? step : -step, behavior: reduced ? 'auto' : 'smooth' });
    e.preventDefault();
  });
  update();
  window.addEventListener('resize', update);
}

function initPinned() {
  const gsap = window.gsap; const ST = window.ScrollTrigger;
  const galleries = $$('[data-gallery]');
  galleries.forEach(initCarousel);
  if (!gsap || !ST || reduced) return;
  gsap.registerPlugin(ST);
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px) and (min-height: 560px)', () => {
    const undo = [];
    galleries.forEach((gallery) => {
      const track = $('.svc-track', gallery);
      const panels = $$('.svc-panel', gallery);
      gallery.classList.add('is-pinned');
      track.removeAttribute('tabindex');
      $$('img', gallery).forEach((im) => { im.loading = 'eager'; });
      undo.push(() => { gallery.classList.remove('is-pinned'); track.setAttribute('tabindex', '0'); track.style.transform = ''; });
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const tween = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: gallery, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: (self) => updateHud(gallery, Math.round(self.progress * (panels.length - 1)) + 1, Math.max(self.progress, 1 / panels.length))
        }
      });
      panels.forEach((panel) => {
        const img = $('img', panel);
        if (!img) return;
        gsap.fromTo(img, { xPercent: -5 }, { xPercent: 5, ease: 'none', scrollTrigger: { trigger: panel, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      });
      updateHud(gallery, 1, 1 / panels.length);
    });
    return () => undo.forEach((fn) => fn());
  });
  // gentle parallax on every stacked image (not tied to the pinned gallery)
  $$('[data-par]').forEach((el) => {
    gsap.fromTo(el, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  const refresh = () => (window.site && window.site.refresh ? window.site.refresh() : ST.refresh());
  window.addEventListener('load', refresh, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(refresh, 50));
}

/* ------------------------------------------------------------------ chips reveal, index nav */
function initReveals() {
  const groups = $$('[data-opts]');
  if (!('IntersectionObserver' in window)) { groups.forEach((g) => g.classList.add('is-in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
  groups.forEach((g) => io.observe(g));
}

function initIndex() {
  const nav = $('[data-index]');
  if (!nav) return;
  const links = $$('a[data-idx]', nav);
  const list = $('ul', nav);
  const setActive = (id) => {
    links.forEach((a) => {
      const on = a.dataset.idx === id;
      a.classList.toggle('is-active', on);
      if (on) { a.setAttribute('aria-current', 'true'); } else a.removeAttribute('aria-current');
      if (on && list.scrollWidth > list.clientWidth) list.scrollTo({ left: a.offsetLeft - 24, behavior: reduced ? 'auto' : 'smooth' });
    });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    $$('.svc').forEach((s) => io.observe(s));
  }
  // Sit under the site header when it is showing, tuck to the top when it hides on scroll down.
  const header = $('.site-header');
  if (header && 'MutationObserver' in window) {
    const sync = () => { nav.style.setProperty('--idx-top', header.classList.contains('is-hidden') ? '0px' : 'var(--header-h)'); };
    new MutationObserver(sync).observe(header, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
}

/* ------------------------------------------------------------------ boot */
initReveals();
initIndex();
initPinned();
loadModules().then((libs) => {
  $$('.svc').forEach((s) => initService(s, libs));
  if (window.site && window.site.refresh) window.site.refresh();
});
