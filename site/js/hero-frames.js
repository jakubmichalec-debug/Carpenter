/*
 * Home hero, photoreal mode: plays the Cycles-rendered assembly (assets/hero-frames/f_###.webp, built by
 * tools/blender/film.py) on the hero canvas, scrubbed by scroll. Same API as createHero() in hero3d.js
 * (setTarget, jump, pointer, setVisible, resize, progress), so the page wiring does not change.
 *
 * Frames load coarse to fine (every 16th, 8th, 4th, 2nd, then all), and the player always draws the nearest
 * loaded frames, crossfading between the two either side of the current position so scrubbing stays smooth.
 */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const FRAME_COUNT = 120;
const BASE = 'assets/hero-frames/';
const src = (i) => `${BASE}f_${String(i).padStart(3, '0')}.webp`;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(() => resolve(img)) : resolve(img));
    img.onerror = reject;
    img.src = url;
  });
}

/** Resolves with a player once the first and last frames have loaded; rejects if they cannot. */
export async function createFramePlayer(canvas, opts = {}) {
  const frames = new Array(FRAME_COUNT).fill(null);
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('frames timed out')), opts.timeout || 6000));
  const [first, last] = await Promise.race([Promise.all([loadImage(src(0)), loadImage(src(FRAME_COUNT - 1))]), timeout]);
  frames[0] = first; frames[FRAME_COUNT - 1] = last;
  // only claim the canvas once the frames are here, so the WebGL fallback can still take it if they are not
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas unavailable');

  const state = { target: 0, current: 0, mx: 0, my: 0, cmx: 0, cmy: 0, w: 1, h: 1, dpr: 1, visible: true, raf: 0, last: performance.now() };

  // coarse to fine background loading
  (async () => {
    const order = [];
    const seen = new Set([0, FRAME_COUNT - 1]);
    for (const step of [16, 8, 4, 2, 1]) {
      for (let i = 0; i < FRAME_COUNT; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
    }
    const queue = order.slice();
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift();
        try { frames[i] = await loadImage(src(i)); invalidate(); } catch { /* a missing frame falls back to its neighbours */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  })();

  const nearest = (i, dir) => {
    for (let k = i; k >= 0 && k < FRAME_COUNT; k += dir) if (frames[k]) return k;
    return -1;
  };

  function drawImage(img, alpha) {
    const { w, h } = state;
    const iw = img.naturalWidth; const ih = img.naturalHeight;
    const portrait = w / h < 1;
    // cover the canvas, a little oversized for the pointer parallax; on phones keep the wardrobe (right of centre) in view
    const scale = Math.max(w / iw, (portrait ? h * 0.62 : h) / ih) * 1.04;
    const dw = iw * scale; const dh = ih * scale;
    const focusX = portrait ? 0.62 : 0.5;
    let dx = w / 2 - dw * focusX + (portrait ? 0 : 0);
    dx = clamp(dx, w - dw, 0);
    const dy = portrait ? 0 : (h - dh) / 2;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, dx + state.cmx * -8, dy + state.cmy * -6, dw, dh);
  }

  function frame() {
    state.raf = 0;
    if (!state.visible && !opts.still) return;
    const now = performance.now();
    const dt = Math.min(0.12, (now - state.last) / 1000 || 0.016);
    state.last = now;
    const k = 1 - Math.exp(-dt * 7);
    const dp = state.target - state.current;
    state.current = Math.abs(dp) < 0.0002 ? state.target : state.current + dp * k;
    const km = 1 - Math.exp(-dt * 3.5);
    state.cmx += (state.mx - state.cmx) * km; state.cmy += (state.my - state.cmy) * km;

    const pos = state.current * (FRAME_COUNT - 1);
    const i0 = nearest(Math.floor(pos), -1);
    const i1 = nearest(Math.ceil(pos), 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = opts.background || '#e9e8e3';
    ctx.fillRect(0, 0, state.w, state.h);
    if (i0 >= 0) drawImage(frames[i0], 1);
    if (i1 >= 0 && i1 !== i0) {
      const f = i0 < 0 ? 1 : clamp((pos - i0) / (i1 - i0), 0, 1);
      if (f > 0.01) drawImage(frames[i1], f);
    }
    ctx.globalAlpha = 1;
    if (state.w / state.h < 1) {
      // phones: the render fills the top of the stage; fade its lower edge into the page ground under the text
      const iw = (frames[i0] || frames[i1]).naturalWidth; const ih = (frames[i0] || frames[i1]).naturalHeight;
      const dh = ih * Math.max(state.w / iw, (state.h * 0.62) / ih) * 1.04;
      const g = ctx.createLinearGradient(0, dh * 0.72, 0, dh);
      g.addColorStop(0, 'rgba(233,232,227,0)'); g.addColorStop(1, opts.background || '#e9e8e3');
      ctx.fillStyle = g; ctx.fillRect(0, dh * 0.72 - 1, state.w, dh * 0.28 + 2);
    }
    if (opts.onFrame) opts.onFrame(state.current);
    const moving = Math.abs(state.target - state.current) > 0.0002 || Math.abs(state.mx - state.cmx) > 0.002 || Math.abs(state.my - state.cmy) > 0.002;
    if (moving && !opts.still) state.raf = requestAnimationFrame(frame);
  }
  function invalidate() { if (!state.raf) state.raf = requestAnimationFrame(frame); }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = Math.max(1, Math.round(r.width)); state.h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(state.w * state.dpr); canvas.height = Math.round(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    invalidate();
  }

  return {
    setTarget(p) { state.target = clamp(p, 0, 1); invalidate(); },
    jump(p) { state.target = state.current = clamp(p, 0, 1); invalidate(); },
    pointer(x, y) { state.mx = x; state.my = y; invalidate(); },
    setVisible(v) { state.visible = v; if (v) invalidate(); },
    resize,
    get progress() { return state.current; },
    mode: 'frames',
  };
}
