/*
 * Home hero, photoreal mode: plays the Cycles-rendered assembly (assets/hero-frames/f_###.webp, built by
 * tools/blender/film.py) on the hero canvas, scrubbed by scroll. Same API as createHero() in hero3d.js
 * (setTarget, jump, pointer, setVisible, resize, progress), so the page wiring does not change.
 *
 * Frames load coarse to fine (every 16th, 8th, 4th, 2nd, then all); the player draws the nearest loaded frame,
 * redrawing only when that frame changes.
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
        try { frames[i] = await loadImage(src(i)); drawn = -1; invalidate(); } catch { /* a missing frame falls back to its neighbours */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  })();

  const nearest = (i, dir) => {
    for (let k = i; k >= 0 && k < FRAME_COUNT; k += dir) if (frames[k]) return k;
    return -1;
  };

  // Performance: draw one frame at 1x (the frames are 1280 wide, so a denser canvas adds no detail, only fill cost),
  // only when the frame index or the size changes, and do the pointer parallax with a CSS transform on the canvas.
  let drawn = -1;
  function draw(i) {
    const img = frames[i];
    const { w, h } = state;
    const iw = img.naturalWidth; const ih = img.naturalHeight;
    const portrait = w / h < 1;
    // cover the canvas, slightly oversized for the parallax; on phones keep the wardrobe (right of centre) in view
    const scale = Math.max(w / iw, (portrait ? h * 0.62 : h) / ih) * 1.04;
    const dw = iw * scale; const dh = ih * scale;
    const dx = clamp(w / 2 - dw * (portrait ? 0.62 : 0.5), w - dw, 0);
    const dy = portrait ? 0 : (h - dh) / 2;
    ctx.fillStyle = opts.background || '#e9e8e3';
    if (portrait) ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, dx, dy, dw, dh);
    if (portrait) {
      // phones: fade the render's lower edge into the page ground under the text
      const g = ctx.createLinearGradient(0, dh * 0.72, 0, dh);
      g.addColorStop(0, 'rgba(233,232,227,0)'); g.addColorStop(1, opts.background || '#e9e8e3');
      ctx.fillStyle = g; ctx.fillRect(0, dh * 0.72 - 1, w, dh * 0.28 + 2);
    }
    drawn = i;
  }

  function frame() {
    state.raf = 0;
    if (!state.visible && !opts.still) return;
    const now = performance.now();
    const dt = Math.min(0.12, (now - state.last) / 1000 || 0.016);
    state.last = now;
    const k = 1 - Math.exp(-dt * 16); // Lenis already smooths the scroll; a second slow ease made the hero trail behind
    const dp = state.target - state.current;
    state.current = Math.abs(dp) < 0.0002 ? state.target : state.current + dp * k;
    const km = 1 - Math.exp(-dt * 3.5);
    state.cmx += (state.mx - state.cmx) * km; state.cmy += (state.my - state.cmy) * km;

    let i = nearest(Math.round(state.current * (FRAME_COUNT - 1)), -1);
    if (i < 0) i = nearest(0, 1);
    if (i >= 0 && i !== drawn) draw(i);
    canvas.style.transform = `translate3d(${(state.cmx * -8).toFixed(2)}px, ${(state.cmy * -6).toFixed(2)}px, 0)`;
    if (opts.onFrame) opts.onFrame(state.current);
    const moving = Math.abs(state.target - state.current) > 0.0002 || Math.abs(state.mx - state.cmx) > 0.002 || Math.abs(state.my - state.cmy) > 0.002;
    if (moving && !opts.still) state.raf = requestAnimationFrame(frame);
  }
  function invalidate() { if (!state.raf) state.raf = requestAnimationFrame(frame); }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    state.w = Math.max(1, Math.round(r.width)); state.h = Math.max(1, Math.round(r.height));
    canvas.width = state.w; canvas.height = state.h;
    ctx.imageSmoothingQuality = 'medium';
    drawn = -1;
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
