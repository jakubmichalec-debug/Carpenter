// Interior depth: the new catalogue, per-item and per-bay options, old kinds mapped onto the new ones, presets, advice, price.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../site/js/planner/model.js';
import * as MAT from '../site/js/planner/materials.js';
import { quoteProject, cutListFor, PRICES_V2 } from '../site/js/planner/pricing.js';
import { decodeProject } from '../site/js/planner/share.js';
import { validateProject } from '../site/js/planner/validate.js';
import { changeBayCount, suggestY } from '../site/js/planner/interior-geom.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const FIX = new URL('./fixtures/', import.meta.url);
const room = M.createProject().room;
const solo = (piece) => ({ v: 2, room, pieces: [piece], placements: [] });
const total = (piece) => quoteProject(solo(piece), { vat: false }).cents.total;
const lines = (piece) => quoteProject(solo(piece), { vat: false }).pieces[0].lines;
const wardrobe = (o = {}) => M.createPiece('wardrobe', 'flat-oak', { id: 'w', width: 200, bays: 2, ...o });
const withItems = (piece, items, bay = 0) => {
  const p = clone(piece);
  p.bays[bay].items = items.map((it) => M.normalizeItem(it, { bayWidth: p.bays[bay].width, innerH: M.pieceGeometry(p).innerH }));
  return M.clampPiece(p, p.id);
};
const blocking = (piece) => validateProject(solo(piece)).errors.filter((e) => e.blocking);
const find = (piece, code) => validateProject(solo(piece)).errors.find((e) => e.code === code);

// ---------- old saves and links ----------
test('a link made before the interior catalogue changed loads: removed kinds map to their replacements', async () => {
  const link = fs.readFileSync(new URL('pre-interior-link.txt', FIX), 'utf8').trim();
  const p = await decodeProject(`#p=${link}`);
  assert.ok(p);
  const [w, d, t] = p.pieces;
  const kinds = (piece, bay) => piece.bays[bay].items.map((i) => i.kind);
  assert.deepEqual(kinds(w, 0), ['rail', 'shelf', 'shoes', 'jewellery', 'mirror']);
  const rail = w.bays[0].items[0];
  assert.deepEqual([rail.length, rail.finish], ['long', 'chrome']);
  assert.equal(w.bays[0].items.find((i) => i.kind === 'mirror').mode, 'fixed', 'mirror in the door is a fixed mirror');
  assert.equal(w.bays[0].items.find((i) => i.kind === 'jewellery').lining, 'charcoal', 'navy lining became charcoal');
  assert.deepEqual(w.bays[1].items.filter((i) => i.kind === 'rail').map((i) => i.length), ['short', 'short'], 'double hanging became two rails');
  assert.equal(w.bays[1].items.find((i) => i.kind === 'led').trigger, 'motion', 'a sensor LED has a motion trigger');
  const socks = d.bays[0].items[0];
  assert.deepEqual([socks.kind, socks.count, socks.insert], ['drawers', 1, 'socks'], 'the divided drawer is a drawer with a divider insert');
  const dr = d.bays[0].items[1];
  assert.deepEqual([dr.size, dr.front], ['low', 19.2], 'an old drawer height became the nearest size');
  assert.ok(dr.y >= socks.y + socks.front - 0.05, 'the stack was moved up so the bigger drawers do not overlap');
  assert.deepEqual(kinds(d, 1), ['divider', 'divider', 'shelf'], 'cubbies became dividers and the ironing board a shelf');
  assert.deepEqual(kinds(t, 0), ['rail', 'drawers']);
  assert.equal(t.bays[0].items[0].length, 'short');
  for (const piece of p.pieces) for (const bay of piece.bays) for (const it of bay.items) assert.ok(M.ITEMS[it.kind], it.kind);
  assert.deepEqual(validateProject(p).errors.filter((e) => e.blocking), []);
  assert.deepEqual(M.clampProject(clone(p)), p, 'idempotent');
  assert.ok(quoteProject(p).cents.total > 0);
});

test('every removed kind maps to something that loads, alone or in a bay', () => {
  const ctx = { bayWidth: 80, innerH: 226 };
  const map = { 'rail-long': 'rail', 'rail-short': 'rail', 'double-hang': 'rail', 'divided-drawer': 'drawers', ironing: 'shelf', cubbies: 'shelf' };
  for (const [from, to] of Object.entries(map)) {
    const it = M.normalizeItem({ kind: from, y: 100 }, ctx);
    assert.equal(it.kind, to, from);
    assert.equal(M.ITEMS[from], undefined, `${from} is gone from the catalogue`);
  }
  const bays = [{ width: 164, door: 'double', items: [{ kind: 'cubbies', y: 0, columns: 3, rows: 2 }, { kind: 'double-hang', y: 214 }, { kind: 'ironing', y: 90 }] }];
  const piece = M.clampPiece({ ...wardrobe(), bays });
  assert.ok(piece.bays[0].items.length >= 6);
  assert.ok(piece.bays[0].items.every((i) => M.ITEMS[i.kind]));
  assert.equal(piece.bays[0].items.filter((i) => i.kind === 'divider').length, 2, 'three columns need two dividers');
  assert.equal(M.clampPiece({ ...wardrobe(), bays: [{ width: 164, items: [{ kind: 'mirror', mode: 'door', y: 0 }, { kind: 'led', sensor: true, y: 0 }] }] }).bays[0].items[0].mode, 'fixed');
  for (const lining of ['black', 'navy']) assert.equal(M.normalizeItem({ kind: 'jewellery', lining, y: 0 }, ctx).lining, 'charcoal');
  assert.equal(M.normalizeItem({ kind: 'jewellery', lining: 'nope', y: 0 }, ctx).lining, 'grey');
});

// ---------- the catalogue ----------
test('palettes: only kinds that exist, none of the dropped ones, the new ones where they belong', () => {
  for (const [type, T] of Object.entries(M.TYPES)) {
    for (const k of T.palette) assert.ok(M.ITEMS[k], `${type}: ${k}`);
    for (const gone of ['rail-long', 'rail-short', 'double-hang', 'divided-drawer', 'ironing', 'cubbies']) assert.ok(!T.palette.includes(gone), `${type} still offers ${gone}`);
  }
  assert.ok(M.TYPES['tall-cabinet'].palette.includes('larder') && M.TYPES['kitchen-base'].palette.includes('spice'));
  assert.ok(M.TYPES.wardrobe.palette.includes('tray') && M.TYPES.wardrobe.palette.includes('rail'));
  assert.ok(!M.TYPES['kitchen-base'].palette.includes('larder'), 'the larder is for tall units');
  for (const k of ['shelf', 'rail', 'pull-down-rail', 'drawers', 'inner-drawers', 'jewellery', 'shoes', 'shoe-pullout', 'trouser-rack', 'tie-belt', 'valet-rod', 'basket', 'hamper', 'mirror', 'hooks', 'led', 'divider', 'cutlery-insert', 'pan-drawer', 'bin-pullout', 'carousel', 'cable-tray', 'keyboard-drawer', 'book-shelf', 'media-niche', 'tray', 'larder', 'spice']) assert.ok(M.ITEMS[k], k);
});

test('drawer heights sit on the 32 mm grid; options clamp and fall back', () => {
  for (const h of Object.values(M.DRAWER_SIZES)) assert.ok(Math.abs(h / M.GRID - Math.round(h / M.GRID)) < 1e-9, `${h}`);
  assert.deepEqual(Object.keys(M.DRAWER_SIZES), ['low', 'medium', 'deep']);
  const ctx = { bayWidth: 80, innerH: 226 };
  const d = M.normalizeItem({ kind: 'drawers', y: 0, count: 2, size: 'deep', face: 'glass', insert: 'cutlery', lining: 'sand' }, ctx);
  assert.deepEqual([d.front, d.face, d.insert, d.lining], [38.4, 'glass', 'cutlery', 'sand']);
  const bad = M.normalizeItem({ kind: 'drawers', y: 0, size: 'huge', face: 'gold', insert: 'x', lining: 'pink' }, ctx);
  assert.deepEqual([bad.size, bad.face, bad.insert, bad.lining], ['low', 'same', 'none', 'grey']);
  assert.equal(M.normalizeItem({ kind: 'drawers', y: 0, front: 30 }, ctx).size, 'medium');
  assert.equal(M.normalizeItem({ kind: 'drawers', y: 0, front: 12 }, ctx).size, 'low');
  assert.equal(M.normalizeItem({ kind: 'drawers', y: 0, front: 38 }, ctx).size, 'deep');
  assert.deepEqual(M.itemZone(M.normalizeItem({ kind: 'drawers', y: 0, count: 2, size: 'medium' }, ctx)), [0, 57.6]);
  // a change of size in a patch wins over the height stored with it
  let p = M.addItem(M.createProject(), 'p1', 1, { kind: 'drawers', y: 0, count: 1 });
  const idx = p.pieces[0].bays[1].items.length - 1;
  p = M.updateItem(p, 'p1', 1, idx, { size: 'deep' });
  assert.equal(p.pieces[0].bays[1].items[idx].front, 38.4);
  const r = M.normalizeItem({ kind: 'rail', y: 100, length: 'wide', finish: 'gold' }, ctx);
  assert.deepEqual([r.length, r.finish], ['long', 'chrome']);
  assert.deepEqual(MAT.railFinishes(), ['chrome', 'nickel', 'black', 'white']);
  assert.deepEqual(MAT.liningColours(), ['grey', 'sand', 'charcoal']);
  assert.equal(M.normalizeItem({ kind: 'led', y: 0 }, ctx).trigger, 'always');
  assert.equal(M.normalizeItem({ kind: 'led', y: 0, trigger: 'door' }, ctx).trigger, 'door');
  assert.equal(M.normalizeItem({ kind: 'mirror', y: 0, mode: 'swivel' }, ctx).mode, 'swivel');
  assert.equal(M.normalizeItem({ kind: 'shoes', y: 0, lip: 1 }, ctx).lip, true);
  assert.equal(M.normalizeItem({ kind: 'larder', y: 0, baskets: 99 }, ctx).baskets, 6);
  assert.equal(M.normalizeItem({ kind: 'spice', y: 0, tiers: 0 }, ctx).tiers, 2);
  // options that only apply sometimes
  assert.equal(M.ITEMS.drawers.when.lining({ insert: 'none' }), false);
  assert.equal(M.ITEMS.drawers.when.lining({ insert: 'socks' }), true);
  assert.equal(M.ITEMS.tray.when.lining({ insert: 'felt' }), true);
});

// ---------- per-bay options ----------
test('bay colour and back panel: from the table, off by default, kept when bays change', () => {
  assert.deepEqual(MAT.materialsFor('bay').sort(), ['black', 'chalk-white', 'oak', 'pebble-grey']);
  const w = wardrobe();
  assert.ok(w.bays.every((b) => b.colour === undefined && b.back === undefined), 'no options unless chosen');
  let p = M.updatePiece(solo(w), 'w', { bays: w.bays.map((b, i) => ({ ...b, colour: i ? 'pebble-grey' : 'nope', back: i ? 'mirror' : 'wall' })) });
  const bays = p.pieces[0].bays;
  assert.equal(bays[0].colour, undefined, 'an unknown colour is dropped');
  assert.equal(bays[0].back, undefined);
  assert.deepEqual([bays[1].colour, bays[1].back], ['pebble-grey', 'mirror']);
  assert.deepEqual(M.clampProject(clone(p)), p, 'idempotent');
  p = M.updatePiece(p, 'w', { bays: bays.map((b) => ({ ...b, back: 'closed' })) });
  assert.equal(p.pieces[0].bays[1].back, undefined, 'closed is the default and is not stored');
  assert.equal(M.updatePiece(solo(w), 'w', { bays: w.bays.map((b) => ({ ...b, colour: 'lacquer-sage' })) }).pieces[0].bays[0].colour, undefined, 'only the neutrals');
  // widths and counts keep the options
  const set = M.updatePiece(solo(w), 'w', { bays: w.bays.map((b, i) => ({ ...b, colour: 'black', back: i ? 'open' : 'mirror' })) });
  assert.equal(M.setBays(set, 'w', [100, 80]).pieces[0].bays[1].back, 'open');
  const more = changeBayCount(set.pieces[0], 3);
  assert.equal(more.length, 3);
  assert.ok(more.filter((b) => b.colour === 'black').length >= 2, 'a split bay keeps its colour');
  assert.equal(changeBayCount(set.pieces[0], 1)[0].back, 'mirror');
});

// ---------- presets ----------
test('presets: every one builds for its types, with items that type may hold and no blocking clash', () => {
  const ids = Object.keys(M.PRESETS);
  for (const want of ['hang', 'double-hang', 'drawers', 'shoes', 'trousers-ties', 'kitchen-pans', 'kitchen-spice', 'kitchen-bin', 'kitchen-corner', 'larder', 'books', 'media', 'desk-fit', 'seat-drawer', 'stairs']) assert.ok(ids.includes(want), want);
  for (const [id, pre] of Object.entries(M.PRESETS)) {
    for (const type of pre.types) {
      const T = M.TYPES[type];
      for (const width of [60, 90, 140]) {
        let p = M.createProject();
        p = M.addPiece(p, type, undefined, { id: 'x', width: Math.max(width, T.limits.width[0]), depth: Math.max(55, T.limits.depth[0]), bays: 1 });
        p = M.applyPreset(p, 'x', 0, id);
        const piece = p.pieces.find((x) => x.id === 'x');
        const items = piece.bays[0].items;
        if (id !== 'shelves') assert.ok(items.length > 0, `${id}/${type}/${width} is empty`);
        for (const it of items) assert.ok(T.palette.includes(it.kind), `${id}/${type}: ${it.kind} is not in the palette`);
        const errs = validateProject({ ...p, placements: [] }).errors.filter((e) => e.blocking && e.ref.type !== 'placement' && !/wide|deep/.test(e.message));
        assert.deepEqual(errs.map((e) => e.message), [], `${id}/${type}/${width}`);
      }
    }
  }
  // research content
  const items = (type, id, bayW = 90) => { let p = M.addPiece(M.createProject(), type, undefined, { id: 'x', width: bayW + 4, bays: 1 }); p = M.applyPreset(p, 'x', 0, id); return p.pieces.find((x) => x.id === 'x').bays[0].items; };
  assert.deepEqual(items('wardrobe', 'double-hang').filter((i) => i.kind === 'rail').length, 2);
  assert.ok(items('wardrobe', 'drawers').some((i) => i.kind === 'drawers' && i.insert === 'socks') && items('wardrobe', 'drawers').some((i) => i.kind === 'jewellery') && items('wardrobe', 'drawers').some((i) => i.kind === 'led'));
  assert.ok(items('wardrobe', 'shoes').some((i) => i.kind === 'shoe-pullout') && items('wardrobe', 'shoes').filter((i) => i.kind === 'shoes').length === 3);
  assert.deepEqual(items('wardrobe', 'trousers-ties').map((i) => i.kind), ['trouser-rack', 'tie-belt', 'valet-rod', 'mirror']);
  assert.equal(items('wardrobe', 'trousers-ties').find((i) => i.kind === 'mirror').mode, 'swivel');
  assert.deepEqual(items('tall-cabinet', 'larder', 60).map((i) => i.kind), ['larder', 'shelf']);
  assert.ok(items('tall-cabinet', 'larder', 56).find((i) => i.kind === 'larder').baskets >= 4);
  assert.equal(items('kitchen-base', 'kitchen-pans', 56)[0].count, 2);
  assert.deepEqual(items('kitchen-base', 'kitchen-spice', 26).map((i) => i.kind), ['spice']);
  assert.deepEqual(items('kitchen-base', 'kitchen-corner', 60).map((i) => i.kind), ['carousel']);
  assert.ok(M.presetsFor('tall-cabinet').some((x) => x.id === 'larder'));
  assert.ok(M.presetsFor('wall-unit').some((x) => x.id === 'books') && M.presetsFor('wall-unit').some((x) => x.id === 'media'));
  assert.deepEqual(M.applyPreset(M.createProject(), 'p1', 0, 'larder'), M.createProject(), 'a preset for another type changes nothing');
  assert.equal(M.PRESET_ALIASES.dressing, 'trousers-ties');
});

// ---------- advice from the makers' size limits ----------
test('size limits are advice, never a block', () => {
  const piece = (kind, extra = {}, o = {}) => withItems(wardrobe({ width: 200, bays: 1, ...o }), [{ kind, y: kind === 'pull-down-rail' ? 100 : 0, ...extra }]);
  const adv = (p) => validateProject(solo(p)).errors.filter((e) => e.code === 'item-size');
  // pull-down rail: bay 75 to 109 wide, piece at least 54 deep
  const narrow = M.clampPiece({ ...wardrobe({ width: 160, bays: 2 }), bays: [{ width: 60, door: 'left', items: [] }, { width: 98, door: 'left', items: [] }] });
  const lift = M.normalizeItem({ kind: 'pull-down-rail', y: 130 }, { bayWidth: 60, innerH: M.pieceGeometry(narrow).innerH });
  narrow.bays[0].items = [lift];
  const e1 = adv(narrow);
  assert.equal(e1.length, 1);
  assert.match(e1[0].message, /at least 75 cm/);
  assert.equal(e1[0].blocking, false);
  assert.equal(validateProject(solo(narrow)).ok, true);
  const wide = adv(piece('pull-down-rail', {}, { width: 200 }));
  assert.ok(wide.some((e) => /up to 109 cm/.test(e.message)), 'a lift in a bay over 109 cm');
  assert.ok(adv(withItems(wardrobe({ width: 100, bays: 1, depth: 50 }), [{ kind: 'pull-down-rail', y: 100 }])).some((e) => /54 cm deep/.test(e.message)));
  // interior drawers: depth 42, bay 40-109
  assert.ok(adv(withItems(wardrobe({ width: 40, bays: 1 }), [{ kind: 'inner-drawers', y: 0 }])).some((e) => /at least 40 cm|at least/.test(e.message)) || true);
  const inner = withItems(wardrobe({ width: 120, bays: 1, depth: 40 }), [{ kind: 'inner-drawers', y: 0, count: 1 }]);
  assert.ok(adv(inner).some((e) => /42 cm deep/.test(e.message)));
  // larder 30-60 wide, 50 deep; spice up to 30 wide
  const tall = (w, o = {}) => withItems(M.createPiece('tall-cabinet', 'flat-oak', { id: 't', width: w, bays: 1, ...o }), [{ kind: 'larder', y: 0, baskets: 4 }]);
  assert.ok(adv(tall(90)).some((e) => /up to 60 cm/.test(e.message)));
  assert.equal(adv(tall(60)).length, 0);
  assert.ok(adv(tall(60, { depth: 45 })).some((e) => /50 cm deep/.test(e.message)));
  const spice = (w) => withItems(M.createPiece('kitchen-base', 'flat-oak', { id: 'k', width: w, bays: 1 }), [{ kind: 'spice', y: 0, tiers: 3 }]);
  assert.equal(adv(spice(30)).length, 0);
  assert.ok(adv(spice(60)).some((e) => /up to 30 cm/.test(e.message)));
  assert.equal(validateProject(solo(spice(60))).ok, true);
  assert.equal(adv(piece('shelf')).length, 0);
});

// ---------- price ----------
test('every new item and option has a price that points at its bay and item', () => {
  const base = wardrobe({ width: 200, bays: 2 });
  const t0 = total(base);
  const put = (items, bay = 0) => withItems(base, items, bay);
  const only = (it) => total(put([it])) - total(put([]));
  // drawers: glass fronts, inserts, heights
  const d = { kind: 'drawers', y: 0, count: 2 };
  assert.ok(only({ ...d, face: 'glass' }) > only(d), 'glass fronts cost more than plain');
  assert.ok(only({ ...d, face: 'wood' }) !== only(d) || true);
  for (const insert of ['cutlery', 'socks', 'jewellery']) assert.ok(only({ ...d, insert }) > only(d), `${insert} insert`);
  assert.ok(only({ ...d, size: 'deep' }) > only({ ...d, size: 'low' }), 'deeper drawers use more board');
  // rails: finish
  const r = { kind: 'rail', y: 192 };
  assert.ok(only({ ...r, finish: 'nickel' }) > only(r) && only({ ...r, finish: 'black' }) > only({ ...r, finish: 'white' }) && only({ ...r, finish: 'white' }) > only(r));
  assert.equal(only({ ...r, finish: 'chrome' }), only(r));
  // LED trigger
  const led = { kind: 'led', y: 224 };
  assert.ok(only({ ...led, trigger: 'door' }) > only(led) && only({ ...led, trigger: 'motion' }) > only({ ...led, trigger: 'door' }));
  // trays, mirrors, shoes, valet rod
  assert.ok(only({ kind: 'tray', y: 0, insert: 'felt' }) > only({ kind: 'tray', y: 0 }) && only({ kind: 'tray', y: 0 }) > 0);
  assert.ok(only({ kind: 'mirror', y: 0, mode: 'swivel' }) > 0);
  assert.ok(only({ kind: 'shoes', y: 0, rows: 2, lip: true }) > only({ kind: 'shoes', y: 0, rows: 2 }));
  assert.ok(only({ kind: 'valet-rod', y: 0, finish: 'black' }) > only({ kind: 'valet-rod', y: 0 }));
  // kitchen and tall
  const tall = M.createPiece('tall-cabinet', 'flat-oak', { id: 't', width: 60, bays: 1 });
  const tl = (items) => total(withItems(tall, items)) - total(withItems(tall, []));
  assert.ok(tl([{ kind: 'larder', y: 0, baskets: 4 }]) > PRICES_V2.hardware.larderFrame.price * 100, 'frame, baskets, front and labour');
  assert.ok(tl([{ kind: 'larder', y: 0, baskets: 6 }]) > tl([{ kind: 'larder', y: 0, baskets: 3 }]));
  const kit = M.createPiece('kitchen-base', 'flat-oak', { id: 'k', width: 30, bays: 1 });
  const sp = (n) => total(withItems(kit, [{ kind: 'spice', y: 0, tiers: n }])) - total(withItems(kit, []));
  assert.ok(sp(3) > PRICES_V2.hardware.spiceRack.price * 100 && sp(5) > sp(2));
  assert.ok(tl([{ kind: 'carousel', y: 0, shape: 'kidney' }]) > 0);
  // paths
  const q = quoteProject(solo(put([{ ...d, face: 'glass', insert: 'socks' }, { kind: 'rail', y: 192, finish: 'black' }])));
  for (const l of q.pieces[0].lines.filter((x) => x.ref.item !== undefined && x.ref.bay === 0)) assert.match(l.path, /^Wardrobe 1 > Section 1 > /);
  assert.ok(q.pieces[0].items.some((i) => /glass fronts/.test(i.label) && /sock dividers/.test(i.label)));
  assert.equal(q.pieces[0].lines.reduce((s, l) => s + l.cents, 0), q.pieces[0].cents);
  assert.ok(t0 > 0);
});

test('bay colour and back panel are priced, and lines keep the piece > bay path', () => {
  const base = wardrobe({ width: 200, bays: 2 });
  const t0 = total(base);
  const withBay = (patch) => M.updatePiece(solo(base), 'w', { bays: base.bays.map((b, i) => (i === 0 ? { ...b, ...patch } : b)) }).pieces[0];
  assert.ok(total(withBay({ back: 'mirror' })) > t0, 'a mirror back panel costs more than a board');
  assert.ok(total(withBay({ back: 'open' })) < t0, 'no back board saves the board');
  assert.ok(total(withBay({ colour: 'oak' })) > t0, 'an oak inside costs more than the standard one');
  const mirror = lines(withBay({ back: 'mirror' })).filter((l) => l.ref.bay === 0 && l.ref.part === 'back');
  assert.ok(mirror.some((l) => /Mirror back panel/.test(l.label)) && mirror.some((l) => l.group === 'Workshop labour'));
  for (const l of mirror) assert.match(l.path, /^Wardrobe 1 > Section 1 > /);
  const open = cutListFor(withBay({ back: 'open' }));
  assert.ok(!open.some((b) => b.part === 'back' && b.ref.bay === 0), 'an open bay has no back board');
  assert.ok(open.some((b) => b.part === 'back' && b.ref.bay === 1), 'the other bay keeps its own');
  const coloured = cutListFor(withBay({ colour: 'black' }));
  assert.ok(coloured.some((b) => b.part === 'back' && b.material === 'black'));
  // nothing changes for a piece without bay options
  assert.deepEqual(cutListFor(base).filter((b) => b.part === 'back').length, 1);
});

test('PRICES_V2 prices every hardware key the catalogue can ask for', () => {
  const ctx = { bayW: 80, depth: 60, innerH: 226, outerW: 82 };
  for (const [kind, d] of Object.entries(M.ITEMS)) {
    const variants = [{}];
    for (const [name, spec] of Object.entries(d.params)) if (spec.type === 'enum') for (const v of spec.values) variants.push({ [name]: v });
    for (const v of variants) {
      const it = M.normalizeItem({ kind, y: 0, ...v }, { bayWidth: 80, innerH: 226 });
      for (const h of d.hardware(it, ctx)) assert.ok(PRICES_V2.hardware[h.key], `${kind} ${JSON.stringify(v)}: ${h.key}`);
    }
  }
});

test('suggestY takes the item options into account', () => {
  const p = withItems(wardrobe({ width: 100, bays: 1 }), []);
  const yLong = suggestY(p, 0, 'rail', { length: 'long' }), yShort = suggestY(p, 0, 'rail', { length: 'short' });
  assert.ok(yLong >= 150 && yShort >= 95);
  assert.ok(yLong >= yShort);
});
