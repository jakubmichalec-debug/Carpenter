/*
 * Home hero, photoreal mode: plays the Cycles-rendered assembly (assets/hero-frames/f_###.webp, built by
 * tools/blender/film.py) on the hero canvas, scrubbed by scroll. Same API as createHero() in hero3d.js
 * (setTarget, jump, pointer, setVisible, resize, progress), so the page wiring does not change.
 *
 * Frames download coarse to fine (every 16th, 8th, 4th, 2nd, then all) and stay in memory as compressed blobs
 * (about 80 KB each). Only some are decoded at a time: every ANCHOR-th frame, plus WINDOW frames either side of
 * the scroll position. 120 decoded 1080p frames would take about 1 GB, which made browsers evict and re-decode
 * them mid-scroll. The player cross-fades between the two decoded frames either side of the scroll position,
 * so the motion reads as continuous, and redraws only when that pair or the blend changes.
 */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const FRAME_COUNT = 120;
const BASE = 'assets/hero-frames/';
// bump V whenever the frames are re-rendered, so browsers fetch the new set instead of their cached copies
// (and the two preload links in index.html with it)
const V = 4;
// every ANCHOR-th frame stays decoded (a fast scroll blends between these while nearer frames decode);
// the preloader waits for exactly these
const ANCHOR = 8;
const WINDOW = 6; // decoded frames kept either side of the scroll position
const DECODERS = 2; // decodes in flight at once
const BLEND_STEPS = 24; // the blend is quantised so a slow scroll does not redraw on every pixel
const src = (i) => `${BASE}f_${String(i).padStart(3, '0')}.webp?v=${V}`;
// the pointer parallax moves the canvas by up to this many whole pixels; the canvas overscans the stage by a
// little more (home.css), so the move never bares an edge and no CSS scale resamples (and softens) the frame
const PARALLAX = { x: 8, y: 6 };

const fetchBlob = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.blob(); });
// ImageBitmaps decode off the main thread and can be freed with close(); without them, keep plain images (no eviction)
const BITMAPS = typeof window.createImageBitmap === 'function';
function decode(blob) {
  if (BITMAPS) return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img); img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}
const widthOf = (im) => im.naturalWidth || im.width;
const heightOf = (im) => im.naturalHeight || im.height;

function transparentOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'rgba(233,232,227,0)';
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0)`;
}

/** Resolves with a player once the first and last frames have loaded; rejects if they cannot. */
export async function createFramePlayer(canvas, opts = {}) {
  const N = FRAME_COUNT;
  const blobs = new Array(N).fill(null);
  const frames = new Array(N).fill(null);
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('frames timed out')), opts.timeout || 6000));
  const ends = () => Promise.all([fetchBlob(src(0)), fetchBlob(src(N - 1))]).then(([a, b]) => {
    blobs[0] = a; blobs[N - 1] = b;
    return Promise.all([decode(a), decode(b)]);
  });
  const [first, last] = await Promise.race([ends(), timeout]);
  frames[0] = first; frames[N - 1] = last;
  // only claim the canvas once the frames are here, so the WebGL fallback can still take it if they are not
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas unavailable');

  const bg = opts.background || '#e9e8e3';
  const bgClear = transparentOf(bg);
  const state = { target: 0, current: 0, mx: 0, my: 0, cmx: 0, cmy: 0, w: 1, h: 1, scale: 1, visible: true, raf: 0, last: performance.now() };
  let drawn = '';
  let transform = '';

  // the loaded frames either side of pos and how far pos lies between them (0 = all `a`, 1 = all `b`)
  const pairAt = (pos) => {
    let a = -1; let b = -1;
    for (let k = Math.floor(pos); k >= 0; k--) if (frames[k]) { a = k; break; }
    for (let k = Math.ceil(pos); k < FRAME_COUNT; k++) if (frames[k]) { b = k; break; }
    if (a < 0) return { a: b, b, t: 0 };
    if (b < 0 || b === a) return { a, b: a, t: 0 };
    const t = Math.round(((pos - a) / (b - a)) * BLEND_STEPS) / BLEND_STEPS;
    return t <= 0 ? { a, b: a, t: 0 } : t >= 1 ? { a: b, b, t: 0 } : { a, b, t };
  };
  const keyOf = (q) => `${q.a}|${q.b}|${q.t}`;

  // which frames to keep decoded around frame c (always the ends and the anchors)
  const keep = (i, c) => i === 0 || i === N - 1 || i % ANCHOR === 0 || Math.abs(i - c) <= WINDOW;
  const centre = () => Math.round(state.current * (N - 1));
  const pending = new Set();
  let decoding = 0;
  // `ready` resolves once the anchors are decoded, `loaded` once every frame has been downloaded (or failed);
  // opts.onLoad(count, readyFraction) reports progress for a preloader.
  const anchorsTotal = Math.ceil(N / ANCHOR) + 1;
  let anchorsDone = 2;
  let markReady;
  const ready = new Promise((r) => { markReady = r; });
  const report = () => { if (opts.onLoad) opts.onLoad(loadedCount, Math.min(1, anchorsDone / anchorsTotal)); };

  // decode what the scroll position needs (nearest first, anchors after) and free what it no longer needs
  function pump() {
    const c = centre();
    if (BITMAPS) for (let i = 0; i < N; i++) if (frames[i] && !keep(i, c)) { frames[i].close(); frames[i] = null; }
    while (decoding < DECODERS) {
      let best = -1; let bestD = Infinity;
      for (let i = 0; i < N; i++) {
        if (!blobs[i] || frames[i] || pending.has(i) || !keep(i, c)) continue;
        const d = Math.abs(i - c) <= WINDOW ? Math.abs(i - c) : N + Math.abs(i - c);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return;
      const i = best;
      pending.add(i); decoding++;
      decode(blobs[i]).then((im) => {
        if (!BITMAPS || keep(i, centre())) frames[i] = im; else im.close();
        if (i % ANCHOR === 0 && ++anchorsDone >= anchorsTotal) markReady();
        report();
      }, () => {}).finally(() => {
        pending.delete(i); decoding--;
        if (keyOf(pairAt(state.current * (N - 1))) !== drawn) invalidate();
        pump();
      });
    }
  }

  let loadedCount = 2;
  const loaded = (async () => {
    const order = [];
    const seen = new Set([0, FRAME_COUNT - 1]);
    for (const step of [16, 8, 4, 2, 1]) {
      for (let i = 0; i < FRAME_COUNT; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
    }
    const worker = async () => {
      while (order.length) {
        const i = order.shift();
        try {
          blobs[i] = await fetchBlob(src(i));
          pump();
        } catch { /* a missing frame falls back to its neighbours */ }
        loadedCount++;
        report();
      }
    };
    // six parallel requests: GitHub Pages serves HTTP/2, and the frames are small (about 80 KB each)
    await Promise.all(Array.from({ length: opts.eager === false ? 2 : 6 }, worker));
    markReady();
  })();

  // Performance: at most two drawImage calls per change of frame or blend, into a canvas no denser than the frames
  // themselves (more device pixels than the source frames add no detail, only fill cost). Parallax is a CSS transform.
  const layout = () => {
    const { w, h } = state;
    const iw = widthOf(first); const ih = heightOf(first);
    const portrait = w / h < 1;
    // cover the stage; on phones the render fills the top part and keeps the wardrobe (right of centre) in view
    const s = Math.max(w / iw, (portrait ? h * 0.62 : h) / ih);
    const dw = iw * s; const dh = ih * s;
    return { portrait, dw, dh, dx: clamp(w / 2 - dw * (portrait ? 0.62 : 0.5), w - dw, 0), dy: portrait ? 0 : (h - dh) / 2 };
  };

  function draw(q) {
    const { portrait, dw, dh, dx, dy } = layout();
    ctx.fillStyle = bg;
    if (portrait) ctx.fillRect(0, 0, state.w, state.h);
    ctx.drawImage(frames[q.a], dx, dy, dw, dh);
    if (q.t > 0) { ctx.globalAlpha = q.t; ctx.drawImage(frames[q.b], dx, dy, dw, dh); ctx.globalAlpha = 1; }
    if (portrait) {
      // fade the render's lower edge into the page ground under the text
      const g = ctx.createLinearGradient(0, dh * 0.72, 0, dh);
      g.addColorStop(0, bgClear); g.addColorStop(1, bg);
      ctx.fillStyle = g; ctx.fillRect(0, dh * 0.72 - 1, state.w, dh * 0.28 + 2);
    }
    drawn = keyOf(q);
  }

  // Lenis already smooths the scroll, so follow it closely; without it, ease more so wheel steps do not show
  const followRate = () => (window.site && window.site.lenis ? 16 : 7);

  function frame() {
    state.raf = 0;
    if (!state.visible && !opts.still) return;
    const now = performance.now();
    const dt = Math.min(0.12, (now - state.last) / 1000 || 0.016);
    state.last = now;
    const k = 1 - Math.exp(-dt * followRate());
    const dp = state.target - state.current;
    state.current = Math.abs(dp) < 0.0002 ? state.target : state.current + dp * k;
    const km = 1 - Math.exp(-dt * 3.5);
    state.cmx += (state.mx - state.cmx) * km; state.cmy += (state.my - state.cmy) * km;

    const c = centre();
    if (c !== lastCentre) { lastCentre = c; pump(); }
    const q = pairAt(state.current * (N - 1));
    if (q.a >= 0 && keyOf(q) !== drawn) draw(q);
    const t = `translate3d(${Math.round(state.cmx * -PARALLAX.x)}px, ${Math.round(state.cmy * -PARALLAX.y)}px, 0)`;
    if (t !== transform) { canvas.style.transform = t; transform = t; }
    if (opts.onFrame) opts.onFrame(state.current);
    const moving = Math.abs(state.target - state.current) > 0.0002 || Math.abs(state.mx - state.cmx) > 0.002 || Math.abs(state.my - state.cmy) > 0.002;
    if (moving && !opts.still) state.raf = requestAnimationFrame(frame);
  }
  let lastCentre = 0;
  function invalidate() { if (!state.raf) state.raf = requestAnimationFrame(frame); }

  function resize() {
    // the canvas's own layout box (it overscans the stage); offset sizes ignore the parallax transform
    state.w = Math.max(1, canvas.offsetWidth); state.h = Math.max(1, canvas.offsetHeight);
    // device pixels up to the screen's density, but never more than the source frame provides
    const { dw } = layout();
    state.scale = clamp(Math.min(window.devicePixelRatio || 1, widthOf(first) / dw), 1, 3);
    canvas.width = Math.round(state.w * state.scale); canvas.height = Math.round(state.h * state.scale);
    ctx.setTransform(state.scale, 0, 0, state.scale, 0, 0);
    ctx.imageSmoothingQuality = 'medium';
    drawn = '';
    invalidate();
  }

  return {
    setTarget(p) { state.target = clamp(p, 0, 1); invalidate(); },
    jump(p) { state.target = state.current = clamp(p, 0, 1); invalidate(); },
    pointer(x, y) { state.mx = x; state.my = y; invalidate(); },
    setVisible(v) { state.visible = v; if (v) invalidate(); },
    resize,
    get progress() { return state.current; },
    loaded,
    ready,
    mode: 'frames',
  };
}
