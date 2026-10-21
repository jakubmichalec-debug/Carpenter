// Three.js scene for the configurator: room, lighting, camera, picking and animation.
// API (CONTRACTS.md) plus a few extras used by ui.js: onDrag, onViewChange, setErrors, setViewInset, getView.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildModule, createMaterialLib } from './geometry.js';
import { MODULE_TYPES, FLOORS, WALL_COLORS } from './model.js';

const FOV = 32;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const WALL_T = 0.12;
const lerp = THREE.MathUtils.lerp;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function cssColor(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 1000;
  ctx.fillStyle = '#000';
  ctx.fillRect(26 - 1000, 26, 76, 76);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function stripTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

export function createConfiguratorScene(canvas, { quality = 'high', label = null } = {}) {
  const low = quality === 'low';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = window.devicePixelRatio || 1;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(dpr, low ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);

  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = 1.5;
  controls.minAzimuthAngle = -1.25;
  controls.maxAzimuthAngle = 1.25;
  controls.minDistance = 1.2;

  const lib = createMaterialLib(THREE);
  const colFocus = new THREE.Color(cssColor('--focus', '#d9a441'));
  const colErr = new THREE.Color(cssColor('--err', '#b2452f'));
  const colInk = new THREE.Color(cssColor('--ink', '#1d1a16'));

  // ---------- state ----------
  let design = null;
  let selectedId = null;
  let hoverId = null;
  let view = 'free';
  let explodeTarget = 0, explodeNow = 0;
  let doorsGlobal = 0;
  const doorOverride = new Map();
  let lightingTarget = 0, lightingNow = 0;
  let errorIds = new Set();
  let inset = { top: 0, bottom: 0 };
  let dirty = true;
  let raf = 0, last = performance.now();
  let camTween = null;
  let userMoved = false;
  const selectCbs = [], dragCbs = [], viewCbs = [];
  const entries = new Map();
  const roomGroup = new THREE.Group();
  const modulesGroup = new THREE.Group();
  scene.add(roomGroup, modulesGroup);
  let roomSig = '';
  let size = { w: 1, h: 1 };
  let bounds = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(5, 3, 5));

  const invalidate = () => { dirty = true; };

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xfff3df, 0xa89880, 0.7);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.castShadow = true;
  const shadowSize = low ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3.5;
  const fill = new THREE.DirectionalLight(0xfff6ea, 0.55);
  const pendant = new THREE.PointLight(0xffc98a, 0, 0, 2);
  scene.add(hemi, sun, sun.target, fill, fill.target, pendant);
  const windowLights = [];

  const dayCol = new THREE.Color(0xfff0d8), nightCol = new THREE.Color(0x7f93d6);
  const skyMats = [];
  const dayHemiSky = new THREE.Color(0xfff3df), nightHemiSky = new THREE.Color(0x6475a8);
  const nightSky = new THREE.Color(0x151d38);

  // ---------- room ----------
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x3a342d, roughness: 0.9 });
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.12 });
  const frameMat = lib.plain('#f4f1ea', 0.5);
  const sillMat = lib.plain('#e9e3d8', 0.55);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.94 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  const stripTex = stripTexture();
  const stripMatDark = new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, depthWrite: false, opacity: 1 });
  const blobTex = blobTexture();

  function disposeGroup(grp) {
    grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    while (grp.children.length) grp.remove(grp.children[0]);
  }

  function shadeStrip(w, d) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stripMatDark);
    mesh.renderOrder = 1;
    return mesh;
  }

  function buildRoom(room) {
    disposeGroup(roomGroup);
    windowLights.length = 0; skyMats.length = 0;
    const RW = room.width / 100, RH = room.height / 100, RD = room.depth / 100;
    const wallDef = WALL_COLORS[room.wall] || WALL_COLORS.chalk;
    wallMat.color.set(wallDef.color);
    const floorDef = FLOORS[room.floor] || FLOORS['oak-floor'];
    const ftex = lib.floorTexture(room.floor, floorDef.color);
    const tileM = lib.floorTileMetres(room.floor);
    ftex.repeat.set(RW / tileM, RD / tileM);
    floorMat.map = ftex;
    floorMat.roughness = /concrete/.test(room.floor) ? 0.35 : /tile/.test(room.floor) ? 0.3 : 0.6;
    floorMat.needsUpdate = true;

    // floor slab: top face gets the texture
    const slab = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.08, RD), [slabMat, slabMat, floorMat, slabMat, slabMat, slabMat]);
    slab.position.set(RW / 2, -0.04, RD / 2);
    slab.receiveShadow = true; slab.castShadow = true;
    roomGroup.add(slab);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(RW + 14, RD + 14), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(RW / 2, -0.081, RD / 2); ground.receiveShadow = true;
    roomGroup.add(ground);

    // back wall with holes
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(RW, 0); shape.lineTo(RW, RH); shape.lineTo(0, RH); shape.closePath();
    room.openings.forEach((o) => {
      const x0 = o.x / 100, x1 = (o.x + o.w) / 100;
      const y0 = Math.max(o.y / 100, o.type === 'door' ? 0.012 : 0.0), y1 = (o.y + o.h) / 100;
      const hole = new THREE.Path();
      hole.moveTo(x0, y0); hole.lineTo(x0, y1); hole.lineTo(x1, y1); hole.lineTo(x1, y0); hole.closePath();
      shape.holes.push(hole);
    });
    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false });
    wallGeo.translate(0, 0, -WALL_T);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.castShadow = true; wall.receiveShadow = true;
    roomGroup.add(wall);

    // side walls, cut away towards the camera
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0, 0); sideShape.lineTo(RD, 0); sideShape.lineTo(RD, 0.09);
    sideShape.lineTo(RD * 0.78, 0.09); sideShape.lineTo(RD * 0.3, RH); sideShape.lineTo(0, RH); sideShape.closePath();
    const sideGeo = new THREE.ExtrudeGeometry(sideShape, { depth: 0.1, bevelEnabled: false });
    const left = new THREE.Mesh(sideGeo, wallMat);
    left.rotation.y = -Math.PI / 2; left.position.set(0, 0, 0);
    const right = new THREE.Mesh(sideGeo, wallMat);
    right.rotation.y = -Math.PI / 2; right.position.set(RW + 0.1, 0, 0);
    [left, right].forEach((s) => { s.castShadow = true; s.receiveShadow = true; roomGroup.add(s); });

    // skirting along the back wall, interrupted by doors
    const doors = room.openings.filter((o) => o.type === 'door').sort((a, b) => a.x - b.x);
    let cursor = 0;
    const skirt = (a, b) => {
      if (b - a < 0.02) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.08, 0.014), frameMat);
      m.position.set((a + b) / 2, 0.04, 0.007); m.castShadow = true; m.receiveShadow = true; roomGroup.add(m);
    };
    doors.forEach((o) => { skirt(cursor, o.x / 100); cursor = (o.x + o.w) / 100; });
    skirt(cursor, RW);

    // openings
    room.openings.forEach((o) => buildOpening(o));

    // fake ambient occlusion in the corners
    const d = 0.45;
    const sb = shadeStrip(RW, d); sb.rotation.x = -Math.PI / 2; sb.position.set(RW / 2, 0.003, d / 2); roomGroup.add(sb);
    [[0, Math.PI / 2], [RW, -Math.PI / 2]].forEach(([x, ry]) => {
      const pivot = new THREE.Group(); pivot.rotation.y = ry; pivot.position.set(x, 0.003, RD / 2);
      const s = shadeStrip(RD, d); s.rotation.x = -Math.PI / 2; s.position.set(0, 0, d / 2 - d / 2 + 0); s.position.z = -0;
      // strip lies along the wall: local +y (towards wall) after rotation.x maps to -z of the pivot
      s.position.set(0, 0, d / 2);
      pivot.add(s); roomGroup.add(pivot);
    });
    [[d / 2, Math.PI / 2], [RW - d / 2, -Math.PI / 2]].forEach(([x, rz]) => {
      const s = shadeStrip(RH, d); s.rotation.z = rz; s.position.set(x, RH / 2, 0.003); roomGroup.add(s);
    });

    // light setup follows the room
    const c = new THREE.Vector3(RW / 2, 0.8, RD * 0.38);
    const dir = new THREE.Vector3(0.22, 0.5, -0.82).normalize();
    sun.position.copy(c).addScaledVector(dir, 12);
    sun.target.position.copy(c);
    const ext = Math.max(RW, RD) / 2 + 2.2;
    const sc = sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 30;
    sc.updateProjectionMatrix();
    fill.position.set(RW / 2 + 1, RH * 0.9, RD + 3); fill.target.position.set(RW / 2, 1, 0);
    pendant.position.set(RW / 2, Math.min(RH - 0.35, 2.4), RD * 0.55);

    bounds = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(RW + 0.5, RH + 0.2, RD + 1.5));
    controls.maxDistance = 45;
    applyLighting(lightingNow);
  }

  function buildOpening(o) {
    const x = o.x / 100, y = o.y / 100, w = o.w / 100, h = o.h / 100;
    const win = o.type === 'window';
    const fw = 0.05;
    const y0 = win ? y : 0.012;
    const hh = win ? h : h - 0.012 + (win ? 0 : 0);
    const part = (px, py, pw, ph, pd, z, mat = frameMat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), mat);
      m.position.set(px + pw / 2, py + ph / 2, z); m.castShadow = true; m.receiveShadow = true; roomGroup.add(m);
      return m;
    };
    const fz = -WALL_T / 2;
    part(x, y0, fw, hh, WALL_T, fz); part(x + w - fw, y0, fw, hh, WALL_T, fz);
    part(x + fw, y0 + hh - fw, w - 2 * fw, fw, WALL_T, fz);
    if (win) {
      part(x + fw, y0, w - 2 * fw, fw, WALL_T, fz);
      if (w > 1.0) part(x + w / 2 - 0.015, y0 + fw, 0.03, hh - 2 * fw, 0.05, fz);
      if (h > 1.2) part(x + fw, y0 + hh * 0.55, w - 2 * fw, 0.025, 0.05, fz);
      // glass
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * fw, hh - 2 * fw), lib.glass());
      glass.position.set(x + w / 2, y0 + hh / 2, fz); glass.renderOrder = 3; roomGroup.add(glass);
      // sill sticks out into the room
      part(x - 0.03, y0 - 0.025, w + 0.06, 0.025, 0.1, 0.02, sillMat);
      // sky behind the glass
      const skyMat = new THREE.MeshBasicMaterial({ map: lib.skyTexture(), toneMapped: false, color: 0xffffff });
      skyMats.push(skyMat);
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.4, hh + 0.4), skyMat);
      sky.position.set(x + w / 2, y0 + hh / 2, -WALL_T - 0.05); roomGroup.add(sky);
      // soft sky light entering the room
      if (windowLights.length < 2) {
        const rl = new THREE.RectAreaLight(0xe6f1ff, 0, w - 2 * fw, hh - 2 * fw);
        rl.position.set(x + w / 2, y0 + hh / 2, -0.02);
        rl.rotation.y = Math.PI;
        roomGroup.add(rl);
        windowLights.push(rl);
      }
    } else {
      const hall = new THREE.MeshBasicMaterial({ map: lib.hallTexture(), toneMapped: false });
      skyMats.push(hall);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, h + 0.3), hall);
      back.position.set(x + w / 2, (h + 0.3) / 2, -WALL_T - 0.4); roomGroup.add(back);
      // threshold
      part(x, 0, w, 0.012, WALL_T + 0.02, fz + 0.01, lib.plain('#8a6a4a', 0.5));
    }
  }

  // ---------- modules ----------
  const shapeSig = (m) => { const { x, z, ...rest } = m; return JSON.stringify(rest); };
  const popSig = (m) => { const { x, z, width, height, depth, elevation, ...rest } = m; return JSON.stringify(rest); };

  function moduleCenter(m) {
    const free = MODULE_TYPES[m.type] && MODULE_TYPES[m.type].freestanding;
    return new THREE.Vector3((m.x + m.width / 2) / 100, m.elevation / 100, ((free ? m.z || 0 : 0) + m.depth / 2) / 100);
  }

  function makeContact(m) {
    const free = MODULE_TYPES[m.type] && MODULE_TYPES[m.type].freestanding;
    const W = m.width / 100, H = m.height / 100, D = m.depth / 100;
    const mat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
    let mesh;
    if (m.elevation > 0) {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.35, H + 0.35), mat);
      mesh.position.set(0, H / 2 - 0.06, -D / 2 + 0.004);
      mat.opacity = 0.4;
    } else {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.3, D + 0.3), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.004, free ? 0 : 0.02);
    }
    mesh.userData.nopick = true; mesh.renderOrder = 2;
    return mesh;
  }

  function applyExplode(grp) {
    grp.traverse((o) => {
      if (o.userData.explode && o.userData.base) {
        o.position.copy(o.userData.base).addScaledVector(o.userData.explode, explodeNow);
      }
    });
  }

  function doorKey(id, i) { return `${id}:${i}`; }

  function initDoors(entry) {
    let i = 0;
    entry.group.traverse((o) => {
      if (o.userData.door || o.userData.drawer) {
        const d = o.userData.door || o.userData.drawer;
        d.key = doorKey(entry.id, i++);
        const t = doorOverride.has(d.key) ? doorOverride.get(d.key) : doorsGlobal;
        d.target = t; d.open = t;
        poseDoor(o);
      }
    });
  }

  function poseDoor(o) {
    const d = o.userData.door;
    if (d) {
      if (d.hinge === 'left') o.rotation.y = -d.open * d.angle;
      else if (d.hinge === 'right') o.rotation.y = d.open * d.angle;
      else o.position.x = d.baseX + d.open * d.slide;
    } else if (o.userData.drawer) {
      o.position.z = o.userData.drawer.open * o.userData.drawer.travel;
    }
  }

  function createEntry(m) {
    const root = new THREE.Group();
    const group = buildModule(m, THREE, lib);
    const c = moduleCenter(m);
    root.position.copy(c);
    group.position.set(-m.width / 200, 0, -m.depth / 200);
    root.add(group);
    const contact = makeContact(m);
    root.add(contact);
    group.traverse((o) => { if (o.userData.led === undefined && o.isMesh) o.userData.moduleId = m.id; });
    modulesGroup.add(root);
    const entry = { id: m.id, m, root, group, contact, target: c.clone(), sig: shapeSig(m), pop: popSig(m), anim: null };
    initDoors(entry);
    applyExplode(group);
    applyLedState(entry);
    return entry;
  }

  function destroyEntry(entry) {
    modulesGroup.remove(entry.root);
    entry.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isLight && o.dispose) o.dispose(); });
  }

  function startAnim(entry, kind) {
    entry.anim = { kind, t0: performance.now(), dur: reduced ? 1 : kind === 'out' ? 200 : 460 };
    invalidate();
  }

  function setDesign(next) {
    const prevRoom = roomSig;
    design = next;
    const r = next.room;
    const rs = JSON.stringify([r.width, r.height, r.depth, r.floor, r.wall, r.openings]);
    const roomChanged = rs !== roomSig;
    const dimsChanged = !roomSig || JSON.stringify([r.width, r.height, r.depth]) !== roomDims;
    if (roomChanged) { roomSig = rs; buildRoom(r); }
    roomDims = JSON.stringify([r.width, r.height, r.depth]);
    const ids = new Set(next.modules.map((m) => m.id));
    entries.forEach((e, id) => {
      if (!ids.has(id)) { entries.delete(id); e.removing = true; e.anim = { kind: 'out', t0: performance.now(), dur: reduced ? 1 : 200 }; removing.add(e); }
    });
    next.modules.forEach((m) => {
      const e = entries.get(m.id);
      if (!e) {
        const ne = createEntry(m);
        entries.set(m.id, ne);
        ne.root.scale.setScalar(reduced ? 1 : 0.001);
        startAnim(ne, 'in');
      } else if (e.sig !== shapeSig(m)) {
        const popIt = e.pop !== popSig(m);
        const wasPos = e.root.position.clone();
        modulesGroup.remove(e.root);
        destroyEntry(e);
        const ne = createEntry(m);
        ne.root.position.copy(wasPos);
        entries.set(m.id, ne);
        if (popIt && !reduced) { ne.root.scale.setScalar(0.94); startAnim(ne, 'settle'); }
      } else {
        e.m = m;
        e.target.copy(moduleCenter(m));
      }
    });
    updateOverlays();
    invalidate();
    if (!prevRoom) frameInstant('free');
    else if (dimsChanged && roomChanged && (view !== 'free' || !userMoved)) tweenToView(view, 0.45);
  }
  let roomDims = '';
  const removing = new Set();

  // ---------- selection overlays ----------
  const overlay = new THREE.Group();
  overlay.renderOrder = 10;
  scene.add(overlay);
  const lineMats = [];

  function boxLines(m, color, lw, opacity, grow = 0.006, depthTest = false) {
    const W = m.width / 100 + grow * 2, H = m.height / 100 + grow * 2, D = m.depth / 100 + grow * 2;
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D));
    const geo = new LineSegmentsGeometry().fromEdgesGeometry(eg);
    eg.dispose();
    const mat = new LineMaterial({ color, linewidth: lw, transparent: true, opacity, depthTest });
    mat.resolution.set(size.w, size.h);
    lineMats.push(mat);
    const line = new LineSegments2(geo, mat);
    line.renderOrder = 12;
    const c = moduleCenter(m);
    line.position.set(c.x, c.y + m.height / 200, c.z);
    line.userData.nopick = true;
    return line;
  }

  const dimGroup = new THREE.Group();
  let overlayKey = '';

  function clearOverlay() {
    overlay.children.slice().forEach((c) => {
      overlay.remove(c);
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) { o.material.dispose(); const i = lineMats.indexOf(o.material); if (i >= 0) lineMats.splice(i, 1); } });
    });
  }

  function updateOverlays() {
    if (!design) return;
    const byId = new Map(design.modules.map((m) => [m.id, m]));
    const key = JSON.stringify([selectedId, hoverId, [...errorIds], design.modules.map((m) => [m.id, m.x, m.z, m.width, m.height, m.depth, m.elevation])]);
    if (key === overlayKey) return;
    overlayKey = key;
    clearOverlay();
    errorIds.forEach((id) => {
      const m = byId.get(id); if (!m) return;
      overlay.add(boxLines(m, colErr, 2.5, 0.95, 0.008, true));
      const tint = new THREE.Mesh(new THREE.BoxGeometry(m.width / 100 + 0.01, m.height / 100 + 0.01, m.depth / 100 + 0.01),
        new THREE.MeshBasicMaterial({ color: colErr, transparent: true, opacity: 0.07, depthWrite: false }));
      const c = moduleCenter(m);
      tint.position.set(c.x, c.y + m.height / 200, c.z);
      tint.userData.nopick = true; tint.renderOrder = 4;
      overlay.add(tint);
    });
    if (hoverId && hoverId !== selectedId && byId.has(hoverId) && !errorIds.has(hoverId)) {
      overlay.add(boxLines(byId.get(hoverId), colInk, 1.5, 0.45, 0.004));
    }
    const sel = selectedId && byId.get(selectedId);
    if (sel) {
      if (!errorIds.has(sel.id)) overlay.add(boxLines(sel, colFocus, 3, 1, 0.007));
      // footprint glow on the floor and a dimension line above
      const c = moduleCenter(sel);
      if (sel.elevation === 0) {
        const fp = new THREE.Mesh(new THREE.PlaneGeometry(sel.width / 100 + 0.12, sel.depth / 100 + 0.12),
          new THREE.MeshBasicMaterial({ color: colFocus, transparent: true, opacity: 0.22, depthWrite: false }));
        fp.rotation.x = -Math.PI / 2; fp.position.set(c.x, 0.006, c.z); fp.userData.nopick = true; fp.renderOrder = 3;
        overlay.add(fp);
      }
      const y = c.y + sel.height / 100 + 0.14, z = c.z + sel.depth / 200;
      const x0 = sel.x / 100, x1 = (sel.x + sel.width) / 100;
      const pts = [x0, y, z, x1, y, z, x0, y - 0.04, z, x0, y + 0.04, z, x1, y - 0.04, z, x1, y + 0.04, z];
      const geo = new LineSegmentsGeometry().setPositions(pts);
      const mat = new LineMaterial({ color: colInk, linewidth: 1.5, transparent: true, opacity: 0.8, depthTest: false });
      mat.resolution.set(size.w, size.h); lineMats.push(mat);
      const dl = new LineSegments2(geo, mat); dl.renderOrder = 12; dl.userData.nopick = true;
      overlay.add(dl);
    }
    invalidate();
  }

  const _v = new THREE.Vector3();
  function updateLabel() {
    if (!label) return;
    const m = design && selectedId && design.modules.find((q) => q.id === selectedId);
    const entry = m && entries.get(m.id);
    if (!m || !entry || size.w < 2) { label.hidden = true; return; }
    _v.set((m.x + m.width / 2) / 100, entry.root.position.y + m.height / 100 + 0.14,
      entry.root.position.z + m.depth / 200);
    _v.x = entry.root.position.x;
    _v.project(camera);
    if (_v.z > 1) { label.hidden = true; return; }
    const sx = (_v.x * 0.5 + 0.5) * size.w;
    const sy = Math.max((-_v.y * 0.5 + 0.5) * size.h, inset.top + label.offsetHeight * 1.35 + 4);
    label.hidden = false;
    label.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -135%)`;
    const w = label.querySelector('[data-dim-w]');
    const s = label.querySelector('[data-dim-s]');
    if (w) w.textContent = `${m.width} cm`;
    if (s) s.textContent = `${m.height} × ${m.depth}`;
  }

  // ---------- lighting ----------
  function applyLighting(t) {
    hemi.intensity = lerp(0.7, 0.14, t);
    hemi.color.lerpColors(dayHemiSky, nightHemiSky, t);
    sun.intensity = lerp(3.4, 0.55, t);
    sun.color.lerpColors(dayCol, nightCol, t);
    fill.intensity = lerp(0.55, 0.06, t);
    pendant.intensity = lerp(0, 26, t);
    scene.environmentIntensity = lerp(0.6, 0.12, t);
    renderer.toneMappingExposure = lerp(1, 1.2, t);
    windowLights.forEach((l) => { l.intensity = lerp(2.2, 0.15, t); });
    skyMats.forEach((m) => { m.color.setRGB(1, 1, 1).lerp(nightSky, t); });
    entries.forEach(applyLedState);
    removing.forEach(applyLedState);
  }
  function applyLedState(entry) {
    const leds = entry.group.userData.leds;
    if (!leds) return;
    const t = lightingNow;
    leds.mats.forEach((mt) => { mt.emissiveIntensity = lerp(0.9, 3.2, t); });
    leds.lights.forEach((l) => { l.intensity = lerp(0.4, 7, t); });
  }

  // ---------- camera ----------
  const visH = () => Math.max(1, size.h - inset.top - inset.bottom);
  function frame(name) {
    if (!design) return { pos: new THREE.Vector3(3, 2, 6), target: new THREE.Vector3(2, 1, 0) };
    const RW = design.room.width / 100, RH = design.room.height / 100, RD = design.room.depth / 100;
    // The frustum covers the whole canvas; insets only shift where the picture sits, so fit into the visible part.
    const asp = size.w / size.h;
    const vf = Math.max(0.2, visH() / size.h);
    let dir, target, pad = size.w < 600 ? 0.95 : 0.9;
    if (name === 'front') { dir = new THREE.Vector3(0, 0.14, 1); target = new THREE.Vector3(RW / 2, RH * 0.47, 0); }
    else if (name === 'top') { dir = new THREE.Vector3(0, 1, 0.004); target = new THREE.Vector3(RW / 2, 0, RD / 2); }
    else {
      const az = 0.55, pol = 1.12;
      dir = new THREE.Vector3(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
      target = new THREE.Vector3(RW / 2, RH * 0.3, RD * 0.34);
    }
    dir.normalize();
    const corners = [[0, 0, 0], [RW, 0, 0], [0, RH, 0], [RW, RH, 0], [0, 0, RD], [RW, 0, RD]].map((c) => new THREE.Vector3(...c));
    const cam = camera.clone();
    cam.aspect = asp; cam.clearViewOffset(); cam.updateProjectionMatrix();
    let dist = Math.max(RW * 0.7 / (TAN * asp), RH * 0.7 / (TAN * vf), RD * 0.5 / TAN);
    const p = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const tgt = target.clone();
    for (let i = 0; i < 12; i++) {
      cam.position.copy(dir).multiplyScalar(dist).add(tgt); cam.lookAt(tgt); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      corners.forEach((c) => { p.copy(c).project(cam); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
      // re-centre the room in the visible area, then scale the distance until it fills `pad` of it
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      tgt.addScaledVector(right, ((x0 + x1) / 2) * dist * TAN * asp).addScaledVector(up, ((y0 + y1) / 2) * dist * TAN);
      const k = Math.max((x1 - x0) / 2 / pad, (y1 - y0) / 2 / (pad * vf));
      dist *= Math.min(1.6, Math.max(0.6, k));
      if (Math.abs(k - 1) < 0.015 && Math.abs(x0 + x1) < 0.02 && Math.abs(y0 + y1) < 0.02) break;
    }
    return { pos: dir.clone().multiplyScalar(dist).add(tgt), target: tgt };
  }

  function applyInset() {
    const dy = (inset.bottom - inset.top) / 2;
    if (dy === 0) camera.clearViewOffset();
    else camera.setViewOffset(size.w, size.h, 0, dy, size.w, size.h);
    camera.updateProjectionMatrix();
  }

  function frameInstant(name) {
    userMoved = false;
    const f = frame(name);
    camera.position.copy(f.pos);
    controls.target.copy(f.target);
    controls.update();
    invalidate();
  }

  function setViewName(name) {
    if (view === name) return;
    view = name;
    viewCbs.forEach((cb) => cb(name));
  }

  const sph0 = new THREE.Spherical(), sph1 = new THREE.Spherical(), sphN = new THREE.Spherical();
  function tweenToView(name, seconds = 0.95) {
    userMoved = false;
    const f = frame(name);
    setViewName(name);
    const t0 = controls.target.clone();
    const o0 = camera.position.clone().sub(t0);
    const o1 = f.pos.clone().sub(f.target);
    sph0.setFromVector3(o0); sph1.setFromVector3(o1);
    if (reduced || seconds <= 0) { camera.position.copy(f.pos); controls.target.copy(f.target); controls.update(); invalidate(); return; }
    camTween = { t0: performance.now(), dur: seconds * 1000, tFrom: t0, tTo: f.target.clone(), s0: sph0.clone(), s1: sph1.clone() };
    controls.enabled = false;
  }

  function stepCamera(now) {
    if (!camTween) return false;
    const k = Math.min(1, (now - camTween.t0) / camTween.dur);
    const e = easeInOut(k);
    const tgt = new THREE.Vector3().lerpVectors(camTween.tFrom, camTween.tTo, e);
    sphN.radius = lerp(camTween.s0.radius, camTween.s1.radius, e);
    sphN.phi = lerp(camTween.s0.phi, camTween.s1.phi, e);
    sphN.theta = lerp(camTween.s0.theta, camTween.s1.theta, e);
    camera.position.setFromSpherical(sphN).add(tgt);
    controls.target.copy(tgt);
    camera.lookAt(tgt);
    if (k >= 1) { camTween = null; controls.enabled = true; controls.update(); }
    return true;
  }

  controls.addEventListener('start', () => {
    if (camTween) { camTween = null; controls.enabled = true; }
    userMoved = true;
    setViewName('free');
  });
  controls.addEventListener('change', () => {
    const before = controls.target.clone();
    controls.target.clamp(bounds.min, bounds.max);
    if (!before.equals(controls.target)) camera.position.add(controls.target.clone().sub(before));
    invalidate();
  });

  // ---------- picking ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setRay(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    // the view offset shifts the projection; unproject through the camera accounts for it
    raycaster.setFromCamera(ndc, camera);
  }
  function pick(ev) {
    setRay(ev);
    const hits = raycaster.intersectObjects(modulesGroup.children, true);
    for (const h of hits) {
      if (h.object.userData.nopick || !h.object.visible) continue;
      let o = h.object, moduleId = null, door = null;
      while (o) {
        if (!door && (o.userData.door || o.userData.drawer)) door = o;
        if (o.userData.moduleId && !moduleId) moduleId = o.userData.moduleId;
        o = o.parent;
      }
      if (moduleId) return { id: moduleId, door, point: h.point };
    }
    return null;
  }

  const plane = new THREE.Plane();
  const hitPt = new THREE.Vector3();
  let press = null;

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || camTween) return;
    const hit = pick(ev);
    press = { x: ev.clientX, y: ev.clientY, hit, dragging: false, t: performance.now(), pid: ev.pointerId };
    if (!hit) return;
    const m = design.modules.find((q) => q.id === hit.id);
    if (!m) return;
    controls.enabled = false;
    if (selectedId !== hit.id) { selectedId = hit.id; updateOverlays(); selectCbs.forEach((cb) => cb(hit.id)); }
    const free = MODULE_TYPES[m.type].freestanding;
    plane.setFromNormalAndCoplanarPoint(free ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1),
      free ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, 0, m.depth / 200));
    setRay(ev);
    if (raycaster.ray.intersectPlane(plane, hitPt)) {
      press.start = hitPt.clone(); press.mx = m.x; press.mz = m.z || 0; press.free = free;
    }
    canvas.setPointerCapture(ev.pointerId);
  }, true);

  canvas.addEventListener('pointermove', (ev) => {
    if (press && press.hit && press.start) {
      const dist = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
      if (!press.dragging && dist > 5) { press.dragging = true; canvas.style.cursor = 'grabbing'; }
      if (press.dragging) {
        setRay(ev);
        if (raycaster.ray.intersectPlane(plane, hitPt)) {
          const dx = Math.round((hitPt.x - press.start.x) * 100);
          const dz = press.free ? Math.round((hitPt.z - press.start.z) * 100) : 0;
          dragCbs.forEach((cb) => cb({ id: press.hit.id, x: press.mx + dx, z: press.free ? press.mz + dz : undefined }));
        }
      }
      return;
    }
    if (ev.pointerType === 'mouse' && !press) {
      hoverReq = ev;
      if (!hoverRaf) hoverRaf = requestAnimationFrame(doHover);
    }
  });
  let hoverReq = null, hoverRaf = 0;
  function doHover() {
    hoverRaf = 0;
    if (!hoverReq || press) return;
    const hit = pick(hoverReq);
    const id = hit ? hit.id : null;
    canvas.style.cursor = hit ? (hit.door ? 'pointer' : 'grab') : '';
    if (id !== hoverId) { hoverId = id; updateOverlays(); }
  }
  canvas.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; updateOverlays(); } canvas.style.cursor = ''; });

  function endPress(ev) {
    if (!press) return;
    const p = press; press = null;
    controls.enabled = !camTween;
    canvas.style.cursor = '';
    try { canvas.releasePointerCapture(p.pid); } catch { /* not captured */ }
    if (p.dragging) { dragCbs.forEach((cb) => cb({ id: p.hit.id, done: true })); return; }
    const moved = Math.hypot(ev.clientX - p.x, ev.clientY - p.y);
    if (moved > 5 || performance.now() - p.t > 700) return;
    if (!p.hit) {
      if (selectedId) { selectedId = null; updateOverlays(); selectCbs.forEach((cb) => cb(null)); }
      return;
    }
    if (p.hit.door) {
      const d = p.hit.door.userData.door || p.hit.door.userData.drawer;
      d.target = d.target > 0.5 ? 0 : 1;
      doorOverride.set(d.key, d.target);
      invalidate();
    }
  }
  canvas.addEventListener('pointerup', endPress);
  canvas.addEventListener('pointercancel', endPress);

  // ---------- frame loop ----------
  function stepEntries(now, dt) {
    let busy = false;
    const k = 1 - Math.exp(-dt * 22);
    const consider = (e) => {
      // slide towards the target position (smooth drags)
      if (!e.removing && e.root.position.distanceToSquared(e.target) > 1e-8) {
        e.root.position.lerp(e.target, k); busy = true;
        if (e.root.position.distanceToSquared(e.target) < 1e-9) e.root.position.copy(e.target);
      }
      if (e.anim) {
        const p = Math.min(1, (now - e.anim.t0) / e.anim.dur);
        if (e.anim.kind === 'in') {
          const s = Math.max(0.001, easeOutBack(p));
          e.root.scale.setScalar(s);
          e.contact.material.opacity = (e.m.elevation > 0 ? 0.4 : 0.55) * p;
        } else if (e.anim.kind === 'settle') {
          e.root.scale.setScalar(lerp(0.94, 1, easeOutBack(p)));
        } else {
          e.root.scale.setScalar(lerp(1, 0.001, p * p));
        }
        busy = true;
        if (p >= 1) {
          if (e.anim.kind === 'out') { removing.delete(e); destroyEntry(e); }
          else e.root.scale.setScalar(1);
          e.anim = null;
        }
      }
    };
    entries.forEach(consider);
    removing.forEach(consider);
    return busy;
  }

  function stepDoors(dt) {
    let busy = false;
    const k = 1 - Math.exp(-dt * 7);
    entries.forEach((e) => {
      e.group.traverse((o) => {
        const d = o.userData.door || o.userData.drawer;
        if (!d || d.target === undefined) return;
        if (Math.abs(d.target - d.open) > 0.002) {
          d.open += (d.target - d.open) * (reduced ? 1 : k);
          busy = true;
        } else if (d.open !== d.target) { d.open = d.target; busy = true; }
        else return;
        poseDoor(o);
      });
    });
    return busy;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let busy = false;
    if (Math.abs(lightingTarget - lightingNow) > 0.002) {
      lightingNow += (lightingTarget - lightingNow) * (reduced ? 1 : 1 - Math.exp(-dt * 4));
      applyLighting(lightingNow); busy = true;
    } else if (lightingNow !== lightingTarget) { lightingNow = lightingTarget; applyLighting(lightingNow); busy = true; }
    if (Math.abs(explodeTarget - explodeNow) > 0.001) {
      explodeNow += (explodeTarget - explodeNow) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
      entries.forEach((e) => applyExplode(e.group)); busy = true;
    } else if (explodeNow !== explodeTarget) { explodeNow = explodeTarget; entries.forEach((e) => applyExplode(e.group)); busy = true; }
    busy = stepDoors(dt) || busy;
    busy = stepEntries(now, dt) || busy;
    busy = stepCamera(now) || busy;
    const moved = controls.update();
    if (busy || moved || dirty) {
      updateOverlays();
      renderer.render(scene, camera);
      updateLabel();
      dirty = false;
    }
  }

  function resize() {
    const p = canvas.parentElement || canvas;
    const w = Math.max(1, Math.round(p.clientWidth)), h = Math.max(1, Math.round(p.clientHeight));
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    applyInset();
    lineMats.forEach((m) => m.resolution.set(w, h));
    if (design && !userMoved) frameInstant(view);
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);
  resize();
  raf = requestAnimationFrame(tick);

  // ---------- API ----------
  const api = {
    setDesign(d) { setDesign(d); },
    select(id) { selectedId = id || null; updateOverlays(); invalidate(); },
    onSelect(cb) { selectCbs.push(cb); },
    onDrag(cb) { dragCbs.push(cb); },
    onViewChange(cb) { viewCbs.push(cb); },
    getView() { return view; },
    setView(v, seconds) { tweenToView(v === 'orbit' ? 'free' : v, seconds); },
    setExplode(v) { explodeTarget = Math.max(0, Math.min(1, v)); invalidate(); },
    setDoors(v) {
      doorsGlobal = v ? 1 : 0; doorOverride.clear();
      entries.forEach((e) => e.group.traverse((o) => { const d = o.userData.door || o.userData.drawer; if (d) d.target = doorsGlobal; }));
      invalidate();
    },
    setLighting(mode) { lightingTarget = mode === 'night' ? 1 : 0; invalidate(); },
    setErrors(ids) { errorIds = new Set(ids || []); updateOverlays(); invalidate(); },
    setViewInset(i) {
      inset = { top: (i && i.top) || 0, bottom: (i && i.bottom) || 0 };
      applyInset(); if (design && !userMoved) tweenToView(view, 0.4); invalidate();
    },
    screenshot() {
      const hiddenOverlay = overlay.visible;
      overlay.visible = false;
      const bg = scene.background;
      scene.background = new THREE.Color(cssColor('--paper-2', '#ebe3d6'));
      if (lightingTarget > 0.5) scene.background = new THREE.Color(0x14181f);
      if (label) label.style.visibility = 'hidden';
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/png');
      scene.background = bg;
      overlay.visible = hiddenOverlay;
      if (label) label.style.visibility = '';
      invalidate();
      return url;
    },
    frameNow(name) { frameInstant(name); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      controls.dispose();
      entries.forEach(destroyEntry); removing.forEach(destroyEntry);
      disposeGroup(roomGroup); clearOverlay();
      lib.dispose(); envTex.dispose(); pmrem.dispose(); renderer.dispose();
    },
    get debug() { return { camera, controls, entries, renderer }; }
  };
  return api;
}
