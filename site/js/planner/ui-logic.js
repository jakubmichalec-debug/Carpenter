// Planner page: small pure helpers behind the one-screen layout (no DOM, no Three.js), so Node can test them.
import { formatEuroWhole } from './review-logic.js';

// One name per step: the stepper, the title, the Next button and the spoken announcement all use these.
export const STEP_NAMES = ['Room', 'Furniture', 'Interior', 'Place', 'Review'];
export const NEXT_LABELS = ['Next: furniture', 'Next: interior', 'Next: place', 'Next: review', ''];
export const stepAnnouncement = (i) => `Step ${i + 1} of ${STEP_NAMES.length}, ${STEP_NAMES[i]}`;

// Where the arrow keys move inside a roving-tabindex group of n items laid out in rows of `cols`. Returns the new
// index, or null for a key the group does not use. A single row or column wraps around; a grid stops at its edges.
export function nextIndex(i, n, key, cols = 1) {
  if (!(n > 0)) return null;
  const wrap = (k) => ((k % n) + n) % n;
  switch (key) {
    case 'ArrowRight': return wrap(i + 1);
    case 'ArrowLeft': return wrap(i - 1);
    case 'ArrowDown': return cols > 1 ? (i + cols < n ? i + cols : i) : wrap(i + 1);
    case 'ArrowUp': return cols > 1 ? (i - cols >= 0 ? i - cols : i) : wrap(i - 1);
    case 'Home': return 0;
    case 'End': return n - 1;
    default: return null;
  }
}

// The running price in the bottom bar. `quote` comes from quoteProject(project, { vat }).
export function priceSummary(project, quote, vatOn) {
  if (!project || !project.pieces || !project.pieces.length) return { empty: true, text: 'No pieces yet', cents: 0 };
  const cents = quote && quote.cents ? quote.cents.total : 0;
  return { empty: false, text: `${formatEuroWhole(cents / 100)} ${vatOn ? 'incl. VAT' : 'excl. VAT'}`, cents };
}

// The wall elevation on step 1 only earns its space when a wall is being worked on: the walls section is open, a wall
// was picked, an opening is selected, or the selected wall already has openings. Otherwise the plan gets the room.
export function elevationVisible({ section, wallPicked, openingId, openingsOnWall }) {
  return section === 'walls' || !!wallPicked || !!openingId || openingsOnWall > 0;
}

// Pieces whose pull-outs are only visible with the doors open (the Review "Front of" views open them).
const PULLOUTS = new Set(['larder', 'spice', 'tray', 'basket', 'hamper', 'bin-pullout', 'shoe-pullout', 'carousel']);
export function hasPullouts(piece) {
  return !!piece && Array.isArray(piece.bays) && piece.bays.some((b) => (b.items || []).some((it) => PULLOUTS.has(it.kind)));
}
