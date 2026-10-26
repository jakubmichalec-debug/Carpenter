import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import * as F from '../site/js/planner/flow.js';
import { materialsFor } from '../site/js/planner/materials.js';

const withPiece = (type) => {
  const p = M.addPiece(M.createBlankProject(), type);
  return { project: p, piece: p.pieces[0] };
};

test('the flow has 9 questions in the three chapters, each asked once, in the order of the brief', () => {
  assert.equal(F.QUESTIONS.length, 9);
  assert.equal(new Set(F.IDS).size, 9);
  assert.deepEqual(F.CHAPTERS, ['Furniture', 'Interior', 'Review']);
  const per = F.CHAPTERS.map((_, i) => F.QUESTIONS.filter((q) => q.chapter === i).map((q) => q.id));
  assert.deepEqual(per, [
    ['type', 'style', 'look', 'piece-size'],
    ['inside', 'arrange'],
    ['more', 'review', 'send']
  ]);
  assert.deepEqual(F.QUESTIONS.map((q) => q.title), [
    'What would you like us to build?', 'Which look do you like best?', 'Want to change the colour or handles?', 'How big should it be?',
    'What should go inside?', 'Want to arrange it yourself?', 'Would you like anything else built?', 'Here’s your furniture.', 'Where should we send your design?'
  ]);
  assert.deepEqual(F.QUESTIONS.filter((q) => q.optional).map((q) => q.id), ['look', 'arrange']);
  for (const q of F.QUESTIONS) {
    assert.ok(q.title.length > 3 && q.help.length > 3 && q.next, q.id);
    assert.ok(q.help.length <= 60, `${q.id}: one short line of help`);
    assert.ok(!/room|wall|place it|where should it go/i.test(`${q.title} ${q.help}`) || q.id === 'piece-size', `${q.id}: no room planner copy`);
  }
  assert.equal(F.IDS.includes('shape') || F.IDS.includes('size') || F.IDS.includes('openings') || F.IDS.includes('finish') || F.IDS.includes('place'), false, 'no Room or Place questions');
  // chapters never go backwards along the list
  const ch = F.QUESTIONS.map((q) => q.chapter);
  assert.deepEqual(ch, [...ch].sort((a, b) => a - b));
});

test('every question names the editor sections it shows, in the step it belongs to', () => {
  const SECTIONS = [['pieces', 'style', 'look', 'size'], ['layout', 'add', 'options', 'item'], ['quote', 'share']];
  for (const q of F.QUESTIONS) {
    for (const flags of [{}, { arrange: true, lookMore: true }]) {
      const v = F.view(q.id, flags);
      assert.equal(v.step, q.chapter, q.id);
      for (const s of v.sections) assert.ok(SECTIONS[v.step].includes(s), `${q.id}: ${s}`);
    }
    const ex = F.expertSection(q.id);
    assert.ok(SECTIONS[q.chapter].includes(ex), `${q.id} has a tab in the tabbed view`);
  }
  // an answer opens the editor behind it
  assert.deepEqual(F.view('look', {}).sections, []);
  assert.deepEqual(F.view('look', { lookMore: true }).sections, ['look']);
  assert.deepEqual(F.view('arrange', {}).sections, []);
  assert.deepEqual(F.view('arrange', { arrange: true }).sections, ['layout']);
  assert.deepEqual(F.view('piece-size').sections, ['size']);
  assert.deepEqual(F.view('review').sections, ['quote', 'share']);
  assert.deepEqual(F.DEFAULT_SECTIONS, ['pieces', 'layout', 'quote']);
});

test('flow order without Room or Place: Furniture, Interior, Review', () => {
  const all = F.activeIds({ hasInside: true });
  assert.deepEqual(all, ['type', 'style', 'look', 'piece-size', 'inside', 'arrange', 'more', 'review', 'send']);
  let id = 'type';
  const seen = [id];
  while (F.nextId(id, { hasInside: true })) { id = F.nextId(id, { hasInside: true }); seen.push(id); }
  assert.deepEqual(seen, F.IDS);
  assert.equal(F.prevId('type', {}), null);
  assert.equal(F.nextId('send', {}), null);
  for (let i = 1; i < F.IDS.length; i++) assert.equal(F.prevId(F.IDS[i], {}), F.IDS[i - 1]);
  assert.equal(F.firstOfChapter(0, {}), 'type');
  assert.equal(F.firstOfChapter(2, {}), 'more');
});

test('a piece with no inside skips the two Interior questions, both ways', () => {
  const ctx = { hasInside: false };
  assert.deepEqual(F.activeIds(ctx), ['type', 'style', 'look', 'piece-size', 'more', 'review', 'send']);
  assert.equal(F.nextId('piece-size', ctx), 'more');
  assert.equal(F.prevId('more', ctx), 'piece-size');
  assert.equal(F.firstOfChapter(1, ctx), null);
  assert.equal(F.firstOfChapter(1, { hasInside: true }), 'inside');
  // asked about a question that is not asked: still finds its neighbours
  assert.equal(F.nextId('inside', ctx), 'more');
  assert.equal(F.prevId('arrange', ctx), 'piece-size');
  assert.equal(F.position('more', ctx).n, 5);
  assert.equal(F.position('more', ctx).total, 7);
});

test('hasInside follows the type: a table has none, a wardrobe has', () => {
  assert.equal(F.hasInside(withPiece('table').piece), false);
  assert.equal(F.hasInside(withPiece('wardrobe').piece), true);
  assert.equal(F.hasInside(withPiece('desk').piece), true);
  assert.equal(F.hasInside(null), false);
});

test('position and the spoken announcement', () => {
  const p = F.position('piece-size', { hasInside: true });
  assert.deepEqual(p, { n: 4, total: 9, k: 4, of: 4, chapter: 0 });
  assert.equal(F.announcement('piece-size', { hasInside: true }), 'Question 4 of 9: How big should it be?');
  assert.equal(F.chapterProgress('style', {}), 'Question 2 of 4');
  assert.equal(F.chapterProgress('arrange', { hasInside: true }), 'Question 2 of 2');
  assert.equal(F.chapterProgress('send', {}), 'Question 3 of 3');
  assert.equal(F.position('send', { hasInside: true }).n, 9);
  assert.equal(F.byId('type').title, 'What would you like us to build?');
});

test('settle: a question that cannot be asked yet becomes the one that comes first', () => {
  const none = { pieces: 0, hasInside: true };
  for (const id of ['style', 'look', 'piece-size', 'inside', 'arrange', 'more', 'review', 'send']) assert.equal(F.settle(id, none), 'type', id);
  assert.equal(F.settle('type', none), 'type');
  const some = { pieces: 1, hasInside: true };
  assert.equal(F.settle('style', some), 'style');
  assert.equal(F.settle('send', some), 'send', 'nothing has to be placed any more');
  assert.equal(F.settle('inside', { ...some, hasInside: false }), 'more');
  assert.equal(F.settle('nonsense', some), 'type');
});

test('landing: saved projects and links open on the review when there is something to see', () => {
  const blank = M.createBlankProject();
  assert.equal(F.landing(blank), 'type');
  assert.equal(F.landing(M.addPiece(blank, 'wardrobe')), 'review', 'one piece is enough: nothing needs placing');
  assert.equal(F.landing(M.createProject()), 'review');
  assert.equal(F.landing(null), 'type');
});

test('an outside step change maps to that step’s question', () => {
  assert.equal(F.questionForStep(0, { hasPiece: true }), 'style');
  assert.equal(F.questionForStep(0, { hasPiece: true, starting: true }), 'type');
  assert.equal(F.questionForStep(0, { hasPiece: false }), 'type');
  assert.equal(F.questionForStep(1, {}), 'inside');
  assert.equal(F.questionForStep(1, { itemSelected: true }), 'arrange');
  assert.equal(F.questionForStep(2, {}), 'review');
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
