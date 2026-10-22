// Planner v2 realistic render: progressive path tracing in the browser with three-gpu-pathtracer and three-mesh-bvh.
// This file, the libraries and render-scene.js are imported only when somebody presses Render on step 5. Nothing here
// runs outside a render: one requestAnimationFrame loop while it works, and when it ends the GPU resources are freed and
// only a plain 2D canvas with the picture is left.
const HDR_URL = new URL('../../assets/3d/room_1k.hdr', import.meta.url).href;

let probed = null;
// Is a path-traced render possible here? Needs WebGL2 and float render targets. Cheap: no Three.js involved.
export function probeRender() {
  if (probed) return probed;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return (probed = { ok: false, reason: 'webgl2', software: false, maxTextureSize: 0 });
    const float = !!gl.getExtension('EXT_color_buffer_float');
    let software = false, name = '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    probed = { ok: float, reason: float ? undefined : 'float', software, maxTextureSize, name };
  } catch {
    probed = { ok: false, reason: 'webgl2', software: false, maxTextureSize: 0 };
  }
  return probed;
}

let hdrCache = null; // the HDRI is fetched once per page; GPU copies are made and freed per render
function loadHdr(THREE, RGBELoader) {
  if (!hdrCache) {
    hdrCache = new RGBELoader().loadAsync(HDR_URL).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; return t; });
    hdrCache.catch(() => { hdrCache = null; });
  }
  return hdrCache;
}

const cssColor = (name, fallback) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// opts: { host, project, camera, hiddenWalls, fronts, settings, onStage(name, info), onProgress(info) }
// camera is a Three.js camera (the viewer's, cloned). Returns { stop(), dispose(), done: Promise<result> }.
export function startRender(opts) {
  const { host, project, camera, hiddenWalls = [], fronts = 'closed', settings, onStage = () => {}, onProgress = () => {} } = opts;
  let stage = 'loading';
  let stopRequested = false, disposed = false, finished = false, raf = 0, skipGap = false;
  // a hidden tab pauses requestAnimationFrame; the gap when it returns must not use up the time limit
  const onVisibility = () => { skipGap = true; };
  document.addEventListener('visibilitychange', onVisibility);
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const R = {}; // everything that needs freeing
  const W = settings.width, H = settings.height;

  const setStage = (s, info) => { stage = s; onStage(s, info); };

  function free() {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    cancelAnimationFrame(raf);
    raf = 0;
    try { if (R.tracer) { try { R.tracer.dispose(); } catch { R.tracer._pathTracer.dispose(); R.tracer._lowResPathTracer.dispose(); } } } catch { /* the context is going away anyway */ }
    try { if (R.quad) { R.quad.material.dispose(); R.quad.dispose(); } } catch { /* same */ }
    try { if (R.built) R.built.dispose(); } catch { /* same */ }
    try { if (R.hdr) R.hdr.dispose(); } catch { /* same */ }
    try { if (R.renderer) { R.renderer.dispose(); R.renderer.forceContextLoss(); } } catch { /* same */ }
    if (R.canvas && R.canvas.parentNode) R.canvas.parentNode.removeChild(R.canvas);
    R.tracer = R.quad = R.built = R.hdr = R.renderer = null;
  }

  function finish(reason, error) {
    if (finished) return;
    finished = true;
    let out = null, samples = 0;
    try {
      if (!error && R.tracer && R.renderer) {
        samples = R.tracer.samples;
        if (samples > 0) {
          // the last picture is smoothed once: a small edge-preserving blur on the linear image, nothing is smoothed while it refines
          const full = R.tracer.target.width >= W;
          blit(full ? 2.4 : 1.2, 0.08);
          out = document.createElement('canvas');
          out.width = W; out.height = H;
          out.getContext('2d').drawImage(R.canvas, 0, 0);
        }
      }
    } catch (err) { error = error || err; out = null; }
    const info = { canvas: out, samples, seconds: R.elapsed || 0, reason: error ? 'error' : reason, error: error || null, width: W, height: H };
    free();
    setStage(error ? 'error' : reason, info);
    resolveDone(info);
  }

  function blit(sigma, threshold) {
    const m = R.quad.material;
    m.uniforms.map.value = R.tracer.target.texture;
    m.uniforms.sigma.value = sigma;
    m.uniforms.threshold.value = threshold;
    R.renderer.setRenderTarget(null);
    R.quad.render(R.renderer);
  }

  async function init() {
    const [THREE, PT, loaders, pass, mats, scn] = await Promise.all([
      import('three'),
      import('three-gpu-pathtracer'),
      import('three/addons/loaders/RGBELoader.js'),
      import('three/addons/postprocessing/Pass.js'),
      import('../configurator/materials.js'),
      import('./render-scene.js')
    ]);
    if (stopRequested || disposed) return finish('stopped');

    const canvas = document.createElement('canvas');
    canvas.className = 'pl-render__canvas';
    canvas.width = W; canvas.height = H;
    host.appendChild(canvas);
    R.canvas = canvas;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); finish('error', new Error('The graphics context was lost.')); });
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    R.renderer = renderer;
    if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) throw new Error('unsupported');
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    let hdr = null;
    try { hdr = await loadHdr(THREE, loaders.RGBELoader); } catch (err) { console.warn('The HDRI could not load; rendering with plain light.', err); }
    R.hdr = hdr;
    if (stopRequested || disposed) return finish('stopped');

    setStage('building');
    await nextFrame();
    if (stopRequested || disposed) return finish('stopped');
    const cam = camera;
    if (cam.isPerspectiveCamera) cam.aspect = W / H;
    else {
      const top = Math.abs(cam.top);
      cam.left = -top * (W / H); cam.right = top * (W / H);
    }
    cam.near = Math.min(cam.near, 0.05); cam.far = Math.max(cam.far, 120);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const lib = mats.createMaterialLib(THREE);
    R.built = scn.buildRenderScene({ project, THREE, lib, fronts, camera: cam, hiddenWalls, hdr, background: cssColor('--paper', '#f6f6f3') });

    const tracer = new PT.WebGLPathTracer(renderer);
    R.tracer = tracer;
    tracer.bounces = settings.bounces;
    tracer.filterGlossyFactor = 0.5;
    tracer.multipleImportanceSampling = true;
    tracer.renderToCanvas = false;
    tracer.rasterizeScene = false;
    tracer.dynamicLowRes = false;
    tracer.renderDelay = 0;
    tracer.minSamples = 0;
    tracer.fadeDuration = 0;
    tracer.textureSize.set(settings.cls === 'weak' ? 512 : 1024, settings.cls === 'weak' ? 512 : 1024);
    tracer.tiles.set(settings.tiles[0], settings.tiles[1]);
    tracer.renderScale = settings.stages[0].scale;
    tracer.setScene(R.built.scene, cam);

    R.quad = new pass.FullScreenQuad(new PT.DenoiseMaterial({}));
    R.quad.material.toneMapped = true;

    setStage('compiling');
    let si = 0, started = false, last = performance.now();
    R.elapsed = 0;
    const lastStage = settings.stages.length - 1;

    const tick = (now) => {
      raf = 0;
      if (disposed || finished) return;
      if (stopRequested) return finish('stopped');
      const dt = skipGap ? 0 : Math.min(5, Math.max(0, (now - last) / 1000)); // frame time, so slow devices count their slow frames
      skipGap = false;
      last = now;
      try {
        tracer.renderSample();
        const samples = tracer.samples;
        if (samples > 0) {
          if (!started) { started = true; setStage(si === lastStage ? 'refining' : 'preview'); }
          R.elapsed += dt;
          blit(0.3, 0.03);
        }
        const st = settings.stages[si];
        if (started && si < lastStage && samples >= st.samples) {
          si++;
          tracer.renderScale = settings.stages[si].scale; // resizes and restarts the average at the next sample
          if (si === lastStage) setStage('refining');
        }
        const atFull = si === lastStage;
        onProgress({
          samples: atFull ? samples : 0, maxSamples: settings.maxSamples, elapsed: R.elapsed, maxSeconds: settings.maxSeconds,
          preview: !atFull, compiling: !started, stage: atFull ? 'refining' : 'preview'
        });
        if (atFull && started && (samples >= settings.maxSamples || R.elapsed >= settings.maxSeconds)) return finish('done');
      } catch (err) { return finish('error', err); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  init().catch((err) => finish('error', err));

  return {
    get stage() { return stage; },
    stop() { stopRequested = true; if (!raf && !finished && R.tracer) finish('stopped'); },
    dispose() { stopRequested = true; if (!finished) { finished = true; free(); resolveDone({ canvas: null, samples: 0, seconds: 0, reason: 'disposed' }); } else free(); },
    done
  };
}
