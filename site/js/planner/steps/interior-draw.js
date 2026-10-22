// SVG drawings of the interior items for the front elevation (doors hidden) and for the palette thumbnails.
// Pure string building: `drawItem(item, r, o)` returns markup for an item whose body fills the rectangle r
// ({ x, y, w, h }, y = top, in px). `o.zone` is the rectangle of the space the item claims, when it is bigger.
import { ITEMS } from '../model.js';

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const rect = (cls, x, y, w, h, extra = '') => `<rect class="${cls}" x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}"${extra}/>`;
const line = (cls, x1, y1, x2, y2) => `<path class="${cls}" d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}"/>`;

const STACKS = {
  drawers: (it) => ({ n: it.count, outer: true }),
  'inner-drawers': (it) => ({ n: it.count, outer: false }),
  jewellery: () => ({ n: 1, outer: false }),
  'divided-drawer': () => ({ n: 1, outer: true }),
  'cutlery-insert': () => ({ n: 1, outer: true }),
  'pan-drawer': (it) => ({ n: it.count, outer: true }),
  'keyboard-drawer': () => ({ n: 1, outer: true }),
  hamper: () => ({ n: 1, outer: true }),
  basket: () => ({ n: 1, outer: false })
};

// Default values for every parameter of a kind, so thumbnails and the palette can draw an item that is not placed yet.
export function defaultItem(kind) {
  const d = ITEMS[kind];
  const it = { kind, y: 0 };
  for (const [name, spec] of Object.entries(d.params)) it[name] = spec.default === null ? 40 : spec.default;
  return it;
}

export function drawItem(it, r, o = {}) {
  const { x, y, w, h } = r;
  const zone = o.zone;
  const k = it.kind;
  let out = '';
  if (STACKS[k]) {
    const { n, outer } = STACKS[k](it);
    const rh = h / n;
    for (let i = 0; i < n; i++) {
      const yy = y + i * rh;
      out += rect(outer ? 'pl-i-front' : 'pl-i-inner', x + 1, yy + 0.5, w - 2, Math.max(2, rh - 1), '');
      const hw = Math.min(w * 0.4, 26);
      if (rh > 6) out += line('pl-i-handle', x + w / 2 - hw / 2, yy + rh * 0.45, x + w / 2 + hw / 2, yy + rh * 0.45);
    }
    return out;
  }
  switch (k) {
    case 'shelf': case 'book-shelf':
      out += rect(it.material === 'glass' ? 'pl-i-glass' : 'pl-i-board', x, y, w, Math.max(3, h));
      if (k === 'book-shelf') for (let i = 0; i < 5 && x + 8 + i * 9 < x + w - 6; i++) out += rect('pl-i-book', x + 6 + i * 9, y - 12, 6, 12);
      return out;
    case 'rail-long': case 'rail-short': case 'double-hang': case 'pull-down-rail': {
      const zb = zone ? zone.y + zone.h : y + h + 24;
      const rails = k === 'double-hang'
        ? [{ ry: y + 3, hang: Math.max(10, h - 6) }, { ry: y + h - 3, hang: Math.max(10, zb - (y + h - 3)) }]
        : [{ ry: y + h / 2, hang: Math.max(10, zb - (y + h / 2)) }];
      rails.forEach(({ ry, hang }) => {
        out += line('pl-i-rail', x + 2, ry, x + w - 2, ry);
        out += `<circle class="pl-i-railend" cx="${f1(x + 2)}" cy="${f1(ry)}" r="2.4"/><circle class="pl-i-railend" cx="${f1(x + w - 2)}" cy="${f1(ry)}" r="2.4"/>`;
        const n = Math.max(2, Math.min(9, Math.floor(w / 13)));
        for (let i = 0; i < n; i++) {
          const gx = x + 6 + (i + 0.5) * ((w - 12) / n);
          const gh = hang * (0.5 + 0.42 * (((i * 5 + 3) % 7) / 7));
          out += rect(i % 2 ? 'pl-i-garment pl-i-garment--b' : 'pl-i-garment', gx - 3.5, ry + 3, 7, Math.max(6, gh - 6), ' rx="2"');
        }
      });
      return out;
    }
    case 'shoes': case 'shoe-pullout': {
      const rows = it.rows;
      const rh = h / rows;
      out += k === 'shoe-pullout' ? rect('pl-i-frame', x + 2, y, w - 4, h) : '';
      for (let i = 0; i < rows; i++) {
        const yy = y + h - (i + 1) * rh + rh * 0.55;
        out += line('pl-i-board-line', x + 3, yy + 3, x + w - 3, yy - 1);
        const pairs = Math.max(1, Math.min(3, Math.floor(w / 40)));
        for (let j = 0; j < pairs; j++) out += rect('pl-i-shoe', x + 8 + j * ((w - 24) / pairs), yy - rh * 0.34, Math.min(22, (w - 24) / pairs - 4), rh * 0.34, ' rx="3"');
      }
      return out;
    }
    case 'trouser-rack': case 'tie-belt': case 'valet-rod': case 'ironing': case 'hooks': {
      if (k === 'ironing') return rect('pl-i-frame', x + w * 0.2, y, w * 0.6, h) + line('pl-i-board-line', x + w * 0.25, y + h * 0.08, x + w * 0.75, y + h * 0.08) + rect('pl-i-ironing', x + w * 0.3, y + h * 0.1, w * 0.4, h * 0.78, ' rx="8"');
      if (k === 'hooks') {
        out += rect('pl-i-board', x + 2, y + h * 0.4, w - 4, Math.max(3, h * 0.25));
        for (let i = 0; i < it.count; i++) out += `<circle class="pl-i-railend" cx="${f1(x + 6 + (i + 0.5) * ((w - 12) / it.count))}" cy="${f1(y + h * 0.4 + h * 0.4)}" r="2"/>`;
        return out;
      }
      if (k === 'valet-rod') return line('pl-i-rail', it.side === 'left' ? x + 3 : x + w - 3, y + h / 2, it.side === 'left' ? x + w * 0.5 : x + w * 0.5, y + h / 2);
      const rx = k === 'tie-belt' ? (it.side === 'left' ? x + 2 : x + w - Math.min(w * 0.3, 14) - 2) : x + w * 0.12;
      const rw = k === 'tie-belt' ? Math.min(w * 0.3, 14) : w * 0.76;
      out += rect('pl-i-frame', rx, y, rw, h);
      const bars = k === 'trouser-rack' ? 8 : 6;
      for (let i = 0; i < bars; i++) out += line('pl-i-board-line', rx + 2, y + (h * (i + 0.7)) / (bars + 0.4), rx + rw - 2, y + (h * (i + 0.7)) / (bars + 0.4));
      return out;
    }
    case 'basket': return out;
    case 'mirror':
      out += rect('pl-i-mirror', x + 3, y, w - 6, h);
      return out + line('pl-i-sheen', x + w * 0.3, y + h * 0.1, x + w * 0.2, y + h * 0.5) + line('pl-i-sheen', x + w * 0.45, y + h * 0.1, x + w * 0.32, y + h * 0.6);
    case 'divider':
      return rect('pl-i-board', x + w / 2 - 2, y, 4, h);
    case 'cubbies': {
      const rows = it.rows, cols = it.columns;
      out += rect('pl-i-frame', x, y, w, h);
      for (let i = 1; i < rows; i++) out += rect('pl-i-board', x, y + (i * h) / rows - 1.5, w, 3);
      for (let j = 1; j < cols; j++) out += rect('pl-i-board', x + (j * w) / cols - 1.5, y, 3, h);
      return out;
    }
    case 'led':
      return rect('pl-i-led-glow', x + 2, y - 1, w - 4, Math.max(5, h + 2), ' rx="2"') + rect('pl-i-led', x + 2, y, w - 4, Math.max(2, h));
    case 'cable-tray':
      return rect('pl-i-frame pl-i-dashed', x + 3, y, w - 6, h);
    case 'carousel': {
      const rx = Math.max(8, Math.min(w / 2 - 3, 36));
      return `<ellipse class="pl-i-board" cx="${f1(x + w / 2)}" cy="${f1(y + h * 0.2)}" rx="${f1(rx)}" ry="3"/><ellipse class="pl-i-board" cx="${f1(x + w / 2)}" cy="${f1(y + h * 0.75)}" rx="${f1(rx)}" ry="3"/>${line('pl-i-rail', x + w / 2, y + h * 0.15, x + w / 2, y + h * 0.8)}`;
    }
    case 'bin-pullout': {
      const n = it.bins;
      for (let i = 0; i < n; i++) out += rect('pl-i-bin', x + 3 + (i * (w - 6)) / n + 1, y + h * 0.2, (w - 6) / n - 2, h * 0.8, ' rx="2"');
      return out;
    }
    case 'media-niche':
      return rect('pl-i-frame', x, y, w, h) + rect('pl-i-board', x, y, w, 3) + rect('pl-i-board', x, y + h - 3, w, 3);
    default:
      return rect('pl-i-frame', x, y, w, Math.max(3, h));
  }
}

// A small picture of a kind with its default parameters, for the palette.
export function thumbSvg(kind, W = 46, H = 32) {
  const it = defaultItem(kind);
  const d = ITEMS[kind];
  const body = d.body(it), zone = d.zone(it);
  const lo = Math.min(body[0], zone ? zone[0] : body[0]), hi = Math.max(body[1], zone ? zone[1] : body[1], lo + 4);
  const span = Math.max(8, hi - lo);
  const s = Math.min((H - 6) / span, 1.4);
  const ph = span * s;
  const pad = (H - ph) / 2;
  const yAt = (v) => H - pad - (v - lo) * s;
  const by0 = yAt(body[1]), bh = Math.max(2, (body[1] - body[0]) * s);
  const zr = zone ? { x: 4, y: yAt(zone[1]), w: W - 8, h: Math.max(2, (zone[1] - zone[0]) * s) } : null;
  const inner = drawItem(it, { x: 4, y: by0, w: W - 8, h: bh }, { zone: zr, thumb: true });
  return `<svg class="pl-thumbi" viewBox="0 0 ${W} ${H}" aria-hidden="true">${inner}</svg>`;
}
