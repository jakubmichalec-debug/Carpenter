/*
 * Before/after renders for the Home page: ONE alcove, ONE camera, drawn twice offscreen (bare, then fitted with a built-in
 * oak shelving unit, desk and LED strip) and returned as two JPEG data URLs, so the slider compares identical views.
 * Reuses the hero's procedural oak grain and floor textures.
 */
import * as THREE from 'three';
import { grainCanvas, rotated, floorCanvas, rng } from './hero3d.js';

export function renderAlcovePair({ width = 1600, height = 1000 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const wallColor = new THREE.Color('#ece4d6');
  const scene = new THREE.Scene();
  scene.background = wallColor;
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 40);
  camera.position.set(0.55, 1.5, 5.9);
  camera.lookAt(0, 1.32, -0.2);

  const rand = rng(77);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const oakH = grainCanvas([196, 143, 84], 11);
  const oakV = rotated(oakH);
  const plyH = grainCanvas([236, 214, 172], 23);
  const plyV = rotated(plyH);
  const tex = (cv, rx, ry) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.repeat.set(rx, ry);
    t.offset.set(rand(), rand());
    return t;
  };
  const oak = (vertical, rx, ry) => new THREE.MeshStandardMaterial({ map: tex(vertical ? oakV : oakH, rx, ry), roughness: 0.55 });
  const ply = (vertical, rx, ry) => new THREE.MeshStandardMaterial({ map: tex(vertical ? plyV : plyH, rx, ry), roughness: 0.7 });
  const flat = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

  const add = (parent, w, h, d, x, y, z, mat, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  };

  /* ---- the alcove: opening x -1.2..1.2, height 2.6, depth 0.55 (back wall at z -0.55) */
  const room = new THREE.Group(); scene.add(room);
  const wallMat = flat(wallColor, 1);
  const D = 0.55; const AW = 1.2; const AH = 2.6;
  add(room, 20, 9, 0.02, 0, 3.5, -D - 0.01, wallMat, false);
  add(room, 9, 9, D, -AW - 4.5, 3.5, -D / 2, wallMat);
  add(room, 9, 9, D, AW + 4.5, 3.5, -D / 2, wallMat);
  add(room, 2 * AW, 9 - (AH - 0), D, 0, AH + (9 - AH) / 2 - 0.0, -D / 2, wallMat);
  const skirt = flat('#f7f2ea', 0.8);
  add(room, 2 * AW, 0.1, 0.018, 0, 0.05, -D + 0.009, skirt);
  add(room, 0.018, 0.1, D, -AW + 0.009, 0.05, -D / 2, skirt);
  add(room, 0.018, 0.1, D, AW - 0.009, 0.05, -D / 2, skirt);
  add(room, 8.8, 0.1, 0.018, -AW - 4.4, 0.05, 0.009, skirt);
  add(room, 8.8, 0.1, 0.018, AW + 4.4, 0.05, 0.009, skirt);
  const ft = new THREE.CanvasTexture(floorCanvas());
  ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.colorSpace = THREE.SRGBColorSpace; ft.repeat.set(5, 5); ft.anisotropy = aniso;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.78, color: '#f7efe4' }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 6.5 - D); floor.receiveShadow = true; scene.add(floor);

  /* ---- lights */
  scene.add(new THREE.HemisphereLight('#fff4e2', '#a78460', 1.15));
  const key = new THREE.DirectionalLight('#ffe6c4', 2.3);
  key.position.set(-3.2, 5, 5);
  key.target.position.set(0, 1.2, -0.3);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 16 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  /* ---- the built-in unit (hidden for the "before" render) */
  const unit = new THREE.Group(); scene.add(unit);
  const T = 0.025; const zc = -D + 0.25; const UD = 0.5; const x0 = -AW + 0.012; const x1 = AW - 0.012;
  const yB = 0.09; const yT = AH - 0.015;
  const oakSide = (h, x, y, z, d = UD) => add(unit, T, h, d, x, y, z, oak(true, d / 1.1, h / 1.1));
  const shelf = (xa, xb, y, d = UD - 0.02, mat) => add(unit, xb - xa, T, d, (xa + xb) / 2, y, -D + d / 2 + 0.01, mat || ply(false, (xb - xa) / 1.1, d / 1.1));
  // back panel, outer sides, plinth, top
  add(unit, x1 - x0, AH - 0.1, 0.012, 0, (AH + 0.1) / 2 - 0.005, -D + 0.006, ply(true, 2, 2));
  oakSide(AH - 0.0, x0 + T / 2, AH / 2, zc);
  oakSide(AH - 0.0, x1 - T / 2, AH / 2, zc);
  add(unit, x1 - x0, 0.09, 0.02, 0, 0.045, -0.1, flat('#3a2618', 0.7));
  add(unit, x1 - x0, T, UD, 0, AH - T / 2, zc, oak(false, 2.2, UD / 1.1));
  add(unit, x1 - x0, T, UD - 0.03, 0, yB + T / 2, zc - 0.01, ply(false, 2, 0.5));
  const xa = -0.44; const xb = 0.56;
  add(unit, T, yT - yB, UD - 0.02, xa, (yT + yB) / 2, zc, ply(true, 0.5, 2));
  add(unit, T, yT - yB, UD - 0.02, xb, (yT + yB) / 2, zc, ply(true, 0.5, 2));

  const palette = ['#c0765a', '#7d8b6a', '#efe6d4', '#4b3020', '#8aa0aa', '#d9a441', '#2f3a4a', '#a9b59a', '#b9844a'];
  const bookMats = palette.map((c) => flat(c, 0.8));
  const books = (xl, xr, yBase, maxH, z = -D + 0.22, fill = 0.8) => {
    let x = xl + 0.04; const end = xl + (xr - xl) * fill;
    while (x < end) {
      const w = 0.022 + rand() * 0.03; const h = Math.min(maxH, 0.17 + rand() * 0.14); const d = 0.16 + rand() * 0.08;
      const m = add(unit, w, h, d, x + w / 2, yBase + h / 2, z, bookMats[Math.floor(rand() * bookMats.length)]);
      if (rand() < 0.08) { m.rotation.z = -0.18; m.position.x += 0.03; x += 0.05; }
      x += w + 0.002;
    }
  };
  const object = (kind, x, y, z, s = 1) => {
    if (kind === 'vase') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.06 * s, 0.2 * s, 20), flat('#e6d6b8', 0.6)); m.position.set(x, y + 0.1 * s, z); m.castShadow = true; unit.add(m);
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 16, 12), flat('#6f8a5c', 0.9)); g.position.set(x, y + 0.27 * s, z); g.scale.set(1, 0.8, 1); g.castShadow = true; unit.add(g);
    } else if (kind === 'bowl') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat('#c0765a', 0.7)); m.position.set(x, y + 0.09 * s, z); m.castShadow = true; unit.add(m);
    } else {
      add(unit, 0.24 * s, 0.2 * s, 0.2 * s, x, y + 0.1 * s, z, flat('#d8c7a6', 0.9));
    }
  };

  // left tower
  const lyS = [0.52, 0.95, 1.38, 1.81, 2.24];
  lyS.forEach((y) => shelf(x0 + T, xa - T / 2, y));
  [yB + T, ...lyS].forEach((y, i) => {
    const top = (lyS[i] ?? AH - T) - T / 2; const gap = top - (y + T / 2);
    if (i === 2) { object('vase', x0 + 0.5, y + T / 2, -D + 0.25, 1); books(x0 + 0.05, x0 + 0.34, y + T / 2, gap - 0.04, undefined, 0.95); }
    else if (i === 4) { object('box', x0 + 0.22, y + T / 2, -D + 0.25, 1); object('box', x0 + 0.5, y + T / 2, -D + 0.25, 0.85); }
    else books(x0 + 0.02, xa, y + T / 2, gap - 0.04, undefined, 0.82);
  });
  // desk bay: desk top, shelves above, LED strip
  const deskY = 0.74;
  add(unit, xb - xa + 0.02, 0.04, 0.62, (xa + xb) / 2, deskY, -D + 0.31 + 0.01, oak(false, 1, 0.6));
  const ds = [1.32, 1.82, 2.24];
  ds.forEach((y) => shelf(xa + T / 2, xb - T / 2, y));
  books(xa + 0.02, xb, 1.32 + T / 2, 0.36, undefined, 0.5);
  object('bowl', xb - 0.2, 1.82 + T / 2, -D + 0.25, 1);
  books(xa + 0.3, xb - 0.3, 1.82 + T / 2, 0.34, undefined, 0.6);
  object('vase', xa + 0.2, 2.24 + T / 2, -D + 0.25, 1.1);
  const led = add(unit, xb - xa - 0.1, 0.008, 0.03, (xa + xb) / 2, 1.32 - T / 2 - 0.006, -D + 0.12, new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffd9a0', emissiveIntensity: 3 }), false);
  void led;
  const glow = new THREE.PointLight('#ffcf94', 2.6, 1.9, 2); glow.position.set((xa + xb) / 2, 1.22, -D + 0.25); unit.add(glow);
  // desk objects: lamp, laptop, plant
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 20), flat('#2a2622', 0.4)); lampBase.position.set(xa + 0.14, deskY + 0.03, -D + 0.2); unit.add(lampBase);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 8), flat('#2a2622', 0.4)); arm.position.set(xa + 0.14, deskY + 0.24, -D + 0.2); arm.rotation.z = 0.15; arm.castShadow = true; unit.add(arm);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.1, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#e6d6b8', roughness: 0.7, side: THREE.DoubleSide })); shade.position.set(xa + 0.2, deskY + 0.46, -D + 0.2); shade.rotation.z = 0.15; unit.add(shade);
  add(unit, 0.34, 0.016, 0.24, (xa + xb) / 2 + 0.1, deskY + 0.028, -D + 0.34, flat('#8b8f93', 0.4));
  const screen = add(unit, 0.34, 0.22, 0.01, (xa + xb) / 2 + 0.1, deskY + 0.14, -D + 0.22, flat('#2a2d31', 0.5)); screen.rotation.x = -0.2;
  object('vase', xb - 0.1, deskY + 0.02, -D + 0.3, 0.7);
  // right tower: closed oak doors below, open shelves above
  const ryS = [0.95, 1.38, 1.81, 2.24];
  ryS.forEach((y) => shelf(xb + T / 2, x1 - T, y));
  const dw = (x1 - T - (xb + T / 2)) / 2;
  [0, 1].forEach((i) => {
    const dx = xb + T / 2 + dw * (i + 0.5);
    add(unit, dw - 0.006, 0.84, 0.022, dx, yB + 0.43, -0.075, oak(true, 0.5, 0.8));
    add(unit, 0.012, 0.3, 0.012, dx + (i ? -1 : 1) * (dw / 2 - 0.05), 0.55, -0.05, flat('#2a2622', 0.4), false);
  });
  [0.95, 1.38, 1.81, 2.24].forEach((y, i) => {
    const top = (ryS[i + 1] ?? AH - T) - T / 2; const gap = top - (y + T / 2);
    if (i === 0) { books(xb + 0.04, x1, y + T / 2, gap - 0.05, undefined, 0.8); }
    else if (i === 1) { object('box', xb + 0.2, y + T / 2, -D + 0.25, 1); object('bowl', xb + 0.45, y + T / 2, -D + 0.25, 1); }
    else if (i === 2) books(xb + 0.04, x1, y + T / 2, gap - 0.05, undefined, 0.7);
    else object('vase', xb + 0.3, y + T / 2, -D + 0.25, 1.1);
  });

  /* ---- render twice */
  const out = {};
  unit.visible = false;
  renderer.render(scene, camera);
  out.before = canvas.toDataURL('image/jpeg', 0.9);
  unit.visible = true;
  renderer.render(scene, camera);
  out.after = canvas.toDataURL('image/jpeg', 0.9);
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  renderer.dispose();
  const gl = renderer.getContext();
  const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  return out;
}
