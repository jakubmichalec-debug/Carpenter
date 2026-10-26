// "How much space do you have?": pure helpers for the size question. The space is the wall width and the ceiling height
// the person has (`piece.space = { width, height }`, cm, either may be missing). All lengths in cm.
import { TYPES, defaultElevation, SCRIBE } from './model.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Air left at the top of the space: a little for a plain piece, more when scribe strips close the gap to the ceiling.
export const headroom = (piece) => (piece && piece.look && piece.look.scribe ? SCRIBE.top - 1 : 0.5);

// Does the piece fit the space it was given? `fits` is true when there is no space to check.
//   { has, fits, tooWide, tooTall, overWidth, overHeight, space }   (over* are cm, 0 when it fits)
export function spaceCheck(piece) {
  const space = piece && piece.space;
  if (!space || (space.width == null && space.height == null)) return { has: false, fits: true, tooWide: false, tooTall: false, overWidth: 0, overHeight: 0, space: null };
  const overWidth = space.width == null ? 0 : Math.max(0, piece.width - space.width);
  const overHeight = space.height == null ? 0 : Math.max(0, defaultElevation(piece) + piece.height - space.height);
  return { has: true, fits: overWidth === 0 && overHeight === 0, tooWide: overWidth > 0, tooTall: overHeight > 0, overWidth, overHeight, space };
}

// The size that fills the space, within the limits of the piece type: { width, height, changed, exact }. `exact` is false
// when the space is smaller or larger than this kind of piece can be made. Null when there is no space to fit.
export function fitToSpace(piece) {
  const space = piece && piece.space;
  if (!space || (space.width == null && space.height == null)) return null;
  const L = TYPES[piece.type].limits;
  const elev = defaultElevation(piece);
  const wantW = space.width == null ? piece.width : Math.floor(space.width);
  const wantH = space.height == null ? piece.height : Math.floor(space.height - elev - headroom(piece));
  const width = clamp(wantW, L.width[0], L.width[1]);
  const height = clamp(wantH, L.height[0], L.height[1]);
  return { width, height, changed: width !== piece.width || height !== piece.height, exact: width === wantW && height === wantH };
}

// A plain sentence about the check, for the size question (null when there is nothing to say).
export function spaceMessage(piece) {
  const c = spaceCheck(piece);
  if (!c.has) return null;
  if (c.fits) return 'This fits the space you have.';
  const parts = [];
  if (c.tooWide) parts.push(`${c.overWidth} cm too wide`);
  if (c.tooTall) parts.push(`${c.overHeight} cm too tall`);
  return `This piece is ${parts.join(' and ')} for your space.`;
}
