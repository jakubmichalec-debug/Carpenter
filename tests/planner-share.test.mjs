import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import * as M from '../site/js/planner/model.js';
import { validateProject } from '../site/js/planner/validate.js';
import { encodeProject, decodeProject, saveLocal, loadLocal, compactProject } from '../site/js/planner/share.js';
import { createDesign, addModule, updateRoom as v1UpdateRoom } from '../site/js/configurator/model.js';
import { encodeDesign } from '../site/js/configurator/share.js';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function largeProject() {
  let p = M.setTemplate(M.createProject(), 'bay', { width: 900, depth: 800 });
  const types = Object.keys(M.TYPES);
  for (let i = 0; i < 36; i++) {
    const t = types[i % types.length];
    p = M.addPiece(p, t, undefined, { bays: M.TYPES[t].limits.bays[1] });
    const id = p.pieces.at(-1).id;
    for (let b = 0; b < p.pieces.at(-1).bays.length; b++) {
      for (const kind of M.TYPES[t].palette.slice(0, 8)) p = M.addItem(p, id, b, { kind, y: 10 + b * 7 + i });
    }
    p = M.placePiece(p, id, M.TYPES[t].freestanding ? { mode: 'free', x: 200 + i * 10, z: 300, rotation: i * 10 } : { mode: 'wall', wallId: `w${(i % 8) + 1}`, offset: i * 3 });
  }
  for (let i = 0; i < 12; i++) p = M.addOpening(p, { type: i % 2 ? 'window' : 'radiator', wallId: `w${(i % 8) + 1}`, offset: i * 9, width: 40 });
  return p;
}

test('round trip: the default project survives encode and decode unchanged', async () => {
  const p = M.createProject();
  const s = await encodeProject(p);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.equal(s[0], 'z');
  assert.deepEqual(await decodeProject(s), p);
  assert.deepEqual(await decodeProject(`#p=${s}`), p);
  assert.deepEqual(await decodeProject(`p=${s}`), p);
  assert.deepEqual(await decodeProject(`https://example.test/planner.html#p=${s}`), p);
  assert.deepEqual(await decodeProject(`  #p=${s}\n`), p);
  assert.ok(s.length < 1200, `default link is ${s.length} characters`);
});

test('round trip: every template, every piece type, rich interiors', async () => {
  for (const id of Object.keys(M.TEMPLATE_PARAMS)) {
    let p = M.setTemplate(M.createProject(), id, {});
    p = M.addOpening(p, { type: 'window', wallId: 'w1', offset: 10, width: 50 });
    const q = await decodeProject(await encodeProject(p));
    assert.deepEqual(q, M.clampProject(p), id);
    assert.deepEqual(q.room.walls, p.room.walls);
    assert.deepEqual(q.room.slope, p.room.slope);
  }
  let p = M.createProject();
  for (const t of Object.keys(M.TYPES)) p = M.addPiece(p, t, undefined);
  p = M.updatePiece(p, 'p3', { style: 'glass-oak' });
  for (const kind of M.TYPES.wardrobe.palette) p = M.addItem(p, 'p1', 0, { kind, y: 33 });
  assert.deepEqual(await decodeProject(await encodeProject(p)), M.clampProject(p));
  // a free-form room (walls that no template makes) keeps its walls
  const custom = M.clampProject({ ...M.createProject(), room: { ...M.createProject().room, walls: [{ id: 'w1', x: 0, z: 0 }, { id: 'w2', x: 300, z: 20 }, { id: 'w3', x: 280, z: 300 }, { id: 'w4', x: 0, z: 310 }] } });
  assert.deepEqual((await decodeProject(await encodeProject(custom))).room.walls, custom.room.walls);
});

test('round trip: a large project', async () => {
  const p = largeProject();
  assert.equal(p.pieces.length, 38);
  const raw = JSON.stringify(compactProject(p));
  const s = await encodeProject(p);
  assert.ok(raw.length > 40000, `big project is ${raw.length} bytes of JSON`);
  assert.ok(s.length < raw.length / 4, `compressed to ${s.length}`);
  assert.deepEqual(await decodeProject(s), p);
  assert.equal(validateProject(await decodeProject(s)).errors.every((e) => typeof e.code === 'string'), true);
});

test('the template regenerates walls, so the link leaves them out', async () => {
  const p = M.createProject();
  const c = compactProject(p);
  assert.equal(c.room.walls, undefined);
  assert.ok(p.room.walls);
  const q = M.setTemplate(p, 'attic', {});
  const c2 = compactProject(q);
  assert.equal(c2.room.walls, undefined);
  assert.equal(c2.room.slope, undefined);
  assert.deepEqual(await decodeProject(await encodeProject(q)), q);
});

test('without CompressionStream the link is plain base64url with its own prefix', async () => {
  const saved = globalThis.CompressionStream;
  const savedD = globalThis.DecompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    const p = M.createProject();
    const plain = await encodeProject(p);
    assert.equal(plain[0], 'u');
    assert.match(plain, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(await decodeProject(plain), p);
    globalThis.CompressionStream = saved;
    const z = await encodeProject(p);
    assert.equal(z[0], 'z');
    assert.ok(z.length < plain.length);
    // a plain link also decodes where compression exists, and a deflated one where it does not exist fails cleanly
    assert.deepEqual(await decodeProject(plain), p);
    globalThis.DecompressionStream = undefined;
    assert.equal(await decodeProject(z), null);
  } finally {
    globalThis.CompressionStream = saved;
    globalThis.DecompressionStream = savedD;
  }
});

test('old v1 links still work: "#design=" and the bare configurator string', async () => {
  let d = v1UpdateRoom(createDesign(), { width: 500 });
  d = addModule(d, 'kitchen-base');
  d = addModule(d, 'island');
  const enc = encodeDesign(d);
  const expect = M.migrate(d);
  assert.deepEqual(await decodeProject(`#design=${enc}`), expect);
  assert.deepEqual(await decodeProject(`design=${enc}`), expect);
  assert.deepEqual(await decodeProject(enc), expect);
  assert.deepEqual(await decodeProject(`https://x.test/configurator.html#design=${enc}`), expect);
  const q = await decodeProject(encodeDesign(createDesign()));
  assert.equal(q.v, 2);
  assert.deepEqual(q.pieces.map((x) => x.type), ['wardrobe', 'desk']);
  assert.deepEqual(q.placements.map((x) => x.wallId), ['w1', 'w1']);
  // a v1 design inside a v2 envelope (JSON with v: 1) is migrated too
  const wrapped = 'u' + b64u(JSON.stringify(createDesign()));
  const w = await decodeProject(wrapped);
  assert.equal(w.v, 2);
  assert.equal(w.pieces.length, 2);
});

test('decoded projects are clamped', async () => {
  const evil = M.createProject();
  evil.pieces[0].width = 99999;
  evil.pieces[0].fronts.material = 'steel-black';
  evil.pieces[0].bays[0].items.push({ kind: 'shelf', y: 99999 }, { kind: 'bogus', y: 1 });
  evil.room.height = 5;
  evil.placements.push({ pieceId: 'ghost', mode: 'free', x: 1, z: 1 });
  const s = 'u' + b64u(JSON.stringify(evil));
  const p = await decodeProject(s);
  assert.equal(p.pieces[0].width, 500);
  assert.notEqual(p.pieces[0].fronts.material, 'steel-black');
  assert.equal(p.room.height, 220);
  assert.equal(p.placements.length, 2);
  assert.ok(p.pieces[0].bays[0].items.every((i) => M.ITEMS[i.kind]));
  assert.deepEqual(M.clampProject(JSON.parse(JSON.stringify(p))), p);
});

test('garbage input gives null and never throws', async () => {
  const bomb = 'z' + b64u(deflateRawSync(Buffer.alloc(5_000_000, 0x20)));
  const cases = [
    undefined, null, 0, 42, {}, [], true, '', ' ', '#', '#p=', 'p=', '#design=', 'z', 'u', 'e', 'zzzz', 'z!!!', 'u???', 'AAAA', 'hello world', '#p=not-valid-at-all!',
    'zAAAA', 'z' + b64u('definitely not deflate'), 'u' + b64u('not json'), 'u' + b64u('{}'), 'u' + b64u('[]'), 'u' + b64u('null'), 'u' + b64u('5'),
    'u' + b64u('{"v":2}'), 'u' + b64u('{"room":{},"pieces":"x"}'), 'u' + b64u('{"room":5,"pieces":[]}'), 'u' + b64u(JSON.stringify({ v: 1, room: {}, modules: 'x' })),
    'u' + b64u(Buffer.from([0xff, 0xfe, 0xfd, 0x80])), 'z' + b64u(deflateRawSync(Buffer.from('not json'))), 'z' + b64u(deflateRawSync(Buffer.from('{"v":2}'))),
    'e', 'eyJ', 'eyJ2IjoxfQ', '#design=!!!', '#design=eyJ2IjoxfQ', 'x' + 'A'.repeat(100), 'A'.repeat(300000), 'z' + 'A'.repeat(100000),
    bomb, '<script>alert(1)</script>', '../../etc/passwd', 'z' + b64u(Buffer.from(Array.from({ length: 200 }, (_, i) => (i * 37) % 256)))
  ];
  for (const c of cases) assert.equal(await decodeProject(c), null, String(typeof c === 'string' ? c.slice(0, 40) : c));
  // random byte strings in both modes
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
  for (let n = 0; n < 60; n++) {
    const bytes = Buffer.from(Array.from({ length: 5 + (n % 40) }, rnd));
    for (const prefix of ['z', 'u', 'e', '#p=z', '#p=u']) assert.equal(await decodeProject(prefix + b64u(bytes)), null);
  }
});

function fakeStorage(overrides = {}) {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), ...overrides };
}

test('saveLocal and loadLocal use gj.project.v2 and survive broken storage', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    // no storage at all
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
    assert.equal(saveLocal(M.createProject()), false);
    assert.equal(loadLocal(), null);
    // working storage
    const ls = fakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
    assert.equal(loadLocal(), null, 'empty');
    const p = largeProject();
    assert.equal(saveLocal(p), true);
    assert.deepEqual([...ls.map.keys()], ['gj.project.v2']);
    assert.deepEqual(loadLocal(), p);
    // an old v1 design saved under the key is migrated
    ls.setItem('gj.project.v2', JSON.stringify(createDesign()));
    assert.equal(loadLocal().pieces.length, 2);
    // corrupt data
    for (const bad of ['{', 'null', '5', '[]', '{"room":1}', 'undefined', '']) {
      ls.setItem('gj.project.v2', bad);
      assert.equal(loadLocal(), null, bad);
    }
    // storage that throws (private mode, blocked site data, quota)
    const boom = fakeStorage({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } });
    Object.defineProperty(globalThis, 'localStorage', { value: boom, configurable: true, writable: true });
    assert.equal(saveLocal(p), false);
    assert.equal(loadLocal(), null);
    // an accessor that throws
    Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true });
    assert.equal(saveLocal(p), false);
    assert.equal(loadLocal(), null);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
  }
});
