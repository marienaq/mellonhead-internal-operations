const pd = (d: string) => new Date(d + 'T12:00:00');
export const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
export const addDays = (d: string, n: number) => { const x = pd(d); x.setDate(x.getDate() + n); return iso(x); };
export const md = (d: string) => pd(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const wmd = (d: string) => pd(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtDate = (d: string) => pd(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const weekday = (d: string) => pd(d).toLocaleDateString('en-US', { weekday: 'long' });
const wkShort = (d: string) => pd(d).toLocaleDateString('en-US', { weekday: 'short' });

/** Today, from the device clock. Statuses move to published once the post date passes. */
export const today = () => iso(new Date());

/** The making week: the Monday of this week, or of next week from Friday on (MQ plans the coming week
 * at the end of the week). A Friday film day holds the week until Saturday. Ideas made in a week post the week after. */
export function makingWeek(t: string = today(), filmWeekday?: number): string {
  const dow = pd(t).getDay(); // 0 Sunday ... 6 Saturday
  const back = (dow + 6) % 7; // days since Monday
  const monday = addDays(t, -back);
  const rollFrom = Math.max(5, (filmWeekday ?? 3) + 1); // 5 Friday, 6 Saturday
  return dow === 0 || dow >= rollFrom ? addDays(monday, 7) : monday;
}
/* Live bindings: importers always see the current values. syncWeek re-works them out once the
 * film-day setting is known (it's in the data, which loads after this module). */
export let CUR_WEEK = makingWeek();
/** Two weeks back, this week and next week. */
export let WEEKS = [-14, -7, 0, 7].map(n => addDays(CUR_WEEK, n));
/** Returns the previous week when it changed, so the store can move the screen along with it. */
export function syncWeek(filmWeekday?: number): string | null {
  const w = makingWeek(today(), filmWeekday);
  if (w === CUR_WEEK) return null;
  const prev = CUR_WEEK; CUR_WEEK = w; WEEKS = [-14, -7, 0, 7].map(n => addDays(w, n));
  return prev;
}

/** Film day is a weekday setting in Config (1 Monday ... 5 Friday); Wednesday if unset. */
export const DEFAULT_FILM_WEEKDAY = 3;
export const filmDate = (filmWeekday: number | undefined, week = CUR_WEEK) => addDays(week, (filmWeekday ?? DEFAULT_FILM_WEEKDAY) - 1);
/** The film day with the day before and after, inside the making week. */
export function filmDays(filmWeekday: number | undefined): { day: string; short: string; label: string }[] {
  const f = filmDate(filmWeekday);
  return [-1, 0, 1].map(n => addDays(f, n)).filter(x => x >= CUR_WEEK && x <= addDays(CUR_WEEK, 4))
    .map(day => ({ day, short: wkShort(day), label: md(day) }));
}

/** US holidays that land on weekdays she might film. Extend once a year. */
export const HOLIDAYS: Record<string, string> = {
  '2026-11-26': 'Thanksgiving', '2026-11-27': 'the day after Thanksgiving', '2026-12-24': 'Christmas Eve', '2026-12-25': 'Christmas', '2026-12-31': "New Year's Eve",
  '2027-01-01': "New Year's Day", '2027-01-18': 'Martin Luther King Jr. Day', '2027-02-15': "Presidents' Day", '2027-05-31': 'Memorial Day',
  '2027-06-18': 'Juneteenth (observed)', '2027-07-05': 'Independence Day (observed)', '2027-09-06': 'Labor Day', '2027-11-25': 'Thanksgiving',
  '2027-11-26': 'the day after Thanksgiving', '2027-12-24': 'Christmas Eve', '2027-12-31': "New Year's Eve",
};
export const holidaysInWeek = (w: string) => [0, 1, 2, 3, 4].map(n => addDays(w, n)).filter(x => HOLIDAYS[x]);

export function weekKind(w: string) { return w < CUR_WEEK ? 'past' : w === CUR_WEEK ? 'current' : 'future'; }
export function weekSub(w: string, filmWeekday?: number) {
  const posts = `posts ${md(addDays(w, 7))} to ${md(addDays(w, 13))}`;
  if (weekKind(w) === 'past') return `Made ${md(w)} to ${md(addDays(w, 4))} · ${posts}`;
  if (w === CUR_WEEK) { const f = filmDate(filmWeekday); return `Week of ${md(w)} · ${posts} · film ${wkShort(f)} ${md(f)}`; }
  return `Next up · ${posts}`;
}
