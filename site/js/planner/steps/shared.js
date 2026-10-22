// Small helpers shared by the step editors: escaping, numeric fields with a slider, the piece switcher and notes.
import { pieceLabel, TYPES } from '../model.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
export const ICON_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v6M13.5 11v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// A number input with an optional slider. `bind` names the value, `data-min` and `data-max` are what typing may reach.
export function fieldHtml(bind, label, value, { min, max, step = 1, unit = 'cm', slider = true, sliderStep, id } = {}) {
  const uid = `pl-n-${(id || bind).replace(/\W/g, '-')}`;
  return `
    <div class="pl-row">
      <label class="pl-row__label" for="${uid}">${esc(label)}</label>
      <span class="pl-field"><input class="pl-field__input" type="number" inputmode="decimal" id="${uid}" data-bind="${esc(bind)}" data-min="${min}" data-max="${max}" min="${min}" max="${max}" step="${step}" value="${value}"><span class="pl-field__unit" aria-hidden="true">${unit}</span></span>
      ${slider ? `<input class="pl-range" type="range" data-bind="${esc(bind)}" data-min="${min}" data-max="${max}" min="${min}" max="${max}" step="${sliderStep || step}" value="${value}" aria-label="${esc(label)} slider">` : ''}
    </div>`;
}

// Wires the [data-bind] inputs under `root`: `apply(bind, value, commit)` is called while typing (commit false)
// and when the value is settled (commit true); `current(bind)` gives the stored value to show.
export function wireFields(root, { apply, current, seal }) {
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches && el.matches('[data-bind]')) {
      const v = Number(el.value);
      if (el.value === '' || !Number.isFinite(v)) return;
      const lo = Number(el.dataset.min), hi = Number(el.dataset.max);
      if (el.type === 'number' && (v < lo || v > hi)) return; // let people type through values that are not valid yet
      apply(el.dataset.bind, clamp(Math.round(v * 10) / 10, lo, hi), false);
    }
  });
  root.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.matches || !el.matches('[data-bind]')) return;
    if (el.type === 'number') {
      const v = Number(el.value);
      if (el.value !== '' && Number.isFinite(v)) apply(el.dataset.bind, clamp(Math.round(v * 10) / 10, Number(el.dataset.min), Number(el.dataset.max)), true);
      const cur = current(el.dataset.bind);
      if (cur !== undefined) el.value = cur;
    }
    seal();
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input[type="number"]') && e.key === 'Enter') e.target.blur();
  });
}

// Puts stored values into the inputs, leaving the one being typed in alone.
export function syncFields(root, current) {
  root.querySelectorAll('[data-bind]').forEach((el) => {
    const v = current(el.dataset.bind);
    if (v === undefined) return;
    if (el.type === 'number' && el === document.activeElement) return;
    if (String(el.value) !== String(v)) el.value = v;
  });
}

// The switcher between pieces: one chip each, plus the placed or not state.
export function pieceChipsHtml(project, selectedId) {
  if (!project.pieces.length) return '';
  return project.pieces.map((p) => {
    const placed = project.placements.some((pl) => pl.pieceId === p.id);
    const n = project.pieces.filter((x) => x.type === p.type).findIndex((x) => x.id === p.id) + 1;
    return `<button type="button" class="pl-chip pl-chip--piece" data-piece="${esc(p.id)}" aria-pressed="${p.id === selectedId}"><span>${esc(TYPES[p.type].label)} ${n}</span><i class="${placed ? 'is-placed' : ''}">${p.width}×${p.height}</i></button>`;
  }).join('');
}

export const pieceName = (project, id) => pieceLabel(project, id);

export function notesHtml(list, actionsFor) {
  return list.map((e) => {
    const actions = actionsFor ? actionsFor(e) : '';
    return `<li class="pl-note${e.blocking ? ' pl-note--block' : ''}"><span class="pl-note__icon">${ICON_NOTE}</span><span class="pl-note__text">${esc(e.message)}</span>${actions ? `<span class="pl-note__actions">${actions}</span>` : ''}</li>`;
  }).join('');
}
