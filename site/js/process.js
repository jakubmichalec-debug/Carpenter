// Process page: scroll-drawn timeline, FAQ accordion, and a scroll-scrubbed Three.js joinery explainer.
// Three.js is imported lazily inside init3D() so the timeline and FAQ still work if the CDN is blocked.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ timeline */
function initTimeline() {
  const tl = $('[data-timeline]');
  if (!tl) return;
  const svg = $('.pr-tl__rail', tl);
  const track = $('.pr-tl__track', svg);
  const line = $('.pr-tl__line', svg);
  const steps = $$('[data-step]', tl);
  let len = 1; let dots = [];

  const build = () => {
    const h = tl.offsetHeight;
    const railW = svg.getBoundingClientRect().width;
    const x0 = railW / 2;
    // a gently wavering line, like a grain line, from the first dot to the last
    const first = steps[0].offsetTop + 22; const last = steps[steps.length - 1].offsetTop + 22;
    let d = `M${x0} ${first}`;
    for (let y = first + 6; y < last; y += 6) d += ` L${(x0 + Math.sin(y / 38) * 2.2).toFixed(1)} ${y}`;
    d += ` L${x0} ${last}`;
    track.setAttribute('d', d); line.setAttribute('d', d);
    svg.setAttribute('viewBox', `0 0 ${railW} ${h}`);
    len = line.getTotalLength() || 1;
    line.style.strokeDasharray = `${len}`;
    dots = steps.map((s) => s.offsetTop + 22);
    update();
  };

  const update = () => {
    const rect = tl.getBoundingClientRect();
    const ref = window.innerHeight * 0.6 - rect.top; // reference line, in timeline coordinates
    const first = dots[0] || 0; const last = dots[dots.length - 1] || 1;
    const p = clamp((ref - first) / (last - first), 0, 1);
    line.style.strokeDashoffset = `${len * (1 - (reduced ? 1 : p))}`;
    steps.forEach((s, i) => s.classList.toggle('is-active', reduced || ref >= dots[i]));
  };

  // entrance per step
  steps.forEach((s) => $$('.pr-step__body > *', s).forEach((el, k) => el.style.setProperty('--k', k)));
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -18% 0px' });
    steps.forEach((s) => io.observe(s));
  } else steps.forEach((s) => s.classList.add('is-in'));

  build();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', build);
  window.addEventListener('load', build);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  // images change the height of steps once loaded
  if ('ResizeObserver' in window) new ResizeObserver(build).observe(tl);
}

/* ------------------------------------------------------------------ FAQ */
function initFaq() {
  const list = $('[data-faq]');
  if (!list) return;
  const items = $$('.pr-faq__item', list);
  const setOpen = (item, open) => {
    item.classList.toggle('is-open', open);
    $('.pr-faq__q', item).setAttribute('aria-expanded', String(open));
  };
  list.addEventListener('click', (e) => {
    const q = e.target.closest('.pr-faq__q');
    if (!q) return;
    const item = q.closest('.pr-faq__item');
    const open = !item.classList.contains('is-open');
    items.forEach((it) => { if (it !== item) setOpen(it, false); });
    setOpen(item, open);
    const refresh = () => window.site && window.site.refresh && window.site.refresh();
    setTimeout(refresh, 700);
  });
  list.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const qs = $$('.pr-faq__q', list);
    const i = qs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? qs.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + qs.length) % qs.length;
    qs[n].focus();
  });
  setOpen(items[0], true);
}

/* ------------------------------------------------------------------ 3D joinery */
async function init3D() {
  const section = $('[data-joint]');
  const canvas = $('[data-joint-canvas]');
  if (!section || !canvas) return;
  const fallback = $('[data-joint-fallback]');
  let THREE;
  try { THREE = await import('three'); } catch (err) { console.warn('Three.js failed to load.', err); canvas.hidden = true; fallback.hidden = false; return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) { console.warn('WebGL unavailable.', err); canvas.hidden = true; fallback.hidden = false; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const OAK = tok('--oak') || '#b9844a';
  const WALNUT = tok('--walnut') || '#4b3020';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x2a1d12, 0.9));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
  key.position.set(3.2, 5.5, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 5; key.shadow.bias = -0.0006;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 16 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb36b, 1.1); rim.position.set(-4, 2.5, -3); scene.add(rim);

  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.38 }));
  shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.receiveShadow = true; scene.add(shadowFloor);

  /* ---- procedural wood ---- */
  const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  function woodCanvas(base, dark, seed, end) {
    const S = 512; const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    if (end) {
      // end grain: concentric growth rings around an off-centre pith
      const cx = S * (0.3 + r() * 0.4); const cy = S * (0.3 + r() * 0.4);
      for (let i = 70; i > 0; i--) {
        g.beginPath(); g.ellipse(cx, cy, i * 9 + r() * 4, i * 7.4 + r() * 4, r() * 0.2, 0, Math.PI * 2);
        g.strokeStyle = dark; g.globalAlpha = 0.1 + r() * 0.22; g.lineWidth = 0.8 + r() * 2.4; g.stroke();
      }
      for (let i = 0; i < 900; i++) { g.globalAlpha = 0.18 * r(); g.fillStyle = dark; g.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1 + r() * 1.5); }
    } else {
      // long grain: wavy lines with a few cathedral arches and pores
      const grad = g.createLinearGradient(0, 0, 0, S);
      grad.addColorStop(0, 'rgba(255,255,255,.07)'); grad.addColorStop(.5, 'rgba(0,0,0,.05)'); grad.addColorStop(1, 'rgba(255,255,255,.06)');
      g.globalAlpha = 1; g.fillStyle = grad; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 150; i++) {
        const y0 = r() * S; const amp = 2 + r() * 9; const fr = 0.004 + r() * 0.012; const ph = r() * 6;
        g.beginPath();
        for (let x = 0; x <= S; x += 8) { const y = y0 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 3.1 + ph) * amp * 0.25; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.strokeStyle = dark; g.globalAlpha = 0.05 + r() * 0.2; g.lineWidth = 0.6 + r() * 2.4; g.stroke();
      }
      for (let i = 0; i < 700; i++) { g.globalAlpha = 0.25 * r(); g.fillStyle = dark; g.fillRect(r() * S, r() * S, 4 + r() * 12, 1); }
    }
    g.globalAlpha = 1;
    return c;
  }
  function woodTextures(base, dark, seed) {
    const mk = (end, s) => { const t = new THREE.CanvasTexture(woodCanvas(base, dark, s, end)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
    const long = mk(false, seed); const end = mk(true, seed + 11);
    const mat = (t) => new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.6, roughness: 0.62, metalness: 0 });
    return [mat(long), mat(end)];
  }
  const oak = woodTextures(OAK, WALNUT, 21);
  const walnut = woodTextures('#6b4a36', '#25150c', 77);

  /* Give every vertex a UV from its world position so grain runs the same way across separate parts,
     and split triangles into [long grain, end grain] groups by the face normal. */
  function prepare(geo, grainAxis) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const pos = g.attributes.position; const nor = g.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    const ax = ['x', 'y', 'z']; const a = grainAxis;
    const others = [0, 1, 2].filter((i) => i !== a);
    const S = 0.9; // texture covers 0.9 units
    const longTris = []; const endTris = [];
    for (let i = 0; i < pos.count; i += 3) {
      const n = [nor.getX(i), nor.getY(i), nor.getZ(i)];
      const isEnd = Math.abs(n[a]) > 0.7;
      (isEnd ? endTris : longTris).push(i);
      for (let k = 0; k < 3; k++) {
        const v = [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)];
        let u; let w;
        if (isEnd) { u = v[others[0]]; w = v[others[1]]; }
        else { u = v[a]; const dom = Math.abs(n[others[0]]) > Math.abs(n[others[1]]) ? others[1] : others[0]; w = v[dom]; }
        uv[(i + k) * 2] = u / S; uv[(i + k) * 2 + 1] = w / S;
      }
    }
    const order = [...longTris, ...endTris];
    const np = new Float32Array(pos.count * 3); const nn = new Float32Array(pos.count * 3); const nu = new Float32Array(pos.count * 2);
    order.forEach((t, j) => { for (let k = 0; k < 3; k++) {
      const s = t + k; const d = j * 3 + k;
      np[d * 3] = pos.getX(s); np[d * 3 + 1] = pos.getY(s); np[d * 3 + 2] = pos.getZ(s);
      nn[d * 3] = nor.getX(s); nn[d * 3 + 1] = nor.getY(s); nn[d * 3 + 2] = nor.getZ(s);
      nu[d * 2] = uv[s * 2]; nu[d * 2 + 1] = uv[s * 2 + 1];
    } });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(np, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(nu, 2));
    out.addGroup(0, longTris.length * 3, 0);
    if (endTris.length) out.addGroup(longTris.length * 3, endTris.length * 3, 1);
    return out;
  }
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a0f08, transparent: true, opacity: 0.35 });
  function part(geo, grainAxis, mats) {
    const g = prepare(geo, grainAxis);
    const mesh = new THREE.Mesh(g, mats);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), edgeMat));
    return mesh;
  }
  const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  /* ---- dovetail: board A (oak) carries the tails, board B (walnut) drops onto them along Y ---- */
  function buildDovetail() {
    const T = 0.36; const Wd = 1.5; const LA = 2.4; const LB = 2.2;
    const g = new THREE.Group();
    const A = new THREE.Group(); const B = new THREE.Group();
    A.add(part(box(-LA, 0, 0, T, -Wd / 2, Wd / 2), 0, oak));
    const centres = [-0.45, 0, 0.45];
    // tails: shape in (x, -z); extrude along +Y by T
    centres.forEach((zc) => {
      const s = new THREE.Shape();
      s.moveTo(0, -(zc - 0.13)); s.lineTo(T, -(zc - 0.2)); s.lineTo(T, -(zc + 0.2)); s.lineTo(0, -(zc + 0.13)); s.closePath();
      const eg = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
      eg.rotateX(-Math.PI / 2); // (x, y, z) -> (x, z, -y): extrusion now runs along +Y, shape y maps to -z
      A.add(part(eg, 0, oak));
    });
    // B: upper block plus an end plate with socket holes
    B.add(part(box(0, T, T, LB, -Wd / 2, Wd / 2), 1, walnut));
    const plate = new THREE.Shape();
    plate.moveTo(0, -Wd / 2); plate.lineTo(T, -Wd / 2); plate.lineTo(T, Wd / 2); plate.lineTo(0, Wd / 2); plate.closePath();
    centres.forEach((zc) => {
      const h = new THREE.Path();
      h.moveTo(0, -(zc - 0.13)); h.lineTo(T, -(zc - 0.2)); h.lineTo(T, -(zc + 0.2)); h.lineTo(0, -(zc + 0.13)); h.closePath();
      plate.holes.push(h);
    });
    const pg = new THREE.ExtrudeGeometry(plate, { depth: T, bevelEnabled: false });
    pg.rotateX(-Math.PI / 2);
    B.add(part(pg, 1, walnut));
    g.add(A, B);
    g.position.set(0.9, -0.5, 0);
    return { group: g, move: (p) => { A.position.set(0, 0, 0); B.position.set(0, (1 - p) * 2.0, 0); A.position.x = -(1 - p) * 0.0; }, center: new THREE.Vector3(0.2, 0.55, 0) };
  }

  /* ---- mortise and tenon: rail (oak) with a tenon slides along X into the post (walnut) ---- */
  function buildTenon() {
    const g = new THREE.Group(); const post = new THREE.Group(); const rail = new THREE.Group();
    const px = 0.35; const pz = 0.36; const mh = 0.4; const mz = 0.13; const md = 0.42;
    // post: back, top, bottom, two cheeks around the mortise
    post.add(part(box(-px, px - md, -1.2, 1.2, -pz, pz), 1, walnut));
    post.add(part(box(px - md, px, mh, 1.2, -pz, pz), 1, walnut));
    post.add(part(box(px - md, px, -1.2, -mh, -pz, pz), 1, walnut));
    post.add(part(box(px - md, px, -mh, mh, mz, pz), 1, walnut));
    post.add(part(box(px - md, px, -mh, mh, -pz, -mz), 1, walnut));
    // rail with a shouldered tenon
    rail.add(part(box(px, 2.0, -0.5, 0.5, -pz, pz), 0, oak));
    rail.add(part(box(px - md + 0.01, px, -mh + 0.015, mh - 0.015, -mz + 0.015, mz - 0.015), 0, oak));
    g.add(post, rail);
    g.position.set(-0.9, 0.0, 0);
    return { group: g, move: (p) => { rail.position.set((1 - p) * 2.0, 0, 0); }, center: new THREE.Vector3(1.0, 0, 0) };
  }

  const builders = { dovetail: buildDovetail, tenon: buildTenon };
  let current = null; let currentKey = 'dovetail'; let swapT = 1;
  function setJoint(key) {
    if (current) { scene.remove(current.group); current.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    currentKey = key; current = builders[key](); scene.add(current.group); swapT = 0;
  }
  setJoint('dovetail');

  /* ---- UI wiring ---- */
  const tabs = $$('[data-joint-btn]', section);
  const copies = $$('[data-copy]', section);
  tabs.forEach((b) => b.addEventListener('click', () => select(b.dataset.jointBtn)));
  function select(key) {
    tabs.forEach((b) => { const on = b.dataset.jointBtn === key; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    copies.forEach((c) => { c.hidden = c.dataset.copy !== key; });
    if (key !== currentKey) { setJoint(key); wake(); }
  }
  $('.pr-joint__tabs', section).addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    n.focus(); select(n.dataset.jointBtn);
  });

  const range = $('[data-joint-range]', section); const out = $('[data-joint-out]', section);
  const phases = $$('[data-phases] li', section);
  const maxScroll = () => section.offsetHeight - window.innerHeight;
  const top = () => section.getBoundingClientRect().top + window.scrollY;
  range.addEventListener('input', () => {
    const y = top() + (range.value / 100) * maxScroll();
    if (window.site && window.site.lenis) window.site.lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  });

  /* ---- interaction: drag to turn ---- */
  let yaw = 0; let pitch = 0; let tYaw = 0; let tPitch = 0; let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId, yaw: tYaw, pitch: tPitch, moved: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) < 6) return;
    drag.moved = true; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    tYaw = drag.yaw + dx * 0.008; tPitch = clamp(drag.pitch + dy * 0.005, -0.5, 0.5); wake();
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

  /* ---- sizing, scroll progress, render loop ---- */
  let w = 0; let h = 0; let visible = false; let raf = 0; let target = 0; let shown = 0; let lastTime = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (r.width === w && r.height === h) return;
    w = r.width; h = r.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    wake();
  };
  new ResizeObserver(resize).observe(canvas);
  const progress = () => clamp(-section.getBoundingClientRect().top / Math.max(1, maxScroll()), 0, 1);

  function frame(t) {
    raf = 0;
    const dt = Math.min(0.05, (t - lastTime) / 1000 || 0.016); lastTime = t;
    target = progress();
    shown += (target - shown) * (reduced ? 1 : 1 - Math.pow(0.001, dt));
    yaw += (tYaw - yaw) * 0.12; pitch += (tPitch - pitch) * 0.12;
    swapT = Math.min(1, swapT + dt * 2.2);

    // phases: hold apart, slide together, settle
    const slide = smooth(clamp((shown - 0.16) / 0.62, 0, 1));
    current.move(slide);
    const settle = clamp((shown - 0.82) / 0.18, 0, 1);
    const pop = swapT < 1 ? 1 - Math.pow(1 - swapT, 3) : 1;
    current.group.scale.setScalar((0.88 + 0.12 * pop) * (1 + Math.sin(settle * Math.PI) * 0.03));
    current.group.rotation.y = (1 - pop) * -0.6;

    // camera orbits a little as you scroll
    const az = 0.75 + shown * 0.55 + yaw; const el = 0.42 - shown * 0.1 + pitch; const dist = currentKey === 'dovetail' ? 6.3 : 7.6;
    const c = current.group.position.clone().add(current.center);
    camera.position.set(c.x + Math.sin(az) * Math.cos(el) * dist, c.y + Math.sin(el) * dist + 0.4, c.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(c);
    shadowFloor.position.y = current.group.position.y - 0.02;
    renderer.render(scene, camera);

    // UI
    const pct = Math.round(shown * 100);
    out.textContent = `${pct}%`;
    if (document.activeElement !== range) range.value = String(pct);
    const phase = shown < 0.16 ? 0 : shown < 0.5 ? 1 : shown < 0.82 ? 2 : 3;
    phases.forEach((li, i) => li.classList.toggle('is-on', i <= phase));

    const moving = Math.abs(target - shown) > 0.0005 || Math.abs(tYaw - yaw) > 0.001 || Math.abs(tPitch - pitch) > 0.001 || swapT < 1;
    if (visible && moving) raf = requestAnimationFrame(frame);
  }
  function wake() { if (visible && !raf) { lastTime = performance.now(); raf = requestAnimationFrame(frame); } }

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { resize(); wake(); } }, { rootMargin: '100px' }).observe(section);
  window.addEventListener('scroll', wake, { passive: true });
  resize();
  visible = true; frame(performance.now()); visible = false;
  canvas.dataset.ready = 'true';
}

initTimeline();
initFaq();
init3D();
