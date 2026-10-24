// DOM helpers shared by the planner steps: roving-tabindex groups (one Tab stop, arrow keys inside), the ARIA tabs that
// switch the sections of a step, small disclosures (tips, issues, the price breakdown) and a cue for scrollable boxes.
// Nothing here runs a loop: everything reacts to events, and attributes are written only when they change.
import { nextIndex } from '../ui-logic.js';


// A group of buttons (or radios, or tabs) that is one Tab stop. The checked/pressed/selected item holds the stop; the
// arrow keys, Home and End move focus inside. `selects: true` also presses the item the focus lands on (radios, tabs).
// The stop follows the markup: when items are re-rendered or their aria state changes, a microtask puts it right.
export function roving(container, { selector, selects = false } = {}) {
  // an item is out of the group when it or something between it and the group is hidden (the group itself may be
  // hidden for now, for example while its step is not on show, and still gets its Tab stop)
  const usable = (el) => {
    if (el.disabled) return false;
    for (let n = el; n && n !== container; n = n.parentElement) if (n.hidden) return false;
    return true;
  };
  const CHECKED = '[aria-checked="true"], [aria-selected="true"], [aria-pressed="true"]';
  const items = () => [...container.querySelectorAll(selector)].filter(usable);
  let queued = false;
  const setStop = (active) => {
    for (const el of container.querySelectorAll(selector)) {
      const want = el === active ? 0 : -1;
      if (el.tabIndex !== want) el.tabIndex = want;
    }
  };
  function refresh() {
    queued = false;
    const list = items();
    if (!list.length) return;
    const focused = list.find((el) => el === document.activeElement);
    setStop(list.find((el) => el.matches(CHECKED)) || focused || list[0]);
  }
  const queue = () => { if (!queued) { queued = true; queueMicrotask(refresh); } };
  new MutationObserver(queue).observe(container, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'aria-pressed', 'aria-selected', 'disabled', 'hidden']
  });
  container.addEventListener('focusin', (e) => {
    const t = e.target.closest && e.target.closest(selector);
    if (t && container.contains(t)) setStop(t);
  });
  container.addEventListener('focusout', (e) => {
    if (!container.contains(e.relatedTarget)) queue();
  });
  container.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target.closest && e.target.closest(selector);
    if (!t || !container.contains(t)) return;
    const list = items();
    const i = list.indexOf(t);
    if (i < 0) return;
    const top = list[0].offsetTop;
    const cols = Math.max(1, list.filter((el) => el.offsetTop === top).length);
    const n = nextIndex(i, list.length, e.key, cols);
    if (n === null) return;
    e.preventDefault();
    if (n === i) return;
    list[n].focus();
    if (selects) list[n].click();
  });
  queue();
  return { refresh };
}

// ARIA tabs for the sections of a step. `root` holds one element per section, marked data-sec="id". The tab list goes
// in front of them. Arrow keys move between the tabs and open the one they land on. Returns a small controller.
export function createTabs({ root, prefix, label, items, onChange = () => {} }) {
  const list = document.createElement('div');
  list.className = 'pl-secnav';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', label);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  list.innerHTML = items.map((it) => `<button type="button" class="pl-sectab" role="tab" id="${prefix}-tab-${it.id}" data-tab="${it.id}"${it.title ? ` title="${esc(it.title)}"` : ''} aria-controls="${prefix}-sec-${it.id}" aria-selected="false" tabindex="-1"><span class="pl-sectab__t">${esc(it.label)}</span><span class="pl-sectab__badge" hidden></span></button>`).join('');
  root.insertBefore(list, root.firstChild);
  const panels = {};
  for (const it of items) {
    const p = root.querySelector(`[data-sec="${it.id}"]`);
    panels[it.id] = p;
    if (!p) continue;
    p.id = `${prefix}-sec-${it.id}`;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', `${prefix}-tab-${it.id}`);
    p.hidden = true;
  }
  const tabOf = (id) => list.querySelector(`[data-tab="${id}"]`);
  let current = null;
  let enabled = true;
  let shownKey = null;

  function visibleIds() { return items.map((it) => it.id).filter((id) => !tabOf(id).hidden); }
  function syncBar() { list.hidden = !enabled || visibleIds().length < 2; }

  function show(id, { focus = false, silent = false } = {}) {
    if (!panels[id] || tabOf(id).hidden) id = visibleIds()[0] || items[0].id;
    const changed = id !== current;
    current = id;
    shownKey = null;
    for (const it of items) {
      const on = it.id === id, t = tabOf(it.id);
      if (t.getAttribute('aria-selected') !== String(on)) t.setAttribute('aria-selected', String(on));
      if (panels[it.id] && panels[it.id].hidden !== !(on && enabled)) panels[it.id].hidden = !(on && enabled);
    }
    const t = tabOf(id);
    if (list.scrollWidth > list.clientWidth) {
      const left = t.offsetLeft - 8, right = t.offsetLeft + t.offsetWidth + 8;
      if (left < list.scrollLeft) list.scrollLeft = left;
      else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
    }
    if (focus) t.focus();
    if (changed && !silent) {
      onChange(id);
      root.dispatchEvent(new CustomEvent('pl-section', { bubbles: true, detail: { id } }));
    }
    return changed;
  }
  // The guided flow shows one question at a time: any number of sections together (or none), with the tab bar out of sight.
  // Returns true when the set changed.
  function showMany(ids, { silent = false } = {}) {
    const want = ids.filter((id) => panels[id]);
    const first = want[0] || null;
    for (const it of items) {
      const on = want.includes(it.id) && enabled, t = tabOf(it.id);
      const sel = it.id === first;
      if (t.getAttribute('aria-selected') !== String(sel)) t.setAttribute('aria-selected', String(sel));
      if (panels[it.id] && panels[it.id].hidden !== !on) panels[it.id].hidden = !on;
    }
    const key = want.join('|');
    const changed = key !== shownKey || first !== current;
    shownKey = key;
    current = first;
    if (changed && !silent) {
      onChange(first || '');
      root.dispatchEvent(new CustomEvent('pl-section', { bubbles: true, detail: { id: first || '' } }));
    }
    return changed;
  }
  list.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { shownKey = null; show(t.dataset.tab); }
  });
  roving(list, { selector: '[role="tab"]', selects: true });

  return {
    show,
    showMany,
    current: () => current,
    list,
    setHidden(id, hidden) {
      const t = tabOf(id);
      if (!t || t.hidden === hidden) return;
      t.hidden = hidden;
      syncBar();
      if (hidden && current === id) show(visibleIds()[0] || items[0].id);
      else if (!hidden && current === null) show(id);
    },
    // a count or mark on a tab, spoken as part of its name ("Clashes, 2 to check")
    setBadge(id, n, spoken = 'to check') {
      const b = tabOf(id).querySelector('.pl-sectab__badge');
      const text = n ? String(n) : '';
      if (b.dataset.n === text) return;
      b.dataset.n = text;
      b.hidden = !n;
      b.innerHTML = n ? `<span aria-hidden="true">${n}</span><span class="visually-hidden">, ${n} ${spoken}</span>` : '';
    },
    // a step with nothing to arrange shows a message instead of its sections
    setEnabled(on) {
      if (enabled === on) return;
      enabled = on;
      syncBar();
      if (current !== null) { const id = current; current = null; show(id, { silent: true }); }
    },
    syncBar
  };
}

// A button that opens and closes a panel next to it (tips, the issue list, the price breakdown). Escape and a click
// elsewhere close it; focus stays on the button.
export function disclosure(button, panel, { onOpen = () => {}, onClose = () => {}, bind = true } = {}) {
  const set = (open) => {
    if (panel.hidden === !open) return;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) onOpen(); else onClose();
  };
  button.setAttribute('aria-expanded', 'false');
  if (bind) button.addEventListener('click', () => set(panel.hidden));
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) set(false);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      set(false);
      if (panel.contains(document.activeElement) || document.activeElement === document.body) button.focus();
    }
  });
  return { open: () => set(true), close: () => set(false), toggle: () => set(panel.hidden), isOpen: () => !panel.hidden };
}

// Marks a scrollable box that has more beyond its edge (a fade and a small arrow, drawn by CSS from the data
// attributes on the wrapper). `axis` is 'y' (default) or 'x'. `grow: false` keeps the box as small as its content
// allows. Updates on scroll and on resize, nothing else.
export function scrollCue(scroller, axis = 'y', { grow = true } = {}) {
  let wrap = scroller.parentElement;
  if (!wrap || !wrap.classList.contains('pl-scrollwrap')) {
    wrap = document.createElement('div');
    wrap.className = 'pl-scrollwrap';
    scroller.parentNode.insertBefore(wrap, scroller);
    wrap.appendChild(scroller);
  }
  wrap.dataset.axis = axis;
  if (!grow) wrap.classList.add('pl-scrollwrap--fit');
  scroller.classList.add('pl-scroll', `pl-scroll--${axis}`);
  const set = (key, on) => {
    if ((wrap.dataset[key] === '1') === on) return;
    if (on) wrap.dataset[key] = '1'; else delete wrap.dataset[key];
  };
  function measure() {
    const pos = axis === 'y' ? scroller.scrollTop : scroller.scrollLeft;
    const max = axis === 'y' ? scroller.scrollHeight - scroller.clientHeight : scroller.scrollWidth - scroller.clientWidth;
    set('moreStart', pos > 2);
    set('moreEnd', max - pos > 2);
  }
  // in a row, the chosen item scrolls into view when it changes (the row shows one line, the rest is behind the cue)
  let shown = null;
  function reveal() {
    if (axis !== 'x') return;
    const c = scroller.querySelector('[aria-checked="true"]');
    if (!c || c === shown) return;
    shown = c;
    const left = c.offsetLeft - 8, right = c.offsetLeft + c.offsetWidth + 8;
    if (left < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, left - 28);
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth + 28;
  }
  scroller.addEventListener('scroll', measure, { passive: true });
  // a sideways row also follows an ordinary vertical wheel, as long as it can still move that way
  if (axis === 'x') scroller.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.ctrlKey) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (max <= 0) return;
    const next = Math.max(0, Math.min(max, scroller.scrollLeft + e.deltaY));
    if (next === scroller.scrollLeft) return;
    e.preventDefault();
    scroller.scrollLeft = next;
  }, { passive: false });
  new ResizeObserver(measure).observe(scroller);
  new MutationObserver(() => { reveal(); measure(); }).observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked'] });
  reveal();
  measure();
  return { measure, wrap };
}
