// Step 4: Place. A plan of the room with every placed piece drawn as its footprint. Drag a piece (it snaps to wall ends,
// to its neighbours and clear of doors and windows), or use the arrow keys and the boxes in the sidebar. Problems show
// in red on the plan and in plain words in the list; nothing here ever blocks editing. The loop back to steps 2 and 3
// lives here too: add another piece, or edit one that is already in the room.
import { TYPES, OPENING_TYPES, wallsOf, wallById, footprintOf, pieceLabel, defaultElevation } from '../model.js';
import { WALL_T, wallQuads, wallPoint, roomBounds } from '../plan-geom.js';
import * as G from '../place-geom.js';
import { esc, clamp, fieldHtml, wireFields, syncFields, ICON_NOTE, ICON_TRASH } from './shared.js';
import { createTabs, roving, scrollCue } from './ui.js';

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const wallNo = (id) => String(id).replace(/^w/, '');
const friendly = (msg) => msg.replace(/\b[Ww]all w(\d+)\b/g, (m, n) => `${m[0] === 'W' ? 'Wall' : 'wall'} ${n}`);
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_TURN = (flip) => `<svg viewBox="0 0 24 24" aria-hidden="true"${flip ? ' style="transform:scaleX(-1)"' : ''}><path d="M19 12a7 7 0 1 1-2.2-5.1M19 4.5v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SNAP_TEXT = {
  start: 'Snapped to the start of the wall', end: 'Snapped to the end of the wall',
  piece: 'Snapped beside the next piece', opening: 'Snapped clear of the opening'
};
// problems that "Find a free spot" can fix by moving the piece
const MOVABLE = new Set(['placement-overlap', 'placement-covers-opening', 'placement-door-swing', 'placement-off-wall', 'placement-outside-room', 'placement-under-slope', 'placement-too-tall', 'placement-wall-missing', 'wall-too-short']);

export function createPlaceStep(root, { plan: planBox, store, announce = () => {}, confirmAction, showPlan = () => {} }) {
  let state = store.getState();
  let validation = { errors: [] };
  let planKey = '', listKey = '', inspKey = '', notesKey = '', statusTimer = 0;
  let L = null;          // plan transform of the current drawing
  let drag = null;       // a piece (or its turn handle) being dragged

  root.innerHTML = `
    <section class="pl-sec" data-sec="pieces">
      <h3 class="visually-hidden">Pieces</h3>
      <p class="pl-addnote" id="pl-p-status" role="status"></p>
      <div class="pl-listbox" id="pl-p-wait-sec" hidden>
        <h4 class="pl-sec__sub" id="pl-p-h-wait">Not placed yet</h4>
        <ul class="pl-waiting" id="pl-p-waiting" aria-labelledby="pl-p-h-wait"></ul>
      </div>
      <div class="pl-listbox" id="pl-p-room-sec">
        <h4 class="pl-sec__sub" id="pl-p-h-room">In the room</h4>
        <div class="pl-chips" id="pl-p-placed" role="radiogroup" aria-labelledby="pl-p-h-room"></div>
        <p class="pl-hint" id="pl-p-roomhint"></p>
      </div>
      <div class="pl-actions" id="pl-p-next-sec">
        <button type="button" class="pl-btn pl-btn--accent" id="pl-p-add">${ICON_PLUS}Add another piece</button>
        <button type="button" class="pl-btn pl-btn--ghost" id="pl-p-edit">Edit this piece</button>
        <button type="button" class="pl-btn pl-btn--ghost" id="pl-p-edit-in">Edit the inside</button>
      </div>
      <p class="pl-hint" id="pl-p-nexthint"></p>
    </section>

    <section class="pl-sec" data-sec="position">
      <h3 class="visually-hidden">Position</h3>
      <p class="pl-inspector__empty" id="pl-p-nopos">Pick a piece that is in the room to set where it stands.</p>
      <div id="pl-p-pos-sec" hidden>
        <div class="pl-sec__row">
          <p class="pl-where" id="pl-p-where" aria-live="polite"></p>
          <button type="button" class="pl-btn pl-btn--quiet" id="pl-p-out">${ICON_TRASH}Take out<span class="visually-hidden"> of the room</span></button>
        </div>
        <div class="pl-chips pl-chips--modes" id="pl-p-modes" role="radiogroup" aria-label="How it stands">
          <button type="button" role="radio" class="pl-chip pl-chip--plain" data-mode="wall" aria-checked="false" tabindex="-1">Against a wall</button>
          <button type="button" role="radio" class="pl-chip pl-chip--plain" data-mode="corner" aria-checked="false" tabindex="-1">In a corner</button>
          <button type="button" role="radio" class="pl-chip pl-chip--plain" data-mode="free" aria-checked="false" tabindex="-1">Free-standing</button>
        </div>
        <div class="pl-form pl-form--grid" id="pl-p-fields"></div>
      </div>
    </section>

    <section class="pl-sec" data-sec="clashes">
      <h3 class="visually-hidden">Clashes</h3>
      <p class="pl-okline" id="pl-p-okline" hidden>${ICON_CHECK}<span>Everything fits where you put it. Nothing overlaps, covers a door or window, or blocks a door.</span></p>
      <ul class="pl-notes" id="pl-p-notes" aria-label="Placement checks"></ul>
    </section>`;
  planBox.innerHTML = `<svg id="pl-place-svg" tabindex="-1" role="group" aria-label="Plan of the room with your pieces, drawn to scale" xmlns="http://www.w3.org/2000/svg"></svg>
    <p class="pl-canvas-hint" id="pl-place-hint">Drag a piece to move it, or click a wall to put it there.</p>`;

  const $ = (sel) => root.querySelector(sel);
  const svg = planBox.querySelector('#pl-place-svg');
  const notesEl = $('#pl-p-notes'), placedEl = $('#pl-p-placed'), waitEl = $('#pl-p-waiting'), fieldsEl = $('#pl-p-fields');
  const posSec = $('#pl-p-pos-sec'), waitSec = $('#pl-p-wait-sec');
  const sections = createTabs({
    root, prefix: 'pl-p', label: 'Place sections',
    items: [{ id: 'pieces', label: 'Pieces' }, { id: 'position', label: 'Position' }, { id: 'clashes', label: 'Clashes' }]
  });
  sections.show('pieces');
  let clashCount = 0;
  roving(placedEl, { selector: '[data-piece]', selects: true });
  roving($('#pl-p-modes'), { selector: '[data-mode]', selects: true });
  roving($('#pl-p-next-sec'), { selector: 'button' });
  scrollCue(waitEl, 'y', { grow: false });
  scrollCue(placedEl, 'y', { grow: false });

  // ---------- lookups ----------
  const project = () => state.project;
  const pieceOf = (id) => project().pieces.find((p) => p.id === id) || null;
  const placementOf = (id) => project().placements.find((p) => p.pieceId === id) || null;
  const selected = () => pieceOf(state.ui.pieceId);
  const nameOf = (id) => pieceLabel(project(), id);
  const clashes = () => G.clashesByPiece(project(), validation.errors || []);
  const placedPieces = () => project().placements.map((pl) => pieceOf(pl.pieceId)).filter(Boolean);
  const whereText = (pl) => (pl.mode === 'free' ? 'Free-standing' : `Wall ${wallNo(pl.wallId)}, ${pl.offset} cm from the start`);
  function modeOf(pl) {
    if (!pl) return null;
    if (pl.mode === 'free') return 'free';
    return G.cornerSpots(project(), pl.pieceId).some((s) => s.wallId === pl.wallId && Math.abs(s.offset - pl.offset) <= 0.5) ? 'corner' : 'wall';
  }
  function say(text) {
    const el = $('#pl-p-status');
    el.textContent = text;
    announce(text);
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; }, 6000);
  }
  const seal = () => store.dispatch({ type: 'history/seal' });

  // ---------- actions ----------
  function placeIt(id, spec, text) {
    store.dispatch({ type: 'place/set', id, spec: { ...spec, snap: false } });
    seal();
    if (text) announce(text);
  }
  function autoPlace(id) {
    const spec = G.suggestPlacement(project(), id);
    placeIt(id, spec);
    const pl = placementOf(id);
    if (pl) announce(`${nameOf(id)} placed. ${whereText(pl)}.`);
    showPlan();
    focusPiece(id);
  }
  function putOnWall(id, wallId) {
    const piece = pieceOf(id), wall = wallById(project().room, wallId);
    if (!piece || !wall) return;
    const pl = placementOf(id);
    const fp = pl && footprintOf(project(), pl);
    const elevation = pl ? pl.elevation : defaultElevation(piece);
    const prefer = fp ? G.projectOnWall(wall, { x: fp.cx, z: fp.cz }).u - piece.width / 2 : (wall.length - piece.width) / 2;
    // a free spot when there is one; otherwise it goes where it was asked and the clash is shown (editing is never blocked)
    const off = G.freeSpotOnWall(project(), id, wallId, prefer, elevation);
    const max = Math.max(0, Math.floor(wall.length - piece.width));
    placeIt(id, { mode: 'wall', wallId, offset: off === null ? clamp(Math.round(prefer), 0, max) : off, elevation });
    announce(off === null ? `${nameOf(id)} is on wall ${wallNo(wallId)}, but there is no free space there.` : `${nameOf(id)} is on wall ${wallNo(wallId)}.`);
  }
  function setMode(id, mode) {
    const piece = pieceOf(id), pl = placementOf(id);
    if (!piece || !pl) return;
    if (mode === 'free') {
      if (pl.mode === 'free') return;
      const fp = footprintOf(project(), pl);
      if (!fp) return;
      placeIt(id, { mode: 'free', x: Math.round(fp.cx), z: Math.round(fp.cz), rotation: G.snapRotation(fp.rotation), elevation: pl.elevation }, `${nameOf(id)} is free-standing now.`);
    } else if (mode === 'corner') {
      const fp = footprintOf(project(), pl);
      const spot = G.bestCorner(project(), id, fp ? { x: fp.cx, z: fp.cz } : null);
      if (!spot) { say(`No corner of this room takes a ${piece.width} cm piece.`); return; }
      placeIt(id, { mode: 'wall', wallId: spot.wallId, offset: spot.offset, elevation: pl.elevation }, `${nameOf(id)} is in the corner of wall ${wallNo(spot.wallId)}.`);
    } else if (pl.mode === 'free') {
      const fp = footprintOf(project(), pl);
      const near = G.nearestWall(project().room, fp ? { x: fp.cx, z: fp.cz } : { x: pl.x, z: pl.z });
      if (near) putOnWall(id, near.wall.id);
    } else {
      const wall = wallById(project().room, pl.wallId) || wallsOf(project().room)[0];
      if (!wall) return;
      const off = G.freeSpotOnWall(project(), id, wall.id, (wall.length - piece.width) / 2, pl.elevation);
      if (off === null) say(`There is no free space for ${nameOf(id)} on wall ${wallNo(wall.id)}.`);
      else if (off !== pl.offset || wall.id !== pl.wallId) placeIt(id, { mode: 'wall', wallId: wall.id, offset: off, elevation: pl.elevation }, `${nameOf(id)} moved along wall ${wallNo(wall.id)}.`);
    }
  }
  async function takeOut(id) {
    const name = nameOf(id);
    const ok = await confirmAction({
      title: `Take ${name} out of the room?`,
      text: `It stays in your list with its design, so you can place it again. Undo also brings it back.`,
      yes: 'Take it out', no: 'Keep it there'
    });
    if (!ok) return;
    store.dispatch({ type: 'place/remove', id });
    seal();
    say(`${name} is out of the room. It is under Not placed yet.`);
  }
  function edit(id, step) {
    store.dispatch({ type: 'ui/piece', id });
    store.dispatch({ type: 'ui/step', step });
  }
  const focusPiece = (id) => requestAnimationFrame(() => {
    const el = svg.querySelector(`[data-piece="${id}"]`);
    if (el && document.activeElement !== el && planBox.offsetParent) el.focus({ preventScroll: true });
  });

  // ---------- sidebar clicks ----------
  placedEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-piece]');
    if (b) { store.dispatch({ type: 'ui/piece', id: b.dataset.piece }); showPlan(); }
  });
  waitEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-place]');
    if (b) { autoPlace(b.dataset.place); return; }
    const r = e.target.closest('[data-pick]');
    if (r) store.dispatch({ type: 'ui/piece', id: r.dataset.pick });
  });
  $('#pl-p-modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b && state.ui.pieceId) setMode(state.ui.pieceId, b.dataset.mode);
  });
  $('#pl-p-out').addEventListener('click', () => { if (state.ui.pieceId && placementOf(state.ui.pieceId)) takeOut(state.ui.pieceId); });
  $('#pl-p-add').addEventListener('click', () => store.dispatch({ type: 'ui/new-piece' }));
  $('#pl-p-edit').addEventListener('click', () => { if (selected()) edit(selected().id, 1); });
  $('#pl-p-edit-in').addEventListener('click', () => { if (selected()) edit(selected().id, 2); });
  notesEl.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const id = t.dataset.show || t.dataset.fix;
    if (!id) return;
    store.dispatch({ type: 'ui/piece', id });
    showPlan();
    if (t.dataset.fix) {
      const spec = G.suggestPlacement(project(), id);
      placeIt(id, spec);
      const pl = placementOf(id);
      announce(pl ? `${nameOf(id)} moved. ${whereText(pl)}.` : '');
    }
    focusPiece(id);
  });

  // ---------- numeric inputs ----------
  const lookup = (bind) => {
    const pl = placementOf(state.ui.pieceId);
    if (!pl) return undefined;
    switch (bind) {
      case 'pl:offset': return pl.mode === 'wall' ? pl.offset : undefined;
      case 'pl:x': return pl.mode === 'free' ? pl.x : undefined;
      case 'pl:z': return pl.mode === 'free' ? pl.z : undefined;
      case 'pl:rot': return pl.mode === 'free' ? pl.rotation : undefined;
      case 'pl:elev': return pl.elevation;
      default: return undefined;
    }
  };
  wireFields(fieldsEl, {
    current: lookup,
    seal,
    apply(bind, v) {
      const id = state.ui.pieceId;
      if (!id || !placementOf(id)) return;
      const patch = bind === 'pl:offset' ? { offset: Math.round(v) }
        : bind === 'pl:x' ? { x: Math.round(v) }
          : bind === 'pl:z' ? { z: Math.round(v) }
            : bind === 'pl:rot' ? { rotation: G.snapRotation(v) }
              : bind === 'pl:elev' ? { elevation: Math.round(v) } : null;
      if (patch) store.dispatch({ type: 'place/move', id, patch: { ...patch, snap: false }, coalesce: `num:${id}:${bind}` });
    }
  });
  fieldsEl.addEventListener('change', (e) => {
    const id = state.ui.pieceId;
    if (e.target.id === 'pl-p-wall' && id) {
      if (e.target.value) putOnWall(id, e.target.value);
      else syncWallSelect();
    }
  });
  fieldsEl.addEventListener('click', (e) => {
    const id = state.ui.pieceId, pl = placementOf(id);
    if (!pl) return;
    const slide = e.target.closest('[data-slide]');
    if (slide && pl.mode === 'wall') {
      const piece = pieceOf(id), wall = wallById(project().room, pl.wallId);
      if (!piece || !wall) return;
      const max = Math.max(0, Math.floor(wall.length - piece.width));
      const offset = slide.dataset.slide === 'start' ? 0 : slide.dataset.slide === 'end' ? max : Math.round(max / 2);
      store.dispatch({ type: 'place/move', id, patch: { offset, snap: false } });
      seal();
      announce(`${nameOf(id)}, ${whereText(placementOf(id))}.`);
      return;
    }
    const turn = e.target.closest('[data-turn]');
    if (turn && pl.mode === 'free') {
      store.dispatch({ type: 'place/move', id, patch: { rotation: G.snapRotation(pl.rotation + Number(turn.dataset.turn)), snap: false } });
      seal();
      announce(`${nameOf(id)} turned to ${placementOf(id).rotation} degrees.`);
    }
  });

  function buildFields(piece, pl) {
    const room = project().room, T = TYPES[piece.type];
    const rows = [];
    if (pl.mode === 'free') {
      const b = roomBounds(room);
      rows.push(fieldHtml('pl:x', 'Across (x)', pl.x, { min: Math.floor(b.minX), max: Math.ceil(b.maxX), sliderStep: 5 }));
      rows.push(fieldHtml('pl:z', 'Down (z)', pl.z, { min: Math.floor(b.minZ), max: Math.ceil(b.maxZ), sliderStep: 5 }));
      rows.push(fieldHtml('pl:rot', 'Turn', pl.rotation, { min: 0, max: 345, step: 15, unit: '°', sliderStep: 15 }));
      rows.push(`<div class="pl-row pl-row--buttons" role="group" aria-label="Turn"><button type="button" class="pl-btn pl-btn--ghost pl-btn--small" data-turn="-15">${ICON_TURN(true)}Turn left 15°</button><button type="button" class="pl-btn pl-btn--ghost pl-btn--small" data-turn="15">${ICON_TURN(false)}Turn right 15°</button></div>`);
    } else {
      const walls = wallsOf(room);
      const wall = walls.find((w) => w.id === pl.wallId);
      const opts = walls.map((w) => `<option value="${w.id}">Wall ${wallNo(w.id)}, ${Math.round(w.length)} cm${w.length < piece.width ? ' (too short)' : ''}</option>`).join('');
      rows.push(`<div class="pl-row pl-row--select"><label class="pl-row__label" for="pl-p-wall">Wall</label><select class="pl-select" id="pl-p-wall">${wall ? '' : '<option value="">Choose a wall</option>'}${opts}</select></div>`);
      if (wall) {
        const max = Math.max(0, Math.floor(wall.length - piece.width));
        rows.push(fieldHtml('pl:offset', 'From the start of the wall', pl.offset, { min: 0, max, sliderStep: 5 }));
        rows.push('<div class="pl-row pl-row--buttons" role="group" aria-label="Slide along the wall"><button type="button" class="pl-btn pl-btn--ghost pl-btn--small" data-slide="start">To the start</button><button type="button" class="pl-btn pl-btn--ghost pl-btn--small" data-slide="mid">Centre</button><button type="button" class="pl-btn pl-btn--ghost pl-btn--small" data-slide="end">To the end</button></div>');
      } else {
        rows.push('<p class="pl-hint">The wall this piece stood on is gone. Pick a wall, or use Find a free spot under Clashes.</p>');
      }
    }
    if (T.limits.elevation[1] > 0) rows.push(fieldHtml('pl:elev', 'Height above the floor', pl.elevation, { min: T.limits.elevation[0], max: T.limits.elevation[1], sliderStep: 5 }));
    fieldsEl.innerHTML = rows.join('');
    fieldsEl.querySelectorAll('.pl-row--buttons').forEach((g) => roving(g, { selector: 'button' }));
  }
  function syncWallSelect() {
    const pl = placementOf(state.ui.pieceId), sel = $('#pl-p-wall');
    if (sel && pl && pl.mode === 'wall' && sel.value !== pl.wallId) sel.value = pl.wallId;
  }

  // ---------- plan drawing ----------
  function layout(room, W, H) {
    const b = roomBounds(room);
    const pad = W < 520 ? 40 : 58;
    const s = Math.max(0.05, Math.min((W - 2 * pad) / Math.max(1, b.width), (H - 2 * pad) / Math.max(1, b.depth)));
    return { W, H, s, ox: (W - b.width * s) / 2 - b.minX * s, oz: (H - b.depth * s) / 2 - b.minZ * s };
  }

  function openingSvg(room, o, walls, pt, wp, s) {
    const wall = walls.find((w) => w.id === o.wallId);
    if (!wall) return '';
    const u0 = Math.max(0, o.offset), u1 = Math.min(wall.length, o.offset + o.width);
    if (u1 - u0 < 1) return '';
    const quad = (ua, ub, va, vb) => `M${wp(wall, ua, va)}L${wp(wall, ub, va)}L${wp(wall, ub, vb)}L${wp(wall, ua, vb)}Z`;
    const label = `${OPENING_TYPES[o.type].label} on wall ${wallNo(wall.id)}`;
    let g = '';
    if (o.type === 'window') {
      g += `<path class="pl-cut" d="${quad(u0, u1, -WALL_T, 0)}"/>`;
      for (const v of [-WALL_T * 0.34, -WALL_T * 0.66]) g += `<path class="pl-win-line" d="M${wp(wall, u0, v)}L${wp(wall, u1, v)}"/>`;
      g += `<path class="pl-win-end" d="M${wp(wall, u0, -WALL_T)}L${wp(wall, u0, 0)}M${wp(wall, u1, -WALL_T)}L${wp(wall, u1, 0)}"/>`;
    } else if (o.type === 'door') {
      g += `<path class="pl-cut" d="${quad(u0, u1, -WALL_T, 0)}"/>`;
      const swing = o.swing || 'in-left';
      const left = swing.endsWith('left'), inward = swing.startsWith('in');
      const hu = left ? u0 : u1, fu = left ? u1 : u0, k = inward ? 1 : -1, r = u1 - u0;
      const hinge = wallPoint(wall, hu, 0), far = wallPoint(wall, fu, 0), open = wallPoint(wall, hu, k * r);
      const cross = (far.x - hinge.x) * (open.z - hinge.z) - (far.z - hinge.z) * (open.x - hinge.x);
      g += `<path class="pl-door-arc" d="M${pt(far)}A${f1(r * s)} ${f1(r * s)} 0 0 ${cross > 0 ? 1 : 0} ${pt(open)}"/>`;
      g += `<path class="pl-door-leaf" d="M${pt(hinge)}L${pt(open)}"/>`;
      g += `<path class="pl-win-end" d="M${wp(wall, u0, -WALL_T)}L${wp(wall, u0, 0)}M${wp(wall, u1, -WALL_T)}L${wp(wall, u1, 0)}"/>`;
    } else if (o.type === 'radiator') {
      g += `<path class="pl-rad" d="${quad(u0, u1, 0, Math.max(7, o.depth || 10))}" fill="url(#pl-hatch-pp)"/>`;
    } else {
      const c = wallPoint(wall, (u0 + u1) / 2, 0), x = c.x * s + L.ox, z = c.z * s + L.oz;
      g += `<circle class="pl-sock" cx="${f1(x)}" cy="${f1(z)}" r="4.5"/>`;
    }
    return `<g class="pl-open pl-open--${o.type}" aria-hidden="true"><title>${esc(label)}</title>${g}</g>`;
  }

  function pieceSvg(pl, flags, X, Z, s) {
    const prj = project();
    const piece = pieceOf(pl.pieceId), fp = footprintOf(prj, pl);
    if (!piece || !fp) return '';
    const pt = (c) => `${f1(X(c.x))},${f1(Z(c.z))}`;
    const [, , c2, c3] = fp.corners;
    const name = nameOf(piece.id);
    const cx = X(fp.cx), cz = Z(fp.cz);
    const wpx = piece.width * s, dpx = piece.depth * s;
    let ang = (((fp.rotation % 360) + 360) % 360);
    if (ang > 90 && ang <= 270) ang -= 180; else if (ang > 270) ang -= 360;
    const num = name.match(/\d+$/);
    const short = `${name.charAt(0)}${num ? num[0] : ''}`;
    const full = wpx >= name.length * 6.8 + 10, tiny = !full && wpx >= short.length * 7 + 8;
    let text = '';
    if ((full || tiny) && dpx >= 13) {
      const showSize = full && dpx >= 34;
      text = `<g transform="rotate(${f1(ang)} ${f1(cx)} ${f1(cz)})" aria-hidden="true"><text class="pl-pc__label" x="${f1(cx)}" y="${f1(cz - (showSize ? 5 : 0))}" text-anchor="middle" dominant-baseline="central">${esc(full ? name : short)}</text>`
        + (showSize ? `<text class="pl-pc__size" x="${f1(cx)}" y="${f1(cz + 9)}" text-anchor="middle" dominant-baseline="central">${piece.width} × ${piece.depth}</text>` : '') + '</g>';
    }
    const c = flags.clash;
    const problems = c ? [...c.blocking, ...c.warn].map((x) => friendly(x.message)).join(' ') : '';
    const cls = `pl-pc${flags.sel ? ' is-selected' : ''}${c && c.blocking.length ? ' is-clash' : c && c.warn.length ? ' is-warn' : ''}${(pl.elevation || 0) > 0 ? ' is-raised' : ''}`;
    const aria = `${name}, ${whereText(pl).toLowerCase()}${problems ? `. ${problems}` : ''}. Arrow keys move it${pl.mode === 'free' ? ', R turns it' : ''}, Delete takes it out of the room.`;
    return `<g class="${cls}" data-piece="${esc(piece.id)}" tabindex="0" role="button" aria-pressed="${flags.sel}" aria-label="${esc(aria)}">`
      + `<polygon class="pl-pc__body" points="${fp.corners.map(pt).join(' ')}"><title>${esc(name)}</title></polygon>`
      + `<path class="pl-pc__front" d="M${pt(c3)}L${pt(c2)}"/>${text}</g>`;
  }

  function renderPlan() {
    const W = Math.round(planBox.clientWidth), H = Math.round(planBox.clientHeight);
    if (W < 120 || H < 120) return;
    const prj = project();
    const room = prj.room;
    L = layout(room, W, H);
    const { s, ox, oz } = L;
    const X = (x) => x * s + ox, Z = (z) => z * s + oz;
    const pt = (p) => `${f1(X(p.x))} ${f1(Z(p.z))}`;
    const wp = (wall, u, v = 0) => pt(wallPoint(wall, u, v));
    const walls = wallsOf(room), quads = wallQuads(room);
    const out = [];
    const poly = room.walls.map((c) => `${f1(X(c.x))},${f1(Z(c.z))}`).join(' ');

    out.push(`<defs><pattern id="pl-hatch-pp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" class="pl-hatch-line"/></pattern>`
      + `<clipPath id="pl-clip-place"><polygon points="${poly}"/></clipPath></defs>`);
    const gridPath = (step) => {
      const d = [];
      const x0 = Math.ceil((0 - ox) / s / step) * step, x1 = Math.floor((W - ox) / s / step) * step;
      for (let x = x0; x <= x1; x += step) d.push(`M${f1(X(x))} 0V${H}`);
      const z0 = Math.ceil((0 - oz) / s / step) * step, z1 = Math.floor((H - oz) / s / step) * step;
      for (let z = z0; z <= z1; z += step) d.push(`M0 ${f1(Z(z))}H${W}`);
      return d.join('');
    };
    const minor = s * 10 >= 5 ? gridPath(10) : '', major = gridPath(100);
    out.push(`<g class="pl-grid pl-grid--outer" aria-hidden="true"><path class="pl-grid-minor" d="${minor}"/><path class="pl-grid-major" d="${major}"/></g>`);
    out.push(`<polygon class="pl-floor" points="${poly}"/>`);
    out.push(`<g class="pl-grid pl-grid--inner" clip-path="url(#pl-clip-place)" aria-hidden="true"><path class="pl-grid-minor" d="${minor}"/><path class="pl-grid-major" d="${major}"/></g>`);

    const selId = state.ui.pieceId;
    const selPl = placementOf(selId);
    const hot = selPl && selPl.mode === 'wall' ? selPl.wallId : null;
    for (const q of quads) {
      const d = `M${pt(q.inner[0])}L${pt(q.inner[1])}L${pt(q.outer[1])}L${pt(q.outer[0])}Z`;
      out.push(`<path class="pl-wall pl-wall--pick${q.id === hot ? ' is-selected' : ''}" d="${d}" data-wall="${q.id}"><title>Wall ${wallNo(q.id)}, ${Math.round(q.wall.length)} cm${selId ? '. Click to put the selected piece here.' : ''}</title></path>`);
    }
    for (const o of room.openings) out.push(openingSvg(room, o, walls, pt, wp, s));

    // wall numbers on the outside, so the wall box in the sidebar matches the drawing
    for (const w of walls) {
      if (w.length * s < 24) continue;
      const c = wallPoint(w, w.length / 2, -(WALL_T + 13 / s));
      out.push(`<g class="pl-wallbadge${w.id === hot ? ' is-selected' : ''}" aria-hidden="true"><circle cx="${f1(X(c.x))}" cy="${f1(Z(c.z))}" r="9"/><text x="${f1(X(c.x))}" y="${f1(Z(c.z))}" text-anchor="middle" dominant-baseline="central">${wallNo(w.id)}</text></g>`);
    }

    // pieces: low ones first, wall units over base cabinets, the selected one on top
    const by = clashes();
    const order = [...prj.placements].sort((a, b) => ((a.pieceId === selId) - (b.pieceId === selId)) || ((a.elevation || 0) - (b.elevation || 0)));
    for (const pl of order) out.push(pieceSvg(pl, { sel: pl.pieceId === selId, clash: by[pl.pieceId] }, X, Z, s));

    // distances to the wall ends for the selected wall piece
    if (selPl && selPl.mode === 'wall') {
      const piece = pieceOf(selId), wall = walls.find((w) => w.id === selPl.wallId);
      if (piece && wall) {
        const vOff = -(WALL_T + 14 / s);
        const seg = (u0, u1) => {
          const len = u1 - u0;
          if (len < 0.5) return '';
          const a = wallPoint(wall, u0, vOff), b = wallPoint(wall, u1, vOff);
          const mid = wallPoint(wall, (u0 + u1) / 2, vOff - 8 / s);
          let ang = wall.angle;
          if (ang > 90.5 || ang < -89.5) ang += 180;
          const px = len * s;
          const lbl = px > 40 ? `${Math.round(len)}` : '';
          const tick = (u) => `M${pt(wallPoint(wall, u, vOff - 4 / s))}L${pt(wallPoint(wall, u, vOff + 4 / s))}`;
          return `<g class="pl-dim pl-dim--sel" aria-hidden="true"><path class="pl-dim-line" d="M${pt(a)}L${pt(b)}${tick(u0)}${tick(u1)}"/>`
            + (lbl ? `<text class="pl-dim-text" x="${f1(X(mid.x))}" y="${f1(Z(mid.z))}" text-anchor="middle" transform="rotate(${f1(ang)} ${f1(X(mid.x))} ${f1(Z(mid.z))})">${lbl}</text>` : '') + '</g>';
        };
        out.push(seg(0, selPl.offset), seg(selPl.offset + piece.width, wall.length));
      }
    }

    // the turn handle of a free piece
    if (selPl && selPl.mode === 'free') {
      const piece = pieceOf(selId), fp = footprintOf(prj, selPl);
      if (piece && fp) {
        const r = (selPl.rotation * Math.PI) / 180, f = { x: -Math.sin(r), z: Math.cos(r) };
        const hx = X(fp.cx + f.x * piece.depth / 2) + f.x * 26, hz = Z(fp.cz + f.z * piece.depth / 2) + f.z * 26;
        out.push(`<g class="pl-rot${drag && drag.turn ? ' is-active' : ''}" data-rotate="${esc(selId)}" transform="translate(${f1(hx)} ${f1(hz)})">`
          + `<path class="pl-rot__stem" d="M0 0L${f1(-f.x * 16)} ${f1(-f.z * 16)}"/><circle class="pl-rot__hit" r="19"/><circle class="pl-rot__dot" r="11"/>`
          + '<path class="pl-rot__arrow" d="M5 0A5 5 0 1 1 2.5-4.3M5 -4.5V-1H1.5"/></g>');
      }
    }

    // while dragging: what it snapped to, or where it stands
    if (drag && drag.moved && selPl) {
      const text = drag.turn ? `Turn ${selPl.rotation}°` : drag.snap ? SNAP_TEXT[drag.snap] : whereText(selPl);
      const w = Math.min(W - 24, text.length * 6.4 + 28);
      out.push(`<g class="pl-readout" aria-hidden="true" transform="translate(${f1(W - 12)} 12)"><rect x="${f1(-w)}" y="-2" width="${f1(w)}" height="26" rx="13"/><text x="${f1(-w / 2)}" y="12" text-anchor="middle">${esc(text)}</text></g>`);
    }
    if (!prj.placements.length) {
      out.push(`<text class="pl-empty-text" x="${f1(W / 2)}" y="26" text-anchor="middle">${prj.pieces.length ? 'Press Place next to a piece to put it in the room' : 'Design a piece first, then place it here'}</text>`);
    }

    const focused = document.activeElement && svg.contains(document.activeElement) ? document.activeElement.getAttribute('data-piece') : null;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.innerHTML = out.join('');
    if (focused) {
      const el = svg.querySelector(`[data-piece="${focused}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  // ---------- plan interaction ----------
  const toPlan = (e) => {
    const r = svg.getBoundingClientRect();
    const k = r.width / (Number(svg.getAttribute('width')) || r.width || 1);
    return { x: ((e.clientX - r.left) / k - L.ox) / L.s, z: ((e.clientY - r.top) / k - L.oz) / L.s };
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !L) return;
    const rot = e.target.closest('[data-rotate]');
    if (rot) {
      e.preventDefault();
      drag = { turn: true, id: rot.dataset.rotate, pointer: e.pointerId, moved: false, x0: e.clientX, y0: e.clientY, snap: null };
      svg.setPointerCapture(e.pointerId);
      planBox.classList.add('is-dragging');
      return;
    }
    const g = e.target.closest('[data-piece]');
    if (!g) return;
    const id = g.dataset.piece;
    e.preventDefault();
    if (state.ui.pieceId !== id) store.dispatch({ type: 'ui/piece', id });
    const pl = placementOf(id), piece = pieceOf(id);
    if (!pl || !piece) return;
    const p = toPlan(e);
    drag = { id, pointer: e.pointerId, moved: false, x0: e.clientX, y0: e.clientY, snap: null, mode: pl.mode };
    if (pl.mode === 'wall') {
      const wall = wallById(project().room, pl.wallId);
      drag.wallId = pl.wallId;
      drag.grab = wall ? clamp(G.projectOnWall(wall, p).u - pl.offset, 0, piece.width) : piece.width / 2;
    } else drag.grab = { x: p.x - pl.x, z: p.z - pl.z };
    svg.setPointerCapture(e.pointerId);
    planBox.classList.add('is-dragging');
    const el = svg.querySelector(`[data-piece="${id}"]`);
    if (el) el.focus({ preventScroll: true });
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    drag.moved = true;
    const p = toPlan(e), id = drag.id;
    const pl = placementOf(id), piece = pieceOf(id);
    if (!pl || !piece) return;
    if (drag.turn) {
      const fp = footprintOf(project(), pl);
      if (!fp) return;
      const deg = (Math.atan2(-(p.x - fp.cx), p.z - fp.cz) * 180) / Math.PI;
      store.dispatch({ type: 'place/move', id, patch: { rotation: G.snapRotation(deg), snap: false }, coalesce: `turn:${id}` });
      update(state);
      return;
    }
    const dist = clamp(8 / L.s, 4, 12);
    if (drag.mode === 'wall') {
      const r = G.dragOnWalls(project(), id, p, { grab: drag.grab, wallId: drag.wallId, dist });
      if (!r) return;
      drag.wallId = r.wallId; drag.grab = r.grab; drag.snap = r.snap;
      store.dispatch({ type: 'place/move', id, patch: { wallId: r.wallId, offset: r.offset, snap: false }, coalesce: `drag:${id}` });
    } else {
      const r = G.dragFree(project(), id, p, { grab: drag.grab });
      store.dispatch({ type: 'place/move', id, patch: { x: r.x, z: r.z, snap: false }, coalesce: `drag:${id}` });
    }
    update(state);
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.pointer)) return;
    try { svg.releasePointerCapture(drag.pointer); } catch { /* already released */ }
    const d = drag;
    drag = null;
    planBox.classList.remove('is-dragging');
    seal();
    planKey = '';
    renderPlan();
    if (d.moved) { const pl = placementOf(d.id); if (pl) announce(`${nameOf(d.id)}. ${whereText(pl)}.`); }
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('click', (e) => {
    if (e.target.closest('[data-piece], [data-rotate]')) return;
    const w = e.target.closest('[data-wall]');
    const id = state.ui.pieceId;
    if (w && id && pieceOf(id)) putOnWall(id, w.dataset.wall);
  });
  svg.addEventListener('keydown', (e) => {
    const g = e.target.closest && e.target.closest('[data-piece]');
    if (!g) return;
    const id = g.dataset.piece;
    const pl = placementOf(id);
    if (!pl) return;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      if (state.ui.pieceId !== id) store.dispatch({ type: 'ui/piece', id });
      const patch = G.nudge(project(), id, arrows[e.key][0], arrows[e.key][1], e.shiftKey ? 10 : 1);
      if (patch) store.dispatch({ type: 'place/move', id, patch, coalesce: `key:${id}` });
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (pl.mode !== 'free') { say('A piece against a wall faces the room. Make it free-standing to turn it.'); return; }
      store.dispatch({ type: 'place/move', id, patch: { rotation: G.snapRotation(pl.rotation + (e.shiftKey ? -15 : 15)), snap: false }, coalesce: `key:${id}` });
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); takeOut(id); }
  });
  svg.addEventListener('keyup', (e) => {
    if (!e.key.startsWith('Arrow') && e.key !== 'r' && e.key !== 'R') return;
    seal();
    const g = e.target.closest && e.target.closest('[data-piece]');
    const pl = g && placementOf(g.dataset.piece);
    if (pl) announce(`${nameOf(pl.pieceId)}. ${whereText(pl)}${pl.mode === 'free' ? `, turned ${pl.rotation} degrees` : ''}.`);
  });
  svg.addEventListener('focusin', (e) => {
    const g = e.target.closest && e.target.closest('[data-piece]');
    if (g && state.ui.pieceId !== g.dataset.piece && !drag) store.dispatch({ type: 'ui/piece', id: g.dataset.piece });
  });

  // ---------- lists and notes ----------
  function renderLists() {
    const prj = project();
    const by = clashes();
    const key = JSON.stringify([prj.pieces.map((p) => [p.id, p.type, p.width, p.height]), prj.placements.map((pl) => [pl.pieceId, pl.mode, pl.wallId]), state.ui.pieceId, Object.keys(by).map((k) => [k, by[k].blocking.length, by[k].warn.length])]);
    if (key !== listKey) {
      listKey = key;
      const placed = prj.placements.filter((pl) => pieceOf(pl.pieceId));
      placedEl.innerHTML = placed.map((pl) => {
        const piece = pieceOf(pl.pieceId), c = by[pl.pieceId];
        const state2 = c && c.blocking.length ? ' is-clash' : c && c.warn.length ? ' is-warn' : '';
        const label = pl.mode === 'free' ? 'Free' : `Wall ${wallNo(pl.wallId)}`;
        const status = c && c.blocking.length ? ', has a problem' : c && c.warn.length ? ', needs a look' : '';
        return `<button type="button" role="radio" class="pl-chip pl-chip--piece${state2}" data-piece="${esc(piece.id)}" aria-checked="${piece.id === state.ui.pieceId}" tabindex="-1"><span class="pl-chip__name">${esc(nameOf(piece.id))}<span class="visually-hidden">${esc(status)}</span></span><i>${esc(label)}</i></button>`;
      }).join('');
      const waiting = prj.pieces.filter((p) => !prj.placements.some((pl) => pl.pieceId === p.id));
      waitSec.hidden = !waiting.length;
      waitEl.innerHTML = waiting.map((p) => `<li class="pl-wait${p.id === state.ui.pieceId ? ' is-selected' : ''}">
        <button type="button" class="pl-wait__name" data-pick="${esc(p.id)}"><b>${esc(nameOf(p.id))}</b><span>${p.width} × ${p.depth} cm</span></button>
        <button type="button" class="pl-btn pl-btn--accent pl-btn--small" data-place="${esc(p.id)}">Place<span class="visually-hidden"> ${esc(nameOf(p.id))} in the room</span></button></li>`).join('');
      $('#pl-p-room-sec').hidden = !placed.length && !!waiting.length;
      $('#pl-p-roomhint').textContent = placed.length ? '' : 'Nothing is in the room yet.';
      $('#pl-p-roomhint').hidden = !!placed.length;
    }
    placedEl.querySelectorAll('[data-piece]').forEach((b) => {
      const on = b.dataset.piece === state.ui.pieceId;
      if (b.getAttribute('aria-checked') !== String(on)) b.setAttribute('aria-checked', String(on));
    });
  }

  function renderNotes() {
    const prj = project();
    const placedIds = new Set(prj.placements.map((pl) => pl.pieceId));
    const list = (validation.errors || []).filter((e) => e.ref && e.ref.type === 'placement' && placedIds.has(e.ref.pieceId));
    const items = list.map((e) => {
      const id = e.ref.pieceId;
      const fix = MOVABLE.has(e.code) ? `<button type="button" class="pl-link" data-fix="${esc(id)}">Find a free spot</button>` : '';
      return `<li class="pl-note pl-note--stack${e.blocking ? ' pl-note--clash' : ''}"><span class="pl-note__icon">${ICON_NOTE}</span><span class="pl-note__text">${esc(friendly(e.message))}</span>`
        + `<span class="pl-note__actions"><button type="button" class="pl-link" data-show="${esc(id)}">Show</button>${fix}</span></li>`;
    });
    clashCount = items.length;
    $('#pl-p-okline').hidden = !(!items.length && placedIds.size);
    sections.setBadge('clashes', items.length);
    const html = items.join('');
    if (html !== notesKey) { notesKey = html; notesEl.innerHTML = html; }
  }

  function renderInspector() {
    const piece = selected(), pl = piece && placementOf(piece.id);
    posSec.hidden = !pl;
    $('#pl-p-nopos').hidden = !!pl;
    if (!pl) { inspKey = ''; return; }
    const room = project().room;
    const key = `${piece.id}|${pl.mode}|${piece.width}|${wallsOf(room).map((w) => `${w.id}:${Math.round(w.length)}`).join()}|${wallById(room, pl.wallId) ? 1 : 0}`;
    if (key !== inspKey) { inspKey = key; buildFields(piece, pl); }
    const mode = modeOf(pl);
    $('#pl-p-modes').querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    $('#pl-p-where').textContent = `${nameOf(piece.id)}: ${whereText(pl).toLowerCase()}${mode === 'corner' ? ', in the corner' : ''}.`;
    syncFields(fieldsEl, lookup);
    syncWallSelect();
  }

  function renderLoop() {
    const piece = selected(), prj = project();
    const placed = piece && placementOf(piece.id);
    $('#pl-p-edit').hidden = !piece;
    $('#pl-p-edit-in').hidden = !piece || !TYPES[piece.type].palette.length;
    if (piece) {
      $('#pl-p-edit').innerHTML = `Edit this piece<span class="visually-hidden"> (${esc(nameOf(piece.id))})</span>`;
    }
    $('#pl-p-nexthint').textContent = !prj.pieces.length ? 'You have not designed a piece yet. Add one, then come back to place it.'
      : !prj.placements.length ? 'Place at least one piece before you review.'
        : placed ? 'Changes you make to a piece keep its place here. If a change makes it clash, it shows under Clashes.' : 'Add another piece, or press Next to review the room.';
  }

  const placementOf2 = () => project().placements.filter((pl) => pieceOf(pl.pieceId));

  // ---------- update ----------
  const ro = new ResizeObserver(() => { planKey = ''; if (!root.hidden) renderPlan(); });
  ro.observe(planBox);

  function update(next, info = {}) {
    state = next;
    validation = info.validation || validation;
    if (root.hidden) return;
    renderLists();
    renderNotes();
    renderInspector();
    renderLoop();
    const prj = project();
    const by = clashes();
    const k = JSON.stringify([prj.room, prj.pieces.map((p) => [p.id, p.type, p.width, p.depth, p.height]), prj.placements, state.ui.pieceId, Object.keys(by).map((id) => [id, by[id].blocking.length, by[id].warn.length]), drag && [drag.moved, drag.snap]]);
    if (k !== planKey) { planKey = k; renderPlan(); }
  }
  function show() {
    planKey = ''; listKey = ''; inspKey = ''; notesKey = '';
    update(state);
    renderPlan();
  }

  update(state);
  return { update, show, sections, status: () => ({ count: clashCount, ok: placementOf2().length > 0, jump: 'clashes' }), destroy() { ro.disconnect(); } };
}
