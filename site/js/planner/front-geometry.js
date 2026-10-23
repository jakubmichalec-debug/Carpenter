// Planner front panels: one mesh per door or drawer front, built as a height field (the front face is z(x, y) over the
// panel) so slab edges (chamfer, round), shaker frames and ribs all come from one small routine. THREE is passed in, so
// this file imports no Three.js and Node can load it. Units are cm. A panel's origin is its low left back corner; the
// back is at z = 0 and the front face at about z = t.
const TILE_ALONG = 160, TILE_ACROSS = 60;     // cm of texture along and across the grain (the same scale as piece-geometry)
const EDGE_R = { chamfer: 0.45, round: 0.7 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Sorted, de-duplicated sample positions.
function uniq(list, lo, hi) {
  const a = list.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9).map((v) => clamp(v, lo, hi)).sort((p, q) => p - q);
  const out = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 1e-4) out.push(v);
  return out;
}

// Distance in from the edge where the edge profile stops, and how far the face drops at distance d from the edge.
function edgeDrop(edge, d) {
  const r = EDGE_R[edge];
  if (!r || d >= r) return 0;
  if (edge === 'chamfer') return r - d;
  return r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d)));
}
function edgeSamples(edge, len) {
  const r = EDGE_R[edge];
  if (!r) return [];
  const out = [];
  const n = edge === 'chamfer' ? 1 : 5;
  for (let k = 0; k <= n; k++) {
    const th = (k * Math.PI) / 2 / n;
    const d = edge === 'chamfer' ? r * k : r * (1 - Math.cos(th)) ;
    out.push(d, len - d);
  }
  return out;
}

// What the front face looks like for a design: { xs, ys, z(x, y), smooth }.
export function profileFor({ design, edge, w, h, t }) {
  const xs = [0, w], ys = [0, h];
  let z = () => t;
  let smooth = false;
  const useEdge = EDGE_R[edge] && design !== 'ribbed';
  if (design === 'shaker') {
    const st = clamp(6, 2.5, 0.3 * Math.min(w, h)), ramp = 0.5, R = Math.min(0.8, t - 0.6);
    xs.push(st, st + ramp, w - st - ramp, w - st);
    ys.push(st, st + ramp, h - st - ramp, h - st);
    z = (x, y) => {
      const s = Math.min(x - st, w - st - x, y - st, h - st - y);
      return t - R * clamp(s / ramp, 0, 1);
    };
  } else if (design === 'ribbed') {
    const n = Math.max(2, Math.round(w / 2.6)), pitch = w / n, amp = 0.55, seg = 8;
    for (let k = 0; k < n; k++) for (let j = 0; j <= seg; j++) xs.push(k * pitch + (j / seg) * pitch);
    z = (x) => {
      const u = ((x / pitch) % 1 + 1) % 1;
      const c = 2 * u - 1;
      return t - amp + amp * Math.sqrt(Math.max(0, 1 - c * c));
    };
    smooth = true;
  }
  if (useEdge) {
    xs.push(...edgeSamples(edge, w));
    ys.push(...edgeSamples(edge, h));
    const base = z;
    z = (x, y) => base(x, y) - edgeDrop(edge, Math.min(x, w - x, y, h - y));
    smooth = smooth || edge === 'round';
  }
  return { xs: uniq(xs, 0, w), ys: uniq(ys, 0, h), z, smooth };
}

// The height field as a BufferGeometry with two groups: 0 = the front face, 1 = the edges and the back.
export function fieldGeometry(THREE, { w, h, t, design = 'slab', edge = 'square', grain = 'y', offU = 0, offV = 0 }) {
  const { xs, ys, z, smooth } = profileFor({ design, edge, w, h, t });
  const pos = [], nor = [], uv = [];
  const front = [];  // vertex triples for the front face
  const rest = [];   // for everything else, with their own normals and uvs
  const P = (x, y) => [x, y, z(x, y)];
  const ε = 0.02;
  const normalAt = (x, y) => {
    const dzdx = (z(Math.min(w, x + ε), y) - z(Math.max(0, x - ε), y)) / (Math.min(w, x + ε) - Math.max(0, x - ε));
    const dzdy = (z(x, Math.min(h, y + ε)) - z(x, Math.max(0, y - ε))) / (Math.min(h, y + ε) - Math.max(0, y - ε));
    const l = Math.hypot(dzdx, dzdy, 1);
    return [-dzdx / l, -dzdy / l, 1 / l];
  };
  const uvFront = (x, y) => (grain === 'y' ? [y / TILE_ALONG + offU, x / TILE_ACROSS + offV] : [x / TILE_ALONG + offU, y / TILE_ACROSS + offV]);
  const cross = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const tri = (list, a, b, c, na, nb, nc, ua, ub, uc) => {
    const fn = na ? null : cross(a, b, c);
    list.push({ p: [a, b, c], n: [na || fn, nb || fn, nc || fn], u: [ua, ub, uc] });
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      const a = P(x0, y0), b = P(x1, y0), c = P(x1, y1), d = P(x0, y1);
      const n = smooth ? [normalAt(x0, y0), normalAt(x1, y0), normalAt(x1, y1), normalAt(x0, y1)] : [null, null, null, null];
      const u = [uvFront(x0, y0), uvFront(x1, y0), uvFront(x1, y1), uvFront(x0, y1)];
      tri(front, a, b, c, n[0], n[1], n[2], u[0], u[1], u[2]);
      tri(front, a, c, d, n[0], n[2], n[3], u[0], u[2], u[3]);
    }
  }
  // sides (from the face down to the back) and the back
  const side = (p0, p1, outward) => {
    const a = [p0[0], p0[1], 0], b = [p1[0], p1[1], 0], c = p1, d = p0;   // a,b on the back; c,d on the face
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const ua = [0, 0], ub = [len / 30, 0], uc = [len / 30, 1], ud = [0, 1];
    const n = cross(a, b, c);
    const ok = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] > 0;
    if (ok) { tri(rest, a, b, c, null, null, null, ua, ub, uc); tri(rest, a, c, d, null, null, null, ua, uc, ud); }
    else { tri(rest, a, c, b, null, null, null, ua, uc, ub); tri(rest, a, d, c, null, null, null, ua, ud, uc); }
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    side([xs[i], 0], [xs[i + 1], 0], [0, -1, 0]);
    side([xs[i], h], [xs[i + 1], h], [0, 1, 0]);
  }
  for (let j = 0; j + 1 < ys.length; j++) {
    side([0, ys[j]], [0, ys[j + 1]], [-1, 0, 0]);
    side([w, ys[j]], [w, ys[j + 1]], [1, 0, 0]);
  }
  const bk = (a, b, c, ua, ub, uc) => tri(rest, a, b, c, [0, 0, -1], [0, 0, -1], [0, 0, -1], ua, ub, uc);
  bk([0, 0, 0], [0, h, 0], [w, h, 0], [0, 0], [0, 1], [1, 1]);
  bk([0, 0, 0], [w, h, 0], [w, 0, 0], [0, 0], [1, 1], [1, 0]);

  const geo = new THREE.BufferGeometry();
  let at = 0;
  const flush = (list, group) => {
    const start = at;
    for (const f of list) {
      for (let k = 0; k < 3; k++) { pos.push(...f.p[k]); nor.push(...f.n[k]); uv.push(...f.u[k]); at++; }
    }
    geo.addGroup(start * 1, (at - start), group);
  };
  flush(front, 0);
  flush(rest, 1);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

// A cornice (crown moulding) profile as a list of [z, y] points, extruded along x by the caller.
export const CORNICE_PROFILE = [[0, 0], [3.4, 0], [3.4, 1.1], [3.0, 1.4], [2.2, 1.9], [1.5, 2.7], [1.1, 3.6], [0.9, 4.3], [0.9, 5], [0, 5]];
