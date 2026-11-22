/* One-time backfill for migration 20261121120000_channels_posts_signals.sql: fills content.ideas.channels and
 * content.ideas.links from the Channels and Links columns of marketing/content-system/ideas.md, and adds the
 * channel options to config as a new config version. Same shape as cleanup-2026-11-20.ts.
 *
 * DRY RUN BY DEFAULT: reads the live rows and ideas.md, prints what would be written, and writes the full plan
 * (every write payload plus the updated_at each write is guarded by) to a JSON file. It prints that file's sha256.
 * Nothing is written to the database. The dry run works before the migration is applied: missing channels/links
 * are read as empty.
 *   Dry run: ../scripts/with-env npx tsx scripts/backfill-2026-11-21.ts --plan <plan.json>
 *   Apply:   ../scripts/with-env npx tsx scripts/backfill-2026-11-21.ts --plan <plan.json> --apply <sha256>
 *            (only after MQ approves the dry run that printed that hash, and after the migration is applied)
 *
 * --apply writes exactly what the approved dry run showed, from the plan file only. It refuses if the channels or
 * links columns don't exist yet. For each row it re-reads updated_at and writes only if it still matches the plan's
 * guard (the update itself is also .eq('updated_at', guard)). Adding a column doesn't touch updated_at, so a plan
 * built before the migration still applies after it. Only channels and links are ever written on an idea. The
 * config version is inserted only if the newest version is still the one the plan was built on.
 *
 * Rules: an idea with channels or links already set is skipped. A link equal to the idea's brief or source_url is
 * left out. A link whose label or path names a client or company, or that is labelled as client / never on screen,
 * is left out and reported by idea id only. Client and company names are read at run time from folder names in
 * the mellonhead repo (same rule as cleanup-2026-11-20.ts), so this file names none. Uses the secret key; never prints it. */
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
const PLAN_PATH = arg('--plan') ?? `${tmpdir()}/backfill-2026-11-21.plan.json`;
const REPO = `${homedir()}/Projects/mellonhead`;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { db: { schema: 'content' }, auth: { persistSession: false } });
const must = <T,>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data as T; };

/* ---------- Client and company names: copied from cleanup-2026-11-20.ts (importing it would run it) ---------- */
function clientPatterns(): RegExp[] {
  const dirs = (rel: string) => { try { return readdirSync(`${REPO}/${rel}`).filter(n => !n.startsWith('.') && !n.startsWith('_') && n !== 'Icon' && statSync(`${REPO}/${rel}/${n}`).isDirectory()); } catch { return []; } };
  const names = new Set<string>();
  for (const n of dirs('course-material')) if (n !== 'base') names.add(n.split('-')[0]);
  for (const n of dirs('prospects')) names.add(n);
  for (const n of dirs('business-development')) if (/[A-Z].*[A-Z]/.test(n)) names.add(n);
  for (const sub of ['partners', 'coaching', 'peer-conversations']) for (const n of dirs(`business-development/${sub}`)) if (n !== 'Co-created') names.add(n);
  const known = [...names].map(n => n.toLowerCase());
  for (const n of dirs('.claude/skills')) { const p = n.split('-')[0]; if (known.includes(p.toLowerCase())) names.add(p); }
  if (names.size < 4) throw new Error('Could not read the client folders in the mellonhead repo; stopping');
  return [...names].filter(n => n.length >= 3).map(n => {
    const parts = n.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_\s]+/).filter(Boolean).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b${parts.join('[-_\\s]?')}\\b`, 'i');
  });
}
const CLIENTS = clientPatterns();
const clientHit = (s: string) => CLIENTS.some(re => re.test(s));

type Link = { label: string; url: string };
type Entry = { table: 'ideas'; pk: 'id'; key: string; label: string; guard: string; cols: { channels?: string[]; links?: Link[] } };
type ConfigInsert = { baseN: number; row: { n: number; label: string; changes: unknown; snapshot: unknown } };
type Plan = { built: string; entries: Entry[]; config: ConfigInsert | null };
const WRITABLE = ['channels', 'links'];

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
  const stray = plan.entries.filter(e => e.table !== 'ideas' || Object.keys(e.cols).some(k => !WRITABLE.includes(k))).map(e => e.label);
  if (stray.length) throw new Error(`The plan writes something other than ideas.channels / ideas.links (${stray.join(', ')}). Nothing written.`);
  const bad = [...plan.entries.filter(e => clientHit(JSON.stringify(e.cols))).map(e => e.label), ...(plan.config && clientHit(JSON.stringify(plan.config.row)) ? ['config version'] : [])];
  if (bad.length) throw new Error(`A client or company name is in the plan (${bad.join(', ')}). Nothing written.`);
  const probe = await c.from('ideas').select('id,channels,links').limit(1);
  if (probe.error) throw new Error(`content.ideas has no channels/links columns yet (${probe.error.message}). Apply migration 20261121120000_channels_posts_signals.sql first. Nothing written.`);
  console.log(`Backfill 2026-11-21 · APPLY from ${PLAN_PATH} (sha256 ${got}, built ${plan.built})\n`);
  let written = 0; const refused: string[] = [];
  if (plan.config) {
    const top = must(await c.from('config_versions').select('n').order('n', { ascending: false }).limit(1)) as Row[];
    const topN = (top[0]?.n as number) ?? 0;
    // Checked before any idea is written, so a stale plan writes nothing rather than half.
    if (topN !== plan.config.baseN) throw new Error(`Config changed since the dry run (newest is now version ${topN}, the plan was built on ${plan.config.baseN}). Run a new dry run. Nothing written.`);
    {
      const ins = await c.from('config_versions').insert(plan.config.row);
      if (ins.error) refused.push(`config version ${plan.config.row.n} (${ins.error.message})`); else { written++; console.log(`written: config version ${plan.config.row.n}`); }
    }
  }
  for (const e of plan.entries) {
    const cur = must(await c.from('ideas').select('updated_at,channels,links').eq('id', e.key).maybeSingle()) as Row | null;
    if (!cur || cur.updated_at !== e.guard) { refused.push(`${e.label} (changed since the dry run)`); continue; }
    if ((e.cols.channels && (cur.channels as unknown[]).length) || (e.cols.links && (cur.links as unknown[]).length)) { refused.push(`${e.label} (channels or links already set)`); continue; }
    const res = must(await c.from('ideas').update(e.cols).eq('id', e.key).eq('updated_at', e.guard).select('id')) as Row[];
    if (res.length) { written++; console.log(`written: ${e.label}`); } else refused.push(`${e.label} (changed during the write)`);
  }
  console.log(`\nApplied: ${written} written, ${refused.length} refused, 0 deleted.`);
  for (const r of refused) console.log(`    refused: ${r}`);
  process.exit(refused.length ? 1 : 0);
}

/* ======================================================================================================
 * DRY RUN: read, plan, print, write the plan file.
 * ====================================================================================================== */
const CS = 'marketing/content-system';
const exists = (rel: string) => existsSync(`${REPO}/${rel}`);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const warnings: string[] = [];

/* ---------- Channels ---------- */
const CHANNELS = ['TikTok', 'LinkedIn', 'LinkedIn newsletter', 'YouTube', 'Mellonmail', 'community'];
const CHANNEL_ALIAS: Record<string, string> = Object.fromEntries([...CHANNELS.map(ch => [ch.toLowerCase(), ch]), ['linkedin newsletter slice', 'LinkedIn newsletter']]);
const unmapped: string[] = [];
function parseChannels(id: string, cell: string): string[] {
  const out: string[] = [];
  for (const raw of cell.split(/,|;|\s\+\s|\band\b/i).map(s => s.trim()).filter(Boolean)) {
    const ch = CHANNEL_ALIAS[raw.toLowerCase().replace(/\s+/g, ' ')];
    if (!ch) { unmapped.push(`${id}: "${raw}"`); continue; }
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

/* ---------- Links ---------- */
/** A path as written in ideas.md → a repo path. Paths relative to marketing/content-system/ (briefs/...) get the prefix. */
function fullPath(id: string, p: string): string {
  if (/^https?:/.test(p)) return p;
  if (p.startsWith('~/')) { warnings.push(`${id}: link "${p}" is outside the mellonhead repo; kept as written`); return p; }
  const bare = p.replace(/^\.\//, '');
  if (exists(bare.replace(/\/$/, ''))) return bare;
  if (exists(`${CS}/${bare}`.replace(/\/$/, ''))) return `${CS}/${bare}`;
  warnings.push(`${id}: link "${bare}" not found in the repo; kept as written`);
  return bare;
}
const looksLikeLink = (s: string) => /^https?:\/\//.test(s) || (/[/]/.test(s) && !/\s/.test(s)) || /\.md$/.test(s);
const baseName = (p: string) => p.replace(/\/$/, '').split('/').pop() || p;
/** Links that have no label in ideas.md, named by MQ (11/21). */
const LABEL_FOR: Record<string, string> = { 'let-go-podcast branding/ai-search-visibility/brief.md': 'Visibility audit (mentions the podcast)' };
const CLIENT_LABEL = /\bclient\b|never on screen/i;

/** Every labelled path or URL in a Links cell, in order. The label is the text before the colon that leads into
 * the link (after the previous sentence), trimmed; with no colon, the file's base name. */
function parseLinks(id: string, cell: string) {
  const found: { label: string; url: string; client: boolean }[] = [];
  const re = /`([^`]+)`|\[([^\]]*)\]\((https?:[^)\s]+)\)|(https?:\/\/[^\s)`]+)/g;
  let prev = 0;
  for (const m of cell.matchAll(re)) {
    const before = cell.slice(prev, m.index);
    prev = m.index! + m[0].length;
    const raw = (m[1] ?? m[3] ?? m[4]).trim();
    if (!looksLikeLink(raw)) continue;
    const lead = before.split(/[.;]\s+/).pop()!.trim();
    let label = lead.endsWith(':') ? lead.slice(0, -1).trim() : '';
    if (!label && m[2]) label = m[2].trim();
    const url = fullPath(id, raw);
    if (!label) label = LABEL_FOR[`${id} ${url}`] ?? baseName(url);
    found.push({ label, url, client: CLIENT_LABEL.test(label) || clientHit(label) || clientHit(url) || clientHit(raw) });
  }
  return found;
}

/* ---------- ideas.md rows ---------- */
type MdRow = { title: string; channels: string; links: string; card: string | null };
const mdRows: MdRow[] = readFileSync(`${REPO}/${CS}/ideas.md`, 'utf8').split('\n')
  .filter(l => l.startsWith('| ') && !l.startsWith('| Idea') && !l.startsWith('|---'))
  .map(l => l.split('|').slice(1, -1).map(x => x.trim()))
  .filter(col => col.length >= 9)
  .map(col => ({ title: col[0], channels: col[5], links: col[7], card: (col[7].match(/Card: `([^`]+)`/) || [])[1] || null }));

/** ideas.md titles that differ from the app's wording for the same idea (from build-import.ts). */
const SAME_AS: Record<string, string> = {
  'How good the results get when you give AI context': 'context',
  'Being let go in 2023': 'let-go-podcast',
  "Demo my family's finance app": 'finance-app',
  'AI-ITA: My Coworker Husband': 'husband',
  'Why "Turning Data Into Stories"': 'data-stories',
  'A lightning overview': 'lightning-data',
  "Do and don't when using AI": 'data-dos',
};

/** An ideas.md row → the idea it is, by (in order) the import's pinned titles, the import's md- id, the card path
 * the cleanup made the brief, the exact title, then the import's loose title match. */
function matchRow(md: MdRow, ideas: Row[]): { idea: Row; how: string } | null {
  const byId = (id: string) => ideas.find(i => i.id === id);
  const pinned = Object.entries(SAME_AS).find(([pre]) => md.title.startsWith(pre));
  if (pinned && byId(pinned[1])) return { idea: byId(pinned[1])!, how: 'pinned title' };
  const n = norm(md.title);
  const mdId = byId('md-' + n.replace(/ /g, '-').slice(0, 48));
  if (mdId) return { idea: mdId, how: 'import id' };
  if (md.card) { const hit = ideas.filter(i => String(i.brief || '') === md.card || String(i.brief || '') === md.card!.replace('marketing/tiktok/story-formats/', '')); if (hit.length === 1) return { idea: hit[0], how: 'card = brief' }; }
  const exact = ideas.filter(i => norm(String(i.title)) === n);
  if (exact.length === 1) return { idea: exact[0], how: 'title' };
  const loose = ideas.filter(i => n.includes(norm(String(i.title))) || norm(String(i.title)).includes(n.slice(0, 40)));
  if (loose.length === 1) return { idea: loose[0], how: 'loose title' };
  if (loose.length > 1) warnings.push(`ideas.md row "${md.title.slice(0, 40)}…" matches ${loose.length} ideas (${loose.map(i => i.id).join(', ')}); not used`);
  return null;
}

/* ---------- Read the database (select only) ---------- */
const ideas = must(await c.from('ideas').select('*').order('id')) as Row[];
const topCfg = (must(await c.from('config_versions').select('n,snapshot').order('n', { ascending: false }).limit(1)) as Row[])[0];
const columnsLive = ideas.length > 0 && 'channels' in ideas[0] && 'links' in ideas[0];
const list = (v: unknown) => (Array.isArray(v) ? v : []);

const live = ideas.filter(i => !i.archived);
const matched = new Map<string, { md: MdRow; how: string }>();
const mdUnmatched: string[] = [];
for (const md of mdRows) {
  const m = matchRow(md, live);
  if (!m) { mdUnmatched.push(md.title); continue; }
  const id = m.idea.id as string;
  if (matched.has(id)) { warnings.push(`${id}: two ideas.md rows match it; kept the first`); continue; }
  matched.set(id, { md, how: m.how });
}

const entries: (Entry & { channelsBefore: string[] })[] = [];
const noMdRow: string[] = [];
const alreadySet: string[] = [];
const nothingToAdd: string[] = [];
const clientLeftOut: Record<string, number> = {};
const droppedSame: string[] = [];

for (const r of live) {
  const id = r.id as string;
  const hit = matched.get(id);
  if (!hit) { noMdRow.push(id); continue; }
  const cols: Entry['cols'] = {};
  const skipped: string[] = [];
  if (list(r.channels).length) skipped.push('channels'); else {
    const ch = parseChannels(id, hit.md.channels);
    if (ch.length) cols.channels = ch;
  }
  if (list(r.links).length) skipped.push('links'); else {
    const links: Link[] = [];
    for (const l of parseLinks(id, hit.md.links)) {
      if (l.client) { clientLeftOut[id] = (clientLeftOut[id] || 0) + 1; continue; }
      // The import stored some briefs as shorter paths: a link whose path ends with the brief's is the same file.
      const sameFile = (u: string, b: unknown) => typeof b === 'string' && !!b && (u === b || u.endsWith('/' + b.replace(/^\/+/, '')));
      if (sameFile(l.url, r.brief) || l.url === r.source_url) { droppedSame.push(`${id}: "${l.label}" (same as ${sameFile(l.url, r.brief) ? 'brief' : 'source_url'})`); continue; }
      if (!links.some(x => x.url === l.url)) links.push({ label: l.label, url: l.url });
    }
    if (links.length) cols.links = links;
  }
  if (skipped.length) alreadySet.push(`${id} (${skipped.join(', ')} already set)`);
  if (Object.keys(cols).length) entries.push({ table: 'ideas', pk: 'id', key: id, label: `idea ${id}`, guard: r.updated_at as string, cols, channelsBefore: list(r.channels) as string[] });
  else if (!skipped.length) nothingToAdd.push(id);
}

/* ---------- Config: channels, inner world, gut check, client rule, as one new version (insert only) ---------- */
/** Text from the foundation and the story bank, copied exactly (minus the bold label). */
const FOUNDATION = readFileSync(`${REPO}/${CS}/foundation.md`, 'utf8');
const bullet = (md: string, label: string) => {
  const m = md.match(new RegExp(`^\\s*- \\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\*\\* (.*)$`, 'm'));
  if (!m) throw new Error(`No "${label}" bullet found`);
  return m[1].trim();
};
const INNER: Record<string, string> = { coreProblem: 'The core problem', hurting: "What's hurting", tried: "What he's tried", thinking: 'Thinking, not saying', afraid: 'Afraid of', wants: 'Wants' };
const innerWorld = Object.fromEntries(Object.entries(INNER).map(([k, label]) => [k, bullet(FOUNDATION, label)]));
const gut = bullet(FOUNDATION, 'Gut check for every video');
const personas = Object.fromEntries(['Dawn', 'Alex', 'Paloma'].map(p => {
  const m = gut.match(new RegExp(`\\b${p} (wants [^.]+)\\.`));
  if (!m) throw new Error(`Gut check bullet has no "${p} wants ..."`);
  return [p, m[1]];
}));
const gutQ = [gut.match(/Would all three keep watching\?/)?.[0], gut.match(/And: .*$/)?.[0]];
if (!gutQ[0] || !gutQ[1]) throw new Error('Gut check bullet: question not found');
const gutQuestion = gutQ.join(' ');
/* The story bank's client rule, as one string. Left out (and reported, without the text) if it names a client or
 * company: the guard knows folder names only, so an acronym or CamelCase word in the rule counts as a name too. */
const storyBank = readFileSync(`${REPO}/marketing/content-system/story-bank.md`, 'utf8');
const ruleLine = storyBank.match(/^\*\*Client stories[^*]*:\*\* (.*)$/m)?.[1]?.trim() || '';
const ruleNamesClient = !ruleLine || clientHit(ruleLine) || /\b[A-Z]{2,}\b|\b[A-Z][a-z]+[A-Z]\w*\b/.test(ruleLine);
if (ruleNamesClient) warnings.push(`config.clientRule: ${ruleLine ? 'the story bank\'s client rule names a client or company' : 'no client rule found in the story bank'}; left out of the config version`);

let config: ConfigInsert | null = null;
if (!topCfg) throw new Error('No config version found');
const before = topCfg.snapshot as { opts: Record<string, string[]>; retired?: Record<string, string[]>; config?: Record<string, unknown> };
const snap = structuredClone(before) as { opts: Record<string, string[]>; retired: Record<string, string[]>; config: Record<string, unknown> };
if (!snap.opts) throw new Error('The newest config has no options');
const changes: { field: string; from: string; to: string }[] = [];
if (snap.opts.channel) warnings.push(`config: opts.channel already exists (${JSON.stringify(snap.opts.channel)}); left as is`);
else {
  snap.opts.channel = [...CHANNELS];
  snap.retired = { ...(snap.retired || {}), channel: [] };
  changes.push({ field: 'channel', from: '', to: `Added ${CHANNELS.map(ch => `"${ch}"`).join(', ')}` });
}
snap.config = { ...(snap.config || {}) };
const setCfg = (k: string, v: unknown, to: string) => {
  if (k in snap.config) { warnings.push(`config: config.${k} already exists; left as is`); return; }
  snap.config[k] = v; changes.push({ field: `config.${k}`, from: '', to });
};
setCfg('innerWorld', innerWorld, 'Added the inner world (core problem, hurting, tried, thinking, afraid, wants) from foundation.md');
setCfg('personas', personas, 'Added Dawn, Alex and Paloma from the gut check in foundation.md');
setCfg('gutQuestion', gutQuestion, 'Added the gut-check question from foundation.md');
if (!ruleNamesClient) setCfg('clientRule', ruleLine, 'Added the client-story rule from story-bank.md');
// The label MQ asked for names the client rule; drop that part when the rule is left out.
const cfgLabel = 'clientRule' in snap.config ? 'Channels, inner world, gut check and client rule added' : 'Channels, inner world and gut check added';
if (changes.length) config = { baseN: topCfg.n as number, row: { n: (topCfg.n as number) + 1, label: cfgLabel, changes, snapshot: snap } };

/* Client-name guard over every value that would be written. */
const hits = [...entries.filter(e => clientHit(JSON.stringify(e.cols))).map(e => e.label), ...(config && clientHit(JSON.stringify(config.row)) ? ['config version'] : [])];
if (hits.length) throw new Error(`A client or company name would be written (${hits.join(', ')}). No plan file written.`);

/* ---------- Print ---------- */
console.log('Backfill 2026-11-21 · DRY RUN: nothing is written to the database\n');
console.log(columnsLive ? 'channels/links columns: present on the live database\n'
  : 'channels/links columns: NOT on the live database yet (read as empty). Apply the migration before --apply.\n');
if (config) {
  console.log(`config version ${config.row.n} (new, insert only; built on version ${config.baseN})`);
  console.log(`    label: ${JSON.stringify(config.row.label)}`);
  for (const ch of config.row.changes as { field: string; to: string }[]) {
    const [root, key] = ch.field === 'channel' ? ['opts', 'channel'] : ch.field.split('.');
    console.log(`    ${root}.${key}: (none) → ${JSON.stringify((snap as unknown as Record<string, Record<string, unknown>>)[root][key], null, 1).replace(/\n\s*/g, ' ')}`);
    if (ch.field === 'channel') console.log('    retired.channel: (none) → []');
  }
  console.log(`    changes: ${canon(config.row.changes)}\n`);
}
for (const e of entries) {
  const how = matched.get(e.key)!.how;
  console.log(`${e.label}  (matched by ${how})`);
  if (e.cols.channels) console.log(`    channels: [] → ${JSON.stringify(e.cols.channels)}`);
  for (const l of e.cols.links || []) console.log(`    + link ${JSON.stringify(l.label)}: ${l.url}`);
  if (clientLeftOut[e.key]) console.log(`    left out (client): ${clientLeftOut[e.key]} link(s)`);
  console.log('');
}
const section = (title: string, xs: string[]) => { if (xs.length) { console.log(`${title}:`); for (const x of xs) console.log(`    ${x}`); console.log(''); } };
section('Left out (client), by idea id', Object.entries(clientLeftOut).map(([id, n]) => `${id}: ${n} link(s)`));
section('Links left out because they equal the brief or source_url', droppedSame);
section('Channel values that do not map (not guessed)', unmapped);
section('Ideas with no ideas.md row (channels and links left empty)', noMdRow);
section('ideas.md rows with no idea', mdUnmatched.map(t => t.length > 60 ? t.slice(0, 60) + '…' : t));
section('Skipped: already set', alreadySet);
section('Matched, but nothing to add', nothingToAdd);
section('Archived ideas, not touched', ideas.filter(i => i.archived).map(i => i.id as string));
section('Notes', warnings);

const plan: Plan = { built: new Date().toISOString(), entries: entries.map(({ channelsBefore: _b, ...e }) => e), config };
const text = JSON.stringify(plan, null, 1);
writeFileSync(PLAN_PATH, text);
const withCh = entries.filter(e => e.cols.channels).length, withLinks = entries.filter(e => e.cols.links).length;
const nLinks = entries.reduce((s, e) => s + (e.cols.links?.length || 0), 0);
console.log(`Summary: ${config ? 1 : 0} config version to add; ${entries.length} ideas to change (${withCh} get channels, ${withLinks} get links, ${nLinks} links in all); ` +
  `${Object.values(clientLeftOut).reduce((a, b) => a + b, 0)} links left out (client) on ${Object.keys(clientLeftOut).length} ideas; ` +
  `${noMdRow.length} ideas with no ideas.md row; ${mdUnmatched.length} ideas.md rows with no idea; ${unmapped.length} unmapped channel values; ` +
  `${alreadySet.length} skipped (already set); 0 deleted. Client-name guard: ${CLIENTS.length} names checked, 0 in the plan.`);
console.log(`Plan file: ${PLAN_PATH}\nPlan sha256: ${sha256(text)}`);
console.log('Dry run: nothing was written to the database. Apply only after the migration and MQ\'s approval, with --plan <that file> --apply <that sha256>.');
