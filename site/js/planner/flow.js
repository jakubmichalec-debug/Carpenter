// The guided question flow: which questions the planner asks, in which order, under which chapter. Pure (no DOM), so Node
// can test it. The three chapters are the planner's three steps (Furniture, Interior, Review); every question belongs to
// one of them and is answered with the editors of that step. The flow never changes the project: it only decides what is
// on screen.
import { TYPES } from './model.js';

export const CHAPTERS = ['Furniture', 'Interior', 'Review'];

// id, chapter (index into CHAPTERS), the headline (a friendly question), one line of help and the label of the main button.
// `needs` says what has to exist before the question makes sense: 'piece' (a piece being designed) or 'inside' (a piece with
// an inside to fit out). `optional` questions may be skipped while nothing has been changed.
export const QUESTIONS = [
  { id: 'type', chapter: 0, title: 'What would you like us to build?', help: 'Tap one. You can add more pieces later.', next: 'Next' },
  { id: 'style', chapter: 0, title: 'Which look do you like best?', help: 'One tap sets the whole look. Prices show the change.', next: 'Next', needs: 'piece' },
  { id: 'look', chapter: 0, title: 'Want to change the colour or handles?', help: 'Optional. Pick a colour and handles, or keep this look.', next: 'Looks good', optional: true, needs: 'piece' },
  { id: 'piece-size', chapter: 0, title: 'How big should it be?', help: 'Pick a standard size, or tell us how much space you have.', next: 'Next', needs: 'piece' },
  { id: 'inside', chapter: 1, title: 'What should go inside?', help: 'Pick a start for each section. Fine-tune it next.', next: 'Use your suggestion', needs: 'inside' },
  { id: 'arrange', chapter: 1, title: 'Want to arrange it yourself?', help: 'Move shelves, rails and drawers. Totally optional.', next: 'Next', optional: true, needs: 'inside' },
  { id: 'more', chapter: 2, title: 'Would you like anything else built?', help: 'Add another piece, or go and see your furniture.', next: 'No, show me the result', needs: 'piece' },
  { id: 'review', chapter: 2, title: 'Here’s your furniture.', help: 'Look around in 3D, check the price, then send it.', next: 'Send it to us', needs: 'piece' },
  { id: 'send', chapter: 2, title: 'Where should we send your design?', help: 'A few details so the workshop can reply.', next: 'Send to the workshop', needs: 'piece' }
];
export const IDS = QUESTIONS.map((q) => q.id);
export const byId = (id) => QUESTIONS.find((q) => q.id === id) || null;
export const chapterOf = (id) => (byId(id) ? byId(id).chapter : 0);

// Does this piece have an inside to fit out? A table has none, so the Interior chapter is skipped for it.
export const hasInside = (piece) => !!piece && !!TYPES[piece.type] && TYPES[piece.type].palette.length > 0;

// The questions asked now. `ctx.hasInside` is false when the piece in hand has no inside.
export function activeIds(ctx = {}) {
  return QUESTIONS.filter((q) => q.needs !== 'inside' || ctx.hasInside !== false).map((q) => q.id);
}
export function nextId(id, ctx = {}) {
  const list = activeIds(ctx);
  const i = list.indexOf(id);
  if (i >= 0) return list[i + 1] || null;
  // a question that is not asked now (the inside of a table): the next one that is, in the order of the full list
  const at = IDS.indexOf(id);
  return at < 0 ? null : list.find((x) => IDS.indexOf(x) > at) || null;
}
export function prevId(id, ctx = {}) {
  const list = activeIds(ctx);
  const i = list.indexOf(id);
  if (i >= 0) return i > 0 ? list[i - 1] : null;
  const at = IDS.indexOf(id);
  const before = list.filter((x) => IDS.indexOf(x) < at);
  return before.length ? before[before.length - 1] : null;
}

// Where a question sits: n of total over the whole flow, and k of m inside its chapter.
export function position(id, ctx = {}) {
  const list = activeIds(ctx);
  const q = byId(id);
  const n = Math.max(1, list.indexOf(id) + 1);
  const inChapter = list.filter((x) => byId(x).chapter === (q ? q.chapter : 0));
  return { n, total: list.length, k: Math.max(1, inChapter.indexOf(id) + 1), of: inChapter.length, chapter: q ? q.chapter : 0 };
}
export const announcement = (id, ctx) => {
  const p = position(id, ctx);
  return `Question ${p.n} of ${p.total}: ${byId(id).title}`;
};
export const chapterProgress = (id, ctx) => {
  const p = position(id, ctx);
  return p.of ? `Question ${p.k} of ${p.of}` : '';
};

// The first question of a chapter (null for the Interior chapter when there is nothing to fit out).
export function firstOfChapter(chapter, ctx = {}) {
  const list = activeIds(ctx);
  return list.find((x) => byId(x).chapter === chapter) || null;
}

// A question that cannot be asked yet becomes the one that has to come first: no piece means "What would you like us to
// build?"; a piece without an inside skips the Interior questions.
export function settle(id, { pieces = 0, hasInside: inside = true } = {}) {
  const q = byId(id);
  if (!q) return IDS[0];
  if (q.needs === 'piece' && !pieces) return 'type';
  if (q.needs === 'inside') return pieces ? (inside ? id : 'more') : 'type';
  return id;
}

// Where a saved project or a shared link opens: the review when there is something to look at, otherwise the first question.
export function landing(project) {
  return (project && project.pieces ? project.pieces : []).length ? 'review' : 'type';
}

// What the planner's own editors show for a question: the step (chapter) and the sections of that step on screen. `flags`
// holds the answers that open an editor: arrange (Yes) and lookMore (the full look panel).
export function view(id, flags = {}) {
  switch (id) {
    case 'type': return { step: 0, sections: [] };
    case 'style': return { step: 0, sections: ['style'] };
    case 'look': return { step: 0, sections: flags.lookMore ? ['look'] : [] };
    case 'piece-size': return { step: 0, sections: ['size'] };
    case 'inside': return { step: 1, sections: [] };
    case 'arrange': return { step: 1, sections: flags.arrange ? ['layout'] : [] };
    case 'more': return { step: 2, sections: [] };
    case 'review': return { step: 2, sections: ['quote', 'share'] };
    case 'send': return { step: 2, sections: [] };
    default: return { step: 0, sections: [] };
  }
}

// Something outside the flow moved the planner to another step (a "Fix in Interior" link in the quote, the editor's own
// buttons): the question that belongs to that step. `ctx`: itemSelected (an interior item is selected), starting (a new
// piece is about to be chosen), hasPiece.
export function questionForStep(step, ctx = {}) {
  switch (step) {
    case 0: return ctx.starting || !ctx.hasPiece ? 'type' : 'style';
    case 1: return ctx.itemSelected ? 'arrange' : 'inside';
    default: return 'review';
  }
}

// The section of a step's own tabs that shows the same thing as a question, for the "Edit everything" view.
const EXPERT = { type: 'pieces', style: 'style', look: 'look', 'piece-size': 'size', inside: 'layout', arrange: 'layout', more: 'quote', review: 'quote', send: 'share' };
export const expertSection = (id) => EXPERT[id] || null;
export const DEFAULT_SECTIONS = ['pieces', 'layout', 'quote'];

// A short list of front colours for the "colour or handles" question: the ones most people choose, in this order, when the
// stock has them, plus the colour the piece has now.
export const COMMON_FRONTS = ['chalk-white', 'sage', 'sand', 'oak', 'walnut', 'ash', 'ink-blue', 'dark-green', 'clay', 'black'];
export function commonFronts(available, current) {
  const have = new Set(available);
  const out = COMMON_FRONTS.filter((id) => have.has(id));
  if (current && have.has(current) && !out.includes(current)) out.push(current);
  return out;
}

// ---------- the contact question ----------
// Checks the contact details. Returns { name, email, postcode, consent } with true where a field is wrong. Phone and
// message are optional.
export function checkContact(f = {}) {
  const s = (v) => String(v === undefined || v === null ? '' : v).trim();
  return {
    name: s(f.name).length < 2,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s(f.email)),
    postcode: s(f.postcode).length < 3,
    consent: !f.consent
  };
}
export const contactOk = (f) => !Object.values(checkContact(f)).some(Boolean);
export const FIELD_ORDER = ['name', 'email', 'postcode', 'consent'];
export const firstBadField = (f) => { const c = checkContact(f); return FIELD_ORDER.find((k) => c[k]) || null; };

// A reference number for the thank-you screen, such as GJ-2412-7QX. Nothing is stored under it.
export function referenceNumber(now = Date.now(), rand = Math.random) {
  const d = new Date(now);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 3; i++) tail += A[Math.floor(rand() * A.length) % A.length];
  return `GJ-${yy}${mm}-${tail}`;
}
