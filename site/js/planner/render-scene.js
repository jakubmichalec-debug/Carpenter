// The scene the path tracer renders. It is made from the same builders as the live viewer (buildFloor, buildWall,
// buildPiece), so the two cannot disagree about what the room holds. On top of that it adds what a photograph needs:
// a ceiling when the camera stands inside the room, the HDRI for daylight, a glowing ceiling panel and the LED strips
// as emissive surfaces.
// Browser only (three is passed in). Loaded on demand by render.js.
import { buildFloor, buildWall, buildPiece, disposeGroup } from './geometry.js';
import { wallsOf, ceilingHeightAt } from './model.js';
import { ceilingPolygons, placedTransform, insideRoom } from './review-logic.js';

const M = 0.01;
const SUN_ELEVATION = (38 * Math.PI) / 180;

export function buildRenderScene({ project, THREE, lib, fronts = 'closed', camera, hiddenWalls = [], hdr = null, background = '#f6f6f3' }) {
  const room = project.room;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'render-root';
  scene.add(root);

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const ceilingY = ceilingHeightAt(room, camPos.x / M, camPos.z / M) * M;
  const interior = !!camera.isPerspectiveCamera && insideRoom(room, camPos.x / M, camPos.z / M) && camPos.y < ceilingY - 0.05;
  const hide = new Set(hiddenWalls);
  const dbg0 = (typeof window !== 'undefined' && window.gjRenderDebug) || {}; // TEMP

  // ----- room -----
  root.add(buildFloor(room, THREE, lib));
  const wallGroups = [];
  room.walls.forEach((c, i) => {
    if (hide.has(c.id) || dbg0.noWalls) return;
    const g = buildWall(room, i, THREE, lib);
    g.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.transparent && m.opacity < 0.5) { m.opacity = 0.1; m.depthWrite = true; } // window glass: clear enough for the sun
        if (o.name === 'slope') { m.emissiveIntensity = 0; }                         // the viewer lifts it with a glow; light does that here
      }
    });
    if (dbg0.noGlass) g.traverse((o) => { if (o.parent && /^window:/.test(o.parent.name) && o.isMesh && o.material.transparent) o.visible = false; });
    wallGroups.push(g);
    root.add(g);
  });

  // ----- ceiling (inside views only; the slope plane of an attic is replaced by it) -----
  const extras = []; // geometries and materials made here
  if (interior && !dbg0.noCeiling) {
    for (const g of wallGroups) g.traverse((o) => { if (o.name === 'slope') o.visible = false; });
    const mat = lib.plain('#f3f1ec', 0.96);
    for (const poly of ceilingPolygons(room)) {
      const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x * M, -p.z * M)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, ceilingHeightAt(room, pos.getX(i) / M, pos.getZ(i) / M) * M);
      const idx = geo.index;
      for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); } // face down
      idx.needsUpdate = true;
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'ceiling';
      root.add(mesh);
      extras.push(geo);
    }
  }
  // looking in from outside there is no ground: the room floats on the page colour, like the live view

  // ----- pieces -----
  const ledMeshes = [];
  for (const pl of dbg0.noPieces ? [] : project.placements || []) {
    const piece = (project.pieces || []).find((p) => p.id === pl.pieceId);
    const tr = piece && placedTransform(project, pl);
    if (!tr) continue;
    const wrapper = new THREE.Group();
    wrapper.name = `placed:${piece.id}`;
    wrapper.position.set(tr.x, 0, tr.z);
    wrapper.rotation.y = tr.rotY;
    const lift = new THREE.Group();
    lift.position.y = tr.lift;
    const inner = buildPiece(piece, THREE, lib, { fronts });
    lift.add(inner);
    wrapper.add(lift);
    root.add(wrapper);
    inner.traverse((o) => { if (o.isMesh && o.userData.part === 'led') ledMeshes.push(o); });
  }
  if (dbg0.noBump) root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.bumpMap = null; }); }); // TEMP
  if (dbg0.noMaps) root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.bumpMap = null; m.map = null; }); }); // TEMP
  scene.updateMatrixWorld(true);

  // ----- light -----
  // Area lights (RectAreaLight) are left out on purpose: in three-gpu-pathtracer 0.0.23 they left patches of the room black
  // when tried here, while emissive surfaces render cleanly. So the light comes from the HDRI (daylight at the windows, and
  // all of the light when looking in from outside), a glowing ceiling panel, and the glowing LED strips.
  const glowers = [];
  const ledMat = lib.led();
  ledMat.emissiveIntensity = 9;
  if (interior) {
    let cx = 0, cz = 0;
    for (const c of room.walls) { cx += c.x; cz += c.z; }
    cx /= room.walls.length; cz /= room.walls.length;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0dc, emissiveIntensity: 5, roughness: 1, side: THREE.FrontSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), panelMat);
    panel.rotation.x = Math.PI / 2; // faces down
    panel.position.set(cx * M, ceilingHeightAt(room, cx, cz) * M - 0.02, cz * M);
    panel.name = 'ceiling-lamp';
    root.add(panel);
    glowers.push(panel.geometry, panelMat);
  }
  const lights = [];

  // ----- sky -----
  // The HDRI is an indoor photograph: it is the daylight at the windows, so it lights the room from inside and is what you
  // see out of a window. Looking in from outside it is turned up.
  if (hdr && !dbg.noEnv) {
    scene.environment = hdr;
    scene.environmentIntensity = interior ? 1 : 2.2;
    if (interior) { scene.background = hdr; scene.backgroundIntensity = 1; scene.backgroundBlurriness = 0.02; }
  }
  if (!scene.background) { scene.background = new THREE.Color(background); scene.backgroundIntensity = 1.3; }

  return {
    scene, interior, ledCount: ledMeshes.length, lightCount: lights.length,
    dispose() {
      disposeGroup(root);
      root.traverse((o) => { if (o.isMesh && o.userData && o.userData.part === 'floor' && o.material) o.material.dispose(); });
      extras.forEach((e) => e.dispose());
      glowers.forEach((e) => e.dispose());
      lib.dispose();
      scene.clear();
    }
  };
}
