import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { quoteProject } from '../site/js/planner/pricing.js';
import { validateProject } from '../site/js/planner/validate.js';
import { encodeProject, decodeProject } from '../site/js/planner/share.js';
import * as R from '../site/js/planner/review-logic.js';

const room = () => ({ v: 2, pieces: [] });
function sample() {
  let p = room();
  p = M.addPiece(p, 'wardrobe', 'flat-oak', { id: 'w' });
  p = M.setBays(p, 'w', 3);
  p = M.addItem(p, 'w', 2, { kind: 'led', y: 230 });
  p = M.addPiece(p, 'table', 'oak-table', { id: 't' });
  return p;
}

// ---------- money and time ----------
test('formatEuro: two decimals, grouping, euro sign', () => {
  assert.equal(R.formatEuro(1234.5), '€1,234.50');
  assert.equal(R.formatEuro(0), '€0.00');
  assert.equal(R.formatEuro(13837.72), '€13,837.72');
  assert.equal(R.formatEuro(-5), '-€5.00');
  assert.equal(R.formatEuro('nonsense'), '€0.00');
});
test('formatEuroWhole and formatDuration', () => {
  assert.equal(R.formatEuroWhole(8000.4), '€8,000');
  assert.equal(R.formatDuration(7.4), '7 s');
  assert.equal(R.formatDuration(61), '1 min 01 s');
  assert.equal(R.formatDuration(-3), '0 s');
});

// ---------- quote view ----------
test('quoteView adds up: sections, pieces and totals match the quote to the cent', () => {
  for (const vat of [true, false]) {
    const p = sample();
    const q = quoteProject(p, { vat });
    const v = R.quoteView(q, p);
    assert.equal(v.pieces.length, 2);
    for (const pc of v.pieces) {
      const src = q.pieces.find((x) => x.id === pc.id);
      assert.equal(pc.cents, src.cents);
      assert.equal(pc.sections.reduce((s, x) => s + x.cents, 0), pc.cents, `${pc.label} sections`);
      assert.equal(pc.groups.reduce((s, x) => s + x.cents, 0), pc.cents, `${pc.label} groups`);
      for (const sec of pc.sections) assert.equal(sec.rows.reduce((s, r) => s + r.cents, 0), sec.cents);
    }
    assert.equal(v.pieces.reduce((s, x) => s + x.cents, 0) + v.totals.lines.find((l) => l.label === 'Design fee').cents, q.cents.subtotal);
    assert.equal(v.totals.lines.reduce((s, l) => s + l.cents, 0), v.totals.subtotalCents);
    assert.equal(v.totals.subtotalCents + v.totals.vatCents, v.totals.totalCents);
    assert.equal(v.totals.totalCents, q.cents.total);
    assert.equal(v.totals.vatOn, vat);
    assert.equal(v.totals.leadTimeWeeks, q.leadTimeWeeks);
  }
});
test('quoteView: the wardrobe has a section per bay with item rows, labelled like the interior', () => {
  const p = sample();
  const v = R.quoteView(quoteProject(p), p);
  const w = v.pieces.find((x) => x.id === 'w');
  assert.deepEqual(w.sections.map((s) => s.title), ['The piece', 'Section 1', 'Section 2', 'Section 3']);
  assert.equal(w.label, 'Wardrobe 1');
  assert.equal(w.size, '240 × 240 × 60 cm');
  assert.ok(w.sections[2].rows.some((r) => /drawers/.test(r.label)));
  assert.ok(w.sections[3].rows.some((r) => /LED/.test(r.label)));
  assert.ok(w.sections[0].rows.some((r) => r.label === 'Carcass boards'));
  assert.ok(w.groups.map((g) => g.label).includes('Fitting'));
  assert.ok(w.sections[1].rows.every((r) => r.cents > 0));
});
test('quoteView: materials sorted by area, every piece named', () => {
  let p = sample();
  p = M.addPiece(p, 'desk', 'oak-desk', { id: 'd' });
  const v = R.quoteView(quoteProject(p), p);
  assert.deepEqual(v.pieces.map((x) => x.label), ['Wardrobe 1', 'Table 1', 'Desk 1']);
  assert.equal('unplaced' in v, false);
  assert.ok(v.pieces.every((x) => !('placed' in x)));
  const areas = v.materials.map((m) => m.m2);
  assert.deepEqual(areas, [...areas].sort((a, b) => b - a));
  assert.ok(v.materials.every((m) => m.label && m.label !== m.id.toUpperCase()));
});
test('quoteView on an empty project is empty but valid', () => {
  const p = room();
  const v = R.quoteView(quoteProject(p), p);
  assert.deepEqual(v.pieces, []);
  assert.equal(v.totals.totalCents, 0);
});

// ---------- blockers ----------
test('sendBlockers: only an empty project stops it; there is nothing to place', () => {
  const p0 = room();
  const b0 = R.sendBlockers(p0, validateProject(p0).errors);
  assert.deepEqual(b0.map((b) => b.code), ['no-pieces']);
  assert.equal(b0[0].step, 0);
  const p1 = M.addPiece(p0, 'wardrobe', 'flat-oak', { id: 'w' });
  assert.deepEqual(R.sendBlockers(p1, validateProject(p1).errors), []);
  assert.deepEqual(R.sendBlockers(sample(), validateProject(sample()).errors), []);
});
test('sendBlockers: a blocking problem points to the step that fixes it; a space that is too small only advises', () => {
  const p = M.addPiece(room(), 'wardrobe', 'flat-oak', { id: 'w' });
  const tight = M.updatePiece(p, 'w', { space: { width: 100, height: 200 } });
  assert.deepEqual(R.sendBlockers(tight, validateProject(tight).errors), []);
  assert.ok(R.adviceList(validateProject(tight).errors).some((a) => a.code === 'space-too-wide'));
  const bad = JSON.parse(JSON.stringify(p));
  bad.pieces[0].bays[0].items.push({ kind: 'rail', y: 3, length: 'long' }, { kind: 'rail', y: 3, length: 'long' });
  const list = R.sendBlockers(bad, validateProject(bad).errors);
  assert.ok(list.length > 0);
  const clash = list.find((b) => b.ref && b.ref.type === 'item');
  assert.ok(clash, 'an item clash is reported');
  assert.equal(clash.step, 1);
  assert.equal(clash.label, 'Fix in Interior');
  assert.equal(clash.pieceId, 'w');
});
test('issueStep maps refs to the step that fixes them: 0 Furniture, 1 Interior', () => {
  assert.equal(R.issueStep({ type: 'piece', id: 'p' }), 0);
  assert.equal(R.issueStep({ type: 'bay', pieceId: 'p', bay: 0 }), 0);
  assert.equal(R.issueStep({ type: 'item', pieceId: 'p', bay: 0, index: 0 }), 1);
  assert.equal(R.issueStep(null), 0);
  assert.deepEqual(R.STEP_NAMES, ['Furniture', 'Interior']);
});
test('adviceList keeps only non-blocking items', () => {
  const errors = [{ code: 'a', message: 'x', blocking: true }, { code: 'space-too-wide', message: 'Too wide', blocking: false, ref: { type: 'piece', id: 'p' } }];
  const a = R.adviceList(errors);
  assert.equal(a.length, 1);
  assert.equal(a[0].message, 'Too wide');
});

// ---------- render settings ----------
test('renderSettings: desktop gets the full size, 256 samples and 60 s', () => {
  const s = R.renderSettings({ aspect: 16 / 9 });
  assert.equal(s.cls, 'desktop');
  assert.equal(s.width, 1600);
  assert.equal(s.height, 900);
  assert.equal(s.maxSamples, 256);
  assert.equal(s.maxSeconds, 60);
  assert.equal(s.capped, false);
  assert.equal(s.note, '');
  assert.deepEqual(s.stages.map((x) => x.scale), [0.25, 0.5, 1]);
  assert.equal(s.stages[2].samples, 256);
});
test('renderSettings: phones and weak GPUs are capped at 960 px and 96 samples, and the note says so', () => {
  const cases = [
    { pointerCoarse: true, screenWidth: 390, screenHeight: 844 },
    { deviceMemory: 2 },
    { software: true },
    { maxTextureSize: 4096 },
    { pointerCoarse: true, screenWidth: 1024, screenHeight: 768, cores: 4 }
  ];
  for (const env of cases) {
    const s = R.renderSettings({ aspect: 1.5, ...env });
    assert.equal(s.cls, 'weak', JSON.stringify(env));
    assert.ok(s.width <= 960 && s.height <= 960);
    assert.equal(s.maxSamples, 96);
    assert.ok(s.maxSeconds <= 60);
    assert.ok(s.capped);
    assert.match(s.note, /960 px/);
    assert.match(s.note, /96 samples/);
    assert.ok(s.reasons.length > 0);
  }
  // a tablet with a big screen and a fast CPU is not weak
  assert.equal(R.renderSettings({ pointerCoarse: true, screenWidth: 1180, screenHeight: 820, cores: 8, deviceMemory: 8 }).cls, 'desktop');
});
test('renderSettings: aspect is kept, long edge capped, sizes even, override applies', () => {
  const tall = R.renderSettings({ aspect: 0.5 }); // clamped to 0.6
  assert.ok(tall.height <= 1600 && tall.width < tall.height);
  assert.equal(tall.width % 2, 0);
  assert.equal(tall.height % 2, 0);
  const wide = R.renderSettings({ aspect: 5 });
  assert.ok(Math.abs(wide.width / wide.height - 2.2) < 0.02);
  const o = R.renderSettings({ aspect: 2 }, { width: 321, maxSamples: 5, maxSeconds: 9 });
  assert.equal(o.width, 320);
  assert.equal(o.height, 160);
  assert.equal(o.maxSamples, 5);
  assert.equal(o.maxSeconds, 9);
  assert.deepEqual(o.tiles, [1, 1]);
  assert.equal(o.stages[2].samples, 5);
});
test('renderSettings: denoise is on unless a test turns it off', () => {
  assert.equal(R.renderSettings({}).denoise, true);
  assert.equal(R.renderSettings({}, { width: 320 }).denoise, true);
  assert.equal(R.renderSettings({}, { denoise: false }).denoise, false);
});
test('renderSettings: big images are tiled so one frame stays short', () => {
  assert.deepEqual(R.renderSettings({ aspect: 16 / 9 }).tiles, [2, 2]); // 1600x900
  assert.deepEqual(R.renderSettings({ aspect: 16 / 9 }, { width: 800 }).tiles, [1, 1]);
  const weak = R.renderSettings({ software: true, aspect: 16 / 9 });
  assert.deepEqual(weak.tiles, [2, 2]);
});
test('progressFraction follows whichever limit is closer', () => {
  assert.equal(R.progressFraction({ samples: 0, maxSamples: 100, elapsed: 0, maxSeconds: 60 }), 0);
  assert.equal(R.progressFraction({ samples: 50, maxSamples: 100, elapsed: 3, maxSeconds: 60 }), 0.5);
  assert.equal(R.progressFraction({ samples: 5, maxSamples: 100, elapsed: 45, maxSeconds: 60 }), 0.75);
  assert.equal(R.progressFraction({ samples: 500, maxSamples: 100, elapsed: 1, maxSeconds: 60 }), 1);
});

// ---------- the whole path: a link opens the same quote ----------
test('a share link decodes to a project whose quote equals the original', async () => {
  const p = sample();
  const enc = await encodeProject(p);
  const back = await decodeProject(`#p=${enc}`);
  assert.equal(quoteProject(back).total, quoteProject(p).total);
  assert.deepEqual(back.pieces.map((x) => M.pieceLabel(back, x.id)), ['Wardrobe 1', 'Table 1']);
});
