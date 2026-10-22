// Planner v2 live 3D viewer. Raster WebGL with soft shadows, ACES tone mapping and a RoomEnvironment for light.
// It sleeps when idle: a frame is requested only when something changed (new geometry, camera motion, a wall fading,
// a resize), and nothing keeps requesting frames after that. Walls between the camera and the room fade out.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaterialLib } from '../configurator/materials.js';
import { roomBounds } from './plan-geom.js';
import {
  buildFloor, buildWall, floorSignature, wallSignature, disposeGroup, setWallFade, setWallHighlight
} from './geometry.js';
import { wallsOf } from './model.js';

const M = 0.01;
const FOV = 36;
const cssColor = (name, fallback) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createViewer(canvas, { onWallPick = null } = {}) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the room is static: redraw the shadow map only when geometry or light changes
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const lib = createMaterialLib(THREE);
  const accent = new THREE.Color(cssColor('--oak', '#4f6f85'));

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0xb5ad9e, 0.55);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  const fill = new THREE.DirectionalLight(0xdfe9f2, 0.45);
  scene.add(hemi, sun, sun.target, fill, fill.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.004;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- cameras and controls ----------
  const persp = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
  persp.position.set(4, 5, 7);
  const ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 120);
  ortho.up.set(0, 0, -1); // plan up on screen is -z, so the top-down view matches the 2D plan
  ortho.position.set(2, 40, 2);
  ortho.lookAt(2, 0, 2);

  const orbit = new OrbitControls(persp, canvas);
  orbit.enableDamping = !reduced;
  orbit.dampingFactor = 0.09;
  orbit.rotateSpeed = 0.7;
  orbit.zoomSpeed = 0.8;
  orbit.screenSpacePanning = true;
  orbit.minPolarAngle = 0.08;
  orbit.maxPolarAngle = 1.5;
  orbit.minDistance = 1.2;
  orbit.maxDistance = 40;

  const topControls = new OrbitControls(ortho, canvas);
  topControls.enableRotate = false;
  topControls.enableDamping = !reduced;
  topControls.dampingFactor = 0.12;
  topControls.screenSpacePanning = true;
  topControls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  topControls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  topControls.minZoom = 0.4;
  topControls.maxZoom = 8;
  topControls.enabled = false;

  // ---------- state ----------
  let mode = '3d';
  let size = { w: 0, h: 0 };
  let bounds = null; // metres
  let fitRadius = 0;
  let templateId = null;
  let floorSig = '', floor = null;
  const walls = new Map(); // id -> { sig, group, fade, target, mid, n, height }
  let highlightId = null;
  let tween = null;
  let queued = false, dirty = true, disposed = false, rafId = 0, lastT = 0;
  const stats = { frames: 0, requests: 0 };
  const viewCbs = [];
  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  const activeCam = () => (mode === 'plan' ? ortho : persp);
  const activeControls = () => (mode === 'plan' ? topControls : orbit);

  function request() {
    dirty = true;
    stats.requests++;
    if (queued || disposed) return;
    queued = true;
    if (!lastT) lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  orbit.addEventListener('change', () => { updateFades(); request(); });
  topControls.addEventListener('change', request);

  // ---------- fitting ----------
  function fit3D(instant = true) {
    if (!bounds) return;
    const c = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0.8, (bounds.minZ + bounds.maxZ) / 2);
    const r = Math.max(1.6, fitRadius);
    const aspect = Math.max(0.5, size.w / Math.max(1, size.h));
    const dist = (r * 1.3) / Math.tan((FOV * Math.PI) / 360) / Math.min(1, aspect * 0.95 + 0.18);
    const az = -0.5, polar = 0.98;
    const to = new THREE.Vector3(Math.sin(az) * Math.sin(polar), Math.cos(polar), Math.cos(az) * Math.sin(polar)).multiplyScalar(dist).add(c);
    if (instant || reduced) {
      persp.position.copy(to); orbit.target.copy(c); orbit.update();
      updateFades();
    } else tweenTo(to, c, 650);
    request();
  }

  function fitPlan() {
    if (!bounds) return;
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const aspect = Math.max(0.3, size.w / Math.max(1, size.h));
    const span = Math.max((bounds.maxX - bounds.minX) / aspect, bounds.maxZ - bounds.minZ) * 1.22 + 0.5;
    ortho.top = span / 2; ortho.bottom = -span / 2; ortho.left = -(span / 2) * aspect; ortho.right = (span / 2) * aspect;
    ortho.zoom = 1;
    ortho.position.set(cx, 40, cz);
    topControls.target.set(cx, 0, cz);
    ortho.updateProjectionMatrix();
    topControls.update();
    request();
  }

  function placeLights() {
    if (!bounds) return;
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const r = fitRadius;
    sun.position.set(cx + r * 0.9, r * 2.1 + 2.2, cz + r * 0.55);
    sun.target.position.set(cx, 0, cz);
    fill.position.set(cx - r * 1.2, r * 1.2 + 1.5, cz - r * 1.4);
    fill.target.position.set(cx, 0, cz);
    const s = sun.shadow.camera;
    const ext = r * 1.5 + 1;
    s.left = -ext; s.right = ext; s.top = ext; s.bottom = -ext; s.near = 0.5; s.far = r * 6 + 12;
    s.updateProjectionMatrix();
    ground.scale.set(r * 6 + 10, r * 6 + 10, 1);
    ground.position.x = cx; ground.position.z = cz;
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------- camera tween ----------
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
    updateFades();
    if (k >= 1) tween = null;
    return !!tween;
  }

  // ---------- fading the walls that block the view ----------
  function updateFades() {
    let changed = false;
    for (const e of walls.values()) {
      let t = 1;
      if (mode === '3d') {
        // the camera is beyond this wall's outer face, so the wall stands between it and the room
        const cam = persp.position;
        const dOut = (cam.x - e.mid.x) * -e.n.x + (cam.z - e.mid.z) * -e.n.z;
        if (dOut > 0.02) t = 0;
      }
      if (e.target !== t) { e.target = t; changed = true; }
    }
    if (changed) request();
  }
  function stepFades(dt) {
    let busy = false;
    for (const e of walls.values()) {
      if (e.fade === e.target) continue;
      const before = e.fade > 0.01;
      e.fade = reduced ? e.target : e.fade + (e.target - e.fade) * (1 - Math.exp(-dt * 16));
      if (Math.abs(e.fade - e.target) < 0.015) e.fade = e.target;
      setWallFade(e.group, e.fade);
      if (before !== e.fade > 0.01) renderer.shadowMap.needsUpdate = true;
      if (e.fade !== e.target) busy = true;
    }
    return busy;
  }

  // ---------- frame ----------
  function frame(now) {
    queued = false;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - (lastT || now)) / 1000));
    lastT = now;
    let more = stepTween(now);
    more = stepFades(dt) || more;
    activeControls().update(); // damping inertia: fires 'change' (which requests another frame) while it moves
    if (size.w > 0 && size.h > 0 && dirty) {
      renderer.render(scene, activeCam());
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
    if (bounds) {
      if (first) { fit3D(true); fitPlan(); }
      else {
        const aspect = w / h;
        const span = ortho.top * 2;
        ortho.left = -(span / 2) * aspect; ortho.right = (span / 2) * aspect;
        ortho.updateProjectionMatrix();
      }
    }
    request();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);

  // ---------- picking ----------
  const ray = new THREE.Raycaster();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !onWallPick) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved > 5 || !quick) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), activeCam());
    const bodies = [];
    for (const en of walls.values()) if (en.group.visible) bodies.push(en.group.userData.body);
    const hit = ray.intersectObjects(bodies, false)[0];
    if (hit) onWallPick(hit.object.userData.wallId);
  });

  // ---------- project ----------
  function applyHighlight() {
    for (const [id, e] of walls) setWallHighlight(e.group, accent, id === highlightId);
  }

  function setProject(project) {
    const room = project && project.room;
    if (!room) return;
    let rebuilt = false;

    const fs = floorSignature(room);
    if (fs !== floorSig) {
      if (floor) { roomGroup.remove(floor); disposeGroup(floor); }
      floor = buildFloor(room, THREE, lib);
      roomGroup.add(floor);
      floorSig = fs;
      rebuilt = true;
    }

    const wl = wallsOf(room);
    const seen = new Set();
    room.walls.forEach((c, i) => {
      seen.add(c.id);
      const sig = wallSignature(room, i);
      const old = walls.get(c.id);
      if (old && old.sig === sig) return;
      const group = buildWall(room, i, THREE, lib);
      if (old) { roomGroup.remove(old.group); disposeGroup(old.group); }
      const w = wl[i];
      const e = {
        sig, group, fade: old ? old.fade : 1, target: old ? old.target : 1,
        mid: new THREE.Vector3(((w.start.x + w.end.x) / 2) * M, 0, ((w.start.z + w.end.z) / 2) * M),
        n: { x: w.normal.x, z: w.normal.z }, height: room.height * M
      };
      roomGroup.add(group);
      walls.set(c.id, e);
      setWallFade(group, e.fade);
      rebuilt = true;
    });
    for (const [id, e] of [...walls]) {
      if (seen.has(id)) continue;
      roomGroup.remove(e.group); disposeGroup(e.group); walls.delete(id); rebuilt = true;
    }
    if (!rebuilt) return;
    applyHighlight();

    const b = roomBounds(room);
    const next = { minX: b.minX * M, maxX: b.maxX * M, minZ: b.minZ * M, maxZ: b.maxZ * M };
    const radius = Math.hypot(next.maxX - next.minX, next.maxZ - next.minZ) / 2;
    const tid = room.template ? room.template.id : null;
    const refit = !bounds || tid !== templateId || Math.abs(radius - fitRadius) / Math.max(0.5, fitRadius) > 0.3;
    bounds = next;
    if (refit) { fitRadius = radius; templateId = tid; }
    placeLights();
    if (refit && size.w > 0) { fit3D(!queuedFirstFit); fitPlan(); queuedFirstFit = true; }
    updateFades();
    renderer.shadowMap.needsUpdate = true;
    request();
  }
  let queuedFirstFit = false;

  // ---------- public API ----------
  function highlightWall(id) {
    highlightId = id || null;
    applyHighlight();
    request();
  }

  function focusWall(id) {
    highlightWall(id);
    const e = walls.get(id);
    if (!e || mode !== '3d' || !bounds) return;
    const cam = persp.position, tgt = orbit.target;
    const seesInner = (cam.x - e.mid.x) * e.n.x + (cam.z - e.mid.z) * e.n.z > 0.2;
    if (seesInner && e.target === 1) return; // already looking at its inside face
    const dist = persp.position.distanceTo(tgt);
    const sph = new THREE.Spherical().setFromVector3(cam.clone().sub(tgt));
    const c = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0.8, (bounds.minZ + bounds.maxZ) / 2);
    // stand on the far side of the room so the chosen wall faces us: along the wall's inward normal, a bit to the side
    const theta = Math.atan2(e.n.x, e.n.z) + 0.35;
    const pos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(dist, Math.min(sph.phi, 1.1), theta)).add(c);
    tweenTo(pos, c, reduced ? 1 : 700);
  }

  function setView(next) {
    const m = next === 'plan' ? 'plan' : '3d';
    if (m === mode) return;
    mode = m;
    orbit.enabled = m === '3d';
    topControls.enabled = m === 'plan';
    tween = null;
    if (m === 'plan') fitPlan(); else updateFades();
    for (const e of walls.values()) if (m === 'plan') e.target = 1;
    viewCbs.forEach((cb) => cb(mode));
    updateFades();
    request();
  }

  return {
    setProject, focusWall, highlightWall, setView,
    getView: () => mode,
    onViewChange(cb) { viewCbs.push(cb); },
    resetView() { if (mode === 'plan') fitPlan(); else fit3D(false); },
    resize,
    stats,
    get idle() { return !queued && !tween; },
    get debug() { return { renderer, scene, persp, ortho, orbit, walls }; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      orbit.dispose(); topControls.dispose();
      walls.forEach((e) => disposeGroup(e.group));
      if (floor) disposeGroup(floor);
      ground.geometry.dispose(); ground.material.dispose();
      lib.dispose(); envTex.dispose(); pmrem.dispose(); renderer.dispose();
    }
  };
}
