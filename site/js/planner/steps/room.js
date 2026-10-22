// Step 1: Room. Template cards, measurements, a scaled plan with draggable dimension handles, a wall elevation
// with openings, and finishes. The DOM is built once; update(state) only touches what changed.
import {
  TEMPLATES, TEMPLATE_PARAMS, OPENING_TYPES, FLOORS, WALL_COLORS, LIMITS, SWINGS, wallsOf, area, roomFromTemplate
} from '../model.js';
import { WALL_T, wallQuads, wallPoint, ceilingProfile, PLAN_HANDLES, roomBounds, snapTo } from '../plan-geom.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const SWING_LABEL = {
  'in-left': 'Opens into the room, hinge on the left',
  'in-right': 'Opens into the room, hinge on the right',
  'out-left': 'Opens outward, hinge on the left',
  'out-right': 'Opens outward, hinge on the right'
};
const PARAM_UNIT = { slopeAngle: '°', slopeWall: '' };
const PARAM_STEP = { slopeAngle: 1, slopeWall: 1 };
const TYPE_ICON = {
  door: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V3h9v18M3 21h18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12.5" cy="12.5" r="1" fill="currentColor"/></svg>',
  window: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="15" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3.5v15M4 11h16M2.5 21h19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  radiator: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM8 6v12M12 6v12M16 6v12M6 20v1M18 20v1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  socket: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9.5" cy="12" r="1.1" fill="currentColor"/><circle cx="14.5" cy="12" r="1.1" fill="currentColor"/></svg>'
};
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';

// ---------- template thumbnails ----------
function thumbSvg(id) {
  const room = roomFromTemplate(id, {});
  const pts = room.walls;
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const W = 64, H = 46, pad = 5;
  const k = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxZ - minZ));
  const ox = (W - (maxX - minX) * k) / 2 - minX * k, oz = (H - (maxZ - minZ) * k) / 2 - minZ * k;
  const P = (p) => `${f1(p.x * k + ox)},${f1(p.z * k + oz)}`;
  let extra = '';
  if (id === 'attic') {
    const x = minX * k + ox, y = minZ * k + oz, w = (maxX - minX) * k, d = 0.32 * (maxZ - minZ) * k;
    extra = `<path class="pl-thumb__slope" d="M${f1(x)},${f1(y + d)} H${f1(x + w)} M${f1(x + 6)},${f1(y)} l-5,${f1(d)} M${f1(x + 16)},${f1(y)} l-5,${f1(d)} M${f1(x + 26)},${f1(y)} l-5,${f1(d)} M${f1(x + 36)},${f1(y)} l-5,${f1(d)} M${f1(x + 46)},${f1(y)} l-5,${f1(d)}"/>`;
  }
  if (id === 'hallway') {
    const x = maxX * k + ox, y = (maxZ + minZ) / 2 * k + oz;
    extra = `<path class="pl-thumb__door" d="M${f1(x)},${f1(y - 3)} v6 M${f1(minX * k + ox)},${f1(y - 3)} v6"/>`;
  }
  return `<svg class="pl-thumb" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polygon class="pl-thumb__room" points="${pts.map(P).join(' ')}"/>${extra}</svg>`;
}

// ---------- helpers on rooms ----------
const openingName = (room, o) => {
  const same = room.openings.filter((x) => x.type === o.type);
  const label = OPENING_TYPES[o.type].label;
  return same.length > 1 ? `${label} ${same.findIndex((x) => x.id === o.id) + 1}` : label;
};
const wallNo = (id) => String(id).replace(/^w/, '');
const friendly = (msg) => msg.replace(/\b[Ww]all w(\d+)\b/g, (m, n) => `${m[0] === 'W' ? 'Wall' : 'wall'} ${n}`);

export function createRoomStep({ side: root, plan: planBox, elev: elevBox }, { store, announce = () => {}, confirmShape }) {
  let state = store.getState();
  let validation = { errors: [] };
  let currentTemplate = null;
  let planKey = '', inspectorKey = '', chipsKey = '', noticeId = state.ui.notice ? state.ui.notice.id : 0, noticeTimer = 0;
  let frozen = null; // plan transform kept while a handle is dragged, so the drawing does not rescale under the pointer
  let drag = null;

  const SHORT = { rect: 'Rectangle', 'l-shape': 'L-shape', alcoves: 'Alcoves', attic: 'Attic', hallway: 'Hallway', bay: 'Bay window' };
  root.innerHTML = `
    <header class="pl-sec__head">
      <p class="eyebrow">Step 1 of 5</p>
      <h2 id="pl-h-shape">Your room</h2>
      <p class="pl-lede">Pick the closest shape, then set its measurements or drag the round handles on the plan (arrow keys nudge by 1 cm, Shift by 10). Click a wall to work on it.</p>
    </header>
    <ul class="pl-notes" id="pl-notes" aria-label="Room checks"></ul>

    <section class="pl-sec" aria-labelledby="pl-h-tpl">
      <header class="pl-sec__row"><h3 id="pl-h-tpl">Shape</h3></header>
      <div class="pl-cards" role="radiogroup" aria-label="Room shape" id="pl-cards">
        ${Object.entries(TEMPLATES).map(([id, t]) => `
          <label class="pl-card" title="${esc(t.label)}"><input type="radio" name="pl-template" value="${id}" aria-label="${esc(t.label)}"><span class="pl-card__body">${thumbSvg(id)}<span class="pl-card__name" aria-hidden="true">${esc(SHORT[id])}</span></span></label>`).join('')}
      </div>
    </section>

    <section class="pl-sec" aria-labelledby="pl-h-meas">
      <header class="pl-sec__row">
        <h3 id="pl-h-meas">Measurements</h3>
        <p class="pl-stat" aria-live="polite"><span class="pl-stat__label">Floor area</span> <b id="pl-area">0.0 m\u00b2</b></p>
      </header>
      <div class="pl-form" id="pl-form"></div>
    </section>

    <section class="pl-sec" aria-labelledby="pl-h-wall">
      <header class="pl-sec__row">
        <h3 id="pl-h-wall">Walls and openings</h3>
        <div class="pl-menu" id="pl-add">
          <button type="button" class="pl-btn pl-btn--accent" id="pl-add-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="pl-add-menu">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Add
            <span class="visually-hidden">an opening to the selected wall</span></button>
          <ul class="pl-menu__list" id="pl-add-menu" role="menu" aria-label="Add to this wall" hidden>
            ${Object.entries(OPENING_TYPES).map(([k, t]) => `<li role="none"><button type="button" role="menuitem" data-add="${k}">${TYPE_ICON[k]}<span>${t.label}</span></button></li>`).join('')}
          </ul>
        </div>
      </header>
      <p class="pl-addnote" id="pl-addnote" role="status"></p>
      <div class="pl-chips" id="pl-chips" role="group" aria-label="Choose a wall"></div>
      <p class="pl-hint" id="pl-elev-hint"></p>
      <div class="pl-inspector" id="pl-inspector" aria-live="off"></div>
    </section>

    <section class="pl-sec" aria-labelledby="pl-h-fin">
      <header class="pl-sec__row"><h3 id="pl-h-fin">Finishes</h3></header>
      <div class="pl-finish">
        <fieldset class="pl-fieldset">
          <legend>Floor</legend>
          <div class="pl-swatches" id="pl-floors">
            ${Object.entries(FLOORS).map(([id, f]) => `<label class="pl-swatch"><input type="radio" name="pl-floor" value="${id}"><span class="pl-swatch__chip" style="--chip:${f.color}"></span><span class="pl-swatch__name">${esc(f.label)}</span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="pl-fieldset">
          <legend>Wall colour</legend>
          <div class="pl-swatches" id="pl-wallcols">
            ${Object.entries(WALL_COLORS).map(([id, f]) => `<label class="pl-swatch"><input type="radio" name="pl-wallcol" value="${id}"><span class="pl-swatch__chip" style="--chip:${f.color}"></span><span class="pl-swatch__name">${esc(f.label)}</span></label>`).join('')}
          </div>
        </fieldset>
        <div class="pl-form pl-form--one" id="pl-skirt"></div>
      </div>
    </section>`;
  planBox.innerHTML = '<svg id="pl-plan-svg" role="group" aria-label="Plan of the room, drawn to scale" xmlns="http://www.w3.org/2000/svg"></svg>';
  elevBox.innerHTML = '<svg id="pl-elev-svg" role="group" aria-label="Elevation of the selected wall" xmlns="http://www.w3.org/2000/svg"></svg>';

  const $ = (sel) => root.querySelector(sel);
  const planSvg = planBox.querySelector('#pl-plan-svg'), elevSvg = elevBox.querySelector('#pl-elev-svg');
  const formEl = $('#pl-form'), notesEl = $('#pl-notes'), chipsEl = $('#pl-chips'), inspEl = $('#pl-inspector');
  const addBtn = $('#pl-add-btn'), addMenu = $('#pl-add-menu');

  // ---------- fields ----------
  const fieldHtml = (bind, label, value, { min, max, step = 1, unit = 'cm', slider = true, sliderStep }) => `
    <div class="pl-row">
      <label class="pl-row__label" for="pl-n-${bind.replace(/\W/g, '-')}">${esc(label)}</label>
      <span class="pl-field"><input class="pl-field__input" type="number" inputmode="decimal" id="pl-n-${bind.replace(/\W/g, '-')}" data-bind="${bind}" data-min="${min}" data-max="${max}" min="${min}" max="${max}" step="${step}" value="${value}"><span class="pl-field__unit" aria-hidden="true">${unit}</span></span>
      ${slider ? `<input class="pl-range" type="range" data-bind="${bind}" data-min="${min}" data-max="${max}" min="${min}" max="${max}" step="${sliderStep || step}" value="${value}" aria-label="${esc(label)} slider">` : ''}
    </div>`;

  const lookup = (bind) => {
    const room = state.project.room;
    if (bind === 'height') return room.height;
    if (bind === 'skirting') return room.skirting;
    if (bind.startsWith('param:')) return room.template ? room.template.params[bind.slice(6)] : undefined;
    if (bind.startsWith('open:')) {
      const o = room.openings.find((x) => x.id === state.ui.openingId);
      return o ? o[bind.slice(5)] : undefined;
    }
    return undefined;
  };

  function syncInputs() {
    root.querySelectorAll('[data-bind]').forEach((el) => {
      const v = lookup(el.dataset.bind);
      if (v === undefined) return;
      if (el.type === 'number' && el === document.activeElement) return;
      if (String(el.value) !== String(v)) el.value = v;
    });
  }

  function apply(bind, raw, commit) {
    const v = Number(raw);
    if (raw === '' || !Number.isFinite(v)) return;
    const lo = Number(root.querySelector(`[data-bind="${bind}"]`).dataset.min), hi = Number(root.querySelector(`[data-bind="${bind}"]`).dataset.max);
    if (!commit && (v < lo || v > hi)) return; // let people type through values that are not valid yet
    const val = clamp(Math.round(v), lo, hi);
    const key = `field:${bind}`;
    if (bind === 'height') store.dispatch({ type: 'room/update', patch: { height: val }, coalesce: key });
    else if (bind === 'skirting') store.dispatch({ type: 'room/update', patch: { skirting: val }, coalesce: key });
    else if (bind.startsWith('param:')) store.dispatch({ type: 'room/params', params: { [bind.slice(6)]: val }, coalesce: key });
    else if (bind.startsWith('open:') && state.ui.openingId) {
      store.dispatch({ type: 'room/opening/update', id: state.ui.openingId, patch: { [bind.slice(5)]: val }, coalesce: `open:${state.ui.openingId}:${bind}` });
    }
  }

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches && el.matches('[data-bind]')) apply(el.dataset.bind, el.value, false);
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches && el.matches('input[data-bind][type="number"]')) {
      apply(el.dataset.bind, el.value, true);
      const v = lookup(el.dataset.bind);
      if (v !== undefined) el.value = v;
      store.dispatch({ type: 'history/seal' });
    } else if (el.matches && el.matches('input[data-bind][type="range"]')) {
      store.dispatch({ type: 'history/seal' });
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input[type="number"]') && e.key === 'Enter') e.target.blur();
  });

  // ---------- template cards ----------
  const cardInputs = [...root.querySelectorAll('input[name="pl-template"]')];
  cardInputs.forEach((inp) => inp.addEventListener('change', () => {
    const id = inp.value;
    const room = state.project.room;
    if (room.template && room.template.id === id) return;
    const placed = state.project.placements.length;
    const apply = () => {
      store.dispatch({ type: 'room/template', id });
      store.dispatch({ type: 'history/seal' });
      announce(`Room shape changed to ${TEMPLATES[id].label}.`);
    };
    if (placed > 0) {
      const text = `Your ${placed} placed ${placed === 1 ? 'piece' : 'pieces'} may need moving.`;
      confirmShape(text).then((ok) => { if (ok) apply(); else syncCards(); });
    } else apply();
  }));
  function syncCards() {
    const id = state.project.room.template ? state.project.room.template.id : null;
    cardInputs.forEach((i) => { i.checked = i.value === id; });
  }

  // ---------- measurement form ----------
  function buildForm() {
    const room = state.project.room;
    const t = room.template;
    const rows = [];
    if (t) {
      for (const [name, spec] of Object.entries(TEMPLATE_PARAMS[t.id])) {
        rows.push(fieldHtml(`param:${name}`, spec.label.replace(/ \(.*\)$/, ''), t.params[name], {
          min: spec.min, max: spec.max, unit: PARAM_UNIT[name] ?? 'cm', sliderStep: PARAM_STEP[name] || 5
        }));
      }
    }
    rows.push(fieldHtml('height', t && t.id === 'attic' ? 'Ridge height' : 'Ceiling height', room.height, { min: LIMITS.height[0], max: LIMITS.height[1], sliderStep: 5 }));
    formEl.innerHTML = rows.join('');
    $('#pl-skirt').innerHTML = fieldHtml('skirting', 'Skirting height', room.skirting, { min: LIMITS.skirting[0], max: LIMITS.skirting[1], sliderStep: 1 });
  }

  // ---------- plan ----------
  function planLayout(room, W, Hb) {
    if (frozen && frozen.W === W && frozen.H === Hb) return frozen;
    const b = roomBounds(room);
    const pad = W < 520 ? 46 : 62;
    const s = Math.max(0.05, Math.min((W - 2 * pad) / Math.max(1, b.width), (Hb - 2 * pad) / Math.max(1, b.depth)));
    return { W, H: Hb, s, ox: (W - b.width * s) / 2 - b.minX * s, oz: (Hb - b.depth * s) / 2 - b.minZ * s };
  }

  function renderPlan() {
    const W = Math.round(planBox.clientWidth), Hb = Math.round(planBox.clientHeight);
    if (W < 120 || Hb < 120) return;
    const room = state.project.room;
    const L = planLayout(room, W, Hb);
    const { s, ox, oz, H } = L;
    const X = (x) => x * s + ox, Z = (z) => z * s + oz;
    const pt = (p) => `${f1(X(p.x))} ${f1(Z(p.z))}`;
    const wp = (wall, u, v = 0) => pt(wallPoint(wall, u, v));
    const walls = wallsOf(room);
    const quads = wallQuads(room);
    const sel = state.ui.wallId;
    const out = [];

    // defs
    out.push(`<defs><pattern id="pl-hatch-p" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="pl-hatch-line"/></pattern>`
      + `<clipPath id="pl-clip-room"><polygon points="${room.walls.map((c) => `${f1(X(c.x))},${f1(Z(c.z))}`).join(' ')}"/></clipPath></defs>`);

    // grid: faint everywhere, stronger inside the room. 10 cm lines, 1 m major lines
    const gridPath = (step) => {
      const d = [];
      const x0 = Math.ceil((0 - ox) / s / step) * step, x1 = Math.floor((W - ox) / s / step) * step;
      for (let x = x0; x <= x1; x += step) d.push(`M${f1(X(x))} 0V${H}`);
      const z0 = Math.ceil((0 - oz) / s / step) * step, z1 = Math.floor((H - oz) / s / step) * step;
      for (let z = z0; z <= z1; z += step) d.push(`M0 ${f1(Z(z))}H${W}`);
      return d.join('');
    };
    const minor = s * 10 >= 5 ? gridPath(10) : '';
    const major = gridPath(100);
    out.push(`<g class="pl-grid pl-grid--outer" aria-hidden="true"><path class="pl-grid-minor" d="${minor}"/><path class="pl-grid-major" d="${major}"/></g>`);
    out.push(`<polygon class="pl-floor" points="${room.walls.map((c) => `${f1(X(c.x))},${f1(Z(c.z))}`).join(' ')}"/>`);
    out.push(`<g class="pl-grid pl-grid--inner" clip-path="url(#pl-clip-room)" aria-hidden="true"><path class="pl-grid-minor" d="${minor}"/><path class="pl-grid-major" d="${major}"/></g>`);

    // walls
    for (const q of quads) {
      const d = `M${pt(q.inner[0])}L${pt(q.inner[1])}L${pt(q.outer[1])}L${pt(q.outer[0])}Z`;
      out.push(`<path class="pl-wall${q.id === sel ? ' is-selected' : ''}" d="${d}" data-wall="${q.id}"><title>Wall ${wallNo(q.id)}, ${Math.round(q.wall.length)} cm. Click to select.</title></path>`);
    }

    // openings
    const sw = (wall, u, v) => wallPoint(wall, u, v);
    for (const o of room.openings) {
      const wall = walls.find((w) => w.id === o.wallId);
      if (!wall) continue;
      const u0 = Math.max(0, o.offset), u1 = Math.min(wall.length, o.offset + o.width);
      if (u1 - u0 < 1) continue;
      const mid = (u0 + u1) / 2;
      const selected = o.id === state.ui.openingId;
      const cls = `pl-open pl-open--${o.type}${selected ? ' is-selected' : ''}${o.flagged ? ' is-flagged' : ''}`;
      const quad = (ua, ub, va, vb) => `M${wp(wall, ua, va)}L${wp(wall, ub, va)}L${wp(wall, ub, vb)}L${wp(wall, ua, vb)}Z`;
      let g = '';
      if (o.type === 'window') {
        g += `<path class="pl-cut" d="${quad(u0, u1, -WALL_T, 0)}"/>`;
        for (const v of [-WALL_T * 0.34, -WALL_T * 0.66]) g += `<path class="pl-win-line" d="M${wp(wall, u0, v)}L${wp(wall, u1, v)}"/>`;
        g += `<path class="pl-win-end" d="M${wp(wall, u0, -WALL_T)}L${wp(wall, u0, 0)}M${wp(wall, u1, -WALL_T)}L${wp(wall, u1, 0)}"/>`;
      } else if (o.type === 'door') {
        g += `<path class="pl-cut" d="${quad(u0, u1, -WALL_T, 0)}"/>`;
        const left = (o.swing || 'in-left').endsWith('left'), inward = (o.swing || 'in-left').startsWith('in');
        const hu = left ? u0 : u1, fu = left ? u1 : u0, k = inward ? 1 : -1, r = u1 - u0;
        const hinge = sw(wall, hu, 0), far = sw(wall, fu, 0), open = sw(wall, hu, k * r);
        const cross = (far.x - hinge.x) * (open.z - hinge.z) - (far.z - hinge.z) * (open.x - hinge.x);
        g += `<path class="pl-door-arc" d="M${pt(far)}A${f1(r * s)} ${f1(r * s)} 0 0 ${cross > 0 ? 1 : 0} ${pt(open)}"/>`;
        g += `<path class="pl-door-leaf" d="M${pt(hinge)}L${pt(open)}"/>`;
        g += `<path class="pl-win-end" d="M${wp(wall, u0, -WALL_T)}L${wp(wall, u0, 0)}M${wp(wall, u1, -WALL_T)}L${wp(wall, u1, 0)}"/>`;
      } else if (o.type === 'radiator') {
        const dep = Math.max(7, o.depth || 10);
        g += `<path class="pl-rad" d="${quad(u0, u1, 0, dep)}" fill="url(#pl-hatch-p)"/>`;
      } else {
        const c = sw(wall, mid, 0);
        g += `<circle class="pl-sock" cx="${f1(X(c.x))}" cy="${f1(Z(c.z))}" r="4.5"/>`;
      }
      const hitV = o.type === 'door' ? Math.max(40, u1 - u0) : 12;
      g += `<path class="pl-hit" d="${quad(u0, u1, -WALL_T, o.type === 'door' ? (o.swing || 'in-left').startsWith('in') ? hitV : 0 : hitV)}" data-opening="${o.id}"><title>${esc(openingName(room, o))} on wall ${wallNo(wall.id)}. Click to edit.</title></path>`;
      out.push(`<g class="${cls}">${g}</g>`);
    }

    // wall numbers inside the room
    for (const q of quads) {
      const w = q.wall;
      if (w.length * s < 30) continue;
      const c = wallPoint(w, w.length / 2, 15 / s + 3);
      out.push(`<text class="pl-wall-num${q.id === sel ? ' is-selected' : ''}" x="${f1(X(c.x))}" y="${f1(Z(c.z))}" text-anchor="middle" dominant-baseline="central" aria-hidden="true">${wallNo(q.id)}</text>`);
    }

    // dimension lines on every wall
    for (const w of walls) {
      const len = w.length;
      if (len * s < 18) continue;
      const vOff = -(WALL_T + 15 / s);
      const a = wallPoint(w, 0, vOff), b = wallPoint(w, len, vOff);
      const e0 = wallPoint(w, 0, -(WALL_T + 3 / s)), e1 = wallPoint(w, len, -(WALL_T + 3 / s));
      const x0 = wallPoint(w, 0, vOff - 5 / s), x1 = wallPoint(w, len, vOff - 5 / s);
      const mid = wallPoint(w, len / 2, vOff - 9 / s);
      let ang = w.angle;
      if (ang > 90.5 || ang < -89.5) ang += 180;
      const px = len * s;
      const label = px > 74 ? `${Math.round(len)} cm` : px > 30 ? `${Math.round(len)}` : '';
      out.push(`<g class="pl-dim" aria-hidden="true"><path class="pl-dim-line" d="M${pt(a)}L${pt(b)}M${pt(e0)}L${pt(x0)}M${pt(e1)}L${pt(x1)}"/>`
        + (label ? `<text class="pl-dim-text" x="${f1(X(mid.x))}" y="${f1(Z(mid.z))}" text-anchor="middle" transform="rotate(${f1(ang)} ${f1(X(mid.x))} ${f1(Z(mid.z))})">${label}</text>` : '') + '</g>');
    }

    // draggable handles
    const t = room.template;
    if (t) {
      for (const h of PLAN_HANDLES[t.id] || []) {
        const w = walls[h.wall];
        if (!w) continue;
        const spec = TEMPLATE_PARAMS[t.id][h.param];
        const c = wallPoint(w, w.length / 2, -WALL_T / 2);
        const horizontal = h.axis === 'x';
        const val = t.params[h.param];
        const label = spec.label.replace(/ \(.*\)$/, '');
        const arrow = horizontal
          ? 'M-5 0L-9.5 0M-9.5 0L-6.5 -2.6M-9.5 0L-6.5 2.6M5 0L9.5 0M9.5 0L6.5 -2.6M9.5 0L6.5 2.6'
          : 'M0 -5L0 -9.5M0 -9.5L-2.6 -6.5M0 -9.5L2.6 -6.5M0 5L0 9.5M0 9.5L-2.6 6.5M0 9.5L2.6 6.5';
        out.push(`<g class="pl-handle${drag && drag.param === h.param ? ' is-active' : ''}" transform="translate(${f1(X(c.x))} ${f1(Z(c.z))})" tabindex="0" role="slider" data-handle="${h.param}"`
          + ` aria-label="${esc(label)}: drag, or use the arrow keys" aria-orientation="${horizontal ? 'horizontal' : 'vertical'}"`
          + ` aria-valuemin="${spec.min}" aria-valuemax="${spec.max}" aria-valuenow="${val}" aria-valuetext="${val} ${PARAM_UNIT[h.param] === '°' ? 'degrees' : 'centimetres'}">`
          + `<circle class="pl-handle__hit" r="19"/><circle class="pl-handle__dot" r="11"/><path class="pl-handle__arrows" d="${arrow}"/></g>`);
      }
    }

    // while dragging, show the value being set
    if (drag) {
      const v = state.project.room.template.params[drag.param];
      out.push(`<g class="pl-readout" aria-hidden="true" transform="translate(${W - 12} 12)"><rect x="-96" y="-2" width="96" height="26" rx="13"/><text x="-48" y="12" text-anchor="middle" dominant-baseline="central">${esc(drag.label)} ${v}${PARAM_UNIT[drag.param] ?? ' cm'}</text></g>`);
    }

    planSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    planSvg.setAttribute('width', W);
    planSvg.setAttribute('height', H);
    const focusedHandle = document.activeElement && planSvg.contains(document.activeElement) ? document.activeElement.getAttribute('data-handle') : null;
    planSvg.innerHTML = out.join('');
    if (focusedHandle) {
      const el = planSvg.querySelector(`[data-handle="${focusedHandle}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  // below 1280 px the plan and the wall are tabs: picking a wall in the plan opens its elevation
  const compact = window.matchMedia('(max-width: 1279px)');
  function showWallPane() { if (compact.matches) store.dispatch({ type: 'ui/pane', pane: 'wall' }); }

  // plan interaction
  function svgScale() {
    const r = planSvg.getBoundingClientRect();
    return r.width / (Number(planSvg.getAttribute('width')) || r.width || 1);
  }
  planSvg.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-handle]');
    if (!h || e.button > 0) return;
    const room = state.project.room;
    const def = (PLAN_HANDLES[room.template.id] || []).find((x) => x.param === h.dataset.handle);
    if (!def) return;
    e.preventDefault();
    frozen = planLayout(room, Math.round(planBox.clientWidth), Math.round(planBox.clientHeight));
    const spec = TEMPLATE_PARAMS[room.template.id][def.param];
    drag = {
      ...def, label: spec.label.replace(/ \(.*\)$/, ''), spec, start: room.template.params[def.param],
      x0: e.clientX, y0: e.clientY, pointer: e.pointerId, last: room.template.params[def.param]
    };
    planSvg.setPointerCapture(e.pointerId);
    h.focus({ preventScroll: true });
    planBox.classList.add('is-dragging');
    renderPlan();
  });
  planSvg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const k = svgScale() * (frozen ? frozen.s : 1);
    const delta = (drag.axis === 'x' ? e.clientX - drag.x0 : e.clientY - drag.y0) / k;
    const v = clamp(snapTo(drag.start + drag.sign * (drag.factor || 1) * delta, 5), drag.spec.min, drag.spec.max);
    if (v === drag.last) return;
    drag.last = v;
    store.dispatch({ type: 'room/params', params: { [drag.param]: v }, coalesce: `plan:${drag.param}` });
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.pointer)) return;
    try { planSvg.releasePointerCapture(drag.pointer); } catch { /* already released */ }
    drag = null; frozen = null;
    planBox.classList.remove('is-dragging');
    store.dispatch({ type: 'history/seal' });
    planKey = '';
    renderPlan();
  };
  planSvg.addEventListener('pointerup', endDrag);
  planSvg.addEventListener('pointercancel', endDrag);
  planSvg.addEventListener('click', (e) => {
    const o = e.target.closest('[data-opening]');
    if (o) { store.dispatch({ type: 'ui/opening', id: o.dataset.opening }); showWallPane(); return; }
    const w = e.target.closest('[data-wall]');
    if (w) { store.dispatch({ type: 'ui/wall', wallId: w.dataset.wall }); showWallPane(); }
  });
  planSvg.addEventListener('keydown', (e) => {
    const h = e.target.closest && e.target.closest('[data-handle]');
    if (h) {
      const room = state.project.room;
      const def = (PLAN_HANDLES[room.template.id] || []).find((x) => x.param === h.dataset.handle);
      if (!def) return;
      const step = e.shiftKey ? 10 : 1;
      const keys = def.axis === 'x' ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
      let d = keys[e.key] ? keys[e.key] * step : 0;
      if (e.key === 'PageUp') d = 10;
      if (e.key === 'PageDown') d = -10;
      if (!d) return;
      e.preventDefault();
      const spec = TEMPLATE_PARAMS[room.template.id][def.param];
      const cur = room.template.params[def.param];
      const v = clamp(cur + def.sign * (def.factor || 1) * d, spec.min, spec.max);
      store.dispatch({ type: 'room/params', params: { [def.param]: Math.round(v) }, coalesce: `plan:${def.param}` });
      return;
    }
    const wEl = e.target.closest && e.target.closest('[data-wall]');
    if (wEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); store.dispatch({ type: 'ui/wall', wallId: wEl.dataset.wall }); }
  });
  // key events from the plan should not leave a half-finished undo step behind
  planSvg.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) store.dispatch({ type: 'history/seal' }); });

  // ---------- wall chips ----------
  function renderChips() {
    const room = state.project.room;
    const walls = wallsOf(room);
    const key = walls.map((w) => `${w.id}:${Math.round(w.length)}:${room.openings.filter((o) => o.wallId === w.id).length}`).join();
    if (key !== chipsKey) {
      chipsKey = key;
      chipsEl.innerHTML = walls.map((w) => {
        const n = room.openings.filter((o) => o.wallId === w.id).length;
        return `<button type="button" class="pl-chip" data-chip="${w.id}" aria-pressed="false"><b>${wallNo(w.id)}</b><span>${Math.round(w.length)} cm</span>${n ? `<i aria-label="${n} ${n === 1 ? 'opening' : 'openings'}">${n}</i>` : ''}</button>`;
      }).join('');
    }
    chipsEl.querySelectorAll('[data-chip]').forEach((b) => {
      const on = b.dataset.chip === state.ui.wallId;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    });
  }
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip]');
    if (b) store.dispatch({ type: 'ui/wall', wallId: b.dataset.chip });
  });

  // ---------- wall elevation ----------
  const openDrag = { o: null };
  function elevLayout(room, wall, W, Hb) {
    const minPad = 46, padT = 40, padB = 34;
    const hMax = Math.max(...ceilingProfile(room, wall).map((p) => p[1]), 1);
    const s = Math.max(0.05, Math.min((W - 2 * minPad) / wall.length, (Hb - padT - padB) / hMax));
    const padL = Math.round((W - wall.length * s) / 2);
    const top = Math.round((Hb - (hMax * s + padT + padB)) / 2);
    return { W, H: Hb, s, padL, padT: padT + top, padB: padB + top, hMax };
  }

  function renderElev() {
    const W = Math.round(elevBox.clientWidth), Hb = Math.round(elevBox.clientHeight);
    if (W < 120 || Hb < 100) return;
    const room = state.project.room;
    const wall = wallsOf(room).find((w) => w.id === state.ui.wallId);
    if (!wall) { elevSvg.innerHTML = ''; return; }
    const L = elevLayout(room, wall, W, Hb);
    const { s, padL, padT, H } = L;
    const X = (u) => padL + u * s, Y = (h) => H - L.padB - h * s;
    const profile = ceilingProfile(room, wall);
    const out = [];
    out.push(`<defs><pattern id="pl-hatch-e" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="pl-hatch-line"/></pattern></defs>`);
    // wall face and ceiling
    const poly = [`${f1(X(0))},${f1(Y(0))}`, `${f1(X(wall.length))},${f1(Y(0))}`, ...profile.slice().reverse().map(([u, h]) => `${f1(X(u))},${f1(Y(h))}`)];
    out.push(`<polygon class="pl-face" points="${poly.join(' ')}"/>`);
    // ruler ticks every 50 cm along the floor
    let ticks = '';
    for (let u = 0; u <= wall.length + 0.1; u += 50) ticks += `M${f1(X(u))} ${f1(Y(0))}v${u % 100 === 0 ? 7 : 4}`;
    out.push(`<path class="pl-ruler" d="${ticks}"/>`);
    out.push(`<path class="pl-floorline" d="M${f1(X(-10))} ${f1(Y(0))}H${f1(X(wall.length + 10))}"/>`);
    out.push(`<path class="pl-ceilline" d="M${profile.map(([u, h], i) => `${i ? 'L' : ''}${f1(X(u))} ${f1(Y(h))}`).join('')}"/>`);

    // dimensions: wall length on top, ceiling height at each end
    const topY = Y(L.hMax) - 22;
    out.push(`<g class="pl-dim" aria-hidden="true"><path class="pl-dim-line" d="M${f1(X(0))} ${f1(topY)}H${f1(X(wall.length))}M${f1(X(0))} ${f1(topY - 4)}v8M${f1(X(wall.length))} ${f1(topY - 4)}v8"/>`
      + `<text class="pl-dim-text" x="${f1(X(wall.length / 2))}" y="${f1(topY - 7)}" text-anchor="middle">Wall ${wallNo(wall.id)} · ${Math.round(wall.length)} cm</text></g>`);
    const hAt = (u, h, side) => {
      const x = side < 0 ? padL - 26 : X(wall.length) + 26;
      return `<g class="pl-dim" aria-hidden="true"><path class="pl-dim-line" d="M${f1(x)} ${f1(Y(0))}V${f1(Y(h))}M${f1(x - 4)} ${f1(Y(0))}h8M${f1(x - 4)} ${f1(Y(h))}h8"/>`
        + `<text class="pl-dim-text" transform="translate(${f1(x - 7)} ${f1((Y(0) + Y(h)) / 2)}) rotate(-90)" text-anchor="middle">${Math.round(h)}</text></g>`;
    };
    out.push(hAt(0, profile[0][1], -1));
    const last = profile[profile.length - 1][1];
    if (Math.abs(last - profile[0][1]) > 1) out.push(hAt(wall.length, last, 1));

    // openings
    const here = room.openings.filter((o) => o.wallId === wall.id);
    for (const o of here) {
      const selected = o.id === state.ui.openingId;
      const x = X(o.offset), y = Y(o.bottom + o.height), w = o.width * s, h = o.height * s;
      const name = openingName(room, o);
      const maxOff = Math.max(0, Math.floor(wall.length - o.width));
      let g = '';
      if (o.type === 'window') {
        g += `<rect class="pl-glass" x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}"/>`;
        if (o.width > 110) g += `<path class="pl-mullion" d="M${f1(x + w / 2)} ${f1(y)}V${f1(y + h)}"/>`;
        g += `<path class="pl-reflect" d="M${f1(x + w * 0.16)} ${f1(y + h * 0.8)}L${f1(x + w * 0.34)} ${f1(y + h * 0.2)}"/>`;
      } else if (o.type === 'door') {
        const left = (o.swing || 'in-left').endsWith('left');
        const hx = left ? x : x + w, ox = left ? x + w : x;
        g += `<rect class="pl-leaf" x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}"/>`;
        g += `<path class="pl-swing" d="M${f1(ox)} ${f1(y)}L${f1(hx)} ${f1(y + h / 2)}L${f1(ox)} ${f1(y + h)}"/>`;
        g += `<circle class="pl-knob" cx="${f1(left ? x + w - 9 : x + 9)}" cy="${f1(y + h * 0.5)}" r="2.6"/>`;
      } else if (o.type === 'radiator') {
        g += `<rect class="pl-rad" x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="url(#pl-hatch-e)"/>`;
      } else {
        g += `<rect class="pl-socket" x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(w, 10))}" height="${f1(Math.max(h, 10))}" rx="2.5"/>`;
        g += `<circle class="pl-knob" cx="${f1(x + Math.max(w, 10) / 2 - 2.4)}" cy="${f1(y + Math.max(h, 10) / 2)}" r="1.4"/><circle class="pl-knob" cx="${f1(x + Math.max(w, 10) / 2 + 2.4)}" cy="${f1(y + Math.max(h, 10) / 2)}" r="1.4"/>`;
      }
      const label = `${name}, offset ${o.offset} cm, bottom ${o.bottom} cm`;
      out.push(`<g class="pl-eo pl-eo--${o.type}${selected ? ' is-selected' : ''}${o.flagged ? ' is-flagged' : ''}" data-opening="${o.id}" tabindex="0" role="slider"`
        + ` aria-label="${esc(name)} position along the wall: drag, or use the arrow keys" aria-orientation="horizontal"`
        + ` aria-valuemin="0" aria-valuemax="${maxOff}" aria-valuenow="${o.offset}" aria-valuetext="${esc(label)}">${g}`
        + `<rect class="pl-eo__ring" x="${f1(x - 2)}" y="${f1(y - 2)}" width="${f1(Math.max(w, 10) + 4)}" height="${f1(Math.max(h, 10) + 4)}" rx="3"/></g>`);
      if (selected) {
        const my = Y(o.bottom + o.height / 2);
        if (o.offset > 4) out.push(`<g class="pl-dim pl-dim--sel" aria-hidden="true"><path class="pl-dim-line" d="M${f1(X(0))} ${f1(my)}H${f1(x)}M${f1(X(0))} ${f1(my - 4)}v8M${f1(x)} ${f1(my - 4)}v8"/><text class="pl-dim-text" x="${f1((X(0) + x) / 2)}" y="${f1(my - 6)}" text-anchor="middle">${o.offset}</text></g>`);
        if (o.bottom > 4 && o.type !== 'door') {
          const mx = x + Math.max(w, 10) / 2;
          out.push(`<g class="pl-dim pl-dim--sel" aria-hidden="true"><path class="pl-dim-line" d="M${f1(mx)} ${f1(Y(0))}V${f1(Y(o.bottom))}M${f1(mx - 4)} ${f1(Y(0))}h8M${f1(mx - 4)} ${f1(Y(o.bottom))}h8"/><text class="pl-dim-text" transform="translate(${f1(mx - 6)} ${f1((Y(0) + Y(o.bottom)) / 2)}) rotate(-90)" text-anchor="middle">${o.bottom}</text></g>`);
        }
      }
    }
    if (!here.length) out.push(`<text class="pl-empty-text" x="${f1(W / 2)}" y="${f1(Y(L.hMax / 2))}" text-anchor="middle">Nothing on this wall yet</text>`);

    elevSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    elevSvg.setAttribute('width', W);
    elevSvg.setAttribute('height', H);
    const focused = document.activeElement && elevSvg.contains(document.activeElement) ? document.activeElement.getAttribute('data-opening') : null;
    elevSvg.innerHTML = out.join('');
    if (focused) {
      const el = elevSvg.querySelector(`[data-opening="${focused}"]`);
      if (el) el.focus({ preventScroll: true });
    }
    openDrag.layout = L;
    openDrag.wall = wall;
  }

  elevSvg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('[data-opening]');
    if (!g || e.button > 0) {
      if (!g && state.ui.openingId) store.dispatch({ type: 'ui/opening', id: null });
      return;
    }
    const o = state.project.room.openings.find((x) => x.id === g.dataset.opening);
    if (!o) return;
    e.preventDefault();
    if (state.ui.openingId !== o.id) store.dispatch({ type: 'ui/opening', id: o.id });
    openDrag.o = { id: o.id, offset: o.offset, bottom: o.bottom, type: o.type, width: o.width, height: o.height, x0: e.clientX, y0: e.clientY, pointer: e.pointerId, last: `${o.offset},${o.bottom}` };
    elevSvg.setPointerCapture(e.pointerId);
    const el = elevSvg.querySelector(`[data-opening="${o.id}"]`);
    if (el) el.focus({ preventScroll: true });
    elevBox.classList.add('is-dragging');
  });
  elevSvg.addEventListener('pointermove', (e) => {
    const d = openDrag.o;
    if (!d || e.pointerId !== d.pointer) return;
    const k = (elevSvg.getBoundingClientRect().width / (Number(elevSvg.getAttribute('width')) || 1)) * openDrag.layout.s;
    const room = state.project.room;
    const wall = openDrag.wall;
    const offset = clamp(snapTo(d.offset + (e.clientX - d.x0) / k, 5), 0, Math.max(0, Math.floor(wall.length - d.width)));
    let bottom = d.bottom;
    if (d.type !== 'door') bottom = clamp(snapTo(d.bottom - (e.clientY - d.y0) / k, 5), OPENING_TYPES[d.type].bottom[0], Math.min(OPENING_TYPES[d.type].bottom[1], room.height - d.height));
    const key = `${offset},${bottom}`;
    if (key === d.last) return;
    d.last = key;
    store.dispatch({ type: 'room/opening/update', id: d.id, patch: { offset, bottom }, coalesce: `drag:${d.id}` });
  });
  const endOpenDrag = (e) => {
    const d = openDrag.o;
    if (!d || (e && e.pointerId !== d.pointer)) return;
    try { elevSvg.releasePointerCapture(d.pointer); } catch { /* released */ }
    openDrag.o = null;
    elevBox.classList.remove('is-dragging');
    store.dispatch({ type: 'history/seal' });
  };
  elevSvg.addEventListener('pointerup', endOpenDrag);
  elevSvg.addEventListener('pointercancel', endOpenDrag);
  elevSvg.addEventListener('keydown', (e) => {
    const g = e.target.closest && e.target.closest('[data-opening]');
    if (!g) return;
    const o = state.project.room.openings.find((x) => x.id === g.dataset.opening);
    if (!o) return;
    const step = e.shiftKey ? 10 : 1;
    const patch = {};
    if (e.key === 'ArrowLeft') patch.offset = o.offset - step;
    else if (e.key === 'ArrowRight') patch.offset = o.offset + step;
    else if (e.key === 'ArrowUp' && o.type !== 'door') patch.bottom = o.bottom + step;
    else if (e.key === 'ArrowDown' && o.type !== 'door') patch.bottom = o.bottom - step;
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store.dispatch({ type: 'room/opening/remove', id: o.id }); announce(`${openingName(state.project.room, o)} removed.`); return; }
    else return;
    e.preventDefault();
    store.dispatch({ type: 'room/opening/update', id: o.id, patch, coalesce: `key:${o.id}` });
  });
  elevSvg.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow')) store.dispatch({ type: 'history/seal' }); });
  elevSvg.addEventListener('focusin', (e) => {
    const g = e.target.closest && e.target.closest('[data-opening]');
    if (g && state.ui.openingId !== g.dataset.opening && !openDrag.o) store.dispatch({ type: 'ui/opening', id: g.dataset.opening });
  });

  // ---------- inspector ----------
  function renderInspector() {
    const room = state.project.room;
    const o = room.openings.find((x) => x.id === state.ui.openingId);
    const key = o ? `${o.id}:${o.type}` : `none:${state.ui.wallId}:${room.openings.filter((x) => x.wallId === state.ui.wallId).map((x) => x.id).join()}`;
    if (key === inspectorKey) return;
    inspectorKey = key;
    if (!o) {
      const here = room.openings.filter((x) => x.wallId === state.ui.wallId);
      inspEl.innerHTML = here.length
        ? `<p class="pl-inspector__empty">On this wall: ${here.map((x) => `<button type="button" class="pl-link" data-pick="${x.id}">${esc(openingName(room, x))}</button>`).join(', ')}. Pick one to change its size and position.</p>`
        : '<p class="pl-inspector__empty">Use <b>Add</b> to put a door, window, radiator or socket on this wall.</p>';
      return;
    }
    const S = OPENING_TYPES[o.type];
    const fields = [
      fieldHtml('open:offset', 'Distance from the left', o.offset, { min: 0, max: 2000, slider: false }),
      o.type === 'door' ? '' : fieldHtml('open:bottom', 'Height above the floor', o.bottom, { min: S.bottom[0], max: S.bottom[1], slider: false }),
      fieldHtml('open:width', 'Width', o.width, { min: S.width[0], max: S.width[1], slider: false }),
      fieldHtml('open:height', 'Height', o.height, { min: S.height[0], max: S.height[1], slider: false })
    ];
    if (o.type === 'radiator') fields.push(fieldHtml('open:depth', 'Depth', o.depth || 10, { min: 3, max: 30, slider: false }));
    const swing = o.type === 'door'
      ? `<div class="pl-row pl-row--select"><label class="pl-row__label" for="pl-swing">Door opens</label><select class="pl-select" id="pl-swing">${SWINGS.map((v) => `<option value="${v}"${v === (o.swing || 'in-left') ? ' selected' : ''}>${SWING_LABEL[v]}</option>`).join('')}</select></div>` : '';
    inspEl.innerHTML = `
      <div class="pl-inspector__card">
        <div class="pl-inspector__head">
          <span class="pl-inspector__icon">${TYPE_ICON[o.type]}</span>
          <div><p class="pl-inspector__title">${esc(openingName(room, o))}</p><p class="pl-inspector__sub">Wall ${wallNo(o.wallId)}</p></div>
          <button type="button" class="pl-btn pl-btn--quiet" data-delete="${o.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v6M13.5 11v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Delete<span class="visually-hidden"> ${esc(openingName(room, o))}</span></button>
        </div>
        <div class="pl-form pl-form--grid">${fields.join('')}${swing}</div>
      </div>`;
  }
  inspEl.addEventListener('click', (e) => {
    const del = e.target.closest('[data-delete]');
    if (del) {
      const o = state.project.room.openings.find((x) => x.id === del.dataset.delete);
      if (o) { announce(`${openingName(state.project.room, o)} removed.`); store.dispatch({ type: 'room/opening/remove', id: o.id }); store.dispatch({ type: 'history/seal' }); }
      return;
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) store.dispatch({ type: 'ui/opening', id: pick.dataset.pick });
  });
  inspEl.addEventListener('change', (e) => {
    if (e.target.id === 'pl-swing' && state.ui.openingId) {
      store.dispatch({ type: 'room/opening/update', id: state.ui.openingId, patch: { swing: e.target.value } });
      store.dispatch({ type: 'history/seal' });
    }
  });

  // ---------- add menu ----------
  function setMenu(open) {
    addMenu.hidden = !open;
    addBtn.setAttribute('aria-expanded', String(open));
    if (open) addMenu.querySelector('button').focus();
  }
  addBtn.addEventListener('click', () => setMenu(addMenu.hidden));
  addMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    setMenu(false);
    addBtn.focus();
    const before = state.project.room.openings.length;
    store.dispatch({ type: 'room/opening/add', opening: { type: b.dataset.add } });
    store.dispatch({ type: 'history/seal' });
    if (state.project.room.openings.length > before) announce(`${OPENING_TYPES[b.dataset.add].label} added to wall ${wallNo(state.ui.wallId)}.`);
    if (state.project.room.openings.length > before) showWallPane();
  });
  addMenu.addEventListener('keydown', (e) => {
    const items = [...addMenu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); setMenu(false); addBtn.focus(); }
    else if (e.key === 'Tab') setMenu(false);
  });
  document.addEventListener('pointerdown', (e) => { if (!addMenu.hidden && !$('#pl-add').contains(e.target)) setMenu(false); });

  // ---------- finishes ----------
  root.querySelectorAll('input[name="pl-floor"]').forEach((i) => i.addEventListener('change', () => {
    store.dispatch({ type: 'room/update', patch: { floor: i.value } }); store.dispatch({ type: 'history/seal' });
  }));
  root.querySelectorAll('input[name="pl-wallcol"]').forEach((i) => i.addEventListener('change', () => {
    store.dispatch({ type: 'room/update', patch: { wall: i.value } }); store.dispatch({ type: 'history/seal' });
  }));

  // ---------- notes ----------
  function renderNotes() {
    const list = (validation.errors || []).filter((e) => e.ref && (e.ref.type === 'room' || e.ref.type === 'opening'));
    const placementIssues = (validation.errors || []).filter((e) => e.ref && (e.ref.type === 'placement' || e.ref.type === 'piece' || e.ref.type === 'bay' || e.ref.type === 'item')).length;
    const room = state.project.room;
    const btn = (act, id, text) => `<button type="button" class="pl-link" data-${act}="${esc(id)}">${text}</button>`;
    const items = list.map((e) => {
      let actions = '';
      if (e.ref.type === 'opening') {
        const o = room.openings.find((x) => x.id === e.ref.id);
        const wallExists = o && room.walls.some((w) => w.id === o.wallId);
        if (o && !wallExists) actions = btn('move', o.id, `Move to wall ${wallNo(state.ui.wallId)}`) + btn('del', o.id, 'Remove');
        else if (e.code === 'opening-off-wall' || e.code === 'opening-too-tall') actions = btn('fit', e.ref.id, 'Fit it') + btn('pick', e.ref.id, 'Show');
        else actions = btn('pick', e.ref.id, 'Show');
      }
      return `<li class="pl-note${e.blocking ? ' pl-note--block' : ''}"><span class="pl-note__icon">${ICON_NOTE}</span><span class="pl-note__text">${esc(friendly(e.message))}</span>${actions ? `<span class="pl-note__actions">${actions}</span>` : ''}</li>`;
    });
    if (placementIssues) {
      items.push(`<li class="pl-note pl-note--info"><span class="pl-note__icon">${ICON_NOTE}</span><span class="pl-note__text">${placementIssues === 1 ? 'One placed piece needs' : `${placementIssues} placed pieces need`} a second look. You can fix ${placementIssues === 1 ? 'it' : 'them'} in step 4, Place.</span></li>`);
    }
    if (!items.length) items.push(`<li class="pl-note pl-note--ok"><span class="pl-note__icon">${ICON_CHECK}</span><span class="pl-note__text">The room looks good. Nothing needs your attention.</span></li>`);
    const html = items.join('');
    if (notesEl.dataset.html !== html) { notesEl.dataset.html = html; notesEl.innerHTML = html; }
  }
  notesEl.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.pick) store.dispatch({ type: 'ui/opening', id: d.pick });
    else if (d.fit) { store.dispatch({ type: 'room/opening/update', id: d.fit, patch: {} }); store.dispatch({ type: 'history/seal' }); }
    else if (d.move) { store.dispatch({ type: 'room/opening/move', id: d.move }); store.dispatch({ type: 'ui/opening', id: d.move }); store.dispatch({ type: 'history/seal' }); }
    else if (d.del) { store.dispatch({ type: 'room/opening/remove', id: d.del }); store.dispatch({ type: 'history/seal' }); announce('Opening removed.'); }
  });

  // ---------- update ----------
  const ro = new ResizeObserver(() => { planKey = ''; elevKey = ''; renderPlan(); renderElev(); });
  ro.observe(planBox); ro.observe(elevBox);
  let elevKey = '';

  function update(next, info = {}) {
    state = next;
    validation = info.validation || validation;
    const room = state.project.room;
    const tid = room.template ? room.template.id : null;
    if (tid !== currentTemplate) { currentTemplate = tid; buildForm(); }
    syncCards();
    syncInputs();
    $('#pl-area').textContent = `${(area(room) / 10000).toFixed(1)} m²`;
    root.querySelectorAll('input[name="pl-floor"]').forEach((i) => { i.checked = i.value === room.floor; });
    root.querySelectorAll('input[name="pl-wallcol"]').forEach((i) => { i.checked = i.value === room.wall; });

    const k = JSON.stringify([room.walls, room.openings, state.ui.wallId, state.ui.openingId, room.template && room.template.params, room.height, room.slope, drag && drag.last]);
    if (k !== planKey) { planKey = k; if (!root.hidden) renderPlan(); }
    const ek = JSON.stringify([room.walls, room.openings, room.height, room.slope, state.ui.wallId, state.ui.openingId]);
    if (ek !== elevKey) { elevKey = ek; if (!root.hidden) renderElev(); }
    renderChips();
    renderInspector();
    const nt = state.ui.notice;
    if (nt && nt.id !== noticeId) {
      noticeId = nt.id;
      const el = $('#pl-addnote');
      el.textContent = nt.text;
      announce(nt.text);
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { el.textContent = ''; }, 6000);
    }
    renderNotes();
    $('#pl-elev-hint').textContent = state.ui.openingId
      ? 'Drag it along the wall or up and down. Arrow keys nudge by 1 cm, Shift by 10 cm. Delete removes it.'
      : 'Click an opening to edit it, or drag it along the wall.';
  }

  function show() {
    planKey = ''; elevKey = '';
    renderPlan(); renderElev();
  }

  update(state);
  return { update, show, destroy() { ro.disconnect(); } };
}
