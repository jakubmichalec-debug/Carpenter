// Process page: scroll-drawn timeline and FAQ accordion.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------------ timeline */
function initTimeline() {
  const tl = $('[data-timeline]');
  if (!tl) return;
  const svg = $('.pr-tl__rail', tl);
  const track = $('.pr-tl__track', svg);
  const line = $('.pr-tl__line', svg);
  const steps = $$('[data-step]', tl);
  let len = 1; let dots = [];

  const build = () => {
    const h = tl.offsetHeight;
    const railW = svg.getBoundingClientRect().width;
    const x0 = railW / 2;
    // a gently wavering line, like a grain line, from the first dot to the last
    const first = steps[0].offsetTop + 22; const last = steps[steps.length - 1].offsetTop + 22;
    let d = `M${x0} ${first}`;
    for (let y = first + 6; y < last; y += 6) d += ` L${(x0 + Math.sin(y / 38) * 2.2).toFixed(1)} ${y}`;
    d += ` L${x0} ${last}`;
    track.setAttribute('d', d); line.setAttribute('d', d);
    svg.setAttribute('viewBox', `0 0 ${railW} ${h}`);
    len = line.getTotalLength() || 1;
    line.style.strokeDasharray = `${len}`;
    dots = steps.map((s) => s.offsetTop + 22);
    update();
  };

  const update = () => {
    const rect = tl.getBoundingClientRect();
    const ref = window.innerHeight * 0.6 - rect.top; // reference line, in timeline coordinates
    const first = dots[0] || 0; const last = dots[dots.length - 1] || 1;
    const p = clamp((ref - first) / (last - first), 0, 1);
    line.style.strokeDashoffset = `${len * (1 - (reduced ? 1 : p))}`;
    steps.forEach((s, i) => s.classList.toggle('is-active', reduced || ref >= dots[i]));
  };

  // entrance per step
  steps.forEach((s) => $$('.pr-step__body > *', s).forEach((el, k) => el.style.setProperty('--k', k)));
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -18% 0px' });
    steps.forEach((s) => io.observe(s));
  } else steps.forEach((s) => s.classList.add('is-in'));

  build();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', build);
  window.addEventListener('load', build);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  // images change the height of steps once loaded
  if ('ResizeObserver' in window) new ResizeObserver(build).observe(tl);
}

/* ------------------------------------------------------------------ FAQ */
function initFaq() {
  const list = $('[data-faq]');
  if (!list) return;
  const items = $$('.pr-faq__item', list);
  const setOpen = (item, open) => {
    item.classList.toggle('is-open', open);
    $('.pr-faq__q', item).setAttribute('aria-expanded', String(open));
  };
  list.addEventListener('click', (e) => {
    const q = e.target.closest('.pr-faq__q');
    if (!q) return;
    const item = q.closest('.pr-faq__item');
    const open = !item.classList.contains('is-open');
    items.forEach((it) => { if (it !== item) setOpen(it, false); });
    setOpen(item, open);
    const refresh = () => window.site && window.site.refresh && window.site.refresh();
    setTimeout(refresh, 700);
  });
  list.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const qs = $$('.pr-faq__q', list);
    const i = qs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? qs.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + qs.length) % qs.length;
    qs[n].focus();
  });
  setOpen(items[0], true);
}

initTimeline();
initFaq();
