// Contact page: live opening hours (Antwerp time) and a stylised map. The quote form is gone: the planner takes designs now.
// Old links that carry a design (#p= from the planner, #design= from the old configurator) go on to the planner.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);

// also covers a hash change on this page; the page head redirects on load before anything is drawn
function toPlanner() {
  if (!/^#(p|design)=/.test(location.hash)) return false;
  location.replace(`planner.html${location.hash}`);
  return true;
}

/* ------------------------------------------------------------------ opening hours (Antwerp time) */
function initHours() {
  const HOURS = { 0: null, 1: [8, 17], 2: [8, 17], 3: [8, 17], 4: [8, 17], 5: [8, 16], 6: null };
  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let day; let mins;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')); mins = Number(get('hour')) % 24 * 60 + Number(get('minute'));
  } catch (err) { const n = new Date(); day = n.getDay(); mins = n.getHours() * 60 + n.getMinutes(); }
  const row = $(`[data-day="${day}"]`); if (row) row.classList.add('is-today');
  const el = $('[data-open]'); const txt = $('[data-open-text]');
  const h = HOURS[day]; const pad = (n) => String(n).padStart(2, '0');
  if (h && mins >= h[0] * 60 && mins < h[1] * 60) { el.classList.add('is-open'); txt.textContent = `Open now, until ${pad(h[1])}:00`; return; }
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7; const hh = HOURS[d];
    if (!hh) continue;
    if (i === 0 && mins >= hh[0] * 60) continue;
    txt.textContent = `Closed, opens ${i === 0 ? 'today' : i === 1 ? 'tomorrow' : NAMES[d]} at ${pad(hh[0])}:00`; return;
  }
}

/* ------------------------------------------------------------------ map */
function initMap() {
  const map = $('[data-map]');
  if (!('IntersectionObserver' in window) || reduced) { map.classList.add('is-in'); return; }
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { map.classList.add('is-in'); io.disconnect(); } }, { threshold: 0.3 });
  io.observe(map);
}

/* ------------------------------------------------------------------ boot */
if (!toPlanner()) {
  initHours();
  initMap();
  if (window.site && window.site.refresh) window.site.refresh();
}
window.addEventListener('hashchange', toPlanner);
