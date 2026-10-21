import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign, addModule, updateModule, updateRoom, validate } from '../site/js/configurator/model.js';
import { encodeDesign, decodeDesign, saveLocal, loadLocal } from '../site/js/configurator/share.js';

test('encode produces a URL-safe string', () => {
  const s = encodeDesign(createDesign());
  assert.equal(typeof s, 'string');
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.ok(s.length < 2000);
});

test('roundtrip: default design', () => {
  const d = createDesign();
  assert.deepEqual(decodeDesign(encodeDesign(d)), d);
});

test('roundtrip: rich design with every type, custom room and unicode-free ids', () => {
  let d = updateRoom(createDesign(), { width: 700, height: 300, depth: 500, floor: 'tile-floor', wall: 'sage' });
  for (const t of ['kitchen-base', 'kitchen-wall', 'tall-cabinet', 'island', 'shelving', 'table', 'bench', 'window-seat']) d = addModule(d, t);
  d = updateModule(d, 'm1', { doors: 'sliding', led: true, handle: 'groove', interior: 'mixed', front: 'lacquer-clay' });
  d = updateModule(d, 'm2', { worktop: 'terrazzo', plinth: true });
  const back = decodeDesign(encodeDesign(d));
  assert.deepEqual(back, d);
  assert.equal(validate(back).errors.length, validate(d).errors.length);
});

test('roundtrip survives hash-style input and whitespace', () => {
  const d = createDesign();
  const s = encodeDesign(d);
  assert.deepEqual(decodeDesign(`#design=${s}`), d);
  assert.deepEqual(decodeDesign(` ${s}\n`), d);
});

test('decode passes data through the model clamps', () => {
  const d = createDesign();
  const evil = JSON.parse(JSON.stringify(d));
  evil.room.width = 99999;
  evil.modules[0].width = 99999;
  evil.modules[0].front = 'unobtainium';
  evil.modules[1].type = 'rocket';
  const enc = Buffer.from(JSON.stringify(evil)).toString('base64url');
  const out = decodeDesign(enc);
  assert.equal(out.room.width, 900);
  assert.equal(out.modules.length, 1, 'unknown type dropped');
  assert.ok(out.modules[0].x + out.modules[0].width <= 900);
  assert.equal(out.modules[0].front, 'oak');
});

test('garbage input returns null', () => {
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  for (const bad of [
    undefined, null, 42, {}, [], '', '   ', 'not base64 !!!', '%%%', '!!!!', 'abc', 'e30',
    b64('{'), b64('null'), b64('[]'), b64('"str"'), b64('42'), b64({}), b64({ room: {}, modules: 'x' }), b64({ modules: [] }), 'A'.repeat(70000)
  ]) {
    assert.equal(decodeDesign(bad), null, String(bad).slice(0, 30));
  }
  assert.equal(decodeDesign(Buffer.from([0xff, 0xfe, 0x00, 0x80]).toString('base64url')), null);
});

test('saveLocal / loadLocal: no localStorage means false / null, never throws', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined');
  assert.equal(saveLocal(createDesign()), false);
  assert.equal(loadLocal(), null);
});

test('saveLocal / loadLocal: roundtrip under gj.design.v1, errors are swallowed', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k)
  };
  try {
    assert.equal(loadLocal(), null);
    const d = addModule(createDesign(), 'bench');
    assert.equal(saveLocal(d), true);
    assert.ok(store.has('gj.design.v1'));
    assert.deepEqual(loadLocal(), d);
    store.set('gj.design.v1', 'garbage!!');
    assert.equal(loadLocal(), null);
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    assert.equal(saveLocal(d), false);
    assert.equal(loadLocal(), null);
  } finally {
    delete globalThis.localStorage;
  }
});
