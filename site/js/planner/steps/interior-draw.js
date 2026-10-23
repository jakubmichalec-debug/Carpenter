// SVG drawings of the interior items for the front elevation (doors hidden) and for the palette thumbnails.
// Pure string building: `drawItem(item, r, o)` returns markup for an item whose body fills the rectangle r
// ({ x, y, w, h }, y = top, in px). `o.zone` is the rectangle of the space the item claims, when it is bigger.
import { ITEMS, normalizeItem } from '../model.js';
import { railInfo, liningInfo } from '../materials.js';

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const rect = (cls, x, y, w, h, extra = '') => `<rect class="${cls}" x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(0, w))}" height="${f1(Math.max(0, h))}"${extra}/>`;
const line = (cls, x1, y1, x2, y2) => `<path class="${cls}" d="M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}"/>`;

const STACKS = {
  drawers: (it) => ({ n: it.count, outer: true }),
  'inner-drawers': (it) => ({ n: it.count, outer: false }),
  jewellery: () => ({ n: 1, outer: false }),
  tray: () => ({ n: 1, outer: false }),
  'cutlery-insert': () => ({ n: 1, outer: true }),
  'pan-drawer': (it) => ({ n: it.count, outer: true }),
  'keyboard-drawer': () => ({ n: 1, outer: true }),
  hamper: () => ({ n: 1, outer: true }),
  basket: () => ({ n: 1, outer: false })
};

// Default values for every parameter of a kind, so thumbnails and the palette can draw an item that is not placed yet.
export function defaultItem(kind) {
  return normalizeItem({ kind, y: 0 }, { bayWidth: 80, innerH: 226 });
}

export function drawItem(it, r, o = {}) {
  const { x, y, w, h } = r;
  const zone = o.zone;
  const k = it.kind;
  let out = '';
  if (STACKS[k]) {
    const { n, outer } = STACKS[k](it);
    const rh = h / n;
    const glass = it.face === 'glass';
    const insert = k === 'jewellery' ? 'jewellery' : k === 'tray' ? (it.insert === 'felt' ? 'felt' : '') : it.insert && it.insert !== 'none' ? it.insert : (k === 'cutlery-insert' ? 'cutlery' : '');
    for (let i = 0; i < n; i++) {
      const yy = y + i * rh;
      out += rect(`${outer ? 'pl-i-front' : 'pl-i-inner'}${glass ? ' pl-i-front--glass' : ''}${it.face === 'wood' ? ' pl-i-front--oak' : ''}`, x + 1, yy + 0.5, w - 2, Math.max(2, rh - 1), '');
      if (glass && rh > 8) out += rect('pl-i-glass-pane', x + 5, yy + 3.5, w - 10, Math.max(2, rh - 8), '') + line('pl-i-sheen pl-i-sheen--thin', x + w * 0.3, yy + rh - 5, x + w * 0.38, yy + 4);
      const hw = Math.min(w * 0.4, 26);
      if (rh > 6 && !glass) out += line('pl-i-handle', x + w / 2 - hw / 2, yy + rh * 0.45, x + w / 2 + hw / 2, yy + rh * 0.45);
      else if (rh > 6 && outer) out += line('pl-i-handle', x + w / 2 - hw / 2, yy + rh - 3, x + w / 2 + hw / 2, yy + rh - 3);
      if (insert && rh > 8) {
        // a little plan of the insert in the corner, in its lining colour
        const lc = insert === 'cutlery' ? '#3b3e42' : liningInfo(it.lining || 'grey').color;
        const iw = Math.min(26, w * 0.34), ih = Math.min(rh - 5, 12), ix = x + w - iw - 5, iy = yy + 3;
        out += `<rect class="pl-i-insert" x="${f1(ix)}" y="${f1(iy)}" width="${f1(iw)}" height="${f1(ih)}" rx="1.5" style="fill:${lc}"/>`;
        const cols = insert === 'socks' ? 4 : insert === 'cutlery' ? 3 : insert === 'jewellery' ? 3 : 0;
        for (let c = 1; c < cols; c++) out += line('pl-i-insert-line', ix + (c * iw) / cols, iy + 1, ix + (c * iw) / cols, iy + ih - 1);
      }
    }
    return out;
  }
  switch (k) {
    case 'shelf': case 'book-shelf':
      out += rect(it.material === 'glass' ? 'pl-i-glass' : 'pl-i-board', x, y, w, Math.max(3, h));
      if (k === 'book-shelf') for (let i = 0; i < 5 && x + 8 + i * 9 < x + w - 6; i++) out += rect('pl-i-book', x + 6 + i * 9, y - 12, 6, 12);
      return out;
    case 'rail': case 'pull-down-rail': {
      const zb = zone ? zone.y + zone.h : y + h + 24;
      const rails = [{ ry: y + h / 2, hang: Math.max(10, zb - (y + h / 2)) }];
      const col = k === 'rail' ? railInfo(it.finish).color : null;
      rails.forEach(({ ry, hang }) => {
        out += `<path class="pl-i-rail" d="M${f1(x + 2)} ${f1(ry)}L${f1(x + w - 2)} ${f1(ry)}"${col ? ` style="stroke:${col}"` : ''}/>`;
        out += `<circle class="pl-i-railend" cx="${f1(x + 2)}" cy="${f1(ry)}" r="2.4"${col ? ` style="fill:${col}"` : ''}/><circle class="pl-i-railend" cx="${f1(x + w - 2)}" cy="${f1(ry)}" r="2.4"${col ? ` style="fill:${col}"` : ''}/>`;
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
        if (k === 'shoes' && it.lip) out += line('pl-i-lip', x + 3, yy + 0.5, x + w - 3, yy - 3.5);
        const pairs = Math.max(1, Math.min(3, Math.floor(w / 40)));
        for (let j = 0; j < pairs; j++) out += rect('pl-i-shoe', x + 8 + j * ((w - 24) / pairs), yy - rh * 0.34, Math.min(22, (w - 24) / pairs - 4), rh * 0.34, ' rx="3"');
      }
      return out;
    }
    case 'trouser-rack': case 'tie-belt': case 'valet-rod': case 'hooks': {
      if (k === 'hooks') {
        out += rect('pl-i-board', x + 2, y + h * 0.4, w - 4, Math.max(3, h * 0.25));
        for (let i = 0; i < it.count; i++) out += `<circle class="pl-i-railend" cx="${f1(x + 6 + (i + 0.5) * ((w - 12) / it.count))}" cy="${f1(y + h * 0.4 + h * 0.4)}" r="2"/>`;
        return out;
      }
      if (k === 'valet-rod') return `<path class="pl-i-rail" d="M${f1(it.side === 'left' ? x + 3 : x + w - 3)} ${f1(y + h / 2)}L${f1(x + w * 0.5)} ${f1(y + h / 2)}" style="stroke:${railInfo(it.finish).color}"/>`;
      const rx = k === 'tie-belt' ? (it.side === 'left' ? x + 2 : x + w - Math.min(w * 0.3, 14) - 2) : x + w * 0.12;
      const rw = k === 'tie-belt' ? Math.min(w * 0.3, 14) : w * 0.76;
      out += rect('pl-i-frame', rx, y, rw, h);
      const bars = k === 'trouser-rack' ? 8 : 6;
      for (let i = 0; i < bars; i++) out += line('pl-i-board-line', rx + 2, y + (h * (i + 0.7)) / (bars + 0.4), rx + rw - 2, y + (h * (i + 0.7)) / (bars + 0.4));
      return out;
    }
    case 'basket': return out;
    case 'mirror':
      if (it.mode === 'swivel') return rect('pl-i-mirror', x + 3, y, Math.min(w * 0.4, 22), h) + line('pl-i-rail', x + 3, y - 1, x + 3, y + h + 1) + line('pl-i-sheen', x + 8, y + h * 0.1, x + 6, y + h * 0.5);
      out += rect('pl-i-mirror', x + 3, y, w - 6, h);
      return out + line('pl-i-sheen', x + w * 0.3, y + h * 0.1, x + w * 0.2, y + h * 0.5) + line('pl-i-sheen', x + w * 0.45, y + h * 0.1, x + w * 0.32, y + h * 0.6);
    case 'divider':
      return rect('pl-i-board', x + w / 2 - 2, y, 4, h);
    case 'larder': {
      out += rect('pl-i-front', x + 1, y + 0.5, w - 2, Math.max(4, h - 1));
      for (let i = 1; i < it.baskets; i++) out += line('pl-i-board-line', x + 5, y + (i * h) / it.baskets, x + w - 5, y + (i * h) / it.baskets);
      for (let i = 0; i < it.baskets; i++) out += rect('pl-i-jar', x + w * 0.3, y + ((i + 1) * h) / it.baskets - 11, 5, 8, ' rx="1"') + rect('pl-i-jar pl-i-jar--b', x + w * 0.3 + 8, y + ((i + 1) * h) / it.baskets - 9, 5, 6, ' rx="1"');
      return out + line('pl-i-handle', x + w - 8, y + h * 0.3, x + w - 8, y + h * 0.5);
    }
    case 'spice': {
      out += rect('pl-i-front', x + 1, y + 0.5, w - 2, Math.max(4, h - 1));
      for (let i = 1; i <= it.tiers; i++) {
        const yy = y + (i * h) / (it.tiers + 0.35);
        out += line('pl-i-board-line', x + 4, yy, x + w - 4, yy);
        for (let j = 0; j < Math.max(1, Math.floor((w - 8) / 7)); j++) out += rect('pl-i-jar', x + 5 + j * 7, yy - 9, 4.5, 8, ' rx="1.5"');
      }
      return out;
    }
    case 'led':
      return rect('pl-i-led-glow', x + 2, y - 1, w - 4, Math.max(5, h + 2), ' rx="2"') + rect('pl-i-led', x + 2, y, w - 4, Math.max(2, h));
    case 'cable-tray':
      return rect('pl-i-frame pl-i-dashed', x + 3, y, w - 6, h);
    case 'carousel': {
      const rx = Math.max(8, Math.min(w / 2 - 3, 36)) * (it.shape === 'kidney' ? 1.15 : 1);
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
