/* Tests for "Make hooks and storyboard" (netlify/lib/story.ts), with a fake database and a fake Claude.
 * No network, no cost. Run: npx tsx scripts/test-story.ts */
import {
  answerText, ask, cantRun, cardOf, folderOf, hooksPathFor, hooksSchema, loadContext, REFERENCES, runStory, SKILL_HOOKS, SKILL_STORYBOARD,
  startStory, storyboardPathFor, system, usageOf, wouldReplace, type Context, type Row,
} from '../netlify/lib/story';

let failures = 0;
const check = (name: string, ok: boolean, got: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(got)}`); if (!ok) failures++; };

/* ---------- A fake of the supabase-js calls story.ts makes ---------- */
const KEYS: Record<string, string> = { ideas: 'id', docs: 'path', jobs: 'id', takes: 'n', stories: 'key', config_versions: 'n' };
class FakeDb {
  t: Record<string, Row[]> = { ideas: [], docs: [], jobs: [], takes: [], stories: [], config_versions: [] };
  clock = 0;
  /** Runs once, before the next update: stands in for MQ editing in the app at that moment. */
  before: ((db: FakeDb) => void) | null = null;
  // Now-ish and always increasing, so the stale-job sweep sees fresh rows as fresh.
  stamp() { return new Date(Date.now() + ++this.clock).toISOString(); }
  from(table: string) { return new Q(this, table); }
}
class Q implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  op: 'select' | 'insert' | 'update' = 'select'; payload: Row = {}; filters: ((r: Row) => boolean)[] = [];
  one: 'maybe' | 'single' | null = null; lim = 0; ord: [string, boolean] | null = null;
  constructor(public db: FakeDb, public table: string) {}
  select() { return this; }
  insert(row: Row) { this.op = 'insert'; this.payload = row; return this; }
  update(cols: Row) { this.op = 'update'; this.payload = cols; return this; }
  eq(c: string, v: unknown) { this.filters.push(r => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push(r => vs.includes(r[c])); return this; }
  lt(c: string, v: string) { this.filters.push(r => Date.parse(String(r[c])) < Date.parse(v)); return this; } // timestamps compare as times, as in Postgres
  order(c: string, o: { ascending: boolean }) { this.ord = [c, o.ascending]; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  then<A, B>(ok?: ((v: { data: unknown; error: { message: string; code?: string } | null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
  run(): { data: unknown; error: { message: string; code?: string } | null } {
    const rows = this.db.t[this.table];
    const clone = <T,>(x: T): T => structuredClone(x);
    if (this.op === 'insert') {
      const row = { archived: false, ...clone(this.payload), updated_at: this.db.stamp() } as Row;
      if (this.table === 'jobs') {
        row.id ??= crypto.randomUUID(); row.step ??= 'queued';
        // jobs_one_live_idx: one live story job per idea.
        if (rows.some(r => r.idea_id === row.idea_id && ['queued', 'hooks', 'storyboard'].includes(String(r.step)))) return { data: null, error: { message: 'duplicate', code: '23505' } };
      }
      if (rows.some(r => r[KEYS[this.table]] === row[KEYS[this.table]])) return { data: null, error: { message: 'duplicate', code: '23505' } };
      rows.push(row);
      return { data: this.one ? clone(row) : [clone(row)], error: null };
    }
    if (this.op === 'update') {
      if (this.db.before) { const f = this.db.before; this.db.before = null; f(this.db); }
      const hit = rows.filter(r => this.filters.every(f => f(r)));
      for (const r of hit) Object.assign(r, clone(this.payload), { updated_at: this.db.stamp() });
      return { data: clone(hit), error: null };
    }
    let out = rows.filter(r => this.filters.every(f => f(r)));
    if (this.ord) { const [c, asc] = this.ord; out = [...out].sort((a, b) => (a[c]! < b[c]! ? -1 : 1) * (asc ? 1 : -1)); }
    if (this.lim) out = out.slice(0, this.lim);
    if (this.one) return { data: out[0] ? clone(out[0]) : null, error: null };
    return { data: clone(out), error: null };
  }
}

const CARD = 'marketing/tiktok/story-formats/workplace-advice/stories/2026-11-15-done-by-two-pm.md';
function freshDb(idea: Row = {}) {
  const db = new FakeDb();
  db.t.config_versions.push({ n: 12, snapshot: { opts: { hookFormat: ['question', 'stakes'] } } });
  db.t.takes.push({ n: 3, text: 'Tools do not fix process', on_camera: 'ready' });
  for (const p of [...REFERENCES, SKILL_HOOKS, SKILL_STORYBOARD]) db.t.docs.push({ path: p, kind: p.includes('skills/tiktok') ? 'skill' : 'reference', title: p, body: `body of ${p}`, archived: false });
  db.t.docs.push({ path: CARD, kind: 'card', title: 'Done by 2pm', body: 'The story: ...', archived: false });
  db.t.docs.push({ path: 'marketing/tiktok/story-formats/workplace-advice/brief.md', kind: 'format', title: 'WA', body: 'beat table', archived: false });
  db.t.ideas.push({
    id: 'two-pm', title: 'Done with work by 2pm', status: 'on deck', summary: 'angle', channels: ['TikTok'], links: [{ label: 'Card', url: CARD }],
    brief: '', source_url: null, take_n: 3, story_key: null, no_story: false, hooks: [], chosen: null, rehook: null,
    beats: [], script: [], prep: [], prep_done: [], drafted: ['feeling'], look: {}, notes: [], archived: false, updated_at: db.stamp(), ...idea,
  });
  db.t.jobs.push({ id: '11111111-1111-1111-1111-111111111111', kind: 'story', idea_id: 'two-pm', step: 'queued', message: '', usage: {}, updated_at: db.stamp() });
  return db;
}
const JOB = '11111111-1111-1111-1111-111111111111';
const U = { input: 1000, output: 500, cacheWrite: 30000, cacheRead: 0, cents: 17, models: ['claude-opus-5-5'] };
const HOOKS = { stop: null, hooks: [{ spoken: 'Done by 2pm?', onscreen: '2PM', frame: 'clock', format: 'question', payoff: 'beat 2', rec: true }], hooks_markdown: '# Hooks', note: '' };
const BOARD = {
  stop: null, beats: [{ t: 'Open on the clock', gap: null, waiting_on: null }, { t: 'Her take', gap: 'your words here', waiting_on: null }],
  look: { setup: 'desk', outfit: 'green', location: 'office', props: 'clock', edit: 'captions' },
  script: [{ t: 'So here is the thing', needs_her: null }, { t: '[your take]', needs_her: 'her take on it' }],
  prep: ['Print the post'], storyboard_markdown: '# Storyboard', note: 'Placed take #3.',
};
type Ans = { out: unknown; refused: string | null; usage: typeof U };
const fakeAsk = (answers: (Ans | Error)[]) => {
  const calls: { system: string; prompt: string; timeout: number }[] = [];
  const f = (async (_c: unknown, sys: { text: string }[], prompt: string, _schema: unknown, timeout: number) => {
    calls.push({ system: sys.map(s => s.text).join('\n'), prompt, timeout });
    const a = answers.shift()!;
    if (a instanceof Error) throw a;
    return a;
  }) as unknown as Parameters<typeof runStory>[2];
  return { f, calls };
};
const sb = (db: FakeDb) => db as unknown as Parameters<typeof runStory>[0];
const job = (db: FakeDb) => db.t.jobs[0];
const idea = (db: FakeDb) => db.t.ideas.find(i => i.id === 'two-pm')!;

/* ---------- Pure helpers ---------- */
{
  check('cardOf finds the card link', cardOf({ links: [{ url: CARD }] }) === CARD);
  check('folderOf the card', folderOf(CARD) === 'marketing/tiktok/story-formats/workplace-advice');
  check('folderOf no card is own-ideas', folderOf(null) === 'marketing/tiktok/own-ideas');
  const ctx = { idea: { id: 'mine', links: [] } } as unknown as Context;
  check('paths without a card use the idea id', hooksPathFor(ctx) === 'marketing/tiktok/own-ideas/hooks/mine.md' && storyboardPathFor(ctx) === 'marketing/tiktok/own-ideas/storyboards/mine.md');
  check('cantRun: not TikTok', cantRun({ idea: { channels: ['LinkedIn'] }, card: null, brief: null } as unknown as Context) === 'This idea is not planned for TikTok.');
  check('cantRun: nothing to work from', !!cantRun({ idea: { channels: ['TikTok'], summary: '' }, card: null, brief: null } as unknown as Context));
  check('wouldReplace: her pick and her lines', JSON.stringify(wouldReplace({ chosen: '0', script: [{ t: 'x', d: false }], beats: [] })) === JSON.stringify(['the hook you picked', 'script lines you wrote']));
  check('wouldReplace: nothing yet', wouldReplace({ chosen: null, script: [], beats: [], hooks: [] }).length === 0);
}

/* ---------- The whole run ---------- */
{ // 1. Happy path: hooks land first, then the storyboard; the job says what it made.
  const db = freshDb({ chosen: '0', rehook: { field: 'feeling', from: 'a', to: 'b' } });
  let hooksSeenBeforeBoard = false;
  const { f, calls } = fakeAsk([{ out: HOOKS, refused: null, usage: U }, { out: BOARD, refused: null, usage: U }]);
  const wrapped = (async (...a: Parameters<typeof f>) => { if (calls.length === 1) hooksSeenBeforeBoard = idea(db).hooks && (idea(db).hooks as unknown[]).length === 1 && job(db).step === 'storyboard'; return f(...a); }) as typeof f;
  await runStory(sb(db), JOB, wrapped, {} as never);
  const i = idea(db);
  check('run: hooks saved before the storyboard step', hooksSeenBeforeBoard);
  check('run: hooks saved, pick and re-hook cleared', (i.hooks as unknown[]).length === 1 && i.chosen === null && i.rehook === null);
  check('run: beats mapped (gap kept, nulls dropped)', JSON.stringify(i.beats) === JSON.stringify([{ t: 'Open on the clock' }, { t: 'Her take', gap: 'your words here' }]));
  check('run: script lines drafted, her gaps noted', JSON.stringify(i.script) === JSON.stringify([{ t: 'So here is the thing', d: true }, { t: '[your take]', d: true, g: 'her take on it' }]));
  check('run: look saved and marked drafted, existing drafted kept', (i.look as Row).outfit === 'green' && (i.drafted as string[]).includes('look.outfit') && (i.drafted as string[]).includes('feeling'));
  check('run: prep saved, ticks reset', JSON.stringify(i.prep) === '["Print the post"]' && JSON.stringify(i.prep_done) === '[]');
  check('run: hooks doc saved by the card slug', db.t.docs.some(d => d.path === 'marketing/tiktok/story-formats/workplace-advice/hooks/2026-11-15-done-by-two-pm.md' && d.kind === 'hooks' && d.idea_id === 'two-pm'));
  check('run: storyboard doc saved', db.t.docs.some(d => d.path === 'marketing/tiktok/story-formats/workplace-advice/storyboards/2026-11-15-done-by-two-pm.md' && d.body === '# Storyboard'));
  check('run: job done with what it made and the cost', job(db).step === 'done' && /1 hooks and a 2-beat storyboard\. Placed take #3\. \(about 34¢\)/.test(String(job(db).message)), job(db).message);
  check('run: the prompt carries the card, the format brief and her take', calls[0].prompt.includes('The story: ...') && calls[0].prompt.includes('beat table') && calls[0].prompt.includes('Tools do not fix process'));
  check('run: the storyboard step gets the new hooks', calls[1].prompt.includes('Done by 2pm?'));
  check('run: each step uses its own skill', calls[0].system.includes(`body of ${SKILL_HOOKS}`) && !calls[0].system.includes(`body of ${SKILL_STORYBOARD}`) && calls[1].system.includes(`body of ${SKILL_STORYBOARD}`));
  // A second call for the same job does nothing: the claim only moves a queued job.
  const before = JSON.stringify(db.t);
  const again = fakeAsk([]);
  await runStory(sb(db), JOB, again.f, {} as never);
  check('run: a repeated call does nothing', JSON.stringify(db.t) === before && again.calls.length === 0);
}
{ // 2. The hooks step stops (no story text): nothing on the idea changes.
  const db = freshDb();
  const { f } = fakeAsk([{ out: { ...HOOKS, stop: { reason: 'no-story', message: 'The card has no story text.' }, hooks: [] }, refused: null, usage: U }]);
  await runStory(sb(db), JOB, f, {} as never);
  check('stop: job stopped with the reason', job(db).step === 'stopped' && job(db).message === 'The card has no story text.');
  check('stop: idea untouched', (idea(db).hooks as unknown[]).length === 0);
}
{ // 3. Claude declines the storyboard: hooks stay, the job says so.
  const db = freshDb();
  const { f } = fakeAsk([{ out: HOOKS, refused: null, usage: U }, { out: null, refused: 'Declined.', usage: U }]);
  await runStory(sb(db), JOB, f, {} as never);
  check('refusal: hooks kept', (idea(db).hooks as unknown[]).length === 1 && (idea(db).beats as unknown[]).length === 0);
  check('refusal: job stopped, says hooks are in', job(db).step === 'stopped' && /Hooks are in/.test(String(job(db).message)));
}
{ // 4. An error: the job fails with a plain message.
  const db = freshDb();
  const { f } = fakeAsk([new Error('The answer was cut off (too long).')]);
  await runStory(sb(db), JOB, f, {} as never);
  check('error: job failed with the reason', job(db).step === 'failed' && job(db).message === 'The answer was cut off (too long).');
  check('error: finished_at set', !!job(db).finished_at);
}
{ // 5. She edits the idea while it saves: her edit stays, the save retries on the new row.
  const db = freshDb();
  const { f } = fakeAsk([{ out: HOOKS, refused: null, usage: U }, { out: BOARD, refused: null, usage: U }]);
  let armed = 0;
  const wrapped = (async (...a: Parameters<typeof f>) => {
    if (armed++ === 1) db.before = d => { const x = d.t.ideas.find(r => r.id === 'two-pm')!; x.title = 'Her new title'; x.updated_at = d.stamp(); };
    return f(...a);
  }) as typeof f;
  await runStory(sb(db), JOB, wrapped, {} as never);
  check('clash: her title kept and the storyboard saved', idea(db).title === 'Her new title' && (idea(db).beats as unknown[]).length === 2 && job(db).step === 'done', { title: idea(db).title, step: job(db).step });
}
{ // 6. The prompt follows the writing guide.
  const db = freshDb();
  const ctx = await loadContext(sb(db), 'two-pm');
  const text = system(ctx, 'hooks').map(b => b.text).join('');
  check('prompt: the frame has no em dash or double hyphen', !/—|--/.test(text.split('<doc')[0]));
  check('prompt: references are cached as one prefix for both steps', system(ctx, 'hooks')[0].text === system(ctx, 'storyboard')[0].text);
}

{ // 7. (review M2) She picks her own hook while the hooks are being written: it stops and leaves her pick alone.
  const db = freshDb();
  const { f } = fakeAsk([{ out: HOOKS, refused: null, usage: U }, { out: BOARD, refused: null, usage: U }]);
  const wrapped = (async (...a: Parameters<typeof f>) => { const x = idea(db); x.chosen = 'own'; x.own_hook = 'My hook'; x.updated_at = db.stamp(); return f(...a); }) as typeof f;
  await runStory(sb(db), JOB, wrapped, {} as never);
  check('edited mid-run: stopped, her hook kept, no new hooks', job(db).step === 'stopped' && idea(db).own_hook === 'My hook' && (idea(db).hooks as unknown[]).length === 0, { step: job(db).step, msg: job(db).message });
}
{ // 8. (review M2) She types a script line during the storyboard step: the storyboard isn't written over it.
  const db = freshDb();
  const { f } = fakeAsk([{ out: HOOKS, refused: null, usage: U }, { out: BOARD, refused: null, usage: U }]);
  let n = 0;
  const wrapped = (async (...a: Parameters<typeof f>) => { if (n++ === 1) { const x = idea(db); x.script = [{ t: 'my own line', d: false }]; x.updated_at = db.stamp(); } return f(...a); }) as typeof f;
  await runStory(sb(db), JOB, wrapped, {} as never);
  check('typed mid-run: her line kept, hooks in, job stopped', JSON.stringify(idea(db).script) === '[{"t":"my own line","d":false}]' && (idea(db).hooks as unknown[]).length === 1 && job(db).step === 'stopped');
}
{ // 9. (review L7) Two ideas from one card: the second gets its own hooks file instead of overwriting the first's.
  const db = freshDb();
  db.t.docs.push({ path: 'marketing/tiktok/story-formats/workplace-advice/hooks/2026-11-15-done-by-two-pm.md', kind: 'hooks', body: 'theirs', idea_id: 'other-idea', archived: false, updated_at: db.stamp() });
  const { f } = fakeAsk([{ out: HOOKS, refused: null, usage: U }, { out: BOARD, refused: null, usage: U }]);
  await runStory(sb(db), JOB, f, {} as never);
  check('shared card: the other idea\'s file untouched', db.t.docs.find(d => d.path.endsWith('hooks/2026-11-15-done-by-two-pm.md'))!.body === 'theirs');
  check('shared card: this idea saved beside it', db.t.docs.some(d => d.path.endsWith('hooks/2026-11-15-done-by-two-pm--two-pm.md') && d.idea_id === 'two-pm'));
}
{ // 10. (review H1) Each call gets a timeout that fits the 15-minute limit, shrinking as time passes.
  const db = freshDb();
  const { f, calls } = fakeAsk([{ out: HOOKS, refused: null, usage: U }, { out: BOARD, refused: null, usage: U }]);
  let t = 0;
  await runStory(sb(db), JOB, (async (...a: Parameters<typeof f>) => { const r = await f(...a); t += 5 * 60 * 1000; return r; }) as typeof f, {} as never, () => t);
  check('budget: first call under 13 minutes', calls[0].timeout <= 12 * 60 * 1000 && calls[0].timeout > 10 * 60 * 1000, calls[0].timeout);
  check('budget: second call gets what is left', calls[1].timeout <= 7 * 60 * 1000, calls[1].timeout);
}

{ // 11. (re-review) The call is aborted at the budget: the job says it ran out of time.
  const db = freshDb();
  const { APIUserAbortError } = await import('@anthropic-ai/sdk');
  await runStory(sb(db), JOB, (async () => { throw new APIUserAbortError(); }) as never, {} as never);
  check('abort: job failed, ran out of time', job(db).step === 'failed' && /ran out of time/.test(String(job(db).message)), job(db).message);
}
{ // 12. (re-review) No time left for the storyboard: no call is made, the hooks stay.
  const db = freshDb();
  const { f, calls } = fakeAsk([{ out: HOOKS, refused: null, usage: U }, { out: BOARD, refused: null, usage: U }]);
  let t = 0;
  await runStory(sb(db), JOB, (async (...a: Parameters<typeof f>) => { const r = await f(...a); t += 12 * 60 * 1000; return r; }) as typeof f, {} as never, () => t);
  check('no time left: one call only, hooks kept, ran out of time', calls.length === 1 && (idea(db).hooks as unknown[]).length === 1 && /ran out of time/.test(String(job(db).message)), { calls: calls.length, msg: job(db).message });
}
{ // 13. (re-review) Edited while running: no doc is written either.
  const db = freshDb();
  const { f } = fakeAsk([{ out: HOOKS, refused: null, usage: U }]);
  const wrapped = (async (...a: Parameters<typeof f>) => { const x = idea(db); x.chosen = 'own'; x.updated_at = db.stamp(); return f(...a); }) as typeof f;
  await runStory(sb(db), JOB, wrapped, {} as never);
  check('edited: no hooks doc written', !db.t.docs.some(d => d.kind === 'hooks'));
}
{ // 14. (re-review L6) An oversized answer is refused before anything is saved.
  const db = freshDb();
  const big = { ...HOOKS, hooks: [{ ...HOOKS.hooks[0], spoken: 'x'.repeat(200000) }] };
  const { f } = fakeAsk([{ out: big, refused: null, usage: U }]);
  await runStory(sb(db), JOB, f, {} as never);
  check('oversized: failed, idea untouched', job(db).step === 'failed' && (idea(db).hooks as unknown[]).length === 0 && /too long/.test(String(job(db).message)));
}

/* ---------- The real `ask`, against a fake SDK client ---------- */
const client = (msg: Row, seen?: { params?: Row; opts?: Row }) => ({ beta: { messages: { stream: (params: Row, opts: Row) => { if (seen) { seen.params = params; seen.opts = opts; } return { finalMessage: async () => msg }; } } } }) as never;
const schema = hooksSchema(['question']);
const good = JSON.stringify({ stop: null, hooks: [{ spoken: 'a', onscreen: 'b', frame: 'c', format: 'question', payoff: 'd', rec: true }], hooks_markdown: '#', note: '' });
const base = { usage: { input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 30000, cache_read_input_tokens: 0 } };
{
  const seen: { params?: Row; opts?: Row } = {};
  const r = await ask(client({ ...base, stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: good }] }, seen), [], 'p', schema, 60000);
  check('ask: parses the answer', r.out?.hooks[0].spoken === 'a' && r.refused === null);
  const fmt = (seen.params!.output_config as Row).format as Row;
  check('ask: sends the schema without the SDK parser', fmt.type === 'json_schema' && !('parse' in fmt) && !!fmt.schema);
  check('ask: timeout passed, no SDK retries', seen.opts!.timeout === 60000 && seen.opts!.maxRetries === 0);
  check('ask: an abort signal stops the whole streamed answer', seen.opts!.signal instanceof AbortSignal);
  check('ask: default fallback on', seen.params!.fallbacks === 'default' && JSON.stringify(seen.params!.betas) === '["server-side-fallback-2026-07-01"]');
  check('ask: cost at Opus 5.5 rates (1000*4 + 2000*20 + 30000*5)/1e4 = 19¢', r.usage.cents === 19, r.usage.cents);
}
{
  const r = await ask(client({ ...base, stop_reason: 'refusal', stop_details: { explanation: 'Not this one.' }, content: [{ type: 'text', text: '{"half' }] }), [], 'p', schema, 1000);
  check('ask: a refusal is reported, not thrown', r.out === null && r.refused === 'Not this one.');
}
{
  let msg = '';
  try { await ask(client({ ...base, stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"hooks": [' }] }), [], 'p', schema, 1000); } catch (e) { msg = (e as Error).message; }
  check('ask: a cut-off answer says so', /cut off/.test(msg), msg);
  msg = '';
  try { await ask(client({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }), [], 'p', schema, 1000); } catch (e) { msg = (e as Error).message; }
  check('ask: bad JSON says so', /not valid JSON/.test(msg), msg);
}
{ // A fallback served it: the declined model's partial text comes first and is ignored; each model priced at its rate.
  const usage = { ...base.usage, iterations: [
    { type: 'message', input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  ] };
  const r = await ask(client({ usage, stop_reason: 'end_turn', content: [{ type: 'text', text: '{"stop": null, "hoo' }, { type: 'fallback' }, { type: 'text', text: good }] }), [], 'p', schema, 1000);
  check('ask: fallback answer parsed', r.out?.hooks.length === 1);
  check('ask: fallback priced per model ((1000*4+100*20) + (1000*5+2000*25))/1e4 = 6¢', r.usage.cents === 6 && r.usage.models.join() === 'claude-opus-5-5,claude-opus-4-8', r.usage);
}
check('answerText: only after the last fallback', answerText([{ type: 'text', text: 'x' }, { type: 'fallback' }, { type: 'text', text: 'y' }]) === 'y');
check('usageOf: unknown model priced high, not low', usageOf({ iterations: [{ model: 'claude-mystery', input_tokens: 1e6, output_tokens: 0 }] }).cents === 500);

/* ---------- Starting a run ---------- */
{
  const db = freshDb({ chosen: '1' });
  db.t.jobs = [];
  let launched = 0;
  const launch = async () => { launched++; return true; };
  const r1 = await startStory(sb(db), 'two-pm', false, launch);
  check('start: asks before replacing her pick', r1.status === 409 && /hook you picked/.test(String(r1.body.confirm)) && launched === 0 && db.t.jobs.length === 0);
  const r2 = await startStory(sb(db), 'two-pm', true, launch);
  check('start: with replace, a job is queued and launched', r2.status === 202 && launched === 1 && db.t.jobs.length === 1 && db.t.jobs[0].step === 'queued');
  const r3 = await startStory(sb(db), 'two-pm', true, launch);
  check('start: a second tap while it runs is refused', r3.status === 409 && /already working/.test(String(r3.body.error)) && launched === 1);
  db.t.jobs[0].updated_at = '2020-01-01T00:00:00.000Z'; db.t.jobs[0].step = 'storyboard';
  const r4 = await startStory(sb(db), 'two-pm', true, launch);
  check('start: a run that died is marked failed and a new one starts', r4.status === 202 && db.t.jobs[0].step === 'failed' && /ran out of time/.test(String(db.t.jobs[0].message)) && db.t.jobs.length === 2);
}
{
  const db = freshDb(); db.t.jobs = [];
  const r = await startStory(sb(db), 'two-pm', false, async () => false);
  check('start: a worker that will not start leaves no live job', r.status === 502 && db.t.jobs[0].step === 'failed');
  const db2 = freshDb({ channels: ['LinkedIn'] }); db2.t.jobs = [];
  const r2 = await startStory(sb(db2), 'two-pm', false, async () => true);
  check('start: not TikTok is refused', r2.status === 400 && db2.t.jobs.length === 0);
  const r3 = await startStory(sb(db2), 'nope', false, async () => true);
  check('start: an idea she cannot see is not found', r3.status === 404);
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
