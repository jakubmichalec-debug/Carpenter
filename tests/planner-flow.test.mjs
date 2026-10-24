import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import * as F from '../site/js/planner/flow.js';
import { materialsFor } from '../site/js/planner/materials.js';

const withPiece = (type) => {
  const p = M.addPiece(M.createBlankProject(), type);
  return { project: p, piece: p.pieces[0] };
};

test('the flow has 14 questions in the five chapters, each asked once', () => {
  assert.equal(F.QUESTIONS.length, 14);
  assert.equal(new Set(F.IDS).size, 14);
  assert.deepEqual(F.CHAPTERS, ['Room', 'Furniture', 'Interior', 'Place', 'Review']);
  const per = F.CHAPTERS.map((_, i) => F.QUESTIONS.filter((q) => q.chapter === i).map((q) => q.id));
  assert.deepEqual(per, [
    ['shape', 'size', 'openings', 'finish'],
    ['type', 'style', 'look', 'piece-size'],
    ['inside', 'arrange'],
    ['place', 'more'],
    ['review', 'send']
  ]);
  for (const q of F.QUESTIONS) {
    assert.ok(q.title.length > 3 && q.help.length > 3 && q.next, q.id);
    assert.ok(q.help.length <= 60, `${q.id}: one short line of help`);
  }
  // chapters never go backwards along the list
  const ch = F.QUESTIONS.map((q) => q.chapter);
  assert.deepEqual(ch, [...ch].sort((a, b) => a - b));
});

test('every question names the editor sections it shows, in the step it belongs to', () => {
  const SECTIONS = [['shape', 'size', 'walls', 'finish'], ['pieces', 'style', 'look', 'size'], ['layout', 'add', 'options', 'item'], ['pieces', 'position', 'clashes'], ['quote', 'share']];
  for (const q of F.QUESTIONS) {
    for (const flags of [{}, { openings: true, arrange: true, lookMore: true }]) {
      const v = F.view(q.id, flags);
      assert.equal(v.step, q.chapter, q.id);
      for (const s of v.sections) assert.ok(SECTIONS[v.step].includes(s), `${q.id}: ${s}`);
    }
    const ex = F.expertSection(q.id);
    assert.ok(SECTIONS[q.chapter].includes(ex), `${q.id} has a tab in the tabbed view`);
  }
  // an answer opens the editor behind it
  assert.deepEqual(F.view('openings', {}).sections, []);
  assert.deepEqual(F.view('openings', { openings: true }).sections, ['walls']);
  assert.deepEqual(F.view('look', {}).sections, []);
  assert.deepEqual(F.view('look', { lookMore: true }).sections, ['look']);
  assert.deepEqual(F.view('arrange', {}).sections, []);
  assert.deepEqual(F.view('place').sections, ['position', 'clashes']);
});

test('next and back walk the questions in order', () => {
  const all = F.activeIds({ hasInside: true });
  assert.equal(all.length, 14);
  let id = 'shape';
  const seen = [id];
  while (F.nextId(id, { hasInside: true })) { id = F.nextId(id, { hasInside: true }); seen.push(id); }
  assert.deepEqual(seen, F.IDS);
  assert.equal(F.prevId('shape', {}), null);
  assert.equal(F.nextId('send', {}), null);
  for (let i = 1; i < F.IDS.length; i++) assert.equal(F.prevId(F.IDS[i], {}), F.IDS[i - 1]);
});

test('a piece with no inside skips the two Interior questions, both ways', () => {
  const ctx = { hasInside: false };
  assert.equal(F.activeIds(ctx).length, 12);
  assert.equal(F.nextId('piece-size', ctx), 'place');
  assert.equal(F.prevId('place', ctx), 'piece-size');
  assert.equal(F.firstOfChapter(2, ctx), null);
  assert.equal(F.firstOfChapter(2, { hasInside: true }), 'inside');
  // asked about a question that is not asked: still finds its neighbours
  assert.equal(F.nextId('inside', ctx), 'place');
  assert.equal(F.prevId('arrange', ctx), 'piece-size');
  assert.equal(F.position('place', ctx).n, 9);
  assert.equal(F.position('place', ctx).total, 12);
});

test('hasInside follows the type: a table has none, a wardrobe has', () => {
  assert.equal(F.hasInside(withPiece('table').piece), false);
  assert.equal(F.hasInside(withPiece('wardrobe').piece), true);
  assert.equal(F.hasInside(withPiece('desk').piece), true);
  assert.equal(F.hasInside(null), false);
});

test('position and the spoken announcement', () => {
  const p = F.position('openings', { hasInside: true });
  assert.deepEqual(p, { n: 3, total: 14, k: 3, of: 4, chapter: 0 });
  assert.equal(F.announcement('openings', { hasInside: true }), 'Question 3 of 14: Are there doors, windows or radiators?');
  assert.equal(F.chapterProgress('size', {}), 'Question 2 of 4');
  assert.equal(F.chapterProgress('arrange', { hasInside: true }), 'Question 2 of 2');
  assert.equal(F.chapterProgress('send', {}), 'Question 2 of 2');
  assert.equal(F.position('send', { hasInside: true }).n, 14);
  assert.equal(F.byId('shape').title, 'Hi! What shape is your room?');
});

test('settle: a question that cannot be asked yet becomes the one that comes first', () => {
  const none = { pieces: 0, placed: 0, hasInside: true };
  for (const id of ['style', 'look', 'piece-size', 'inside', 'arrange', 'place', 'more', 'review', 'send']) assert.equal(F.settle(id, none), 'type', id);
  for (const id of ['shape', 'size', 'openings', 'finish', 'type']) assert.equal(F.settle(id, none), id, id);
  const some = { pieces: 1, placed: 0, hasInside: true };
  assert.equal(F.settle('style', some), 'style');
  assert.equal(F.settle('send', some), 'place', 'nothing stands in the room yet');
  assert.equal(F.settle('send', { ...some, placed: 1 }), 'send');
  assert.equal(F.settle('inside', { ...some, hasInside: false }), 'place');
  assert.equal(F.settle('nonsense', some), 'shape');
});

test('landing: saved projects and links open on the review when something stands in the room', () => {
  const blank = M.createBlankProject();
  assert.equal(F.landing(blank), 'type');
  const piece = M.addPiece(blank, 'wardrobe');
  assert.equal(F.landing(piece), 'place');
  assert.equal(F.landing(M.createProject()), 'review', 'the example project has pieces in place');
  assert.equal(F.landing(null), 'type');
});

test('an outside step change maps to that step’s question', () => {
  assert.equal(F.questionForStep(0, {}), 'shape');
  assert.equal(F.questionForStep(0, { openingId: 'o1' }), 'openings');
  assert.equal(F.questionForStep(1, { hasPiece: true }), 'style');
  assert.equal(F.questionForStep(1, { hasPiece: true, starting: true }), 'type');
  assert.equal(F.questionForStep(1, { hasPiece: false }), 'type');
  assert.equal(F.questionForStep(2, {}), 'inside');
  assert.equal(F.questionForStep(2, { itemSelected: true }), 'arrange');
  assert.equal(F.questionForStep(3, {}), 'place');
  assert.equal(F.questionForStep(4, {}), 'review');
});

test('openingsAnswer: a room with openings is a Yes; otherwise what was said', () => {
  const blank = M.createBlankProject();
  assert.equal(F.openingsAnswer(blank, undefined), null);
  assert.equal(F.openingsAnswer(blank, null), null);
  assert.equal(F.openingsAnswer(blank, true), true);
  assert.equal(F.openingsAnswer(blank, false), false);
  const door = M.addOpening(blank, { type: 'door', wallId: blank.room.walls[0].id, offset: 50, width: 90, height: 210, bottom: 0 });
  assert.ok(door.room.openings.length > 0);
  assert.equal(F.openingsAnswer(door, false), true);
});

test('commonFronts keeps the short list in order, only what is in stock, and the piece’s own colour', () => {
  const all = materialsFor('front');
  const list = F.commonFronts(all, 'oak');
  assert.ok(list.length >= 6 && list.length <= F.COMMON_FRONTS.length);
  assert.ok(list.every((id) => all.includes(id)));
  assert.deepEqual(list, F.COMMON_FRONTS.filter((id) => all.includes(id)));
  const odd = F.commonFronts(all, 'laminate-grey');
  assert.equal(odd[odd.length - 1], 'laminate-grey');
  assert.deepEqual(F.commonFronts(['sage'], 'sage'), ['sage']);
  assert.deepEqual(F.commonFronts(['sage', 'oak'], 'unknown'), ['sage', 'oak']);
});

test('the contact step asks for a name, an email, a postcode and consent; phone and message are optional', () => {
  const ok = { name: 'Ada Lovelace', email: 'ada@example.org', postcode: '2000', consent: true };
  assert.deepEqual(F.checkContact(ok), { name: false, email: false, postcode: false, consent: false });
  assert.equal(F.contactOk(ok), true);
  assert.equal(F.contactOk({ ...ok, phone: '', message: '' }), true);
  assert.equal(F.contactOk({ ...ok, name: 'A' }), false);
  assert.equal(F.contactOk({ ...ok, name: '   ' }), false);
  assert.equal(F.contactOk({ ...ok, email: 'ada@example' }), false);
  assert.equal(F.contactOk({ ...ok, email: 'ada example@x.org' }), false);
  assert.equal(F.contactOk({ ...ok, postcode: '20' }), false);
  assert.equal(F.contactOk({ ...ok, consent: false }), false);
  assert.equal(F.contactOk({}), false);
  assert.equal(F.firstBadField({}), 'name');
  assert.equal(F.firstBadField({ ...ok, email: 'x' }), 'email');
  assert.equal(F.firstBadField({ ...ok, consent: false }), 'consent');
  assert.equal(F.firstBadField(ok), null);
});

test('reference numbers look like GJ-YYMM-ABC', () => {
  const fixed = new Date(2026, 9, 15).getTime();
  assert.equal(F.referenceNumber(fixed, () => 0), 'GJ-2610-AAA');
  assert.match(F.referenceNumber(fixed), /^GJ-2610-[A-Z2-9]{3}$/);
  assert.match(F.referenceNumber(), /^GJ-\d{4}-[A-Z2-9]{3}$/);
});
