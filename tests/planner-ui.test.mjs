import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/js/planner/model.js';
import { quoteProject } from '../site/js/planner/pricing.js';
import { validateProject } from '../site/js/planner/validate.js';
import { loadStart, loadInitialProject } from '../site/js/planner/store.js';
import { encodeProject } from '../site/js/planner/share.js';
import { createDesign, updateRoom as v1UpdateRoom } from '../site/js/configurator/model.js';
import { encodeDesign } from '../site/js/configurator/share.js';
import {
  STEP_NAMES, NEXT_LABELS, stepAnnouncement, nextIndex, priceSummary, elevationVisible, hasPullouts
} from '../site/js/planner/ui-logic.js';

test('createBlankProject: a plain 4 x 3.5 m rectangle with nothing in it', () => {
  const p = M.createBlankProject();
  assert.equal(p.v, 2);
  assert.equal(p.pieces.length, 0);
  assert.equal(p.placements.length, 0);
  assert.equal(p.room.openings.length, 0);
  assert.equal(p.room.template.id, 'rect');
  assert.deepEqual(p.room.template.params, { width: 400, depth: 350 });
  assert.equal(p.room.walls.length, 4);
  assert.deepEqual(validateProject(p).errors.filter((e) => e.blocking && e.code !== 'no-pieces'), []);
  assert.notDeepEqual(p, M.createProject(), 'the example project stays a different design');
});

test('the example project still has its pieces', () => {
  const p = M.createProject();
  assert.ok(p.pieces.length >= 2 && p.placements.length >= 2);
});

test('loadStart: a link and a saved design skip the start screen; nothing at all is a first visit', async () => {
  const custom = M.setTemplate(M.createBlankProject(), 'bay', { width: 500 });
  const code = await encodeProject(custom);
  const link = await loadStart({ hash: `#p=${code}`, load: () => null });
  assert.equal(link.kind, 'link');
  assert.equal(link.project.room.template.id, 'bay');
  const saved = M.createBlankProject();
  const s = await loadStart({ hash: '', load: () => saved });
  assert.equal(s.kind, 'saved');
  assert.equal(s.project, saved);
  const bad = await loadStart({ hash: '#p=garbage!!', load: () => saved });
  assert.equal(bad.kind, 'saved');
  const first = await loadStart({ hash: '', load: () => null });
  assert.equal(first.kind, 'new');
  assert.ok(first.project.pieces.length > 0, 'a first visit carries the example, which the start screen only uses if it is picked');
  assert.equal((await loadInitialProject({ hash: '', load: () => saved })), saved);
});

test('loadStart: an old configurator link (#design=) opens the planner with that design, not the start screen', async () => {
  const enc = encodeDesign(v1UpdateRoom(createDesign(), { width: 500 }));
  const old = await loadStart({ hash: `#design=${enc}`, load: () => null });
  assert.equal(old.kind, 'link');
  assert.equal(old.project.v, 2);
  assert.ok(old.project.pieces.length >= 1);
});

test('one name per step, in the stepper, the title, the Next button and the announcement', () => {
  assert.deepEqual(STEP_NAMES, ['Room', 'Furniture', 'Interior', 'Place', 'Review']);
  assert.deepEqual(NEXT_LABELS.slice(0, 4), ['Next: furniture', 'Next: interior', 'Next: place', 'Next: review']);
  NEXT_LABELS.slice(0, 4).forEach((l, i) => assert.equal(l.toLowerCase(), `next: ${STEP_NAMES[i + 1].toLowerCase()}`));
  assert.equal(stepAnnouncement(2), 'Step 3 of 5, Interior');
});

test('nextIndex: arrow keys wrap in a row, stop at the edges of a grid, Home and End jump', () => {
  assert.equal(nextIndex(0, 4, 'ArrowRight'), 1);
  assert.equal(nextIndex(3, 4, 'ArrowRight'), 0);
  assert.equal(nextIndex(0, 4, 'ArrowLeft'), 3);
  assert.equal(nextIndex(1, 4, 'ArrowDown'), 2);
  assert.equal(nextIndex(1, 6, 'ArrowDown', 3), 4);
  assert.equal(nextIndex(4, 6, 'ArrowDown', 3), 4, 'the last row of a grid stays put');
  assert.equal(nextIndex(4, 6, 'ArrowUp', 3), 1);
  assert.equal(nextIndex(1, 6, 'ArrowUp', 3), 1);
  assert.equal(nextIndex(2, 6, 'Home'), 0);
  assert.equal(nextIndex(2, 6, 'End'), 5);
  assert.equal(nextIndex(2, 6, 'a'), null);
  assert.equal(nextIndex(0, 0, 'ArrowRight'), null);
});

test('priceSummary: the running price, with or without VAT, or "No pieces yet"', () => {
  const blank = M.createBlankProject();
  assert.deepEqual(priceSummary(blank, quoteProject(blank, { vat: true }), true), { empty: true, text: 'No pieces yet', cents: 0 });
  const demo = M.createProject();
  const withVat = priceSummary(demo, quoteProject(demo, { vat: true }), true);
  const without = priceSummary(demo, quoteProject(demo, { vat: false }), false);
  assert.match(withVat.text, /^€[\d,]+ incl\. VAT$/);
  assert.match(without.text, /^€[\d,]+ excl\. VAT$/);
  assert.ok(withVat.cents > without.cents, 'VAT adds to the total');
  assert.equal(withVat.cents, quoteProject(demo, { vat: true }).cents.total);
});

test('elevationVisible: only when a wall is worked on or has openings', () => {
  assert.equal(elevationVisible({ section: 'shape', wallPicked: false, openingId: null, openingsOnWall: 0 }), false);
  assert.equal(elevationVisible({ section: 'walls', wallPicked: false, openingId: null, openingsOnWall: 0 }), true);
  assert.equal(elevationVisible({ section: 'size', wallPicked: true, openingId: null, openingsOnWall: 0 }), true);
  assert.equal(elevationVisible({ section: 'size', wallPicked: false, openingId: null, openingsOnWall: 2 }), true);
  assert.equal(elevationVisible({ section: 'finish', wallPicked: false, openingId: 'o1', openingsOnWall: 0 }), true);
});

test('hasPullouts: larders and spice racks only show with the doors open', () => {
  assert.equal(hasPullouts(null), false);
  const withLarder = { bays: [{ items: [{ kind: 'shelf' }] }, { items: [{ kind: 'larder' }] }] };
  assert.equal(hasPullouts(withLarder), true);
  assert.equal(hasPullouts({ bays: [{ items: [{ kind: 'shelf' }, { kind: 'drawers' }] }] }), false);
});
