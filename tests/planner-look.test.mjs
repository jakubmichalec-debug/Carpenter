// The look of a piece: material table, defaults for old projects, styles, fit helpers, pricing of every option.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../site/js/planner/model.js';
import * as MAT from '../site/js/planner/materials.js';
import { quoteProject, cutListFor } from '../site/js/planner/pricing.js';
import { decodeProject } from '../site/js/planner/share.js';
import { validateProject } from '../site/js/planner/validate.js';
import { spaceCheck, fitToSpace, spaceMessage } from '../site/js/planner/fit.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const FIX = new URL('./fixtures/', import.meta.url);
const solo = (piece) => ({ v: 2, pieces: [piece] });
const total = (piece) => quoteProject(solo(piece), { vat: false }).cents.total;
const one = (type, style, o) => M.createPiece(type, style, { id: 'p1', ...o });

// ---------- the table ----------
test('material table: every entry is complete and every use has options', () => {
  for (const [id, m] of Object.entries(MAT.LIBRARY)) {
    assert.ok(m.label && m.family && m.kind && /^#[0-9a-f]{6}$/i.test(m.color), id);
    assert.ok(Number.isFinite(m.roughness) && Number.isFinite(m.metalness) && Number.isFinite(m.pricePerM2), id);
    assert.ok(Array.isArray(m.uses), id);
    assert.ok(MAT.FAMILIES[m.family], `${id}: unknown family ${m.family}`);
    for (const u of m.uses) assert.ok(MAT.USES.includes(u), `${id}: ${u}`);
    for (const f of MAT.finishesOf(id)) assert.ok(MAT.FINISHES[f], `${id}: ${f}`);
  }
  for (const use of MAT.USES) assert.ok(MAT.materialsFor(use).length > 0, use);
  assert.deepEqual(MAT.materialsFor('handle'), ['brass', 'handle-black', 'brushed', 'wood']);
  assert.equal(MAT.materialsFor('front').filter((id) => MAT.LIBRARY[id].family === 'painted').length, 8);
});

test('old material ids map to the closest new entry', () => {
  const map = { 'lacquer-white': 'chalk-white', 'lacquer-sage': 'sage', 'lacquer-charcoal': 'black', 'lacquer-clay': 'clay', terrazzo: 'quartz-white', 'steel-black': 'handle-black' };
  for (const [from, to] of Object.entries(map)) assert.equal(MAT.canonicalId(from), to);
  assert.equal(MAT.resolveMaterial('lacquer-sage', 'front'), 'sage');
  assert.equal(MAT.resolveMaterial('ash', 'front'), 'ash');
  assert.equal(MAT.resolveMaterial('no-such-thing', 'front', 'walnut'), 'walnut');
  assert.equal(MAT.resolveMaterial('no-such-thing', 'front'), MAT.firstFor('front'));
  assert.equal(MAT.resolveMaterial('oak', 'glass'), MAT.firstFor('glass'), 'a use the material is not for');
});

// ---------- old projects ----------
test('a share link made before the look options still loads, with the look it had', async () => {
  const link = fs.readFileSync(new URL('pre-look-link.txt', FIX), 'utf8').trim();
  const p = await decodeProject(`#p=${link}`);
  assert.ok(p, 'decodes');
  assert.equal(p.pieces.length, 4);
  const [wardrobe, desk, kitchen, shelf] = p.pieces;
  assert.equal(wardrobe.style, 'glass-oak');
  assert.deepEqual([wardrobe.fronts.kind, wardrobe.look.design], ['glass', 'glass']);
  assert.equal(wardrobe.fronts.material, 'oak');
  assert.deepEqual([desk.look.design, desk.look.edge, desk.look.top, desk.look.gap, desk.look.upper, desk.interior], ['slab', 'square', 'flush', 3, null, null]);
  assert.equal(kitchen.fronts.material, 'sage', 'lacquer-sage became sage');
  assert.equal(kitchen.worktop, 'oak');
  assert.equal(shelf.fronts.handle, 'knob');
  assert.equal(shelf.plinth, 0);
  assert.equal(shelf.look.base, 'none');
  for (const x of p.pieces) {
    assert.ok(M.HANDLES.includes(x.fronts.handle) && MAT.isUsable(x.fronts.material, 'front') && MAT.isUsable(x.carcass.material, 'carcass'));
    assert.equal(x.look.base, x.plinth > 0 ? 'recessed' : 'none');
  }
  assert.deepEqual(validateProject(p).errors.filter((e) => e.blocking), []);
  assert.deepEqual(M.clampProject(clone(p)), p, 'idempotent');
  assert.ok(quoteProject(p).cents.total > 0);
});

test('a saved project from before loads through clampProject, old ids and all', () => {
  const old = JSON.parse(fs.readFileSync(new URL('pre-look-project.json', FIX), 'utf8'));
  old.pieces[0].fronts.material = 'lacquer-white';
  old.pieces[0].carcass.material = 'ash';           // no longer a carcass option
  old.pieces[1].fronts.handle = 'groove';           // is now the routed finger pull
  old.pieces[2].worktop = 'terrazzo';
  const p = M.clampProject(old);
  assert.equal(p.pieces[0].fronts.material, 'chalk-white');
  assert.ok(MAT.isUsable(p.pieces[0].carcass.material, 'carcass'));
  assert.equal(p.pieces[1].fronts.handle, 'edge');
  assert.equal(p.pieces[2].worktop, 'quartz-white');
  assert.ok(MAT.handleFinishes().includes(p.pieces[0].fronts.handleFinish));
});

test('clampPiece fills every look field from nothing and survives rubbish', () => {
  for (const type of Object.keys(M.TYPES)) {
    const p = M.clampPiece({ type, style: 'nope', look: 'x', fronts: 5, interior: 7 });
    assert.ok(p, type);
    assert.ok(M.DESIGNS.includes(p.look.design) && M.EDGES.includes(p.look.edge) && M.BASES.includes(p.look.base) && M.TOPS.includes(p.look.top));
    assert.ok(M.GAPS.includes(p.look.gap));
    assert.ok(p.look.split > 0 && p.look.split <= p.height);
    assert.deepEqual(M.clampPiece(clone(p), p.id), p, `${type} is idempotent`);
  }
  const p = M.clampPiece({ type: 'wardrobe', look: { design: 'cane', edge: 'bevel', gap: 9, top: 'crown', base: 'wheels', legs: 'gold', split: 'high', gables: 1 }, fronts: { handle: 'leather', handleSize: 'huge', doorHandle: 'x' } });
  assert.equal(p.look.design, 'shaker', 'cane became shaker');
  assert.deepEqual([p.look.edge, p.look.gap, p.look.top, p.look.base, p.look.legs, p.look.gables], ['square', 3, 'flush', 'recessed', 'wood', true]);
  assert.deepEqual([p.fronts.handle, p.fronts.handleSize, p.fronts.doorHandle], ['bar', 'medium', 'auto']);
});

test('glass fronts and the glass design go together; a base needs a height', () => {
  let p = M.createProject();
  p = M.updatePiece(p, 'p1', { look: { design: 'glass' } });
  assert.equal(p.pieces[0].fronts.kind, 'glass');
  p = M.updatePiece(p, 'p1', { look: { design: 'ribbed' } });
  assert.deepEqual([p.pieces[0].fronts.kind, p.pieces[0].look.design], ['hinged', 'ribbed']);
  p = M.updatePiece(p, 'p1', { fronts: { kind: 'glass' } });
  assert.equal(p.pieces[0].look.design, 'glass');
  p = M.updatePiece(p, 'p1', { plinth: 0 });
  assert.equal(p.pieces[0].look.base, 'none');
  p = M.updatePiece(p, 'p1', { plinth: 12 });
  assert.equal(p.pieces[0].look.base, 'recessed');
  assert.equal(M.clampPiece({ type: 'kitchen-wall', look: { base: 'legs', top: 'cornice' }, plinth: 10 }).look.base, 'none');
  assert.equal(M.clampPiece({ type: 'kitchen-base', look: { top: 'cornice' } }).look.top, 'flush', 'worktop types take no crown');
});

// ---------- styles ----------
test('styles: a dozen on offer, all from the table, every one builds for every type', () => {
  const shown = Object.keys(M.STYLES).filter((id) => !M.STYLES[id].legacy);
  assert.ok(shown.length >= 12 && shown.length <= 14, `${shown.length} styles`);
  for (const id of Object.keys(M.STYLES)) {
    const s = M.STYLES[id];
    assert.ok(MAT.isMaterial(s.fronts.material) && MAT.isUsable(s.fronts.material, 'front'), id);
    assert.ok(MAT.isUsable(s.carcass, 'carcass'), `${id} carcass`);
    if (s.interior && s.interior.material !== 'front') assert.ok(MAT.isUsable(s.interior.material, 'interior'), id);
    if (s.look.upper) assert.ok(MAT.isUsable(s.look.upper.material, 'front'), id);
    assert.ok(M.HANDLES.includes(s.fronts.handle), id);
    assert.ok(MAT.handleFinishes().includes(s.fronts.handleFinish), `${id} handle finish`);
    for (const type of Object.keys(M.TYPES)) {
      const p = M.createPiece(type, id, { id: 'p1' });
      assert.equal(p.style, id);
      assert.deepEqual(validateProject({ v: 2, room: M.createProject().room, pieces: [p] }).errors.filter((e) => e.blocking), [], `${id} ${type}`);
    }
  }
  assert.equal(M.createPiece('wardrobe', 'ink-oak').look.upper.material, 'oak');
  assert.equal(M.createPiece('wardrobe', 'midcentury-walnut').look.base, 'legs');
  assert.equal(M.createPiece('wardrobe', 'white-minimal').fronts.handle, 'push');
  assert.equal(M.createPiece('wardrobe', 'glass-oak').fronts.kind, 'glass');
});

test('a style whose material leaves the table falls back instead of breaking', () => {
  const removed = {};
  for (const id of ['clay', 'brass', 'walnut', 'glass-clear']) { removed[id] = MAT.LIBRARY[id]; delete MAT.LIBRARY[id]; }
  try {
    for (const id of Object.keys(M.STYLES)) {
      for (const type of ['wardrobe', 'kitchen-base', 'desk']) {
        const p = M.createPiece(type, id, { id: 'p1' });
        assert.ok(MAT.isUsable(p.fronts.material, 'front'), `${id}: front ${p.fronts.material}`);
        assert.ok(MAT.isUsable(p.carcass.material, 'carcass') && MAT.handleFinishes().includes(p.fronts.handleFinish), id);
        assert.ok(MAT.isUsable(p.look.glass, 'glass'), id);
        if (p.look.upper) assert.ok(MAT.isUsable(p.look.upper.material, 'front'));
        if (p.worktop) assert.ok(MAT.isUsable(p.worktop, 'top'));
        assert.ok(total(p) > 0);
      }
    }
    // a saved piece that names a removed material loads with the style's instead
    const p = M.clampPiece({ type: 'wardrobe', style: 'clay-oak', fronts: { material: 'clay', handleFinish: 'brass' }, look: { glass: 'glass-clear' } });
    assert.ok(MAT.isUsable(p.fronts.material, 'front'));
    assert.notEqual(p.fronts.material, 'clay');
  } finally {
    Object.assign(MAT.LIBRARY, removed);
  }
});

test('updatePiece with a style replaces the whole look; a patch keeps the rest', () => {
  let p = M.createProject();
  p = M.updatePiece(p, 'p1', { style: 'green-shaker' });
  const w = p.pieces[0];
  assert.deepEqual([w.fronts.material, w.look.design, w.fronts.handle, w.fronts.handleFinish], ['dark-green', 'shaker', 'cup', 'brass']);
  p = M.updatePiece(p, 'p1', { look: { edge: 'round' }, style: 'custom' });
  assert.deepEqual([p.pieces[0].look.edge, p.pieces[0].look.design, p.pieces[0].style], ['round', 'shaker', 'custom']);
  p = M.updatePiece(p, 'p1', { interior: { material: 'front' } });
  assert.equal(p.pieces[0].interior.material, 'front');
  p = M.updatePiece(p, 'p1', { interior: null });
  assert.equal(p.pieces[0].interior, null);
  p = M.updatePiece(p, 'p1', { look: { upper: { material: 'walnut' } } });
  assert.equal(p.pieces[0].look.upper.material, 'walnut');
});

// ---------- geometry rules the 3D and the quote share ----------
test('base, top and sizes: pieceGeometry follows the look', () => {
  const p = one('wardrobe', 'flat-oak');
  assert.equal(M.pieceGeometry(p).cap, 0);
  const crown = { ...p, look: { ...p.look, top: 'cornice' } };
  const g = M.pieceGeometry(crown);
  assert.equal(g.cap, 5);
  assert.equal(g.Hc, M.pieceGeometry(p).Hc - 5);
  assert.equal(M.legCount(100), 4);
  assert.equal(M.legCount(200), 6);
  assert.equal(M.legCount(300), 8);
  for (const [type, list] of Object.entries(M.SIZE_PRESETS)) {
    const L = M.TYPES[type].limits;
    assert.ok(list.length >= 3, type);
    for (const s of list) assert.ok(s.width >= L.width[0] && s.width <= L.width[1] && s.height >= L.height[0] && s.height <= L.height[1] && s.depth >= L.depth[0] && s.depth <= L.depth[1], `${type} ${s.label}`);
  }
  const hung = M.clampPiece({ type: 'kitchen-wall', elevation: 150 });
  assert.equal(hung.elevation, 150);
  assert.equal(M.clampPiece({ type: 'wardrobe', elevation: 50 }).elevation, 0, 'type limits hold');
  let pr = M.createProject();
  pr = M.addPiece(pr, 'kitchen-wall', 'sage-kitchen', { elevation: 130 });
  assert.equal(pr.pieces.find((x) => x.id === 'p3').elevation, 130, 'a wall unit hangs at its own height');
});

test('roleSegments splits a stretch of front at the two-tone line', () => {
  const p = one('wardrobe', 'ink-oak');
  const split = p.look.split;
  const parts = M.roleSegments(10, 240, p);
  assert.deepEqual(parts.map((x) => x.role), ['front', 'upper']);
  assert.ok(parts[0].hi < split && parts[1].lo > split);
  assert.deepEqual(M.roleSegments(10, 240, one('wardrobe', 'flat-oak')).map((x) => x.role), ['front']);
  assert.deepEqual(M.roleSegments(split + 5, 240, p).map((x) => x.role), ['upper']);
  assert.deepEqual(M.roleSegments(10, split - 5, p).map((x) => x.role), ['front']);
});

test('surfacesOf: inside follows the sides, the fronts or its own material', () => {
  let p = one('wardrobe', 'flat-oak');
  assert.deepEqual(M.surfacesOf(p).interior, M.surfacesOf(p).carcass);
  p = M.updatePiece(solo(p), 'p1', { interior: { material: 'front' } }).pieces[0];
  assert.equal(M.surfacesOf(p).interior.material, p.fronts.material);
  p = M.updatePiece(solo(p), 'p1', { interior: { material: 'black' } }).pieces[0];
  assert.equal(M.surfacesOf(p).interior.material, 'black');
});

// ---------- fit to the space ----------
test('space check: a piece fits when it is no wider than the wall and no taller than the ceiling', () => {
  let p = M.createProject();
  assert.deepEqual(spaceCheck(p.pieces[0]), { has: false, fits: true, tooWide: false, tooTall: false, overWidth: 0, overHeight: 0, space: null });
  assert.equal(spaceMessage(p.pieces[0]), null);
  assert.equal(fitToSpace(p.pieces[0]), null, 'nothing to fit without a space');
  // p1 is a 170 x 240 cm wardrobe
  const check = (space, patch = {}) => spaceCheck(M.updatePiece(p, 'p1', { space, ...patch }).pieces[0]);
  assert.equal(check({ width: 170, height: 240 }).fits, true, 'exactly as big as the space');
  assert.equal(check({ width: 300, height: 260 }).fits, true);
  let c = check({ width: 160, height: 250 });
  assert.deepEqual([c.fits, c.tooWide, c.tooTall, c.overWidth], [false, true, false, 10]);
  c = check({ width: 200, height: 230 });
  assert.deepEqual([c.fits, c.tooWide, c.tooTall, c.overHeight], [false, false, true, 10]);
  c = check({ width: 100, height: 200 });
  assert.deepEqual([c.overWidth, c.overHeight], [70, 40]);
  assert.equal(check({ width: null, height: 250 }).fits, true, 'either side can be left empty');
  assert.equal(check({ width: 100, height: null }).tooWide, true);
  assert.match(spaceMessage(M.updatePiece(p, 'p1', { space: { width: 160, height: 230 } }).pieces[0]), /10 cm too wide and 10 cm too tall/);
  assert.equal(spaceMessage(M.updatePiece(p, 'p1', { space: { width: 200, height: 250 } }).pieces[0]), 'This fits the space you have.');
  // a piece that hangs above the floor counts its height from the floor
  const hung = M.createPiece('kitchen-wall', undefined, { id: 'p9', elevation: 150, space: { width: 300, height: 260 } });
  assert.equal(spaceCheck(hung).fits, true);
  const low = M.createPiece('kitchen-wall', undefined, { id: 'p9', elevation: 150, space: { width: 300, height: 200 } });
  assert.equal(spaceCheck(low).overHeight, 150 + low.height - 200);
});

test('fit to the space: the width fills the wall, the height stays under the ceiling, both within the type limits', () => {
  const p = M.createProject();
  const fit = (space, patch = {}) => { const pc = M.updatePiece(p, 'p1', { space, ...patch }).pieces[0]; return [pc, fitToSpace(pc)]; };
  let [pc, r] = fit({ width: 220, height: 250 });
  assert.deepEqual([r.width, r.height, r.exact, r.changed], [220, 249, true, true]);
  const fitted = M.updatePiece(M.createProject(), 'p1', { space: pc.space, width: r.width, height: r.height }).pieces[0];
  assert.equal(spaceCheck(fitted).fits, true);
  assert.equal(fitted.width, 220);
  assert.equal(fitted.height, 249);
  assert.equal(fitToSpace(fitted).changed, false, 'fitting twice changes nothing more');
  // scribe strips close the gap at the top, so there is more room to leave
  [pc, r] = fit({ width: 220, height: 250 }, { look: { scribe: true } });
  assert.equal(r.height, 248);
  // the limits of the type win, and say so
  const L = M.TYPES.wardrobe.limits;
  [pc, r] = fit({ width: 40, height: 100 });
  assert.deepEqual([r.width, r.height, r.exact], [L.width[0], L.height[0], false]);
  [pc, r] = fit({ width: 1400, height: 450 });
  assert.deepEqual([r.width, r.height, r.exact], [L.width[1], L.height[1], false]);
  // only the width given: the height stays as it is
  [pc, r] = fit({ width: 190, height: null });
  assert.deepEqual([r.width, r.height], [190, 240]);
  // the sections still add up after the size changes
  const out = M.updatePiece(p, 'p1', { width: r.width, height: r.height }).pieces[0];
  assert.equal(out.bays.reduce((s, b) => s + b.width, 0), M.pieceGeometry(out).innerW);
  assert.deepEqual(validateProject({ v: 2, pieces: [out] }).errors.filter((e) => e.blocking), []);
});

test('validate: a piece that does not fit its space is advice, never a block', () => {
  const p = M.updatePiece(M.createProject(), 'p1', { space: { width: 150, height: 230 } });
  const v = validateProject(p);
  const codes = v.errors.map((e) => e.code).sort();
  assert.deepEqual(codes.filter((c) => c.startsWith('space-')), ['space-too-tall', 'space-too-wide']);
  assert.equal(v.ok, true);
  assert.ok(v.errors.filter((e) => e.code.startsWith('space-')).every((e) => !e.blocking && e.ref.type === 'piece' && e.ref.id === 'p1'));
  const fine = M.updatePiece(M.createProject(), 'p1', { space: { width: 400, height: 300 } });
  assert.deepEqual(validateProject(fine).errors, []);
});

// ---------- price ----------
const lineOf = (piece, re) => quoteProject(solo(piece), { vat: false }).pieces[0].lines.filter((l) => re.test(l.label));

test('every option has a plausible price and every line points at its piece', () => {
  const base = one('wardrobe', 'flat-oak');
  const up = (patch) => M.updatePiece(solo(base), 'p1', patch).pieces[0];
  const t0 = total(base);
  assert.ok(total(up({ look: { design: 'shaker' } })) > t0, 'shaker costs more than slab');
  assert.ok(total(up({ look: { design: 'ribbed' } })) > total(up({ look: { design: 'shaker' } })), 'ribs take the longest');
  assert.ok(total(up({ look: { edge: 'round' } })) > total(up({ look: { edge: 'chamfer' } })) && total(up({ look: { edge: 'chamfer' } })) > t0);
  assert.ok(total(up({ fronts: { material: 'walnut' } })) > t0);
  assert.ok(total(up({ fronts: { material: 'chalk-white' } })) < t0, 'paint is cheaper than oak veneer');
  assert.ok(total(up({ fronts: { material: 'birch-ply' } })) < total(up({ fronts: { material: 'chalk-white' } })));
  assert.ok(total(up({ fronts: { handle: 'knob' } })) < t0 && total(up({ fronts: { handle: 'cup' } })) > t0);
  assert.ok(total(up({ fronts: { handleFinish: 'brass' } })) > t0);
  assert.ok(total(up({ fronts: { handleSize: 'long' } })) > total(up({ fronts: { handleSize: 'short' } })));
  assert.ok(total(up({ look: { top: 'cornice' } })) > t0 && total(up({ look: { top: 'overhang' } })) > t0);
  assert.ok(total(up({ look: { scribe: true } })) > t0);
  assert.ok(total(up({ look: { gables: true } })) > t0);
  assert.ok(total(up({ look: { upper: { material: 'walnut' } } })) > total(up({ look: { upper: { material: 'oak' } } })), 'a second material and extra doors');
  assert.ok(total(up({ interior: { material: 'oak' } })) > t0);
  assert.ok(total(up({ look: { base: 'legs' }, plinth: 15 })) !== t0);
  assert.equal(total(up({ look: { gap: 2 } })), t0, 'the gap is free');
  assert.ok(lineOf(up({ look: { base: 'legs' } }), /legs/i).length >= 1);
  assert.equal(lineOf(up({ look: { base: 'legs' } }), /plinth feet/i).length, 0, 'legs replace the plinth feet');
  assert.ok(lineOf(up({ look: { base: 'legs', legs: 'brass' } }), /metal legs/i)[0].cents > lineOf(up({ look: { base: 'legs', legs: 'wood' } }), /wooden legs/i)[0].cents * 0.5);
  assert.ok(lineOf(up({ look: { top: 'cornice' } }), /crown/i).length >= 1);
  assert.ok(lineOf(up({ look: { design: 'shaker' } }), /shaker/i)[0].cents > 0);
  // sums and paths
  const q = quoteProject(solo(up({ look: { design: 'shaker', upper: { material: 'walnut' }, top: 'cornice', scribe: true, gables: true, base: 'legs' }, interior: { material: 'black' } })));
  assert.equal(q.pieces[0].lines.reduce((s, l) => s + l.cents, 0), q.pieces[0].cents);
  assert.equal(q.lines.reduce((s, l) => s + l.cents, 0), q.cents.subtotal);
  for (const l of q.pieces[0].lines) assert.ok(l.ref.pieceId === 'p1' && l.path.startsWith('Wardrobe 1'), l.path);
});

test('cut list: the box and the inside are priced as boards, fronts as veneer', () => {
  const p = one('wardrobe', 'flat-oak');
  const boards = cutListFor(p);
  assert.ok(boards.every((b) => b.role === 'front' || b.role === 'board'));
  assert.ok(boards.filter((b) => b.part === 'side').every((b) => b.role === 'board'));
  assert.ok(boards.filter((b) => b.part === 'door').every((b) => b.role === 'front'));
  const gabled = cutListFor(M.updatePiece(solo(p), 'p1', { look: { gables: true } }).pieces[0]);
  assert.equal(gabled.find((b) => b.part === 'side').material, p.fronts.material);
  const two = cutListFor(M.updatePiece(solo(p), 'p1', { look: { upper: { material: 'walnut' } } }).pieces[0]);
  assert.ok(two.some((b) => b.part === 'door' && b.material === 'walnut') && two.some((b) => b.part === 'door' && b.material === 'oak'));
  const m2 = (list, mat) => list.filter((b) => b.part === 'door' && b.material === mat).reduce((s, b) => s + (b.w * b.h * b.qty) / 1e4, 0);
  assert.ok(Math.abs(m2(two, 'walnut') + m2(two, 'oak') - m2(boards, 'oak')) < 0.15, 'the split keeps the door area');
});
