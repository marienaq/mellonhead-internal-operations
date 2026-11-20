/* Builds the one-time import SQL (stage E). Run: npx tsx scripts/build-import.ts <out.sql>
 * Sources: the prototype seed (the ideas MQ reviewed, with drafted hooks, beats and tips),
 * plus every other real row in marketing/content-system/ideas.md (Story format rows are skipped).
 * Left out on purpose: the example past weeks, and sample scripts (a script is her words).
 * Writes outside the repo: the output is exported data and must not be committed. */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { seed } from '../src/lib/seed';
import type { Idea } from '../src/lib/types';

const out = process.argv[2];
if (!out) throw new Error('usage: tsx scripts/build-import.ts <out.sql>');
const d = seed();
const IDEAS_MD = `${homedir()}/Projects/mellonhead/marketing/content-system/ideas.md`;

/* ---------- ideas.md rows not already in the seed ---------- */
const FEEL: Record<string, string> = { laughed: 'cheeky', 'called out': 'cheeky', understood: 'seen', validated: 'seen', hopeful: 'optimistic', proud: 'empowered', angry: 'seen', curious: 'curious', inspired: 'inspired', seen: 'seen' };
const STATUS: Record<string, Idea['status']> = { proposed: 'proposed', backlog: 'backlog', rejected: 'rejected', 'in progress': 'on deck', scheduled: 'on deck', published: 'published' };
const STYLE_BY_PREFIX: [string, string][] = [['AI-ITA', 'AI-ITA'], ['Chatbot Court', 'skit'], ['Workplace advice', 'workplace advice'], ['Tales From Tech Support', 'Tales From Tech Support']];
/* ideas.md rows whose titles differ from the prototype's wording for the same idea */
const SAME_AS: Record<string, string> = {
  'How good the results get when you give AI context': 'context',
  'Being let go in 2023': 'let-go-podcast',
  "Demo my family's finance app": 'finance-app',
  'AI-ITA: My Coworker Husband': 'husband',
  'Why "Turning Data Into Stories"': 'data-stories',
  'A lightning overview': 'lightning-data',
  "Do and don't when using AI": 'data-dos',
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seedTitles = d.ideas.filter(i => !i.past).map(i => norm(i.title));

const rows = readFileSync(IDEAS_MD, 'utf8').split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Idea') && !l.startsWith('|---'));
const extra: Idea[] = [];
const createdAt: Record<string, string> = {};
for (const line of rows) {
  const c = line.split('|').slice(1, -1).map(x => x.trim());
  if (c.length < 9) continue;
  const [title, , , feeling, , , statusRaw, links, added] = c;
  if (title.startsWith('Story format')) continue;
  const n = norm(title);
  const pinned = Object.entries(SAME_AS).find(([pre]) => title.startsWith(pre));
  if (pinned) { createdAt[pinned[1]] = added; continue; }
  const hit = d.ideas.find(i => !i.past && (norm(i.title) === n || n.includes(norm(i.title)) || norm(i.title).includes(n.slice(0, 40))));
  if (hit) { createdAt[hit.id] = added; continue; }
  if (seedTitles.some(t => t.length > 12 && n.includes(t))) continue;
  const status = STATUS[statusRaw.replace(/\s*\(.*\)$/, '')] || 'backlog';
  const first = feeling.replace(/\(c\)/g, '').split(',')[0].trim();
  const card = (links.match(/Card: `([^`]+)`/) || [])[1] || '';
  const id = 'md-' + n.replace(/ /g, '-').slice(0, 48);
  extra.push({
    id, title, status, week: null, postDate: null, summary: '', pillar: '', type: '',
    style: (STYLE_BY_PREFIX.find(([p]) => title.startsWith(p)) || [, ''])[1]!, onCamera: '', voice: 'Mariena',
    feeling: FEEL[first] || '', harmHelp: '', cta: '', take: null, story: null, series: '', ep: null, safety: 'clear',
    origin: 'read', brief: card.replace('marketing/tiktok/story-formats/', ''), sourceLink: null, hooks: [], chosen: null, rehook: null,
    beats: [], gut: {}, tips: null, notes: [], drafted: FEEL[first] ? ['feeling', 'style'] : ['style'], script: [], prep: [], slate: '',
    look: { setup: '', outfit: '', location: '', props: '', edit: '' },
  });
  createdAt[id] = added;
}

/* ---------- SQL ---------- */
const j = (v: unknown) => `$json$${JSON.stringify(v)}$json$::jsonb`;
const ideas = d.ideas.filter(i => !i.past).concat(extra).map(i => ({
  id: i.id, title: i.title, status: i.status, week: i.week, post_date: i.postDate, summary: i.summary, pillar: i.pillar, type: i.type,
  style: i.style, on_camera: i.onCamera, voice: i.voice, feeling: i.feeling, harm_help: i.harmHelp, cta: i.cta, cta_link: i.ctaLink ?? null,
  take_n: i.take, story_key: i.story, series: i.series, ep: i.ep, safety: i.safety, origin: i.origin, brief: i.brief,
  source_label: i.sourceLink?.label ?? null, source_url: i.sourceLink?.url ?? null, hooks: i.hooks,
  chosen: i.chosen === null ? null : String(i.chosen), own_hook: i.ownHook ?? null, rehook: i.rehook, beats: i.beats, gut: i.gut,
  tips: i.tips, notes: i.notes, drafted: i.drafted, script: [], prep: i.prep, slate: i.slate, look: i.look,
  reject_note: i.rejectNote ?? null, created_at: createdAt[i.id] ? `${createdAt[i.id]}T12:00:00Z` : new Date().toISOString(),
}));
const takes = Object.entries(d.takes).map(([n, t]) => ({ n: Number(n), short: t.short, text: t.text, pillar: t.pillar, on_camera: t.onCamera }));
const stories = Object.entries(d.stories).map(([key, s]) => ({ key, title: s.title, pillar: s.pillar, known: s.known, missing: s.missing, on_camera: s.onCamera }));
const snapshot = { opts: d.opts, retired: d.retired, pillars: d.pillars, config: d.config, targets: d.targets };
const [cur, ...older] = d.versions;

const sql = `-- One-time import, built ${new Date().toISOString()}. Exported data: never commit this file.
begin;
set local mh.actor = 'import';
insert into content.takes (n, short, text, pillar, on_camera)
  select * from jsonb_to_recordset(${j(takes)}) as x(n int, short text, text text, pillar text, on_camera text);
insert into content.stories (key, title, pillar, known, missing, on_camera)
  select * from jsonb_to_recordset(${j(stories)}) as x(key text, title text, pillar text, known text, missing text, on_camera text);
insert into content.ideas (id, title, status, week, post_date, summary, pillar, type, style, on_camera, voice, feeling, harm_help, cta, cta_link,
  take_n, story_key, series, ep, safety, origin, brief, source_label, source_url, hooks, chosen, own_hook, rehook, beats, gut, tips, notes,
  drafted, script, prep, slate, look, reject_note, created_at)
  select id, title, status, week, post_date, summary, pillar, type, style, on_camera, voice, feeling, harm_help, cta, cta_link,
    take_n, story_key, series, ep, safety, origin, brief, source_label, source_url, coalesce(hooks, '[]'), chosen, own_hook, rehook,
    coalesce(beats, '[]'), coalesce(gut, '{}'), tips, coalesce(notes, '[]'), drafted, coalesce(script, '[]'), coalesce(prep, '[]'), slate, look, reject_note, created_at
  from jsonb_to_recordset(${j(ideas)}) as x(id text, title text, status text, week date, post_date date, summary text, pillar text, type text,
    style text, on_camera text, voice text, feeling text, harm_help text, cta text, cta_link text, take_n int, story_key text, series text,
    ep int, safety text, origin text, brief text, source_label text, source_url text, hooks jsonb, chosen text, own_hook text, rehook jsonb,
    beats jsonb, gut jsonb, tips jsonb, notes jsonb, drafted text[], script jsonb, prep jsonb, slate text, look jsonb, reject_note text, created_at timestamptz);
${older.reverse().map(v => `insert into content.config_versions (n, label, changes, snapshot, created_at, created_by) values (${v.n}, ${j(v.label)}#>>'{}', ${j(v.changes)}, '{"note":"Imported history: the full snapshot starts at the current version."}', '${v.date}T12:00:00Z', 'import');`).join('\n')}
insert into content.config_versions (n, label, changes, snapshot, created_at, created_by) values (${cur.n}, ${j(cur.label)}#>>'{}', ${j(cur.changes)}, ${j(snapshot)}, '${cur.date}T12:00:00Z', 'import');
insert into content.weeks (week, film_day) values ('2026-11-23', '2026-11-25');
insert into content.prefs (id, include_proposed) values (1, false);
commit;
`;
writeFileSync(out, sql);
console.log(`ideas: ${ideas.length} (${extra.length} more from ideas.md) · takes: ${takes.length} · stories: ${stories.length} · config versions: ${d.versions.length}`);
console.log('extra rows:', extra.map(e => `${e.status}: ${e.title}`).join(' | '));
