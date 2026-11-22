/* Tests the syncer against an in-memory stand-in for Supabase: two "devices" (phone and laptop) editing
 * the same data at once. No network, no real database. Run: npx tsx scripts/test-syncer.ts */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { canon, makeSyncer, rowsOf, type Stamps } from '../src/lib/remote';
import { seed } from '../src/lib/seed';
import { addStory } from '../src/lib/logic';
import type { Data } from '../src/lib/types';

type Row = Record<string, any>;
const PK: Record<string, string> = { ideas: 'id', takes: 'n', stories: 'key', weeks: 'week', prefs: 'id', config_versions: 'n' };

/* ---------- A tiny fake of the parts of supabase-js the syncer uses ---------- */
class FakeDb {
  tables: Record<string, Map<string, Row>> = {};
  clock = 0;
  failNext = 0; // make the next N writes fail, like a dropped connection
  /** A rule the real database enforces (a check constraint): writes it rejects get Postgres's 23514. */
  reject?: (table: string, row: Row) => boolean;
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
      for (const r of this.payload) if (this.db.reject?.(this.name, r)) return { data: null, error: { code: '23514', message: 'violates check constraint (test)' } };
      const out = this.payload.map((r: Row) => { const x = { ...structuredClone(r), updated_at: this.db.stamp() }; tb.set(String(r[pk]), x); return x; });
      return { data: out, error: null };
    }
    if (this.op === 'update') {
      const out: Row[] = [];
      for (const [k, r] of tb) if (match(r)) {
        const x = { ...r, ...structuredClone(this.payload), updated_at: this.db.stamp() };
        if (this.db.reject?.(this.name, x)) return { data: null, error: { code: '23514', message: 'violates check constraint (test)' } };
        tb.set(k, x); out.push(x);
      }
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
    onRefused: m => { log.errors.push(m); },
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

{ // 15. (review 3) An agent retires a series while she adds one: the retired one stays out of the active list.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), agent = device(base, stamps, db);
  const y = base.opts.series[0];
  agent.change(x => { x.opts.series = x.opts.series.filter(v => v !== y); x.retired.series = [...(x.retired.series || []), y]; x.versions.unshift({ n: 99, date: '', label: 'retire', changes: [], key: 'r2' }); });
  await settle(agent);
  a.change(x => { x.opts.series = [...x.opts.series, 'NEWX']; x.versions.unshift({ n: 99, date: '', label: 'add', changes: [], key: 'a2' }); });
  await settle(a);
  const last = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n).pop()!.snapshot;
  check('series retire + add: consistent', !last.opts.series.includes(y) && last.retired.series.includes(y) && last.opts.series.includes('NEWX'), JSON.stringify([last.opts.series, last.retired.series]));
}

{ // 16. (step 2 review 1) Phone decides "no story" while the laptop picks a story: never both in the row.
  const b0 = structuredClone(base); const x0 = b0.ideas.find(i => i.id === id)!; x0.story = null; x0.noStory = false;
  const { db, stamps } = freshDb(b0); const a = device(b0, stamps, db), b = device(b0, stamps, db);
  db.reject = (t, r) => t === 'ideas' && !!r.no_story && r.story_key !== null;
  const sk = Object.keys(b0.stories)[0];
  a.change(x => { x.ideas.find(i => i.id === id)!.story = sk; });
  await settle(a);
  b.change(x => { const i = x.ideas.find(i => i.id === id)!; i.story = null; i.noStory = true; });
  await settle(b);
  const r = idea(db);
  check('no story vs a story: written together, clash reported', !(r.no_story && r.story_key) && r.no_story === true && b.log.conflicts.some(c => !!c), JSON.stringify({ no_story: r.no_story, story_key: r.story_key, c: b.log.conflicts }));
  check('no story vs a story: nothing refused', !b.log.errors.length, JSON.stringify(b.log.errors));
}
{ // 17. (step 2 review 3) A config from before the channel list: retiring one channel keeps the other five.
  const b0 = structuredClone(base); const { db, stamps } = freshDb(b0);
  const top = [...db.t('config_versions').values()][0]; delete top.snapshot.opts.channel; delete top.snapshot.retired.channel;
  const a = device(b0, stamps, db);
  a.change(x => { x.opts.channel = x.opts.channel.filter(c => c !== 'community'); x.retired.channel.push('community'); x.versions.unshift({ n: 99, date: '', label: 'retire channel', changes: [], key: 'c1' }); });
  await settle(a);
  const last = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n).pop()!.snapshot;
  check('channel list from defaults: retire keeps the rest', last.opts.channel.length === 5 && !last.opts.channel.includes('community') && last.retired.channel.includes('community'), JSON.stringify([last.opts.channel, last.retired.channel]));
}
{ // 18. (step 2 review 4) A tab loaded before the inner world arrived edits one field: the other five survive.
  const b0 = structuredClone(base); const { db, stamps } = freshDb(b0);
  const a = device(b0, stamps, db); // her tab: no inner world, no personas
  const agent = device(b0, stamps, db);
  agent.change(x => { x.config.innerWorld = { coreProblem: 'CP', hurting: 'H', tried: 'T', thinking: 'TH', afraid: 'A', wants: 'W' }; x.config.personas = { Dawn: 'd', Alex: 'a', Paloma: 'p' }; x.versions.unshift({ n: 99, date: '', label: 'v12', changes: [], key: 'v12' }); });
  await settle(agent);
  a.change(x => { x.config.innerWorld = { ...x.config.innerWorld, wants: 'MINE' }; x.config.personas = { ...x.config.personas, Dawn: 'MINE' }; x.versions.unshift({ n: 99, date: '', label: 'edit', changes: [], key: 'e1' }); });
  await settle(a);
  const last = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n).pop()!.snapshot.config;
  check('inner world: one field edited, the rest kept', last.innerWorld.wants === 'MINE' && last.innerWorld.coreProblem === 'CP' && last.innerWorld.afraid === 'A', JSON.stringify(last.innerWorld));
  check('personas: one edited, the rest kept', last.personas.Dawn === 'MINE' && last.personas.Alex === 'a' && last.personas.Paloma === 'p', JSON.stringify(last.personas));
}
{ // 19. (step 2 review 1) A row the database refuses is reported and skipped; the rest still save, nothing retries forever.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db);
  const other = base.ideas.find(i => !i.past && i.id !== id)!.id;
  db.reject = (t, r) => t === 'ideas' && r.id === id && r.title === 'BAD';
  a.change(x => { x.ideas.find(i => i.id === id)!.title = 'BAD'; x.ideas.find(i => i.id === other)!.title = 'GOOD'; x.config.mission = 'saved too'; x.versions.unshift({ n: 99, date: '', label: 'm', changes: [], key: 'm1' }); });
  await settle(a);
  const lastCfg = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n).pop()!.snapshot.config;
  check('refused row: others and config still saved', db.t('ideas').get(other)!.title === 'GOOD' && lastCfg.mission === 'saved too', db.t('ideas').get(other)!.title);
  check('refused row: reported, idle, refresh asked for', a.s.idle() && a.log.errors.some(e => /refused your change/.test(e)) && a.log.conflicts.length > 0, JSON.stringify(a.log));
}
{ // 20. Channels and links merge item by item: phone adds LinkedIn while the laptop adds a link and YouTube.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db), b = device(base, stamps, db);
  a.change(x => { const i = x.ideas.find(i => i.id === id)!; i.channels = [...i.channels, 'LinkedIn']; });
  b.change(x => { const i = x.ideas.find(i => i.id === id)!; i.channels = [...i.channels, 'YouTube']; i.links = [...i.links, { label: 'Card', url: 'a/b.md' }]; });
  await settle(a, b);
  const r = idea(db);
  check('channels and links: both sides kept', r.channels.includes('LinkedIn') && r.channels.includes('YouTube') && r.links.length === 1, JSON.stringify([r.channels, r.links]));
}

{ // 21. (round 2, L1) A new idea the database refuses, then undone before the reload: nothing jams.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db);
  db.reject = (t, r) => t === 'ideas' && r.title === 'REFUSED';
  const nu = structuredClone(base.ideas.find(i => !i.past)!); nu.id = 'new-refused'; nu.title = 'REFUSED';
  a.change(x => { x.ideas.push(nu); });
  await settle(a);
  a.change(x => { x.ideas = x.ideas.filter(i => i.id !== 'new-refused'); x.config.mission = 'after undo'; x.versions.unshift({ n: 99, date: '', label: 'u', changes: [], key: 'u1' }); });
  await settle(a);
  const lastCfg = [...db.t('config_versions').values()].sort((p, q) => p.n - q.n).pop()!.snapshot.config;
  check('refused insert + undo: idle, later saves land', a.s.idle() && lastCfg.mission === 'after undo' && !db.t('ideas').has('new-refused'), JSON.stringify({ idle: a.s.idle(), m: lastCfg.mission }));
  check('refused insert: reported', a.log.errors.some(e => /refused your change/.test(e)), JSON.stringify(a.log.errors));
}
{ // 22. (round 2, M1) Signed out mid-save (permission denied): her change is kept and retried, never dropped.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db);
  const orig = Query.prototype.then; let denied = 2;
  (Query.prototype as any).then = function (this: any, ok: any, bad: any) {
    if (denied > 0 && this.op === 'update') { denied--; return Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied (test)' } }).then(ok, bad); }
    return orig.call(this, ok, bad);
  };
  a.change(x => { x.ideas.find(i => i.id === id)!.title = 'KEPT'; });
  await sleep(600);
  check('permission denied: not marked saved', !a.s.idle(), 'idle too early');
  await sleep(9000); await settle(a);
  Query.prototype.then = orig;
  check('permission denied: saved on retry', idea(db).title === 'KEPT', idea(db).title);
}

{ // 23. (step 3 review) An agent marks the angle drafted while she confirms the pillar: both stand.
  const d0 = structuredClone(base); d0.ideas.find(i => i.id === id)!.drafted = ['pillar'];
  const { db, stamps } = freshDb(d0); const a = device(d0, stamps, db);
  const row = db.t('ideas').get(id)!; row.summary = 'agent angle'; row.drafted = ['pillar', 'summary']; row.updated_at = db.stamp();
  a.change(x => { const i = x.ideas.find(i => i.id === id)!; i.drafted = i.drafted.filter(f => f !== 'pillar'); });
  await settle(a);
  const r = idea(db);
  check('drafted: her confirm and the agent mark both kept', canon(r.drafted) === canon(['summary']), JSON.stringify(r.drafted));
}
{ // 24. (step 3 review) An agent sets the outfit while she edits the setup: both kept.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db);
  const row = db.t('ideas').get(id)!; row.look = { ...row.look, outfit: 'green sweater' }; row.updated_at = db.stamp();
  a.change(x => { const i = x.ideas.find(i => i.id === id)!; i.look = { ...i.look, setup: 'desk' }; });
  await settle(a);
  const r = idea(db);
  check('look: both keys kept', r.look.outfit === 'green sweater' && r.look.setup === 'desk', JSON.stringify(r.look));
  check('look: no clash reported', !a.log.conflicts.some(c => c), JSON.stringify(a.log.conflicts));
}

{ // 25. (story review M3) New hooks land from the backend while she picks from the old list: the pick is dropped, she's told.
  const d0 = structuredClone(base); const i0 = d0.ideas.find(i => i.id === id)!; i0.hooks = [{ spoken: 'old A', onscreen: '', frame: '', format: 'question', payoff: '', rec: false }, { spoken: 'old B', onscreen: '', frame: '', format: 'question', payoff: '', rec: false }]; i0.chosen = null;
  const { db, stamps } = freshDb(d0); const a = device(d0, stamps, db);
  const row = db.t('ideas').get(id)!; row.hooks = [{ spoken: 'new A', onscreen: '', frame: '', format: 'stakes', payoff: '', rec: true }]; row.chosen = null; row.updated_at = db.stamp();
  a.change(x => { x.ideas.find(i => i.id === id)!.chosen = 1; });
  await settle(a);
  const r = idea(db);
  check('stale pick: not written', r.chosen === null && r.hooks[0].spoken === 'new A', JSON.stringify({ chosen: r.chosen, h: r.hooks[0].spoken }));
  check('stale pick: she is told', a.log.errors.some(e => /hooks changed while you picked/.test(e)), JSON.stringify(a.log.errors));
}
{ // 26. Hooks unchanged elsewhere: her pick saves as usual, even when another column changed.
  const d0 = structuredClone(base); const i0 = d0.ideas.find(i => i.id === id)!; i0.hooks = [{ spoken: 'A', onscreen: '', frame: '', format: 'question', payoff: '', rec: false }]; i0.chosen = null;
  const { db, stamps } = freshDb(d0); const a = device(d0, stamps, db);
  const row = db.t('ideas').get(id)!; row.title = 'changed elsewhere'; row.updated_at = db.stamp();
  a.change(x => { x.ideas.find(i => i.id === id)!.chosen = 0; });
  await settle(a);
  check('fresh pick: saved', idea(db).chosen === '0', String(idea(db).chosen));
}

{ // 27. A story added from the idea's story picker: saved to the bank (blinded) and picked for the idea.
  const { db, stamps } = freshDb(base); const a = device(base, stamps, db);
  let key = '';
  a.change(x => { key = addStory(x, 'The vendor demo that went sideways', 'Messy'); const i = x.ideas.find(i => i.id === id)!; i.story = key; i.noStory = false; });
  await settle(a);
  const st = db.t('stories').get(key);
  check('new story: saved, blinded', !!st && st.title === 'The vendor demo that went sideways' && st.on_camera === 'blinded', JSON.stringify(st));
  check('new story: picked for the idea', idea(db).story_key === key && a.log.errors.length === 0, JSON.stringify({ sk: idea(db).story_key, e: a.log.errors }));
  check('new story: key is readable and unique', /^the-vendor-demo-that-went-sideways-[a-z0-9]{1,4}$/.test(key), key);
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
