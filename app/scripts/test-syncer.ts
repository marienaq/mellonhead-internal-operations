/* Tests the syncer against an in-memory stand-in for Supabase: two "devices" (phone and laptop) editing
 * the same data at once. No network, no real database. Run: npx tsx scripts/test-syncer.ts */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeSyncer, rowsOf, type Stamps } from '../src/lib/remote';
import { seed } from '../src/lib/seed';
import type { Data } from '../src/lib/types';

type Row = Record<string, any>;
const PK: Record<string, string> = { ideas: 'id', takes: 'n', stories: 'key', weeks: 'week', prefs: 'id', config_versions: 'n' };

/* ---------- A tiny fake of the parts of supabase-js the syncer uses ---------- */
class FakeDb {
  tables: Record<string, Map<string, Row>> = {};
  clock = 0;
  failNext = 0; // make the next N writes fail, like a dropped connection
  stamp() { return `t${String(++this.clock).padStart(6, '0')}`; }
  t(name: string) { return (this.tables[name] ??= new Map()); }
  from(name: string) { return new Query(this, name); }
}
class Query implements PromiseLike<any> {
  declare name: string;
  op: 'select' | 'insert' | 'update' = 'select';
  payload: any; filters: [string, any][] = []; orderBy?: [string, boolean]; lim?: number; single = false; wantRows = false;
  constructor(private db: FakeDb, name: string) { this.name = name; }
  select(_cols?: string) { if (this.op !== 'select') this.wantRows = true; return this; }
  insert(rows: any) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(cols: Row) { this.op = 'update'; this.payload = cols; return this; }
  eq(col: string, v: any) { this.filters.push([col, v]); return this; }
  order(col: string, o: { ascending: boolean }) { this.orderBy = [col, o.ascending]; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.single = true; return this; }
  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
  run(): { data: any; error: any } {
    const tb = this.db.t(this.name), pk = PK[this.name];
    if (this.op !== 'select' && this.db.failNext > 0) { this.db.failNext--; return { data: null, error: { message: 'network error (test)' } }; }
    const match = (r: Row) => this.filters.every(([c, v]) => String(r[c]) === String(v));
    if (this.op === 'insert') {
      for (const r of this.payload) if (tb.has(String(r[pk]))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      const out = this.payload.map((r: Row) => { const x = { ...structuredClone(r), updated_at: this.db.stamp() }; tb.set(String(r[pk]), x); return x; });
      return { data: out, error: null };
    }
    if (this.op === 'update') {
      const out: Row[] = [];
      for (const [k, r] of tb) if (match(r)) { const x = { ...r, ...structuredClone(this.payload), updated_at: this.db.stamp() }; tb.set(k, x); out.push(x); }
      return { data: out, error: null };
    }
    let rows = [...tb.values()].filter(match);
    if (this.orderBy) { const [c, asc] = this.orderBy; rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
    if (this.lim) rows = rows.slice(0, this.lim);
    rows = structuredClone(rows);
    return { data: this.single ? rows[0] ?? null : rows, error: null };
  }
}

/* ---------- Setup ---------- */
function freshDb(d: Data) {
  const db = new FakeDb(); const r = rowsOf(d);
  const stamps: Stamps = { ideas: {}, takes: {}, stories: {}, weeks: {}, prefs: {} };
  for (const t of ['ideas', 'takes', 'stories', 'weeks', 'prefs'] as const)
    for (const [k, row] of Object.entries(r[t])) { const s = db.stamp(); db.t(t).set(k, { ...structuredClone(row), updated_at: s }); stamps[t][k] = s; }
  const top = d.versions[0];
  db.t('config_versions').set(String(top.n), { n: top.n, label: top.label, changes: top.changes, snapshot: structuredClone(r.snapshot), created_at: '2026-11-20' });
  return { db, stamps };
}
type Log = { conflicts: (string | null)[]; errors: string[]; renumbered: [number, number][]; versions: number };
function device(d: Data, stamps: Stamps, db: FakeDb) {
  const log: Log = { conflicts: [], errors: [], renumbered: [], versions: 0 };
  let data = structuredClone(d);
  const s = makeSyncer(structuredClone(d), stamps, {
    onVersions: () => { log.versions++; },
    onError: m => { log.errors.push(m); },
    onConflict: c => { log.conflicts.push(c); },
    onRenumberTake: (f, t) => { log.renumbered.push([f, t]); },
  }, db as any);
  return {
    log, s,
    change(fn: (x: Data) => void) { data = structuredClone(data); fn(data); s.queue(data); },
    get data() { return data; },
  };
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function settle(...ds: { s: { idle: () => boolean } }[]) { for (let k = 0; k < 200 && !ds.every(x => x.s.idle()); k++) await sleep(50); await sleep(50); }

let failures = 0;
function check(name: string, ok: boolean, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failures++; }

const base = seed();
const id = base.ideas.find(i => !i.past && i.prep.length >= 2)!.id;
const idea = (db: FakeDb) => db.t('ideas').get(id)!;

/* ---------- Tests ---------- */
{ // 1. Different fields of one idea, from two devices at once: both kept, the second one told to reload.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), b = device(base, stamps, db);
  a.change(x => { x.ideas.find(i => i.id === id)!.harmHelp = 'neutral'; });
  b.change(x => { x.ideas.find(i => i.id === id)!.cta = 'follow'; });
  await settle(a, b);
  check('different fields: both kept', idea(db).harm_help === 'neutral' && idea(db).cta === 'follow', JSON.stringify([idea(db).harm_help, idea(db).cta]));
  check('different fields: no clash reported', [...a.log.conflicts, ...b.log.conflicts].every(c => c === null), JSON.stringify([a.log.conflicts, b.log.conflicts]));
  check('different fields: the second device reloads', a.log.conflicts.length + b.log.conflicts.length === 1);
}
{ // 2. Same field from both: the later write wins and that device is told.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), b = device(base, stamps, db);
  a.change(x => { x.ideas.find(i => i.id === id)!.summary = 'from the phone'; });
  await settle(a);
  b.change(x => { x.ideas.find(i => i.id === id)!.summary = 'from the laptop'; });
  await settle(b);
  check('same field: last write wins', idea(db).summary === 'from the laptop');
  check('same field: clash reported', b.log.conflicts.length === 1 && typeof b.log.conflicts[0] === 'string', JSON.stringify(b.log.conflicts));
}
{ // 3. Prep ticks on two devices: both ticks kept.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), b = device(base, stamps, db);
  a.change(x => { x.prepDone[`${id}:0`] = true; });
  b.change(x => { x.prepDone[`${id}:1`] = true; });
  await settle(a, b);
  check('prep ticks merge', JSON.stringify(idea(db).prep_done) === '[0,1]', JSON.stringify(idea(db).prep_done));
  check('prep ticks: no clash', [...a.log.conflicts, ...b.log.conflicts].every(c => c === null));
}
{ // 4. Notes from two places: both kept.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), b = device(base, stamps, db);
  a.change(x => { x.ideas.find(i => i.id === id)!.notes.push({ who: 'phone', text: 'one' }); });
  b.change(x => { x.ideas.find(i => i.id === id)!.notes.push({ who: 'agent', text: 'two' }); });
  await settle(a, b);
  const whos = (idea(db).notes as Row[]).map(n => n.who);
  check('notes merge', whos.includes('phone') && whos.includes('agent'), JSON.stringify(whos));
}
{ // 5. A failed save is kept and retried; the syncer is not idle meanwhile (so a refresh can't wipe it).
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db);
  db.failNext = 1;
  a.change(x => { x.ideas.find(i => i.id === id)!.feeling = 'cheeky'; });
  await sleep(700);
  check('failed save: error shown', a.log.errors.length === 1, JSON.stringify(a.log.errors));
  check('failed save: not idle while unsaved', !a.s.idle());
  await sleep(8600);
  await settle(a);
  check('failed save: retried and saved', idea(db).feeling === 'cheeky' && a.s.idle(), String(idea(db).feeling));
}
{ // 6. Two devices add a take at once: the second is renumbered, nothing overwritten, its idea follows.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), b = device(base, stamps, db);
  const n = Math.max(...Object.keys(base.takes).map(Number)) + 1;
  a.change(x => { x.takes[n] = { short: 'phone take', text: 'from the phone', pillar: '', onCamera: 'ready' }; });
  await settle(a);
  b.change(x => { x.takes[n] = { short: 'laptop take', text: 'from the laptop', pillar: '', onCamera: 'ready' }; x.ideas.find(i => i.id === id)!.take = n; });
  await settle(b);
  check('take clash: first take untouched', db.t('takes').get(String(n))?.text === 'from the phone');
  check('take clash: second saved under the next number', db.t('takes').get(String(n + 1))?.text === 'from the laptop');
  check('take clash: device told', JSON.stringify(b.log.renumbered) === JSON.stringify([[n, n + 1]]));
  check('take clash: the idea points at the renumbered take', idea(db).take_n === n + 1, String(idea(db).take_n));
}
{ // 7. Config changed on two devices at once: one version each, numbered in order, both changes in the latest snapshot.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), b = device(base, stamps, db);
  const top = base.versions[0].n;
  a.change(x => { x.config.cadenceWeeks = 8; x.versions.unshift({ n: top + 1, date: '', label: 'Cadence', changes: [], key: 'a1' }); });
  b.change(x => { x.config.filmWeekday = 4; x.versions.unshift({ n: top + 1, date: '', label: 'Film day', changes: [], key: 'b1' }); });
  await settle(a, b);
  const vs = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n);
  const last = vs[vs.length - 1].snapshot.config;
  check('config race: two new versions', vs.length === 3 && vs[1].n === top + 1 && vs[2].n === top + 2, JSON.stringify(vs.map(v => [v.n, v.label])));
  check('config race: latest has both changes', last.cadenceWeeks === 8 && last.filmWeekday === 4, JSON.stringify(last));
  check('config race: labels kept (no fake "Undo")', vs.slice(1).every(v => v.label !== 'Undo: back to the earlier setting'), JSON.stringify(vs.map(v => v.label)));
}
{ // 8. Nothing changed: nothing written.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db);
  const before = db.clock;
  a.change(() => {});
  await settle(a);
  check('no change: no writes', db.clock === before, `${db.clock - before} writes`);
}
{ // 9. Jsonb comes back from Postgres with its keys reordered: no phantom changes.
  const { db, stamps } = freshDb(base);
  for (const r of db.t('ideas').values()) r.look = Object.fromEntries(Object.entries(r.look as Row).reverse());
  const a = device(base, stamps, db);
  a.change(x => { x.ideas.find(i => i.id === id)!.look = Object.fromEntries(Object.entries(x.ideas.find(i => i.id === id)!.look).reverse()) as Data['ideas'][number]['look']; });
  const before = db.clock;
  await settle(a);
  check('key order: no write', db.clock === before, `${db.clock - before} writes`);
}

{ // 10. (review A) After a merge, her next edit to the same row must not undo the other side's change.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), agent = device(base, stamps, db);
  agent.change(x => { x.ideas.find(i => i.id === id)!.slate = 'AGENT'; x.prepDone[`${id}:1`] = true; });
  await settle(agent);
  a.change(x => { x.ideas.find(i => i.id === id)!.title = 'first edit'; });
  await settle(a);
  a.change(x => { x.ideas.find(i => i.id === id)!.title = 'second edit'; });
  await settle(a);
  check('after merge: other side kept on her next edit', idea(db).slate === 'AGENT' && JSON.stringify(idea(db).prep_done) === '[1]' && idea(db).title === 'second edit', JSON.stringify([idea(db).slate, idea(db).prep_done, idea(db).title]));
  a.change(x => { x.prepDone[`${id}:0`] = true; });
  await settle(a);
  check('after merge: her later tick merges too', JSON.stringify(idea(db).prep_done) === '[0,1]', JSON.stringify(idea(db).prep_done));
}
{ // 10b. After a merge, if she then changes the very field the other side changed, she's told.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), agent = device(base, stamps, db);
  agent.change(x => { x.ideas.find(i => i.id === id)!.slate = 'AGENT'; });
  await settle(agent);
  a.change(x => { x.ideas.find(i => i.id === id)!.title = 'edit'; });
  await settle(a);
  a.change(x => { x.ideas.find(i => i.id === id)!.slate = 'MINE'; });
  await settle(a);
  check('after merge: clash on the same field is reported', a.log.conflicts.some(c => typeof c === 'string'), JSON.stringify(a.log.conflicts));
}
{ // 11. (review B) Two new takes in one save while an agent took the first number.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), agent = device(base, stamps, db);
  const n = Math.max(...Object.keys(base.takes).map(Number)) + 1;
  agent.change(x => { x.takes[n] = { short: 'agent', text: 'AGENT', pillar: '', onCamera: 'ready' }; });
  await settle(agent);
  a.change(x => { x.takes[n] = { short: 'one', text: 'MINE ONE', pillar: '', onCamera: 'ready' }; x.takes[n + 1] = { short: 'two', text: 'MINE TWO', pillar: '', onCamera: 'ready' }; x.ideas.find(i => i.id === id)!.take = n; });
  await settle(a);
  const texts = [...db.t('takes').values()].map(r => r.text);
  const mineOneAt = [...db.t('takes').values()].find(r => r.text === 'MINE ONE')?.n;
  check('two takes: all three kept', texts.includes('AGENT') && texts.includes('MINE ONE') && texts.includes('MINE TWO'), JSON.stringify(texts.slice(-3)));
  check('two takes: the idea points at MINE ONE', idea(db).take_n === mineOneAt, `${idea(db).take_n} vs ${mineOneAt}`);
}
{ // 12. (review C) After a config merge, an unrelated edit must not save an "Undo" that reverts the other side.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), agent = device(base, stamps, db);
  const top = base.versions[0].n;
  agent.change(x => { x.config.cadenceWeeks = 99; x.versions.unshift({ n: top + 1, date: '', label: 'agent', changes: [], key: 'g1' }); });
  await settle(agent);
  a.change(x => { x.config.mission = 'MINE'; x.versions.unshift({ n: top + 1, date: '', label: 'mine', changes: [], key: 'm1' }); });
  await settle(a);
  a.change(x => { x.ideas.find(i => i.id === id)!.title = 'unrelated'; });
  await settle(a);
  const vs = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n);
  const last = vs[vs.length - 1];
  check('config merge: no spurious Undo version', vs.every(v => v.label !== 'Undo: back to the earlier setting'), JSON.stringify(vs.map(v => v.label)));
  check('config merge: latest keeps both', last.snapshot.config.cadenceWeeks === 99 && last.snapshot.config.mission === 'MINE', JSON.stringify(last.snapshot.config));
  a.change(x => { x.config.vibe = 'MINE TOO'; x.versions.unshift({ n: top + 3, date: '', label: 'mine 2', changes: [], key: 'm2' }); });
  await settle(a);
  const l2 = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n).pop()!;
  check('config merge: her next change keeps the agent\'s', l2.snapshot.config.cadenceWeeks === 99 && l2.snapshot.config.vibe === 'MINE TOO', JSON.stringify(l2.snapshot.config));
}
{ // 13. (review D) The config insert lands but its response is lost: the retry must not insert it twice.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db);
  const top = base.versions[0].n;
  const orig = Query.prototype.then; let dropped = false;
  // Lose the response of the first config_versions insert after it has been applied.
  (Query.prototype as any).then = function (this: any, ok: any, bad: any) {
    if (!dropped && this.name === 'config_versions' && this.op === 'insert') { dropped = true; return Promise.resolve().then(() => { (this as any).run(); return { data: null, error: { message: 'network lost (test)' } }; }).then(ok, bad); }
    return orig.call(this, ok, bad);
  };
  a.change(x => { x.config.mission = 'once'; x.versions.unshift({ n: top + 1, date: '', label: 'once', changes: [], key: 'o1' }); });
  await sleep(9500); await settle(a);
  Query.prototype.then = orig;
  const labels = [...db.t('config_versions').values()].map(v => v.label);
  check('lost response: version saved once', labels.filter(l => l === 'once').length === 1, JSON.stringify(labels));
}
{ // 14. Config sections merge key by key: she adds a series while an agent retires a feeling.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), agent = device(base, stamps, db);
  const f = base.opts.feeling[0];
  agent.change(x => { x.opts.feeling = x.opts.feeling.filter(v => v !== f); x.retired.feeling = [...(x.retired.feeling || []), f]; x.versions.unshift({ n: 99, date: '', label: 'retire', changes: [], key: 'r1' }); });
  a.change(x => { x.opts.series = [...x.opts.series, 'New series']; x.versions.unshift({ n: 99, date: '', label: 'add series', changes: [], key: 's1' }); });
  await settle(agent, a);
  const last = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n).pop()!.snapshot;
  check('config keys merge: both list changes kept', !last.opts.feeling.includes(f) && last.opts.series.includes('New series'), JSON.stringify([last.opts.feeling, last.opts.series]));
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
