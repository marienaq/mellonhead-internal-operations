/* One-time import for migration 20261122120000_docs_and_jobs.sql: copies what the hooks and storyboard skills read
 * from the mellonhead repo into content.docs, so the app's backend can read it (product/story-generation-design-2026-11-21.md).
 *
 * What it takes (only .md files, never a client folder):
 *   card        marketing/tiktok/{story-formats/*,own-ideas,long-form-cuts}/stories/*.md
 *   format      marketing/tiktok/story-formats/<format>/brief.md (and own-ideas / long-form-cuts briefs if present)
 *   brief       marketing/content-system/briefs/*.md, and any other .md an idea's brief points to
 *   storyboard  marketing/tiktok/.../storyboards/*.md   (linked to the idea that links its card)
 *   hooks       marketing/tiktok/.../hooks/*.md        (the same)
 *   reference   shared-standards.md, hook-research.md, foundation.md, writing-guide.md,
 *               and the newsletter-from-transcripts skill (the storyboard skill uses its Step 6)
 *   skill       .claude/skills/tiktok-hooks/SKILL.md, .claude/skills/tiktok-storyboard/SKILL.md
 *
 * DRY RUN BY DEFAULT: lists every doc and writes the plan (every row to insert) to a JSON file, then prints its sha256.
 *   Dry run: ../scripts/with-env npx tsx scripts/import-docs-2026-11-22.ts --plan <plan.json>
 *   Apply:   ../scripts/with-env npx tsx scripts/import-docs-2026-11-22.ts --plan <plan.json> --apply <sha256>
 * --apply inserts exactly the plan's rows. A path already in content.docs is skipped and reported, never overwritten.
 * Uses the secret key on this Mac only; never prints it. Deletes nothing. */
(globalThis as { WebSocket?: unknown }).WebSocket ??= class {};
const { createClient } = await import('@supabase/supabase-js');
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

type Row = Record<string, unknown>;
type Doc = { path: string; kind: string; title: string; body: string; idea_id: string | null };
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes('--apply');
const PLAN_PATH = arg('--plan') ?? `${tmpdir()}/import-docs-2026-11-22.plan.json`;
const REPO = `${homedir()}/Projects/mellonhead`;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { db: { schema: 'content' }, auth: { persistSession: false } });
const must = <T,>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data as T; };

const isFile = (rel: string) => { try { return statSync(`${REPO}/${rel}`).isFile(); } catch { return false; } };
const isDir = (rel: string) => { try { return statSync(`${REPO}/${rel}`).isDirectory(); } catch { return false; } };
const mdIn = (rel: string) => isDir(rel) ? readdirSync(`${REPO}/${rel}`).filter(n => n.endsWith('.md') && !n.startsWith('.')).sort().map(n => `${rel}/${n}`) : [];
const titleOf = (body: string, path: string) => (body.match(/^#\s+(.+)$/m)?.[1] ?? path.split('/').pop()!.replace(/\.md$/, '')).trim().slice(0, 200);
const PATH_OK = /^[A-Za-z0-9.][A-Za-z0-9._/ ()-]*$/;

/* ---------- Collect ---------- */
const formatDirs = ['marketing/tiktok/own-ideas', 'marketing/tiktok/long-form-cuts',
  ...(isDir('marketing/tiktok/story-formats') ? readdirSync(`${REPO}/marketing/tiktok/story-formats`).filter(n => isDir(`marketing/tiktok/story-formats/${n}`)).sort().map(n => `marketing/tiktok/story-formats/${n}`) : [])];

const wanted = new Map<string, string>(); // path -> kind
for (const d of formatDirs) {
  for (const p of mdIn(`${d}/stories`)) wanted.set(p, 'card');
  for (const p of mdIn(`${d}/storyboards`)) wanted.set(p, 'storyboard');
  for (const p of mdIn(`${d}/hooks`)) wanted.set(p, 'hooks');
  if (isFile(`${d}/brief.md`)) wanted.set(`${d}/brief.md`, 'format');
}
for (const p of mdIn('marketing/content-system/briefs')) wanted.set(p, 'brief');
for (const p of ['marketing/tiktok/story-formats/shared-standards.md', 'marketing/tiktok/hook-research.md',
  'marketing/content-system/foundation.md', 'writing-guide.md', '.claude/skills/newsletter-from-transcripts/SKILL.md']) wanted.set(p, 'reference');
for (const p of ['.claude/skills/tiktok-hooks/SKILL.md', '.claude/skills/tiktok-storyboard/SKILL.md']) wanted.set(p, 'skill');

const ideas = must(await c.from('ideas').select('id, title, brief, source_url, links, archived')) as Row[];
const live = ideas.filter(i => !i.archived);
// Any other .md an idea's brief points to (a storyboard used as a brief, a brief elsewhere).
for (const i of live) {
  const b = String(i.brief ?? '').trim();
  if (b.endsWith('.md') && !wanted.has(b) && isFile(b)) wanted.set(b, /\/storyboards\//.test(b) ? 'storyboard' : /\/stories\//.test(b) ? 'card' : 'brief');
}

const placesOf = (i: Row) => [String(i.brief ?? ''), String(i.source_url ?? ''), ...((i.links as { url: string }[] | null) ?? []).map(l => l.url)];
// A storyboard or hooks file belongs to the idea that links its card (same slug) or the file itself.
function ideaFor(path: string): string | null {
  const slug = path.split('/').pop()!;
  const card = path.replace(/\/(storyboards|hooks)\//, '/stories/');
  const hits = live.filter(i => placesOf(i).some(p => p === path || p === card || (p.endsWith(`/stories/${slug}`) && p.startsWith(path.split('/storyboards/')[0].split('/hooks/')[0]))));
  return hits.length === 1 ? String(hits[0].id) : null;
}

const docs: Doc[] = [];
const notes: string[] = [];
for (const [path, kind] of [...wanted.entries()].sort()) {
  if (!isFile(path)) { notes.push(`missing, skipped: ${path}`); continue; }
  if (!PATH_OK.test(path) || path.includes('..')) { notes.push(`odd path, skipped: ${path}`); continue; }
  const body = readFileSync(`${REPO}/${path}`, 'utf8');
  if (body.length > 400000) { notes.push(`too long, skipped: ${path}`); continue; }
  const idea_id = kind === 'storyboard' || kind === 'hooks' ? ideaFor(path) : null;
  if ((kind === 'storyboard' || kind === 'hooks') && !idea_id) notes.push(`${kind} with no single matching idea (kept, unlinked): ${path}`);
  docs.push({ path, kind, title: titleOf(body, path), body, idea_id });
}

/* ---------- Dry run ---------- */
if (!APPLY) {
  // Before the migration the table doesn't exist yet: everything is new.
  const ex = await c.from('docs').select('path');
  const existing = new Set(ex.error ? [] : (ex.data as Row[]).map(r => String(r.path)));
  if (ex.error) console.log('(content.docs does not exist yet: the migration runs before --apply)');
  const fresh = docs.filter(d => !existing.has(d.path));
  const byKind: Record<string, number> = {};
  for (const d of fresh) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
  for (const kind of ['skill', 'reference', 'format', 'brief', 'card', 'hooks', 'storyboard']) {
    const list = fresh.filter(d => d.kind === kind);
    if (!list.length) continue;
    console.log(`\n${kind} (${list.length}):`);
    for (const d of list) console.log(`    ${d.path}  (${Math.round(d.body.length / 1000)}k chars)${d.idea_id ? `  -> idea ${d.idea_id}` : ''}`);
  }
  if (existing.size) console.log(`\nAlready in the database, skipped: ${docs.length - fresh.length}`);
  if (notes.length) { console.log('\nNotes:'); for (const n of notes) console.log(`    ${n}`); }
  const plan = JSON.stringify({ built: new Date().toISOString(), docs: fresh }, null, 1);
  writeFileSync(PLAN_PATH, plan);
  console.log(`\nSummary: ${fresh.length} docs to add (${Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(', ')}).`);
  console.log(`Plan file: ${PLAN_PATH}\nPlan sha256: ${sha256(plan)}`);
  console.log('Dry run: nothing was written. Apply only after MQ approves, with --plan <that file> --apply <that sha256>.');
  process.exit(0);
}

/* ---------- Apply ---------- */
const want = arg('--apply');
if (!existsSync(PLAN_PATH)) throw new Error(`No plan at ${PLAN_PATH}`);
const raw = readFileSync(PLAN_PATH, 'utf8');
if (sha256(raw) !== want) throw new Error('The plan file does not match the approved sha256; refusing.');
const plan = JSON.parse(raw) as { docs: Doc[] };
let written = 0, skipped = 0;
for (const d of plan.docs) {
  const have = must(await c.from('docs').select('path').eq('path', d.path).maybeSingle());
  if (have) { console.log(`skipped (already there): ${d.path}`); skipped++; continue; }
  must(await c.from('docs').insert(d).select('path'));
  written++;
}
console.log(`\nApplied: ${written} written, ${skipped} skipped, 0 deleted.`);
