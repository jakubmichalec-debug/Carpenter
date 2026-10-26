// Planner v2 live 3D viewer. Raster WebGL with soft shadows, ACES tone mapping and a studio environment for light. The
// pieces stand side by side in a neutral studio (a floor that curves up into a back wall, see studio.js), lit like a
// product shot: a soft key light with shadows, a fill from the other side and the environment.
// It sleeps when idle: a frame is requested only when something changed (new geometry, camera motion, a resize), and nothing
// keeps requesting frames after that.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPlannerLib } from './material-lib.js';
import { buildStudio, studioSignature, disposeGroup, buildPiece, pieceSignature } from './geometry.js';
import { layoutStudio, overviewPose } from './studio.js';

const M = 0.01;
const FOV = 36;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createViewer(canvas) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the set is static: redraw the shadow map only when geometry or light changes
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.6;

  const lib = createPlannerLib(THREE);

  // ---------- lights: a soft key from the front left, a fill from the right, the environment for the rest ----------
  const key = new THREE.DirectionalLight(0xfff1de, 2.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6;
  const fill = new THREE.DirectionalLight(0xdfe9f4, 0.7);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc8bb, 0.35);
  scene.add(hemi, key, key.target, fill, fill.target);

  // ---------- camera and controls ----------
  const persp = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
  persp.position.set(2, 2.5, 6);
  const orbit = new OrbitControls(persp, canvas);
  orbit.enableDamping = !reduced;
  orbit.dampingFactor = 0.09;
  orbit.rotateSpeed = 0.7;
  orbit.zoomSpeed = 0.8;
  orbit.screenSpacePanning = true;
  orbit.minPolarAngle = 0.08;
  orbit.maxPolarAngle = 1.5;
  orbit.minDistance = 0.8;
  orbit.maxDistance = 30;

  // ---------- state ----------
  let size = { w: 0, h: 0 };
  let layout = layoutStudio({ pieces: [] });
  let studio = null, studioSig = '';
  let fitRadius = 0, fitKey = '';
  let tween = null;
  let auto = true; // the camera is where the framing put it: a resize frames the set again, until the person moves the camera
  let queued = false, dirty = true, disposed = false, rafId = 0, lastT = 0;
  const stats = { frames: 0, requests: 0 };
  const set = new THREE.Group();
  scene.add(set);
  const entries = new Map(); // pieceId -> { sig, group }

  function request() {
    dirty = true;
    stats.requests++;
    if (queued || disposed) return;
    queued = true;
    if (!lastT) lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  orbit.addEventListener('change', request);
  orbit.addEventListener('start', () => { auto = false; });

  // ---------- camera ----------
  function aspect() { return Math.max(0.4, size.w / Math.max(1, size.h)); }
  function fit(instant = true) {
    if (layout.empty) return;
    const pose = overviewPose(layout, { aspect: aspect(), fov: FOV });
    moveTo(new THREE.Vector3(...pose.position), new THREE.Vector3(...pose.target), instant);
    auto = true;
  }
  function moveTo(pos, target, instant, ms = 650) {
    if (instant || reduced || size.w === 0) {
      tween = null; // a camera move that is still running must not undo this
      persp.position.copy(pos); orbit.target.copy(target); orbit.update();
      request();
    } else tweenTo(pos, target, ms);
  }
  function tweenTo(pos, target, ms) {
    const sph0 = new THREE.Spherical().setFromVector3(persp.position.clone().sub(orbit.target));
    const sph1 = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
    let dTheta = sph1.theta - sph0.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta)); // the short way round
    tween = { sph0, sph1, dTheta, t0: target.clone(), from: orbit.target.clone(), start: performance.now(), ms };
    request();
  }
  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.start) / tween.ms);
    const e = easeInOut(k);
    const s = new THREE.Spherical(
      tween.sph0.radius + (tween.sph1.radius - tween.sph0.radius) * e,
      tween.sph0.phi + (tween.sph1.phi - tween.sph0.phi) * e,
      tween.sph0.theta + tween.dTheta * e
    );
    orbit.target.lerpVectors(tween.from, tween.t0, e);
    persp.position.setFromSpherical(s).add(orbit.target);
    orbit.update();
    if (k >= 1) tween = null;
    return !!tween;
  }

  function placeLights() {
    const b = layout.bounds;
    const cx = ((b.minX + b.maxX) / 2) * M, cz = (layout.items.length ? Math.max(...layout.items.map((i) => i.z + i.d)) / 2 : 100) * M;
    const r = Math.max(1.4, Math.hypot((b.maxX - b.minX) * M, layout.wall.height * M, b.maxZ * M) / 2);
    key.position.set(cx - r * 0.75, r * 1.35 + 1.2, cz + r * 1.25);
    key.target.position.set(cx, 0.6, cz * 0.5);
    fill.position.set(cx + r * 1.4, r * 0.6 + 0.8, cz + r * 1.1);
    fill.target.position.set(cx, 0.8, cz * 0.5);
    const s = key.shadow.camera;
    const ext = r * 1.1 + 0.8;
    s.left = -ext; s.right = ext; s.top = ext; s.bottom = -ext; s.near = 0.5; s.far = r * 6 + 10;
    s.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------- frame ----------
  function frame(now) {
    queued = false;
    if (disposed) return;
    lastT = now;
    const more = stepTween(now);
    orbit.update(); // damping inertia: fires 'change' (which requests another frame) while it moves
    if (size.w > 0 && size.h > 0 && dirty) {
      renderer.render(scene, persp);
      stats.frames++;
    }
    dirty = false;
    if (more) request();
    else lastT = 0;
  }

  // ---------- size ----------
  function resize() {
    const p = canvas.parentElement || canvas;
    const w = Math.round(p.clientWidth), h = Math.round(p.clientHeight);
    if (w === size.w && h === size.h) return;
    const first = size.w === 0;
    size = { w, h };
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    if (first || auto) fit(true);
    request();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);

  // ---------- the set ----------
  function dropEntry(e) {
    set.remove(e.group);
    disposeGroup(e.group);
  }

  // Shows the project's pieces side by side in the studio. `only` shows that one piece alone (the Furniture and Interior
  // steps edit one piece at a time); `fronts` is 'closed', 'ajar' or 'hidden'. The meshes of a piece are rebuilt only when
  // its design changes; moving a neighbour just moves the group.
  function setProject(project, { only = null, fronts = 'closed' } = {}) {
    const all = (project && project.pieces) || [];
    const pieces = only ? all.filter((p) => p.id === only) : all;
    layout = layoutStudio({ pieces });
    let changed = false;
    const seen = new Set();
    for (const it of layout.items) {
      const piece = pieces.find((p) => p.id === it.pieceId);
      seen.add(piece.id);
      const sig = pieceSignature(piece, fronts);
      let e = entries.get(piece.id);
      if (!e || e.sig !== sig) {
        if (e) dropEntry(e);
        const group = buildPiece(piece, THREE, lib, { fronts });
        group.userData = { ...group.userData, pieceId: piece.id };
        e = { sig, group, pos: '' };
        entries.set(piece.id, e);
        set.add(group);
        changed = true;
      }
      const pos = `${it.x}|${it.z}|${it.lift}`;
      if (e.pos !== pos) {
        e.group.position.set(it.x * M, it.lift * M, it.z * M);
        e.pos = pos;
        changed = true;
      }
    }
    for (const [id, e] of [...entries]) {
      if (seen.has(id)) continue;
      dropEntry(e); entries.delete(id); changed = true;
    }
    const sSig = layout.empty ? '' : studioSignature(layout);
    if (sSig !== studioSig) {
      if (studio) { set.remove(studio); disposeGroup(studio); studio = null; }
      if (!layout.empty) { studio = buildStudio(layout, THREE); set.add(studio); }
      studioSig = sSig;
      changed = true;
    }
    if (!changed) return;
    placeLights();
    // refit the camera when the set is another one (other pieces, or a size that changed a lot); otherwise leave it where the person put it
    const radius = Math.hypot(layout.extent, layout.wall.height) / 2;
    const k = `${only || 'all'}|${layout.items.length}|${layout.items.map((i) => i.pieceId).join(',')}`;
    const refit = k !== fitKey || Math.abs(radius - fitRadius) / Math.max(40, fitRadius) > 0.3;
    if (refit) { const first = !fitKey; fitKey = k; fitRadius = radius; if (size.w > 0) fit(first); }
    renderer.shadowMap.needsUpdate = true;
    request();
  }

  // ---------- public API ----------
  // camera move to a pose given in metres: { position: [x, y, z], target: [x, y, z] }
  function setPose({ position, target }, { instant = false } = {}) {
    auto = false;
    moveTo(new THREE.Vector3(...position), new THREE.Vector3(...target), instant, 700);
  }

  // the camera as it is now, for the path tracer: a clone with current matrices
  function getCameraState() {
    const cam = persp.clone();
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return { camera: cam, size: { w: size.w, h: size.h } };
  }

  // renders now and returns a canvas with the frame on the page background (a PNG with a transparent sky looks broken)
  function capture({ maxWidth = 1600 } = {}) {
    if (size.w === 0 || size.h === 0) return null;
    renderer.render(scene, persp);
    const k = Math.min(1, maxWidth / canvas.width);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(canvas.width * k));
    out.height = Math.max(1, Math.round(canvas.height * k));
    const ctx = out.getContext('2d');
    ctx.fillStyle = cssColor('--paper', '#f6f6f3');
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    request(); // the next paint after the capture comes from the normal path
    return out;
  }

  return {
    setProject, setPose, getCameraState, capture,
    get layout() { return layout; },
    resetView() { fit(false); },
    resize,
    stats,
    get idle() { return !queued && !tween; },
    get debug() { return { renderer, scene, persp, orbit, entries }; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      orbit.dispose();
      entries.forEach(dropEntry);
      if (studio) disposeGroup(studio);
      lib.dispose(); envTex.dispose(); pmrem.dispose(); renderer.dispose();
    }
  };
}

function cssColor(name, fallback) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
}
