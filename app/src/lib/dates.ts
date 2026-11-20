const pd = (d: string) => new Date(d + 'T12:00:00');
export const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
export const addDays = (d: string, n: number) => { const x = pd(d); x.setDate(x.getDate() + n); return iso(x); };
export const md = (d: string) => pd(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const wmd = (d: string) => pd(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtDate = (d: string) => pd(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Today, from the device clock. Statuses move to published once the post date passes. */
export const today = () => iso(new Date());

/** The week she makes videos (seed: Nov 23; she films Wed Nov 25). Fixed for the prototype. */
export const CUR_WEEK = '2026-11-23';
export const WEEKS = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
export const FILM_DAY = '2026-11-25';
export const FILM_DAYS: [string, string, string][] = [['2026-11-24', 'Tue', 'Nov 24'], ['2026-11-25', 'Wed', 'Nov 25'], ['2026-11-26', 'Thu', 'Nov 26']];

export function weekKind(w: string) { return w < CUR_WEEK ? 'past' : w === CUR_WEEK ? 'current' : 'future'; }
export function weekSub(w: string) {
  const posts = `posts ${md(addDays(w, 7))} to ${md(addDays(w, 13))}`;
  if (weekKind(w) === 'past') return `Made ${md(w)} to ${md(addDays(w, 4))} · ${posts}`;
  if (w === CUR_WEEK) return `Week of ${md(w)} · ${posts} · film Wed Nov 25`;
  return `Next up · ${posts}`;
}
