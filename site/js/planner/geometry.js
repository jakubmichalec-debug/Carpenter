// Planner v2 studio geometry: turns the studio layout (studio.js) into Three.js meshes. THREE is passed in, so this file
// imports no Three.js and Node can load it. Scene units are metres, the model's are cm. The studio is one smooth surface:
// a floor that curves up into the back wall (a cove), so there is no hard corner and the pieces read like a product shot.
import { STUDIO } from './studio.js';

export { buildPiece, pieceSignature, FRONT_MODES } from './piece-geometry.js';

const M = 0.01;
export const STUDIO_COLOR = '#e7e3db';

// What a rebuild of the studio depends on: its size. Moving a piece along the floor does not change it.
export function studioSignature(layout) {
  const f = layout.floor, w = layout.wall;
  return JSON.stringify([f.x0, f.x1, f.z1, w.height]);
}

// The floor and the back wall as one surface (a strip along x). Profile in (z, y): the floor from the front edge back to the
// cove, a quarter circle up, then the wall. The surface faces into the studio and is single-sided, so a camera behind the
// wall (or under the floor) sees through it. UVs are in metres.
export function buildStudio(layout, THREE, material = null) {
  const x0 = layout.floor.x0 * M, x1 = layout.floor.x1 * M, z1 = layout.floor.z1 * M, H = layout.wall.height * M;
  const R = Math.min(STUDIO.cove * M, H / 2, z1 / 2);
  const profile = [{ z: z1, y: 0, nz: 0, ny: 1 }];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = (-Math.PI / 2) - (Math.PI / 2) * (i / steps); // from straight down to straight left of the circle's centre
    const cz = R + R * Math.cos(a), cy = R + R * Math.sin(a);
    profile.push({ z: cz, y: cy, nz: -Math.cos(a), ny: -Math.sin(a) });
  }
  profile.push({ z: 0, y: H, nz: 1, ny: 0 });
  const pos = [], nrm = [], uv = [], idx = [];
  let run = 0;
  profile.forEach((p, i) => {
    if (i) run += Math.hypot(p.z - profile[i - 1].z, p.y - profile[i - 1].y);
    for (const x of [x0, x1]) {
      pos.push(x, p.y, p.z);
      nrm.push(0, p.ny, p.nz);
      uv.push(x, run);
    }
  });
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = material || new THREE.MeshStandardMaterial({ color: STUDIO_COLOR, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'studio';
  mesh.receiveShadow = true;
  mesh.userData = { part: 'studio', ownsMaterial: !material };
  return mesh;
}

// Frees the geometry and the materials a group owns. Textures belong to the material lib and are left alone.
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.userData && o.userData.ownsMaterial && o.material) o.material.dispose();
  });
}
