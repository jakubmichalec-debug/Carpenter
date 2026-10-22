// Contact page: multi-step quote form (nothing is sent anywhere), a "Your design" summary from #p= (the planner)
// or #design= (the old configurator), live opening hours and a stylised map.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const euro = (n) => '€' + Math.round(n).toLocaleString('en-US');

const form = $('[data-form]');
const card = $('[data-card]');
const steps = $$('[data-step]', form);
const bar = $('[data-bar]');
const barEl = bar.parentElement;
const backBtn = $('[data-back]');
const nextBtn = $('[data-next]');
const nextLabel = $('[data-next-label]');
let step = 0;
const field = (name) => form.elements[name];

/* ------------------------------------------------------------------ steps */
function showStep(n, dir = 1, focus = true) {
  const prev = steps[step];
  step = clamp(n, 0, steps.length - 1);
  steps.forEach((s, i) => {
    const on = i === step;
    s.hidden = !on; s.classList.toggle('is-active', on); s.classList.toggle('is-back', on && dir < 0);
  });
  $$('[data-pstep]').forEach((li) => {
    const i = Number(li.dataset.pstep);
    li.classList.toggle('is-current', i === step); li.classList.toggle('is-done', i < step);
    if (i === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  bar.style.setProperty('--p', String((step + 1) / steps.length));
  barEl.setAttribute('aria-valuenow', String(step + 1));
  barEl.setAttribute('aria-label', `Step ${step + 1} of ${steps.length}`);
  backBtn.hidden = step === 0;
  nextLabel.textContent = step === steps.length - 1 ? 'Send request' : 'Next';
  if (focus && prev !== steps[step]) {
    const target = $('legend', steps[step]);
    if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    const top = card.getBoundingClientRect().top;
    if (top < 80 || top > window.innerHeight * 0.5) {
      if (window.site && window.site.scrollTo) window.site.scrollTo(card, { offset: -(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72) - 16 });
      else card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }
}

/* ------------------------------------------------------------------ validation */
const RULES = {
  0: () => [['type', !form.querySelector('[name="type"]:checked')]],
  1: () => {
    const w = Number(field('width').value); const h = Number(field('height').value);
    const samples = form.querySelector('[name="type"]:checked')?.value === 'sample-box'; // a sample box needs no measurements
    return [['room', !field('room').value], ['width', field('width').value ? !(w >= 60 && w <= 900) : !samples], ['height', field('height').value ? !(h >= 200 && h <= 400) : !samples]];
  },
  2: () => [],
  3: () => [['name', field('name').value.trim().length < 2], ['email', !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(field('email').value.trim())], ['postcode', field('postcode').value.trim().length < 3], ['consent', !field('consent').checked]]
};
function showError(name, bad) {
  const msg = $(`[data-err="${name}"]`, form);
  if (msg) msg.hidden = !bad;
  const input = name === 'type' ? null : field(name);
  if (input) { if (bad) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
}
function validate(n) {
  const res = RULES[n]();
  res.forEach(([name, bad]) => showError(name, bad));
  const first = res.find(([, bad]) => bad);
  if (first) {
    card.classList.remove('is-shake'); void card.offsetWidth; if (!reduced) card.classList.add('is-shake');
    const el = first[0] === 'type' ? form.querySelector('[name="type"]') : field(first[0]);
    if (el) el.focus({ preventScroll: false });
    return false;
  }
  return true;
}
// clear an error as soon as the value becomes valid
form.addEventListener('input', (e) => {
  const t = e.target; if (t.name === 'budget') return;
  if (t.getAttribute('aria-invalid') === 'true' || t.name === 'type' || t.name === 'consent') {
    RULES[step]().forEach(([name, bad]) => { if (name === t.name && !bad) showError(name, false); });
  }
  t.closest('.ct-field')?.classList.remove('is-prefilled');
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate(step)) return;
  if (step < steps.length - 1) showStep(step + 1, 1);
  else finish();
});
backBtn.addEventListener('click', () => showStep(step - 1, -1));

/* ------------------------------------------------------------------ budget */
const range = field('budget'); const out = $('[data-budget-out]'); const hint = $('[data-budget-hint]');
const TYPE_LABEL = { wardrobe: 'Wardrobe', kitchen: 'Kitchen', 'wall-unit': 'Wall unit', desk: 'Desk or study', table: 'Table or bench', 'window-seat': 'Window seat', 'under-stairs': 'Under-stairs', 'sample-box': 'Sample box', other: 'Something else' };
let shownBudget = Number(range.value); let budgetRaf = 0;
function budgetHint(v) {
  if (v < 3000) return 'This buys a desk, a window seat or a single wall unit.';
  if (v < 7000) return 'This usually covers a wardrobe wall, or a desk with shelving above it.';
  if (v < 15000) return 'This is the range for a large wardrobe wall or a compact kitchen.';
  if (v < 25000) return 'This is the range for a full kitchen with an island, or several pieces in one room.';
  return 'This is the range for a full kitchen with premium worktops, or built-ins across several rooms.';
}
function setBudgetText(v) {
  out.textContent = euro(v) + (v >= 30000 ? '+' : '');
  range.style.setProperty('--pct', `${((range.value - range.min) / (range.max - range.min)) * 100}%`);
}
function renderBudget(animate) {
  const v = Number(range.value);
  hint.textContent = budgetHint(v);
  range.setAttribute('aria-valuetext', `${euro(v)}${v >= 30000 ? ' or more' : ''}`);
  cancelAnimationFrame(budgetRaf);
  if (!animate || reduced) { shownBudget = v; setBudgetText(v); return; }
  const from = shownBudget; const t0 = performance.now();
  const tick = (now) => { const p = clamp((now - t0) / 380, 0, 1); shownBudget = from + (v - from) * (1 - Math.pow(1 - p, 3)); setBudgetText(shownBudget); if (p < 1) budgetRaf = requestAnimationFrame(tick); };
  budgetRaf = requestAnimationFrame(tick);
}
range.addEventListener('input', () => renderBudget(true));
renderBudget(false);

/* ------------------------------------------------------------------ success */
function finish() {
  const data = new FormData(form);
  const type = TYPE_LABEL[data.get('type')] || 'Project';
  const b = Number(data.get('budget'));
  const ref = `GJ-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  $('[data-ref]').textContent = ref;
  const first = String(data.get('name') || '').trim().split(/\s+/)[0];
  $('[data-success-title]').textContent = first ? `Thank you, ${first}.` : 'Thank you.';
  const rows = [
    ['Project', type], ['Room', data.get('room')], ['Wall', data.get('width') ? `${data.get('width')} cm${data.get('height') ? ` × ${data.get('height')} cm high` : ''}` : 'Not needed'],
    ['Fitted', data.get('when')], ['Budget', `${euro(b)}${b >= 30000 ? '+' : ''}${data.get('flexible') ? ', flexible' : ''}`], ['Reply to', data.get('email')]
  ];
  $('[data-recap]').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</dd></div>`).join('');
  const success = $('[data-success]');
  const swap = () => {
    form.hidden = true; $('.ct-progress').hidden = true; success.hidden = false; success.classList.remove('is-play'); void success.offsetWidth; success.classList.add('is-play'); success.focus({ preventScroll: true });
    if (window.site && window.site.scrollTo) window.site.scrollTo(card, { offset: -100 });
  };
  if (reduced) { swap(); return; }
  form.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-20px)' }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).finished.then(swap);
}
$('[data-restart]').addEventListener('click', () => {
  form.reset(); form.getAnimations().forEach((a) => a.cancel()); form.hidden = false; $('.ct-progress').hidden = false; $('[data-success]').hidden = true;
  $$('.is-prefilled').forEach((el) => el.classList.remove('is-prefilled'));
  $$('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid')); $$('.ct-err', form).forEach((el) => { el.hidden = true; });
  renderBudget(false); showStep(0, -1);
  if (!reduced) form.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
});

/* ------------------------------------------------------------------ design from #design= */
async function initDesign() {
  const m = location.hash.match(/design=([A-Za-z0-9_-]+)/);
  const notice = $('[data-notice]'); const panel = $('[data-design]');
  if (!m) { if (/design=/.test(location.hash)) { notice.textContent = 'We could not read that design link, so the form is empty. You can still send us a request.'; notice.hidden = false; } return; }
  let libs;
  try { libs = await Promise.all([import('./configurator/share.js'), import('./configurator/pricing.js'), import('./configurator/model.js')]); }
  catch (err) { console.warn('Configurator modules unavailable.', err); return; }
  const [share, pricing, model] = libs;
  let design; let quote;
  try { design = share.decodeDesign(m[1]); quote = design && pricing.quoteDesign(design); } catch (err) { design = null; }
  if (!design || !design.modules.length) { notice.textContent = 'We could not read that design link, so the form is empty. You can still send us a request.'; notice.hidden = false; return; }

  const { MODULE_TYPES, MATERIALS } = model;
  // summary card
  panel.hidden = false;
  const groups = [];
  design.modules.forEach((mod) => {
    const key = `${mod.type}|${mod.front}|${mod.width}|${mod.height}|${mod.depth}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.n += 1; else groups.push({ key, n: 1, mod });
  });
  $('[data-design-mods]').innerHTML = groups.map(({ n, mod }) => {
    const mat = MATERIALS[mod.front] || MATERIALS.oak;
    return `<li><i style="background:${mat.color}"></i><strong>${n > 1 ? `${n} \u00d7 ` : ''}${MODULE_TYPES[mod.type].label}</strong><span>${mod.width} \u00d7 ${mod.height} \u00d7 ${mod.depth} cm</span></li>`;
  }).join('');
  const mats = Object.entries(quote.boardM2ByMaterial).sort((a, b) => b[1] - a[1]).map(([id, m2]) => `${(MATERIALS[id] || { label: id }).label} (${m2.toFixed(1)} m²)`);
  $('[data-design-mats]').textContent = `Materials: ${mats.join(', ')}.`;
  $('[data-design-total]').textContent = euro(quote.total);
  $('[data-design-weeks]').textContent = `${quote.leadTimeWeeks} weeks`;
  $('[data-design-edit]').href = `planner.html#design=${m[1]}`;
  $('[data-design-art]').innerHTML = elevation(design, MATERIALS);

  // prefill
  const count = {};
  design.modules.forEach((mod) => { count[mod.type] = (count[mod.type] || 0) + 1; });
  const has = (t) => count[t] > 0;
  const type = has('island') || has('kitchen-base') || has('kitchen-wall') ? 'kitchen' : has('wardrobe') ? 'wardrobe' : has('window-seat') ? 'window-seat' : has('desk') ? 'desk' : has('table') ? 'table' : has('shelving') || has('tall-cabinet') ? 'wall-unit' : 'other';
  const roomGuess = { kitchen: 'Kitchen', wardrobe: 'Bedroom', 'window-seat': 'Living room', desk: 'Study or home office', table: 'Dining room', 'wall-unit': 'Living room', other: '' }[type];
  const mark = (el) => el && el.closest('.ct-field') && el.closest('.ct-field').classList.add('is-prefilled');
  const radio = form.querySelector(`[name="type"][value="${type}"]`); if (radio) radio.checked = true;
  field('room').value = roomGuess; mark(field('room'));
  field('width').value = design.room.width; mark(field('width'));
  field('height').value = design.room.height; mark(field('height'));
  field('depth').value = '';
  const b = clamp(Math.round(quote.total / 500) * 500, 1500, 30000);
  range.value = String(b); renderBudget(false);
  if (!field('message').value) { field('message').value = `I would like a quote for the design summarised on this page (${design.modules.length} piece${design.modules.length > 1 ? 's' : ''}, estimated at ${euro(quote.total)} including VAT).`; mark(field('message')); }
  $('.ct-hero__lead').textContent = 'We have filled in what we could from your design. Check each step, add your details, and send it over.';
}

// A small front elevation of the design: wall, openings and each module in its front material.
function elevation(d, MATERIALS) {
  const W = d.room.width; const H = d.room.height; const pad = 6; const vw = 400; const sc = (vw - pad * 2) / W; const vh = H * sc + pad * 2;
  const rect = (x, y, w, h, cls, extra = '') => `<rect class="${cls}" x="${(pad + x * sc).toFixed(1)}" y="${(pad + (H - y - h) * sc).toFixed(1)}" width="${(w * sc).toFixed(1)}" height="${(h * sc).toFixed(1)}" ${extra}/>`;
  let s = `<svg viewBox="0 0 ${vw} ${vh.toFixed(0)}" role="img" aria-label="Front view of your design">${rect(0, 0, W, H, 'd-wall')}`;
  d.room.openings.forEach((o) => { s += rect(o.x, o.y, o.w, o.h, 'd-open'); });
  d.modules.forEach((m, i) => {
    const fill = (MATERIALS[m.front] || MATERIALS.oak).color;
    const x = m.x != null ? m.x : 0;
    s += rect(x, m.elevation || 0, m.width, m.height, 'd-mod', `style="--i:${i}" fill="${fill}"`);
  });
  return s + '</svg>';
}

/* ------------------------------------------------------------------ design from #p= (the planner) */
const escapeHtml = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function initPlan() {
  const m = location.hash.match(/^#p=([A-Za-z0-9_-]+)/);
  const notice = $('[data-notice]'); const panel = $('[data-design]');
  const fail = () => { notice.textContent = 'We could not read that design link, so the form is empty. You can still send us a request.'; notice.hidden = false; };
  if (!m) { fail(); return; }
  let libs;
  try { libs = await Promise.all([import('./planner/share.js'), import('./planner/pricing.js'), import('./planner/review-logic.js')]); }
  catch (err) { console.warn('Planner modules unavailable.', err); return; }
  const [share, pricing, logic] = libs;
  const enc = m[1];
  let project = null; let quote = null;
  try { project = await share.decodeProject(enc); quote = project && pricing.quoteProject(project); } catch (err) { project = null; }
  if (!project || !project.pieces.length) { fail(); return; }
  const sum = logic.summaryFor(project, quote);
  const view = logic.quoteView(quote, project);

  panel.hidden = false;
  let art = '';
  try {
    const entry = JSON.parse(sessionStorage.getItem(logic.THUMB_KEY) || 'null');
    if (logic.validThumb(entry, enc)) art = `<img src="${entry.thumb}" alt="Your design as you left it in the planner" width="560" height="315">`;
  } catch (err) { /* no thumbnail: the plan below does the job */ }
  $('[data-design-art]').innerHTML = art || logic.planSvg(project);
  $('[data-design-mods]').innerHTML = sum.pieces.map((p) => `<li><i style="background:${escapeHtml(p.color)}"></i><strong>${escapeHtml(p.label)}</strong><span>${escapeHtml(p.size)}</span></li>`).join('');
  $('[data-design-mats]').textContent = view.materials.length ? `Materials: ${view.materials.map((x) => `${x.label} (${x.m2.toFixed(1)} m\u00b2)`).join(', ')}.` : '';
  $('[data-design-total]').textContent = logic.formatEuro(sum.total);
  $('[data-design-weeks]').textContent = `about ${sum.leadTimeWeeks} weeks`;
  $('[data-design-edit]').href = logic.plannerLink(enc);

  const mark = (el) => el && el.closest('.ct-field') && el.closest('.ct-field').classList.add('is-prefilled');
  const radio = form.querySelector(`[name="type"][value="${sum.formType}"]`); if (radio) radio.checked = true;
  if (sum.roomGuess) { field('room').value = sum.roomGuess; mark(field('room')); }
  field('width').value = sum.wallWidth; mark(field('width'));
  field('height').value = sum.wallHeight; mark(field('height'));
  field('depth').value = '';
  const b = clamp(Math.round(sum.total / 500) * 500, 1500, 30000);
  range.value = String(b); renderBudget(false);
  if (!field('message').value) {
    field('message').value = logic.contactMessage(sum, new URL(logic.plannerLink(enc), location.href).href);
    mark(field('message'));
  }
  $('.ct-hero__lead').textContent = 'We have filled in what we could from your design. Check each step, add your details, and send it over.';
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

/* ------------------------------------------------------------------ #samples: preselect the Sample box project type */
function initSamples() {
  if (location.hash !== '#samples') return;
  const radio = form.querySelector('[name="type"][value="sample-box"]');
  if (radio) { radio.checked = true; const err = $('[data-err="type"]'); if (err) err.hidden = true; }
}

/* ------------------------------------------------------------------ boot */
showStep(0, 1, false);
initSamples();
initHours();
initMap();
(/^#p=/.test(location.hash) ? initPlan() : initDesign()).then(() => { if (window.site && window.site.refresh) window.site.refresh(); });
window.addEventListener('hashchange', () => { if (/design=|^#p=/.test(location.hash)) location.reload(); else initSamples(); });
