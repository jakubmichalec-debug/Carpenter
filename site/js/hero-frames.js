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
// the canvas is scaled up this much and moved by the pointer parallax; the scale hides the edges the move would bare
const PARALLAX = { x: 8, y: 6, scale: 1.03 };

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(() => resolve(img)) : resolve(img));
    img.onerror = reject;
    img.src = url;
  });
}

function transparentOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'rgba(233,232,227,0)';
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0)`;
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

  const bg = opts.background || '#e9e8e3';
  const bgClear = transparentOf(bg);
  const state = { target: 0, current: 0, mx: 0, my: 0, cmx: 0, cmy: 0, w: 1, h: 1, scale: 1, visible: true, raf: 0, last: performance.now() };
  let drawn = -1;
  let transform = '';

  const nearestTo = (pos) => {
    const lo = Math.floor(pos); const hi = Math.ceil(pos);
    let below = -1; let above = -1;
    for (let k = lo; k >= 0; k--) if (frames[k]) { below = k; break; }
    for (let k = hi; k < FRAME_COUNT; k++) if (frames[k]) { above = k; break; }
    if (below < 0) return above;
    if (above < 0) return below;
    return pos - below <= above - pos ? below : above;
  };

  // coarse to fine background loading; a newly loaded frame only causes a redraw if it is now the nearest one.
  // `loaded` resolves once every frame has been tried; opts.onLoad(count) reports progress for a preloader.
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
          frames[i] = await loadImage(src(i));
          if (nearestTo(state.current * (FRAME_COUNT - 1)) !== drawn) invalidate();
        } catch { /* a missing frame falls back to its neighbours */ }
        loadedCount++;
        if (opts.onLoad) opts.onLoad(loadedCount);
      }
    };
    // six parallel requests: GitHub Pages serves HTTP/2, and the frames are small (about 40 KB each)
    await Promise.all(Array.from({ length: opts.eager === false ? 2 : 6 }, worker));
  })();

  // Performance: one drawImage per change of frame, into a canvas no denser than the frames themselves
  // (more device pixels than the source frames add no detail, only fill cost). Parallax is a CSS transform.
  const layout = () => {
    const { w, h } = state;
    const iw = first.naturalWidth; const ih = first.naturalHeight;
    const portrait = w / h < 1;
    // cover the stage; on phones the render fills the top part and keeps the wardrobe (right of centre) in view
    const s = Math.max(w / iw, (portrait ? h * 0.62 : h) / ih);
    const dw = iw * s; const dh = ih * s;
    return { portrait, dw, dh, dx: clamp(w / 2 - dw * (portrait ? 0.62 : 0.5), w - dw, 0), dy: portrait ? 0 : (h - dh) / 2 };
  };

  function draw(i) {
    const { portrait, dw, dh, dx, dy } = layout();
    ctx.fillStyle = bg;
    if (portrait) ctx.fillRect(0, 0, state.w, state.h);
    ctx.drawImage(frames[i], dx, dy, dw, dh);
    if (portrait) {
      // fade the render's lower edge into the page ground under the text
      const g = ctx.createLinearGradient(0, dh * 0.72, 0, dh);
      g.addColorStop(0, bgClear); g.addColorStop(1, bg);
      ctx.fillStyle = g; ctx.fillRect(0, dh * 0.72 - 1, state.w, dh * 0.28 + 2);
    }
    drawn = i;
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

    const i = nearestTo(state.current * (FRAME_COUNT - 1));
    if (i >= 0 && i !== drawn) draw(i);
    const t = `translate3d(${(state.cmx * -PARALLAX.x).toFixed(1)}px, ${(state.cmy * -PARALLAX.y).toFixed(1)}px, 0) scale(${PARALLAX.scale})`;
    if (t !== transform) { canvas.style.transform = t; transform = t; }
    if (opts.onFrame) opts.onFrame(state.current);
    const moving = Math.abs(state.target - state.current) > 0.0002 || Math.abs(state.mx - state.cmx) > 0.002 || Math.abs(state.my - state.cmy) > 0.002;
    if (moving && !opts.still) state.raf = requestAnimationFrame(frame);
  }
  function invalidate() { if (!state.raf) state.raf = requestAnimationFrame(frame); }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    state.w = Math.max(1, Math.round(r.width)); state.h = Math.max(1, Math.round(r.height));
    // device pixels up to the screen's density, but never more than the source frame provides
    const { dw } = layout();
    state.scale = clamp(Math.min(window.devicePixelRatio || 1, first.naturalWidth / dw), 1, 3);
    canvas.width = Math.round(state.w * state.scale); canvas.height = Math.round(state.h * state.scale);
    ctx.setTransform(state.scale, 0, 0, state.scale, 0, 0);
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
    loaded,
    mode: 'frames',
  };
}
