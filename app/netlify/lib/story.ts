/* "Make hooks and storyboard": the backend's work, shared by the start and worker functions
 * (product/story-generation-design-2026-11-21.md).
 *
 * Everything runs as MQ: the Supabase client carries her sign-in token, so row-level security applies exactly as it
 * does in the app. The only server secret is ANTHROPIC_API_KEY. The skills themselves are docs in the database
 * (kind 'skill'); the prompt is built from them, so editing a skill changes what this does. */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createClient, type SupabaseClient as SC } from '@supabase/supabase-js';
// Untyped rows: the content schema has no generated types here.
type SupabaseClient = SC<any, any, any>;
import { z } from 'zod';

export type Row = Record<string, unknown>;
export const MODEL = 'claude-opus-5-5';
// Opus 5.5 per million tokens: input, output, cache write (5 min), cache read.
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };

export const SKILL_HOOKS = '.claude/skills/tiktok-hooks/SKILL.md';
export const SKILL_STORYBOARD = '.claude/skills/tiktok-storyboard/SKILL.md';
// Shared by both steps, so they sit first in the prompt and are cached once for both.
export const REFERENCES = [
  'writing-guide.md',
  'marketing/content-system/foundation.md',
  'marketing/tiktok/hook-research.md',
  'marketing/tiktok/story-formats/shared-standards.md',
  '.claude/skills/newsletter-from-transcripts/SKILL.md',
];

/* ---------- Supabase, as her ---------- */
export function asUser(token: string): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase settings are missing on the server');
  return createClient(url, key, {
    db: { schema: 'content' },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export const bearer = (req: Request) => (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
export function must<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
  return r.data as T;
}

/* ---------- Where an idea's material is ---------- */
const placesOf = (i: Row) => [String(i.brief ?? ''), String(i.source_url ?? ''), ...((i.links as { url: string }[] | null) ?? []).map(l => l.url)];
export const cardOf = (i: Row) => placesOf(i).find(p => /^marketing\/tiktok\/.+\/stories\/[^/]+\.md$/.test(p)) ?? null;
/** The format folder (marketing/tiktok/story-formats/aita-ai, marketing/tiktok/own-ideas...). */
export const folderOf = (card: string | null) => card ? card.replace(/\/stories\/[^/]+$/, '') : 'marketing/tiktok/own-ideas';
export const isTikTok = (i: Row) => ((i.channels as string[] | null) ?? []).includes('TikTok');

export type Context = {
  idea: Row; config: Row; take: Row | null; story: Row | null;
  card: Row | null; brief: Row | null; format: Row | null; references: Row[]; skills: Record<string, Row>;
};

export async function loadContext(sb: SupabaseClient, ideaId: string): Promise<Context> {
  const idea = must(await sb.from('ideas').select('*').eq('id', ideaId).maybeSingle()) as Row | null;
  if (!idea || idea.archived) throw new Error('That idea is not there (or is archived).');
  const config = (must(await sb.from('config_versions').select('snapshot').order('n', { ascending: false }).limit(1)) as Row[])[0]?.snapshot as Row;
  const take = idea.take_n ? must(await sb.from('takes').select('*').eq('n', idea.take_n).maybeSingle()) as Row | null : null;
  const story = idea.story_key ? must(await sb.from('stories').select('*').eq('key', idea.story_key).maybeSingle()) as Row | null : null;
  const cardPath = cardOf(idea);
  const briefPath = String(idea.brief ?? '').endsWith('.md') ? String(idea.brief) : null;
  const formatPath = cardPath ? `${folderOf(cardPath)}/brief.md` : null;
  const paths = [...REFERENCES, SKILL_HOOKS, SKILL_STORYBOARD, cardPath, briefPath, formatPath].filter(Boolean) as string[];
  const docs = must(await sb.from('docs').select('path, kind, title, body').in('path', paths).eq('archived', false)) as Row[];
  const by = (p: string | null) => (p ? docs.find(d => d.path === p) ?? null : null);
  const skills = { hooks: by(SKILL_HOOKS)!, storyboard: by(SKILL_STORYBOARD)! };
  if (!skills.hooks || !skills.storyboard) throw new Error('The hooks or storyboard skill is missing from the docs table.');
  return {
    idea, config, take, story, card: by(cardPath), brief: briefPath && briefPath !== cardPath ? by(briefPath) : null,
    format: by(formatPath), references: REFERENCES.map(by).filter(Boolean) as Row[], skills,
  };
}

/** Why the button can't run on this idea, or null. */
export function cantRun(ctx: Context): string | null {
  if (!isTikTok(ctx.idea)) return 'This idea is not planned for TikTok.';
  if (!ctx.card && !ctx.brief && !String(ctx.idea.summary ?? '').trim()) return 'It needs a brief or a story card first.';
  return null;
}

/** What she'd lose if it ran: her picked hook, her own script lines, an existing storyboard. */
export function wouldReplace(i: Row): string[] {
  const out: string[] = [];
  if (i.chosen !== null && i.chosen !== undefined) out.push('the hook you picked');
  if (((i.script as { d?: boolean }[] | null) ?? []).some(l => !l.d)) out.push('script lines you wrote');
  if (((i.beats as unknown[] | null) ?? []).length) out.push('the storyboard beats');
  else if (((i.hooks as unknown[] | null) ?? []).length) out.push('the hooks');
  return out;
}

/* ---------- Prompts ---------- */
const doc = (d: Row) => `<doc path="${d.path}" kind="${d.kind}">\n${d.body}\n</doc>`;

const FRAME = `You are running inside the backend of Mellonhead's content planning app, doing the work of one of the TikTok pipeline's skills for a single idea that Mariena (MQ) asked for by tapping a button.

How this differs from running the skill in Claude Code:
- You can't read or write files, run commands, post to Slack, or dispatch other agents. Everything you can use is in this prompt. Paths in the skill refer to the docs below by their path attribute.
- Where the skill says to write a file, put that file's full content in the matching field of your answer; the app saves it.
- Where the skill says to stop and report back to Orca (no story text, a deleted source, a check only she can make), set "stop" with a one-line reason she can act on, and leave the other fields empty.
- Where the skill relies on something this prompt doesn't include, work from what is here and say what was missing in "note". Never invent her words, her take, or facts about the story.
- Client stories stay blinded: never name a client, a company she worked with, or a real person from a blinded story.
- Write to the writing guide: no em dashes and no double hyphens anywhere.

The reference docs follow; the skill for this step comes after them.`;

export function system(ctx: Context, step: 'hooks' | 'storyboard'): Anthropic.Beta.Messages.BetaTextBlockParam[] {
  return [
    { type: 'text', text: `${FRAME}\n\n${ctx.references.map(doc).join('\n\n')}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `The skill for this step:\n\n${doc(ctx.skills[step])}`, cache_control: { type: 'ephemeral' } },
  ];
}

function ideaFacts(ctx: Context): string {
  const i = ctx.idea;
  const pick = (k: string) => (i[k] === null || i[k] === undefined || i[k] === '' ? undefined : i[k]);
  const facts = {
    id: i.id, title: i.title, status: i.status, week: pick('week'), angle: pick('summary'), pillar: pick('pillar'), type: pick('type'),
    style: pick('style'), on_camera: pick('on_camera'), voice: pick('voice'), feeling: pick('feeling'), harm_help: pick('harm_help'),
    call_to_action: pick('cta'), series: pick('series'), episode: pick('ep'), safety: i.safety, channels: i.channels,
    speaks_to: (i.inner_world as string[] | null)?.length ? i.inner_world : undefined,
    drafted_fields: (i.drafted as string[] | null)?.length ? i.drafted : undefined,
    notes: (i.notes as unknown[] | null)?.length ? i.notes : undefined,
  };
  const parts = [`The idea (from the app; fields listed in drafted_fields were filled by an agent and she hasn't confirmed them):\n${JSON.stringify(facts, null, 1)}`];
  parts.push(ctx.take ? `Her take #${ctx.take.n} (her words): ${ctx.take.text}\nOn camera: ${ctx.take.on_camera}` : 'Her take: none yet (waiting).');
  if (ctx.story) parts.push(`Story from her bank, "${ctx.story.title}" (on camera: ${ctx.story.on_camera}). Known: ${ctx.story.known}. Missing: ${ctx.story.missing}`);
  else if (i.no_story) parts.push('Story from her bank: none (she decided it does not need one).');
  if (ctx.card) parts.push(`The story card:\n${doc(ctx.card)}`);
  else parts.push('There is no story card for this idea; it is one of her own ideas. Work from the brief and the idea.');
  if (ctx.format) parts.push(`The format's brief:\n${doc(ctx.format)}`);
  if (ctx.brief) parts.push(`The idea's brief:\n${doc(ctx.brief)}`);
  return parts.join('\n\n');
}

export function hooksPrompt(ctx: Context): string {
  return `${ideaFacts(ctx)}\n\nWrite this idea's hook options, following the skill. Return the hooks file's full text in hooks_markdown as well as each option in hooks.`;
}

export function storyboardPrompt(ctx: Context, hooks: Hook[]): string {
  const h = hooks.length ? `The hook options for this episode (just written by the hooks step):\n${JSON.stringify(hooks, null, 1)}` : 'No hook options came back from the hooks step.';
  return `${ideaFacts(ctx)}\n\n${h}\n\nWrite this episode's storyboard, following the skill. Return the storyboard file's full text in storyboard_markdown, and also the parts the app shows on its own: the beats in order, the look, the script lines (only lines the skill would have her say; a line that needs her words gets a short note in "needs_her"), and a short prep list.`;
}

/* ---------- Answers ---------- */
const Stop = z.object({ reason: z.enum(['no-story', 'story-partial', 'source-gone', 'confirm', 'other']), message: z.string() }).nullable();

export function hooksSchema(formats: string[]) {
  return z.object({
    stop: Stop,
    hooks: z.array(z.object({
      spoken: z.string(), onscreen: z.string(), frame: z.string(),
      format: formats.length ? z.enum(formats as [string, ...string[]]) : z.string(),
      payoff: z.string(), rec: z.boolean(),
    })),
    hooks_markdown: z.string(),
    note: z.string(),
  });
}
export type Hook = { spoken: string; onscreen: string; frame: string; format: string; payoff: string; rec: boolean };

export const StoryboardSchema = z.object({
  stop: Stop,
  beats: z.array(z.object({ t: z.string(), gap: z.string().nullable(), waiting_on: z.string().nullable() })),
  look: z.object({ setup: z.string(), outfit: z.string(), location: z.string(), props: z.string(), edit: z.string() }),
  script: z.array(z.object({ t: z.string(), needs_her: z.string().nullable() })),
  prep: z.array(z.string()),
  storyboard_markdown: z.string(),
  note: z.string(),
});

/* ---------- One call to Claude ---------- */
export type Usage = { input: number; output: number; cacheWrite: number; cacheRead: number; cents: number; models: string[] };
// Per million tokens: input, output, cache write (5 min), cache read. A fallback is priced at its own model's rates;
// a model not listed is priced as Opus 4.8, the dearest likely fallback, so the estimate never runs low.
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 5, 0.2],
  'claude-opus-5': [5, 25, 6.25, 0.5],
  'claude-opus-4-8': [5, 25, 6.25, 0.5],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.2],
};
type IterUsage = { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; model?: string; type?: string };

export function usageOf(u: IterUsage & { iterations?: IterUsage[] | null }, requested = MODEL): Usage {
  const parts = u.iterations?.length ? u.iterations : [u];
  const out: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cents: 0, models: [] };
  let micro = 0; // millionths of a dollar
  for (const it of parts) {
    const model = it.model ?? requested;
    const [pi, po, pw, pr] = PRICES[model] ?? PRICES['claude-opus-4-8'];
    const i = it.input_tokens ?? 0, o = it.output_tokens ?? 0, w = it.cache_creation_input_tokens ?? 0, r = it.cache_read_input_tokens ?? 0;
    out.input += i; out.output += o; out.cacheWrite += w; out.cacheRead += r;
    micro += i * pi + o * po + w * pw + r * pr;
    if (!out.models.includes(model)) out.models.push(model);
  }
  out.cents = Math.round(micro / 1e4);
  return out;
}

/** The answer's JSON: the text after the last fallback block (a declined model's partial text comes before it). */
export function answerText(content: { type: string; text?: string }[]): string {
  let from = 0;
  content.forEach((b, n) => { if (b.type === 'fallback') from = n + 1; });
  return content.slice(from).flatMap(b => (b.type === 'text' && b.text ? [b.text] : [])).join('');
}

export type Ask = <S extends z.ZodType>(client: Anthropic, sys: Anthropic.Beta.Messages.BetaTextBlockParam[], prompt: string, schema: S, timeoutMs: number) =>
  Promise<{ out: z.infer<S> | null; refused: string | null; usage: Usage }>;

export const ask: Ask = async (client, sys, prompt, schema, timeoutMs) => {
  // The schema goes to the API without the SDK's own parser: it would throw on a refusal, a cut-off answer or a
  // fallback's partial text before this code could say which it was.
  const { parse: _sdkParse, ...format } = betaZodOutputFormat(schema);
  void _sdkParse;
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // a declined request is re-run on Anthropic's recommended fallback model
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format },
    system: sys,
    messages: [{ role: 'user', content: prompt }],
  }, { timeout: timeoutMs, maxRetries: 0, signal: AbortSignal.timeout(timeoutMs) });
  // `timeout` only covers waiting for the first byte; the signal stops the whole streamed answer at the budget.
  const msg = await stream.finalMessage();
  const usage = usageOf(msg.usage as unknown as IterUsage & { iterations?: IterUsage[] });
  if (msg.stop_reason === 'refusal') return { out: null, refused: msg.stop_details?.explanation || 'Claude declined this one.', usage };
  if (msg.stop_reason === 'max_tokens') throw new Error('The answer was cut off (too long). Try again.');
  let json: unknown;
  try { json = JSON.parse(answerText(msg.content as { type: string; text?: string }[])); }
  catch { throw new Error('The answer was not valid JSON. Try again.'); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error('The answer did not have the expected shape. Try again.');
  return { out: parsed.data, refused: null, usage };
};

/* ---------- Saving, guarded like every other writer ---------- */
/** Write cols to the row only if nobody changed it since it was read; read again and retry if they did. */
export async function guarded(sb: SupabaseClient, table: string, key: string, keyCol: string, fn: (row: Row) => Row | null) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = must(await sb.from(table).select('*').eq(keyCol, key).maybeSingle()) as Row | null;
    const cols = fn(row ?? {});
    if (!cols) return row;
    if (!row) { must(await sb.from(table).insert({ [keyCol]: key, ...cols }).select(keyCol)); return cols; }
    const out = must(await sb.from(table).update(cols).eq(keyCol, key).eq('updated_at', row.updated_at as string).select('*')) as Row[];
    if (out.length) return out[0];
    await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
  }
  throw new Error(`${table} ${key} kept changing while saving; try again`);
}

const MAX_DOC = 300000;
const MAX_FIELD = 100000;
/** Refuse an answer that would put something oversized into the idea (a prompt-injected card could try). */
function checkSize(what: string, value: unknown) {
  if (JSON.stringify(value).length > MAX_FIELD) throw new Error(`The ${what} came back too long to save.`);
}
/** Save a hooks file or storyboard. If another idea already owns that path (two ideas from one card), this idea's
 * copy gets its own path instead of overwriting the other's. Returns the path used. */
export async function saveDoc(sb: SupabaseClient, path: string, kind: string, title: string, body: string, ideaId: string): Promise<string> {
  if (body.length > MAX_DOC) throw new Error(`The ${kind} came back too long to save.`);
  const there = must(await sb.from('docs').select('idea_id').eq('path', path).maybeSingle()) as Row | null;
  const use = there && there.idea_id && there.idea_id !== ideaId ? path.replace(/\.md$/, `--${ideaId}.md`) : path;
  await guarded(sb, 'docs', use, 'path', row => (row.body === body && row.idea_id === ideaId ? null : { kind, title, body, idea_id: ideaId }));
  return use;
}

export function hooksPathFor(ctx: Context) {
  const card = cardOf(ctx.idea);
  return `${folderOf(card)}/hooks/${card ? card.split('/').pop() : `${ctx.idea.id}.md`}`;
}
export function storyboardPathFor(ctx: Context) {
  const card = cardOf(ctx.idea);
  return `${folderOf(card)}/storyboards/${card ? card.split('/').pop() : `${ctx.idea.id}.md`}`;
}

/* ---------- The job's record ---------- */
export const setJob = async (sb: SupabaseClient, id: string, cols: Row) => { must(await sb.from('jobs').update(cols).eq('id', id).select('id')); };

/* ---------- Starting a run (POST /api/story) ---------- */
export const LIVE = ['queued', 'hooks', 'storyboard'];
/** A run never lasts longer than this (Netlify stops background functions at 15 minutes). A live job older than
 * this died without saying so; it is marked failed so it can't block the idea. */
export const STALE_MS = 16 * 60 * 1000;

export type Started = { status: number; body: Record<string, unknown> };
export async function startStory(sb: SupabaseClient, ideaId: string, replace: boolean, launch: (jobId: string) => Promise<boolean>): Promise<Started> {
  let ctx: Context;
  try { ctx = await loadContext(sb, ideaId); } catch (e) { return { status: 404, body: { error: (e as Error).message } }; }
  const why = cantRun(ctx);
  if (why) return { status: 400, body: { error: why } };
  const lose = wouldReplace(ctx.idea);
  if (lose.length && !replace) return { status: 409, body: { confirm: `This replaces ${lose.join(' and ')}.` } };

  // Clear out a run that died without finishing, so it doesn't block this one.
  await sb.from('jobs').update({ step: 'failed', message: 'It stopped without finishing (ran out of time).', finished_at: new Date().toISOString() })
    .eq('idea_id', ideaId).in('step', LIVE).lt('updated_at', new Date(Date.now() - STALE_MS).toISOString()).select('id');

  const ins = await sb.from('jobs').insert({ kind: 'story', idea_id: ideaId, options: { replace } }).select('id').single();
  if (ins.error) {
    if (ins.error.code === '23505') return { status: 409, body: { error: "It's already working on this idea." } };
    return { status: 403, body: { error: "Couldn't start it." } };
  }
  const jobId = (ins.data as { id: string }).id;
  if (!(await launch(jobId).catch(() => false))) {
    await sb.from('jobs').update({ step: 'failed', message: "Couldn't start the worker. Try again.", finished_at: new Date().toISOString() }).eq('id', jobId).select('id');
    return { status: 502, body: { error: "Couldn't start it. Try again." } };
  }
  return { status: 202, body: { jobId } };
}

/* ---------- The whole run (the background function calls this; tests pass a fake `ask`) ---------- */
/** What only she changes while it runs. If any of it changes mid-run, the run stops rather than overwrite it. */
const hers = (r: Row) => JSON.stringify({
  chosen: r.chosen ?? null, own: r.own_hook ?? null,
  lines: ((r.script as { t: string; d?: boolean }[] | null) ?? []).filter(l => !l.d).map(l => l.t),
});
class EditedWhileRunning extends Error {}
class OutOfTime extends Error {}
const BUDGET_MS = 13 * 60 * 1000; // both calls and the saves, inside Netlify's 15 minutes

export async function runStory(sb: SupabaseClient, jobId: string, askFn: Ask = ask, client?: Anthropic, now = () => Date.now()): Promise<void> {
  const began = now();
  // Claim it: only a queued job moves to hooks, so a repeated call does nothing.
  const claimed = await sb.from('jobs').update({ step: 'hooks', started_at: new Date(began).toISOString(), message: '' })
    .eq('id', jobId).eq('step', 'queued').select('*');
  if (claimed.error || !claimed.data?.length) return;
  const job = claimed.data[0] as Row;
  const ideaId = String(job.idea_id);
  const usage: Record<string, Usage> = {};
  const finish = (step: 'done' | 'stopped' | 'failed', message: string) =>
    setJob(sb, jobId, { step, message: message.slice(0, 1000), usage, finished_at: new Date().toISOString() });
  // Time left for a call, keeping a minute for the saves after it.
  const left = () => {
    const ms = BUDGET_MS - (now() - began) - 60000;
    if (ms < 30000) throw new OutOfTime();
    return ms;
  };

  try {
    client ??= new Anthropic(); // ANTHROPIC_API_KEY from the environment
    const ctx = await loadContext(sb, ideaId);
    const formats = (((ctx.config?.opts as Row | undefined)?.hookFormat as string[] | undefined) ?? []);
    let snap = hers(ctx.idea);

    /* 1. Hooks */
    const h = await askFn(client, system(ctx, 'hooks'), hooksPrompt(ctx), hooksSchema(formats), left());
    usage.hooks = h.usage;
    if (h.refused) return await finish('stopped', h.refused);
    if (h.out!.stop) return await finish('stopped', h.out!.stop.message);
    const hooks = h.out!.hooks as Hook[];
    checkSize('hooks', hooks);
    if (h.out!.hooks_markdown.length > MAX_DOC) throw new Error('The hooks file came back too long to save.');
    // The idea first: if she edited it meanwhile, this stops before anything is saved.
    const after = await guarded(sb, 'ideas', ideaId, 'id', row => {
      if (hers(row) !== snap) throw new EditedWhileRunning();
      return { hooks, chosen: null, own_hook: null, rehook: null };
    }) as Row;
    snap = hers(after);
    await saveDoc(sb, hooksPathFor(ctx), 'hooks', `Hooks: ${ctx.idea.title}`, h.out!.hooks_markdown, ideaId);
    await setJob(sb, jobId, { step: 'storyboard', message: `${hooks.length} hooks written.`, usage });

    /* 2. Storyboard */
    const s = await askFn(client, system(ctx, 'storyboard'), storyboardPrompt(ctx, hooks), StoryboardSchema, left());
    usage.storyboard = s.usage;
    if (s.refused) return await finish('stopped', `Hooks are in; the storyboard stopped: ${s.refused}`);
    if (s.out!.stop) return await finish('stopped', `Hooks are in; the storyboard stopped: ${s.out!.stop.message}`);
    const o = s.out!;
    const beats = o.beats.map(b => ({ t: b.t, ...(b.gap ? { gap: b.gap } : {}), ...(b.waiting_on ? { waitingOn: b.waiting_on } : {}) }));
    const script = o.script.map(l => ({ t: l.t, d: true, ...(l.needs_her ? { g: l.needs_her } : {}) }));
    checkSize('storyboard', { beats, look: o.look, script, prep: o.prep });
    if (o.storyboard_markdown.length > MAX_DOC) throw new Error('The storyboard file came back too long to save.');
    await guarded(sb, 'ideas', ideaId, 'id', row => {
      if (hers(row) !== snap) throw new EditedWhileRunning();
      const drafted = new Set((row.drafted as string[] | null) ?? []);
      for (const k of ['setup', 'outfit', 'location', 'props', 'edit']) drafted.add(`look.${k}`);
      return { beats, look: o.look, script, prep: o.prep, prep_done: [], drafted: [...drafted] };
    });
    await saveDoc(sb, storyboardPathFor(ctx), 'storyboard', `Storyboard: ${ctx.idea.title}`, o.storyboard_markdown, ideaId);
    const cents = Object.values(usage).reduce((a, u) => a + u.cents, 0);
    await finish('done', `${hooks.length} hooks and a ${beats.length}-beat storyboard.${o.note ? ` ${o.note}` : ''} (about ${cents}¢)`);
  } catch (e) {
    const msg = e instanceof EditedWhileRunning ? 'You changed your hook pick, your own hook or script lines while it ran, so it stopped without touching them. Run it again when you are ready.'
      : e instanceof OutOfTime || e instanceof Anthropic.APIConnectionTimeoutError || e instanceof Anthropic.APIUserAbortError || (e as Error)?.name === 'TimeoutError' ? 'It ran out of time. Try again.'
      : e instanceof Anthropic.AuthenticationError ? "The server's Anthropic key was refused."
      : e instanceof Anthropic.RateLimitError ? 'Claude is busy right now. Try again in a minute.'
      : e instanceof Anthropic.APIError ? `Claude returned an error (${e.status}). Try again.`
      : (e as Error).message || 'Something went wrong.';
    await finish(e instanceof EditedWhileRunning ? 'stopped' : 'failed', msg).catch(() => {});
  }
}
