// Choices that belong to the whole planner page rather than one step. Today that is the VAT switch: the Review step
// owns the control, and the running price in the bottom bar follows it.
export const prefs = { vat: true };
const subs = new Set();
export function setVat(on) {
  const v = !!on;
  if (v === prefs.vat) return;
  prefs.vat = v;
  for (const fn of [...subs]) fn(prefs);
}
export function onPrefs(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
