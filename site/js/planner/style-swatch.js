// Small generated pictures of a look: an elevation of a pair of doors drawn from a style bundle (design, material
// colours, handles, base, top, two-tone). Pure: returns SVG strings, no DOM.
import { MATERIALS, canonicalId } from './materials.js';

const colorOf = (id, fallback = '#c19a6b') => (MATERIALS[canonicalId(id)] || { color: fallback }).color;
const isGrain = (id) => !!(MATERIALS[canonicalId(id)] && MATERIALS[canonicalId(id)].grain);
let counter = 0;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
}

// `look` is a bundle from styleBundle(): { fronts, carcass, interior, plinth, look }. `size` is the CSS pixel width.
export function swatchSvg(b) {
  const id = `sw${++counter}`;
  const f = b.fronts, lk = b.look;
  const base = colorOf(f.material);
  const upperId = lk.upper ? lk.upper.material : null;
  const line = shade(base, 0.6);
  const hcol = colorOf(f.handleFinish, '#1c1d1f');
  const legs = b.plinth > 0 && lk.base === 'legs';
  const baseH = b.plinth > 0 ? (legs ? 12 : lk.base === 'flush' ? 6 : 5) : 0;
  const capH = lk.top === 'cornice' ? 6 : lk.top === 'overhang' ? 3 : 0;
  const x0 = 14, x1 = 86, yTop = 12 + capH, yBot = 112 - baseH;
  const mid = (x0 + x1) / 2;
  const hgt = yBot - yTop;
  const splitY = yTop + hgt * 0.42;
  const out = [];
  out.push(`<svg viewBox="0 0 100 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">`);
  out.push(`<defs><pattern id="${id}g" width="3" height="8" patternUnits="userSpaceOnUse"><rect width="3" height="8" fill="none"/><path d="M0.8 0v8M2.2 0v8" stroke="#000" stroke-opacity=".09" stroke-width=".5"/></pattern></defs>`);
  // base
  if (legs) {
    const lc = lk.legs === 'wood' ? shade(base, 0.8) : colorOf(lk.legs, '#1c1d1f');
    for (const x of [x0 + 5, x1 - 5]) out.push(`<rect x="${x - 1.5}" y="${yBot}" width="3" height="${baseH}" fill="${lc}"/>`);
  } else if (baseH) {
    out.push(`<rect x="${lk.base === 'flush' ? x0 : x0 + 3}" y="${yBot}" width="${lk.base === 'flush' ? x1 - x0 : x1 - x0 - 6}" height="${baseH}" fill="${shade(colorOf(b.carcass.material, '#e3cfa6'), 0.85)}"/>`);
  }
  // cabinet sides show as a thin frame behind the doors
  out.push(`<rect x="${x0 - 1}" y="${yTop - 1}" width="${x1 - x0 + 2}" height="${hgt + 2}" fill="${colorOf(b.carcass.material, '#e3cfa6')}" stroke="${line}" stroke-opacity=".5" stroke-width=".8"/>`);
  // top treatment
  if (lk.top === 'cornice') out.push(`<path d="M${x0 - 3} ${yTop - 1}h${x1 - x0 + 6}l-2 -4h-${x1 - x0 + 2}z M${x0 - 1} ${yTop - 5}h${x1 - x0 + 2}v-2h-${x1 - x0 + 2}z" fill="${base}" stroke="${line}" stroke-width=".6"/>`);
  else if (lk.top === 'overhang') out.push(`<rect x="${x0 - 2}" y="${yTop - 3}" width="${x1 - x0 + 4}" height="3" fill="${base}" stroke="${line}" stroke-width=".6"/>`);
  const door = (xa, xb, side) => {
    const w = xb - xa - 1;
    const parts = lk.upper ? [[yTop + 1, splitY - 0.6, upperId], [splitY + 0.6, yBot - 1, f.material]] : [[yTop + 1, yBot - 1, f.material]];
    for (const [ya, yb, mat] of parts) {
      const col = colorOf(mat), h = yb - ya, xx = xa + 0.5;
      const dline = shade(col, 0.62);
      if (lk.design === 'glass' && f.kind === 'glass') {
        const st = 4;
        out.push(`<rect x="${xx}" y="${ya}" width="${w}" height="${h}" fill="${col}" stroke="${dline}" stroke-width=".6"/>`);
        out.push(`<rect x="${xx + st}" y="${ya + st}" width="${w - 2 * st}" height="${h - 2 * st}" fill="${colorOf(lk.glass, '#d7e9ee')}" fill-opacity=".55" stroke="${dline}" stroke-width=".5"/>`);
        out.push(`<path d="M${xx + st + 2} ${ya + h - st - 3}l8 -10M${xx + st + 8} ${ya + h - st - 3}l8 -10" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/>`);
        continue;
      }
      out.push(`<rect x="${xx}" y="${ya}" width="${w}" height="${h}" rx="${lk.edge === 'round' ? 1.6 : 0.4}" fill="${col}" stroke="${dline}" stroke-width=".6"/>`);
      if (isGrain(mat)) out.push(`<rect x="${xx}" y="${ya}" width="${w}" height="${h}" fill="url(#${id}g)"/>`);
      if (lk.edge === 'chamfer') out.push(`<rect x="${xx + 1.2}" y="${ya + 1.2}" width="${w - 2.4}" height="${h - 2.4}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".7"/>`);
      if (lk.design === 'shaker') out.push(`<rect x="${xx + 5}" y="${ya + 5}" width="${w - 10}" height="${h - 10}" fill="${shade(col, 0.96)}" stroke="${dline}" stroke-opacity=".8" stroke-width=".7"/>`);
      if (lk.design === 'ribbed') {
        let d = '';
        for (let x = xx + 1.8; x < xx + w - 1; x += 2.6) d += `M${x.toFixed(1)} ${ya + 0.8}v${h - 1.6}`;
        out.push(`<path d="${d}" stroke="#000" stroke-opacity=".22" stroke-width=".6"/><path d="${d.replace(/M([\d.]+)/g, (m, x) => `M${(Number(x) + 0.9).toFixed(1)}`)}" stroke="#fff" stroke-opacity=".25" stroke-width=".5"/>`);
      }
      // handles
      const hx = side === 'left' ? xx + w - 4 : xx + 4;
      const hy = Math.min(yb - 8, Math.max(ya + 8, ya + h * 0.5));
      const hn = f.handle;
      if (hn === 'bar') out.push(`<rect x="${hx - 0.9}" y="${hy - 7}" width="1.8" height="14" rx=".8" fill="${hcol}"/>`);
      else if (hn === 'knob') out.push(`<circle cx="${hx}" cy="${hy}" r="2.4" fill="${hcol}" stroke="#000" stroke-opacity=".25" stroke-width=".4"/>`);
      else if (hn === 'cup') out.push(`<path d="M${hx - 3} ${hy - 1}a3 3.2 0 0 0 6 0z" fill="${hcol}" stroke="#000" stroke-opacity=".25" stroke-width=".4"/>`);
      else if (hn === 'edge') out.push(`<rect x="${side === 'left' ? xx + w - 1.8 : xx + 0.6}" y="${hy - 9}" width="1.2" height="18" fill="#000" fill-opacity=".45"/>`);
    }
  };
  door(x0, mid, 'left');
  door(mid, x1, 'right');
  out.push('</svg>');
  return out.join('');
}

// Mini icons for the front designs: a door in outline, in the current text colour.
const FRAME = '<rect x="6" y="3" width="20" height="26" rx="1.5"/>';
export const DESIGN_ICONS = {
  slab: `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${FRAME}<path d="M22 14v5"/></svg>`,
  shaker: `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${FRAME}<rect x="10" y="7" width="12" height="18" rx=".5"/><path d="M22 14v5" opacity="0"/></svg>`,
  glass: `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${FRAME}<rect x="9" y="6" width="14" height="20" rx=".5"/><path d="M12 23l5-7M16 23l5-7" stroke-width="1.1"/></svg>`,
  ribbed: `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${FRAME}<path d="M10 6v20M14 6v20M18 6v20M22 6v20" stroke-width="1.2"/></svg>`
};
