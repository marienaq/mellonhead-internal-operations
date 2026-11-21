/* One-time cleanup after the 2026-11-19 import (spec: MQ's decisions on gap-analysis-2026-11-20.md,
 * her answers of 2026-11-20, and the staff review).
 *
 * DRY RUN BY DEFAULT: reads the live rows and the markdown sources, works out the new values, prints a
 * before/after of only the fields that would change, and writes the full plan (every write payload plus the
 * updated_at each write is guarded by) to a JSON file. It prints that file's sha256. Nothing is written to the database.
 *   Dry run: ../scripts/with-env npx tsx scripts/cleanup-2026-11-20.ts --plan <plan.json>
 *   Apply:   ../scripts/with-env npx tsx scripts/cleanup-2026-11-20.ts --plan <plan.json> --apply <sha256>
 *            (only after MQ approves the dry run that printed that hash)
 *
 * --apply writes exactly what the approved dry run showed: it loads the plan file, checks its sha256, and writes
 * from the file. It never re-reads the markdown. For each row it re-reads updated_at and writes only if it still
 * matches the plan's guard (the update itself is also .eq('updated_at', guard)); a row that changed since the dry
 * run is refused and reported. The config version is inserted only if the newest version is still the one the
 * plan was built on. Archiving sets archived = true; nothing is deleted.
 *
 * updated_by: PostgREST can't set mh.actor, so content.touch() falls back. With the secret key the JWT claims
 * carry no email, so touch() stamps updated_by = 'system' on every row this writes.
 *
 * Only rows stamped updated_by = 'import' are touched, plus two ids MQ named (ALLOW below). Every other row is
 * left alone and listed. Every value written is checked against client and company names, read at run time
 * from folder names in the mellonhead repo, so this file names none. Uses the secret key; never prints it. */
// Node 20 has no WebSocket; this script never uses realtime, so a stub is enough.
(globalThis as { WebSocket?: unknown }).WebSocket ??= class {};
const { createClient } = await import('@supabase/supabase-js');
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { canon } from '../src/lib/remote';

type Row = Record<string, unknown>;
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');
const PLAN_PATH = arg('--plan') ?? `${tmpdir()}/cleanup-2026-11-20.plan.json`;
const REPO = `${homedir()}/Projects/mellonhead`;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { db: { schema: 'content' }, auth: { persistSession: false } });
const must = <T,>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data as T; };

/* ---------- Client and company names (folder names only; nothing named here) ----------
 * Where CLAUDE.md says client and prospect work lives: course-material/<client>/, prospects/<name>/, and
 * business-development/ (company folders there are CamelCase or capitalised parts; partner, coaching and peer
 * folders are named after people or firms). Skill folders whose prefix is one of those names are counted too. */
function clientPatterns(): RegExp[] {
  const dirs = (rel: string) => { try { return readdirSync(`${REPO}/${rel}`).filter(n => !n.startsWith('.') && !n.startsWith('_') && n !== 'Icon' && statSync(`${REPO}/${rel}/${n}`).isDirectory()); } catch { return []; } };
  const names = new Set<string>();
  for (const n of dirs('course-material')) if (n !== 'base') names.add(n.split('-')[0]);
  for (const n of dirs('prospects')) names.add(n);
  for (const n of dirs('business-development')) if (/[A-Z].*[A-Z]/.test(n)) names.add(n); // CamelCase or acronym: a company
  for (const sub of ['partners', 'coaching', 'peer-conversations']) for (const n of dirs(`business-development/${sub}`)) if (n !== 'Co-created') names.add(n);
  const known = [...names].map(n => n.toLowerCase());
  for (const n of dirs('.claude/skills')) { const p = n.split('-')[0]; if (known.includes(p.toLowerCase())) names.add(p); }
  if (names.size < 4) throw new Error('Could not read the client folders in the mellonhead repo; stopping');
  return [...names].filter(n => n.length >= 3).map(n => {
    // CamelCase splits into words and "a-b-c" into a b c; parts may be joined by nothing, a space, a hyphen or an underscore.
    const parts = n.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_\s]+/).filter(Boolean).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b${parts.join('[-_\\s]?')}\\b`, 'i');
  });
}
const CLIENTS = clientPatterns();
const clientHit = (s: string) => CLIENTS.some(re => re.test(s));

type Entry = { table: 'ideas' | 'takes' | 'stories'; pk: string; key: string | number; label: string; guard: string; cols: Row };
type ConfigInsert = { baseN: number; row: { n: number; label: string; changes: unknown; snapshot: unknown } };
type Plan = { built: string; entries: Entry[]; config: ConfigInsert | null };

/* ======================================================================================================
 * APPLY: from the approved plan file only.
 * ====================================================================================================== */
if (APPLY) {
  const want = arg('--apply');
  if (!want || !/^[0-9a-f]{64}$/.test(want)) throw new Error('usage: --plan <plan.json> --apply <sha256 printed by the approved dry run>');
  const text = readFileSync(PLAN_PATH, 'utf8');
  const got = sha256(text);
  if (got !== want) throw new Error(`Plan file hash ${got} doesn't match ${want}. Nothing written.`);
  const plan = JSON.parse(text) as Plan;
  const bad = [...plan.entries.filter(e => clientHit(JSON.stringify(e.cols))).map(e => e.label), ...(plan.config && clientHit(JSON.stringify(plan.config.row)) ? ['config version'] : [])];
  if (bad.length) throw new Error(`A client or company name is in the plan (${bad.join(', ')}). Nothing written.`);
  console.log(`Cleanup 2026-11-20 · APPLY from ${PLAN_PATH} (sha256 ${got}, built ${plan.built})\n`);
  let written = 0; const refused: string[] = [];
  if (plan.config) {
    const top = must(await c.from('config_versions').select('n,snapshot').order('n', { ascending: false }).limit(1)) as Row[];
    const topN = (top[0]?.n as number) ?? 0;
    if (topN !== plan.config.baseN) refused.push(`config version ${plan.config.row.n} (config changed since the dry run: newest is now ${topN})`);
    else {
      const ins = await c.from('config_versions').insert(plan.config.row);
      if (ins.error) refused.push(`config version ${plan.config.row.n} (${ins.error.message})`); else { written++; console.log(`written: config version ${plan.config.row.n}`); }
    }
  }
  for (const e of plan.entries) {
    const cur = must(await c.from(e.table).select('updated_at').eq(e.pk, e.key).maybeSingle()) as Row | null;
    if (!cur || cur.updated_at !== e.guard) { refused.push(`${e.label} (changed since the dry run)`); continue; }
    const res = must(await c.from(e.table).update(e.cols).eq(e.pk, e.key).eq('updated_at', e.guard).select(e.pk)) as Row[];
    if (res.length) { written++; console.log(`written: ${e.label}`); } else refused.push(`${e.label} (changed during the write)`);
  }
  console.log(`\nApplied: ${written} written, ${refused.length} refused, 0 deleted.`);
  for (const r of refused) console.log(`    refused: ${r}`);
  process.exit(refused.length ? 1 : 0);
}

/* ======================================================================================================
 * DRY RUN: read, plan, print, write the plan file.
 * ====================================================================================================== */
const TT = 'marketing/tiktok';
const SF = `${TT}/story-formats`;
const read = (rel: string) => readFileSync(`${REPO}/${rel}`, 'utf8');
const exists = (rel: string) => existsSync(`${REPO}/${rel}`);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const unquote = (s: string) => s.trim().replace(/^"(.*)"$/s, '$1');
const EMPTY_LOOK = { setup: '', outfit: '', location: '', props: '', edit: '' };
const warnings: string[] = [];

/* ---------- Markdown sources ---------- */
const IDEAS_MD = read('marketing/content-system/ideas.md');
const TAKES_MD = read('marketing/content-system/takes.md');

/** ideas.md title → card path (repo-relative), from the Links column. */
const mdCards: Record<string, string> = {};
for (const line of IDEAS_MD.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Idea') && !l.startsWith('|---'))) {
  const cols = line.split('|').slice(1, -1).map(x => x.trim());
  const card = (cols[7]?.match(/Card: `([^`]+)`/) || [])[1];
  if (card) mdCards[norm(cols[0])] = card;
}
/** takes.md row n, exactly as written. */
const takeText = (n: number) => {
  const line = TAKES_MD.split('\n').find(l => l.startsWith(`| ${n} |`));
  if (!line) throw new Error(`takes.md has no row ${n}`);
  return line.split('|').slice(1, -1).map(x => x.trim())[1];
};

/** "- **Key:** value" lines from a card's header. */
function cardFields(rel: string) {
  const f: Record<string, string> = {};
  for (const m of read(rel).matchAll(/^- \*\*([^*]+):\*\* (.*)$/gm)) if (!(m[1] in f)) f[m[1]] = m[2].trim();
  const src = f['Source'] || '';
  const url = (src.match(/\]\((https?:[^)]+)\)/) || src.match(/^(https?:\S+)/) || [])[1] || null;
  const where = (f['Where'] || '').split(' · ')[0].trim() || null;
  const hh = (f['Harm, benefit, or both'] || '').toLowerCase().split(/[\s(,.]/)[0];
  return { url, where, harmHelp: hh === 'harm' ? 'harm' : hh === 'help' || hh === 'benefit' ? 'help' : hh === 'both' ? 'both' : '', summary: f['Summary'] || '' };
}

/** A hooks file → the app's Hook shape. Options that failed the voice check ("Fail, left out") are dropped. */
function parseHooks(rel: string) {
  const md = read(rel);
  const rec = (md.match(/\*\*Recommendation:\*\* ([A-D])\b/) || [])[1];
  const failed = new Set([...md.matchAll(/^- \*\*([A-D])\.\*\* Fail\b/gm)].map(m => m[1]));
  const hooks: { spoken: string; onscreen: string; frame: string; format: string; payoff: string; rec: boolean }[] = [];
  const dropped: string[] = [];
  for (const sec of md.split(/^### /m).slice(1)) {
    const head = sec.split('\n')[0]; // "A. 10. Cold-read line (Curiosity)"
    const letter = head[0];
    const get = (k: string) => (sec.match(new RegExp(`^- \\*\\*${k}:\\*\\* (.*)$`, 'm')) || [])[1]?.trim() || '';
    if (failed.has(letter)) { dropped.push(letter); continue; }
    hooks.push({
      spoken: unquote(get('Said')), onscreen: unquote(get('On screen')), frame: get('First frame'),
      format: head.replace(/^[A-D]\.\s*\d+\.\s*/, '').trim(), payoff: get('Payoff'), rec: letter === rec,
    });
  }
  const herPick = (md.match(/\*\*Her (?:pick|hook)[^:]*:\*\* (.*)$/m) || [])[1];
  if (herPick && !/waiting/i.test(herPick)) warnings.push(`${rel}: records a pick ("${herPick}"); chosen not set automatically, check by hand`);
  return { hooks, dropped, rec };
}

/** A storyboard's beat note can name a client ("No client or <name> stories on camera"): keep the rule, drop the name. */
const scrub = (s: string) => s.replace(/No client or (\S+) stories on camera/g, (m, w: string) => (clientHit(w) ? 'No client stories on camera' : m));

/** A storyboard → beats (stage directions and the said column, as written) and look. No script lines:
 * every spoken line in these storyboards is listed under "Lines that aren't hers" or is a prompt for her. */
function parseStoryboard(rel: string) {
  const md = read(rel);
  const head = (k: string) => (md.match(new RegExp(`^- \\*\\*${k}:\\*\\* (.*)$`, 'm')) || [])[1]?.trim() || '';
  const signoffs = (md.split('**Sign-off options')[1] || '').split('\n\n')[0].split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).replace(/^Signed, /, '').trim());
  const beats: { t: string; gap?: string }[] = [];
  for (const line of md.split('\n').filter(l => /^\| \d+ \|/.test(l))) {
    const [, time, onScreen, said0, text, note] = line.split('|').slice(1, -1).map(x => x.trim());
    let said = said0.replace(/\[sign-off, pick one below\]/, `[sign-off: ${signoffs.join(' / ')}]`);
    let gap: string | undefined;
    const lead = said.match(/^\[MQ: ([^\]]+)\]\s*(.*)$/s);
    if (lead) { gap = lead[1] + (lead[2] ? `. ${lead[2]}` : ''); said = ''; }
    else { const inl = said.match(/\[MQ: ([^\]]+)\]/); if (inl) gap = inl[1]; }
    const parts = [time, `On screen: ${onScreen}`];
    if (said) parts.push(`Said: ${said}`);
    if (text && text !== 'none') parts.push(`Text: ${text}`);
    if (note) parts.push(`Note: ${note}`);
    const t = scrub(parts.join(' · '));
    beats.push(gap ? { t, gap } : { t });
  }
  // "outfit not set · setup talking head, seated at her desk · location her desk · props ..."
  const lk = head('Look');
  const part = (k: string) => { const m = lk.split(' · ').find(p => p.startsWith(k + ' ')); return m && !/not set$/.test(m) ? m.slice(k.length + 1).trim() : ''; };
  const look = { setup: part('setup'), outfit: part('outfit'), location: part('location'), props: part('props'), edit: scrub(head('Descript edit notes')) };
  const hookUsed = head('Hook used');
  if (hookUsed && !/^waiting/i.test(hookUsed)) warnings.push(`${rel}: "Hook used: ${hookUsed}"; chosen not set automatically, check by hand`);
  return { beats, look, cta: head('Call to action'), episode: Number((head('Episode').match(/^(\d+)/) || [])[1]) || null };
}

/** Episode numbers from the run of show: "- **Ep 2. Workplace advice: Automated my job, tell my boss?**",
 * keyed by the title after the format prefix, which is the card's own title. */
const ROS = read(`${TT}/run-of-show/2026-11-19.md`);
const rosEp: Record<string, number> = {};
for (const m of ROS.matchAll(/^- \*\*Ep (\d+)\. ([^*]+)\*\*/gm)) rosEp[norm(m[2].replace(/^[^:]+: /, ''))] = Number(m[1]);
const cardTitle = (rel: string) => read(rel).split('\n')[0].replace(/^#\s*/, '');

/* ---------- The three storyboarded ideas (decision 4) ---------- */
const WA = `${SF}/workplace-advice`;
const BOARDED: Record<string, string> = { 'two-pm': '2026-11-15-done-by-two-pm', dyslexia: '2026-11-15-dyslexic-trainee-email-signature', appraisals: '2026-11-15-twenty-appraisals-chatgpt' };
/** Pillar the hooks files give ("Built from: pillar X (c)"). */
const hooksPillar = (rel: string) => (read(rel).match(/\*\*Built from:\*\* pillar (\w+)/) || [])[1] || null;
/** Takes the storyboard names as possibly applying ("takes.md rows 2, 10 and 13"). */
const boardTakes = (rel: string) => ((read(rel).match(/takes\.md` rows ([\d, and]+)/) || [])[1] || '').match(/\d+/g)?.map(Number) || [];

/* ---------- Notes: only those with a markdown source stay ---------- */
const KEEP_NOTE: Record<string, (n: { who: string; text: string }) => boolean> = {
  // A trimmed version of "Your words, 11/4" under "Notes per idea" in ideas.md.
  context: n => n.who === 'You, Nov 4',
  // Verbatim in the card's Flags line.
  dyslexia: n => read(`${WA}/stories/${BOARDED.dyslexia}.md`).includes(n.text),
};

/* ---------- Decisions 5, 6 and MQ's answers ---------- */
const STATUS: Record<string, string> = { context: 'backlog', 'finance-app': 'published', 'data-stories': 'backlog', dyslexia: 'in progress', appraisals: 'in progress', 'two-pm': 'in progress' };
const DRAFT_TAGS = ['context', 'husband', 'chatbot-boss', 'chatbot-said']; // none has a hand-set pillar/type/feeling in ideas.md
const ARCHIVE = ['skills-stuck', 'do-it-scared'];
/** Takes the markdown never ties to these ideas (the prototype picked them). Kept: dyslexia 10, appraisals 16 (named in their storyboards). */
const SEED_ONLY_TAKE = ['tell-boss', 'chatbot-boss', 'husband', 'chatbot-said', 'two-pm', 'finance-app'];
/** Not stamped import, but MQ said to touch them (answers 4 and 5). Still guarded by updated_at. */
const OLD_PROCESS = `${TT}/own-ideas/storyboards/2026-11-19-old-process-hanging-on.md`;
const ALLOW: Record<string, 'clean' | 'storyboard'> = { 'data-dos': 'clean', 'new-1795233427422': 'storyboard' };

function cardPathFor(r: Row): string | null {
  const brief = String(r.brief || '');
  if (brief.endsWith('.md')) for (const p of [brief, `${SF}/${brief}`, `${TT}/${brief}`]) if (p.includes('/stories/') && exists(p)) return p;
  const fromMd = mdCards[norm(String(r.title))];
  return fromMd && exists(fromMd) ? fromMd : null;
}
function fullBrief(r: Row): string {
  const brief = String(r.brief || '');
  if (!brief.endsWith('.md')) return brief;
  for (const p of [brief, `${SF}/${brief}`, `marketing/content-system/${brief}`]) if (exists(p)) return p;
  return brief; // file not found: leave as is
}

/* ---------- Work out the new values ---------- */
/** Answer 4: her app idea gets the storyboard's tags, drafted, and the storyboard as its brief. Nothing else changes. */
function planOldProcess(r: Row): Row {
  const md = read(OLD_PROCESS);
  const tag = (k: string) => (md.match(new RegExp(`\\*\\*${k}:\\*\\* ([^·\\n]+)`)) || [])[1]?.trim() || '';
  const takes = [...tag('Takes').matchAll(/(\d+) \(([^)]*)\)/g)].map(m => ({ n: Number(m[1]), why: m[2] }));
  const drafted = new Set(r.drafted as string[]);
  const next: Row = { pillar: tag('Pillar'), type: tag('Type'), feeling: tag('Feeling'), brief: OLD_PROCESS };
  for (const k of ['pillar', 'type', 'feeling']) drafted.add(k);
  if (takes[0]) { next.take_n = takes[0].n; drafted.add('take'); }
  const notes = [...(r.notes as { who: string; text: string }[])];
  for (const t of takes.slice(1)) {
    const text = `The storyboard also names take ${t.n} (${t.why}).`;
    if (!notes.some(n => n.text === text)) notes.push({ who: 'From the storyboard, 11/19', text });
  }
  next.notes = notes;
  next.drafted = [...drafted];
  return next;
}

function planIdea(r: Row): Row {
  const id = r.id as string;
  if (ALLOW[id] === 'storyboard') return planOldProcess(r);
  const next: Row = {};
  const drafted = new Set(r.drafted as string[]);
  if (ARCHIVE.includes(id)) {
    if (IDEAS_MD.toLowerCase().includes(String(r.title).toLowerCase().slice(0, 24))) { warnings.push(`${id}: its title appears in ideas.md; not archived`); return next; }
    return { archived: true };
  }

  // Decision 1: the prototype's content, cleared.
  Object.assign(next, { gut: {}, tips: null, look: EMPTY_LOOK, prep: [], prep_done: [], slate: '', hooks: [], chosen: null, beats: [], script: [], post_date: null, cta_link: null });
  next.notes = (r.notes as { who: string; text: string }[]).filter(n => KEEP_NOTE[id]?.(n));
  if (SEED_ONLY_TAKE.includes(id)) { next.take_n = null; drafted.delete('take'); }

  // Links (decision 7) and the card (decision 4).
  next.brief = fullBrief(r);
  const card = cardPathFor(r);
  if (card) {
    if (!next.brief || !String(next.brief).endsWith('.md')) next.brief = card;
    if (id !== 'context') { // context's card is an own-ideas card: no outside source
      const f = cardFields(card);
      if (f.summary) { next.summary = f.summary; drafted.add('summary'); }
      if (f.url && f.url !== r.source_url) { next.source_url = f.url; next.source_label = f.where; }
      if (f.harmHelp && f.harmHelp !== r.harm_help) next.harm_help = f.harmHelp; // "both" is added to the options below (answer 1)
      if (f.harmHelp) drafted.add('harmHelp');
    }
  }

  // Episode: only where the markdown gives one (answer 2: kept as episode numbers).
  next.ep = (card && rosEp[norm(cardTitle(card))]) || null;

  // Decision 4: hooks and storyboard for the three in progress.
  if (BOARDED[id]) {
    const hk = parseHooks(`${WA}/hooks/${BOARDED[id]}.md`);
    const sb = parseStoryboard(`${WA}/storyboards/${BOARDED[id]}.md`);
    next.hooks = hk.hooks; drafted.add('hooks');
    next.beats = sb.beats; drafted.add('beats');
    next.look = sb.look; drafted.add('look');
    if (sb.cta === 'none') { next.cta = 'none'; drafted.add('cta'); }
    if (sb.episode) next.ep = sb.episode;
    const p = hooksPillar(`${WA}/hooks/${BOARDED[id]}.md`);
    if (p) { next.pillar = p; drafted.add('pillar'); }
    if (r.take_n && !boardTakes(`${WA}/storyboards/${BOARDED[id]}.md`).includes(r.take_n as number)) { next.take_n = null; drafted.delete('take'); }
    if (hk.dropped.length) warnings.push(`${id}: hook option ${hk.dropped.join(', ')} left out (failed the voice check in its hooks file)`);
  }

  if (STATUS[id]) next.status = STATUS[id];
  if (id === 'finance-app') { next.post_date = '2026-11-07'; next.week = null; }
  if (DRAFT_TAGS.includes(id)) for (const k of ['pillar', 'type', 'feeling']) drafted.add(k);
  next.drafted = [...drafted];
  return next;
}

/* Answer B: takes 5 and 18 exactly as takes.md has them. */
const TAKES_FROM_MD = [5, 18];
// story-bank.md names the sender of that email; only the date goes in.
const STORY_FIX: Record<string, (s: Row) => Row> = {
  grant: s => (String(s.known).includes('10/29') ? {} : { known: `Email of 10/29/2026: ${s.known}` }),
};

/* ---------- Print ---------- */
const show = (v: unknown, max = 200) => { const s = typeof v === 'string' ? JSON.stringify(v) : canon(v); return s.length > max ? s.slice(0, max) + `… (${s.length} chars)` : s; };
function printChange(col: string, before: unknown, after: unknown) {
  const list = (v: unknown) => Array.isArray(v) && v.length && typeof v[0] === 'object';
  if (list(before) || list(after)) {
    console.log(`    ${col}: ${Array.isArray(before) ? before.length : 0} item(s) → ${Array.isArray(after) ? after.length : 0} item(s)`);
    for (const x of (before as unknown[]) || []) console.log(`      - ${show(x, 140)}`);
    for (const x of (after as unknown[]) || []) console.log(`      + ${show(x, 2000)}`);
  } else console.log(`    ${col}: ${show(before)}\n      → ${show(after, 2000)}`);
}

/* ---------- Read the database (select only) ---------- */
const ideas = must(await c.from('ideas').select('*').order('id')) as Row[];
const takes = must(await c.from('takes').select('*').in('n', TAKES_FROM_MD)) as Row[];
const stories = must(await c.from('stories').select('*').in('key', Object.keys(STORY_FIX))) as Row[];
const topCfg = (must(await c.from('config_versions').select('n,snapshot').order('n', { ascending: false }).limit(1)) as Row[])[0];

const entries: (Entry & { before: Row })[] = [];
const leftAlone: string[] = [];
const unchanged: string[] = [];
const diff = (r: Row, next: Row) => Object.fromEntries(Object.entries(next).filter(([k, v]) => canon(v) !== canon(r[k])));
const who = (u: unknown) => (String(u).includes('@') ? 'MQ in the app' : String(u));

for (const r of ideas) {
  if (r.archived) continue;
  if (r.updated_by !== 'import' && !ALLOW[r.id as string]) { leftAlone.push(`idea ${r.id} "${r.title}" (updated_by ${who(r.updated_by)})`); continue; }
  const cols = diff(r, planIdea(r));
  if (Object.keys(cols).length) entries.push({ table: 'ideas', pk: 'id', key: r.id as string, label: `idea ${r.id} "${r.title}"${r.updated_by !== 'import' ? ` (allowed: updated_by ${who(r.updated_by)})` : ''}`, guard: r.updated_at as string, cols, before: r });
  else unchanged.push(r.id as string);
}
for (const t of takes) {
  if (t.updated_by !== 'import') { leftAlone.push(`take ${t.n} (updated_by ${who(t.updated_by)})`); continue; }
  const cols = diff(t, { text: takeText(t.n as number) });
  if (Object.keys(cols).length) entries.push({ table: 'takes', pk: 'n', key: t.n as number, label: `take ${t.n}`, guard: t.updated_at as string, cols, before: t });
}
for (const s of stories) {
  if (s.updated_by !== 'import') { leftAlone.push(`story ${s.key} (updated_by ${who(s.updated_by)})`); continue; }
  const cols = diff(s, STORY_FIX[s.key as string](s));
  if (Object.keys(cols).length) entries.push({ table: 'stories', pk: 'key', key: s.key as string, label: `story ${s.key}`, guard: s.updated_at as string, cols, before: s });
}

/* Answer 1: "both" becomes a harm/help option, as a new config version (insert only), if it isn't one yet. */
let config: ConfigInsert | null = null;
if (!topCfg) throw new Error('No config version found');
const snap = structuredClone(topCfg.snapshot) as { opts: Record<string, string[]> };
if (!snap.opts?.harmHelp) throw new Error('The newest config has no harm/help options');
if (!snap.opts.harmHelp.includes('both')) {
  snap.opts.harmHelp = [...snap.opts.harmHelp, 'both'];
  config = { baseN: topCfg.n as number, row: { n: (topCfg.n as number) + 1, label: 'Harm or help: added both', changes: [{ field: 'harmHelp', from: '', to: 'Added "both"' }], snapshot: snap } };
}

/* Client-name guard over every value that would be written. */
const hits = [...entries.filter(e => clientHit(JSON.stringify(e.cols))).map(e => e.label), ...(config && clientHit(JSON.stringify(config.row)) ? ['config version'] : [])];
if (hits.length) throw new Error(`A client or company name would be written (${hits.join(', ')}). No plan file written.`);

console.log('Cleanup 2026-11-20 · DRY RUN: nothing is written to the database\n');
if (config) {
  console.log(`config version ${config.row.n} (new, insert only; built on version ${config.baseN})`);
  console.log(`    label: ${JSON.stringify(config.row.label)}`);
  console.log(`    opts.harmHelp: ${JSON.stringify((topCfg.snapshot as typeof snap).opts.harmHelp)}\n      → ${JSON.stringify(snap.opts.harmHelp)}\n`);
} else console.log('config: "both" is already a harm/help option; no new version\n');
for (const e of entries) {
  console.log(`${e.label}${e.cols.archived ? '  [ARCHIVE]' : ''}`);
  for (const [k, v] of Object.entries(e.cols)) printChange(k, e.before[k], v);
  console.log('');
}
console.log('Left alone:');
for (const l of leftAlone) console.log(`    ${l}`);
if (warnings.length) { console.log('\nNotes:'); for (const w of warnings) console.log(`    ${w}`); }

const plan: Plan = { built: new Date().toISOString(), entries: entries.map(({ before: _b, ...e }) => e), config };
const text = JSON.stringify(plan, null, 1);
writeFileSync(PLAN_PATH, text);
const n = (t: string) => entries.filter(e => e.table === t).length;
const archived = entries.filter(e => e.cols.archived).length;
console.log(`\nSummary: ${config ? 1 : 0} config version to add, ${n('ideas')} ideas to change (${archived} archived, ${n('ideas') - archived} changed), ` +
  `${n('takes')} takes, ${n('stories')} stories; ${unchanged.length} ideas already right${unchanged.length ? ` (${unchanged.join(', ')})` : ''}; ` +
  `${leftAlone.length} rows left alone; 0 deleted. Client-name guard: ${CLIENTS.length} names checked, 0 found.`);
console.log(`Plan file: ${PLAN_PATH}\nPlan sha256: ${sha256(text)}`);
console.log('Dry run: nothing was written to the database. Apply only after MQ approves, with --plan <that file> --apply <that sha256>.');
