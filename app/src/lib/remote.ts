/* eslint-disable @typescript-eslint/no-explicit-any */
/* PKCE: the emailed link comes back as ?code=..., which leaves the #page part of the address to the app's router.
 * Supabase: load everything after sign-in, and save changes by comparing each row with what was last saved.
 * Only the publishable key is used here (safe in a browser: row-level security lets only MQ's login in).
 * Nothing is ever deleted: a row that disappears locally (for example, undoing "add idea") is archived. */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Block, Data, Idea, Persona, Gut } from './types';
import { CUR_WEEK, syncWeek } from './dates';

const env = ((import.meta as unknown as { env?: Record<string, string> }).env) ?? {};
const url = env.VITE_SUPABASE_URL as string | undefined;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const remoteEnabled = !!(url && key);
export const sb = remoteEnabled ? createClient(url!, key!, { db: { schema: 'content' }, auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null;

export async function getSession(): Promise<Session | null> { return sb ? (await sb.auth.getSession()).data.session : null; }
export async function sendLink(email: string) {
  const { error } = await sb!.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
/* Google sign-in through Supabase. Only an existing user can get in: sign-ups are off, and the data
 * is limited to the owner row in content.app_users. */
export async function signInWithGoogle() {
  const { error } = await sb!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}
export async function signOut() { await sb?.auth.signOut(); }

type Row = Record<string, unknown>;
const must = <T,>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data as T; };

/* ---------- Load ---------- */
/** When each row was last changed in the database, by table and key. The syncer uses these to notice
 * a row that changed somewhere else (the phone, the laptop, an agent through `mh content`). */
export type Stamps = Record<Table, Record<string, string>>;
export async function loadAll(c: SupabaseClient<any, any, any> = sb as unknown as SupabaseClient<any, any, any>): Promise<Data> {
  return (await loadWithStamps(c)).data;
}
export async function loadWithStamps(c: SupabaseClient<any, any, any> = sb as unknown as SupabaseClient<any, any, any>): Promise<{ data: Data; stamps: Stamps }> {
  const [ideas, takes, stories, weeks, versions, prefs] = await Promise.all([
    c.from('ideas').select('*').eq('archived', false).order('created_at'),
    c.from('takes').select('*').eq('archived', false),
    c.from('stories').select('*').eq('archived', false),
    c.from('weeks').select('*'),
    c.from('config_versions').select('*').order('n', { ascending: false }),
    c.from('prefs').select('*').eq('id', 1).maybeSingle(),
  ]).then(rs => rs.map(must)) as [Row[], Row[], Row[], Row[], Row[], Row | null];

  const top = versions[0]; if (!top) throw new Error('No config found. Run the import first.');
  const snap = top.snapshot as Pick<Data, 'opts' | 'retired' | 'pillars' | 'config' | 'targets'>;
  syncWeek(snap.config.filmWeekday); // before picking this week's run of show below
  const d: Data = {
    schema: 2,
    ideas: ideas.map(fromIdeaRow),
    takes: Object.fromEntries(takes.map(t => [t.n as number, { short: t.short as string, text: t.text as string, pillar: t.pillar as string, onCamera: t.on_camera as string }])),
    stories: Object.fromEntries(stories.map(s => [s.key as string, { title: s.title as string, pillar: s.pillar as string, known: s.known as string, missing: s.missing as string, onCamera: s.on_camera as string }])),
    opts: snap.opts, retired: snap.retired, pillars: snap.pillars, config: snap.config, targets: snap.targets,
    versions: versions.map(v => ({ n: v.n as number, date: String(v.created_at).slice(0, 10), label: v.label as string, changes: v.changes as Data['versions'][number]['changes'] })),
    includeProposed: !!prefs?.include_proposed,
    locked: {}, filmed: {}, prepDone: {}, ros: null,
  };
  for (const i of ideas) {
    if (i.filmed) d.filmed[i.id as string] = true;
    for (const n of (i.prep_done as number[]) || []) d.prepDone[`${i.id}:${n}`] = true;
  }
  for (const w of weeks) {
    if (w.reviewed_on) d.locked[w.week as string] = w.reviewed_on as string;
    if (w.week === CUR_WEEK) {
      d.ros = (w.ros as Block[] | null) ?? null;
      for (const n of (w.general_prep_done as number[]) || []) d.prepDone[`gen:${n}`] = true;
    }
  }
  const stamps: Stamps = { ideas: {}, takes: {}, stories: {}, weeks: {}, prefs: {} };
  for (const r of ideas) stamps.ideas[r.id as string] = r.updated_at as string;
  for (const r of takes) stamps.takes[String(r.n)] = r.updated_at as string;
  for (const r of stories) stamps.stories[r.key as string] = r.updated_at as string;
  for (const r of weeks) stamps.weeks[r.week as string] = r.updated_at as string;
  if (prefs) stamps.prefs['1'] = prefs.updated_at as string;
  return { data: d, stamps };
}

function fromIdeaRow(r: Row): Idea {
  const chosen = r.chosen === null ? null : r.chosen === 'own' ? 'own' : Number(r.chosen);
  return {
    id: r.id as string, title: r.title as string, status: r.status as Idea['status'], week: r.week as string | null, postDate: r.post_date as string | null,
    summary: r.summary as string, pillar: r.pillar as string, type: r.type as string, style: r.style as string, onCamera: r.on_camera as string,
    voice: r.voice as string, feeling: r.feeling as string, harmHelp: r.harm_help as string, cta: r.cta as string, ctaLink: (r.cta_link as string) || undefined,
    take: r.take_n as number | null, story: r.story_key as string | null, series: r.series as string, ep: r.ep as number | null,
    safety: r.safety as Idea['safety'], origin: r.origin as Idea['origin'], brief: r.brief as string,
    sourceLink: r.source_url ? { label: (r.source_label as string) || (r.source_url as string), url: r.source_url as string } : null,
    hooks: r.hooks as Idea['hooks'], chosen, ownHook: (r.own_hook as string) || undefined, rehook: r.rehook as Idea['rehook'],
    beats: r.beats as Idea['beats'], gut: r.gut as Partial<Record<Persona, Gut>>, tips: r.tips as Idea['tips'], notes: r.notes as Idea['notes'],
    drafted: r.drafted as string[], script: r.script as Idea['script'], prep: r.prep as string[], slate: r.slate as string, look: r.look as Idea['look'],
    rejectNote: (r.reject_note as string) || undefined, addedAfterLock: !!r.added_after_lock, added: Date.parse(r.created_at as string),
  };
}

/* ---------- Rows from the app's data ---------- */
export function rowsOf(d: Data) {
  const ideas: Record<string, Row> = {};
  for (const i of d.ideas) {
    if (i.past) continue;
    ideas[i.id] = {
      id: i.id, title: i.title, status: i.status, week: i.week, post_date: i.postDate, summary: i.summary, pillar: i.pillar, type: i.type,
      style: i.style, on_camera: i.onCamera, voice: i.voice, feeling: i.feeling, harm_help: i.harmHelp, cta: i.cta, cta_link: i.ctaLink ?? null,
      take_n: i.take, story_key: i.story, series: i.series, ep: i.ep, safety: i.safety, origin: i.origin, brief: i.brief,
      source_label: i.sourceLink?.label ?? null, source_url: i.sourceLink?.url ?? null, hooks: i.hooks,
      chosen: i.chosen === null ? null : String(i.chosen), own_hook: i.ownHook ?? null, rehook: i.rehook, beats: i.beats, gut: i.gut, tips: i.tips,
      notes: i.notes, drafted: i.drafted, script: i.script, prep: i.prep,
      prep_done: i.prep.map((_, n) => n).filter(n => d.prepDone[`${i.id}:${n}`]), filmed: !!d.filmed[i.id], slate: i.slate, look: i.look,
      reject_note: i.rejectNote ?? null, added_after_lock: !!i.addedAfterLock, archived: false,
    };
  }
  const takes: Record<string, Row> = {};
  for (const [n, t] of Object.entries(d.takes)) takes[n] = { n: Number(n), short: t.short, text: t.text, pillar: t.pillar, on_camera: t.onCamera, archived: false };
  const stories: Record<string, Row> = {};
  for (const [k, s] of Object.entries(d.stories)) stories[k] = { key: k, title: s.title, pillar: s.pillar, known: s.known, missing: s.missing, on_camera: s.onCamera, archived: false };
  const weeks: Record<string, Row> = {};
  const weekKeys = new Set([...Object.keys(d.locked), CUR_WEEK]);
  for (const w of weekKeys) weeks[w] = {
    week: w, reviewed_on: d.locked[w] ?? null,
    ...(w === CUR_WEEK ? { ros: d.ros, general_prep_done: Object.keys(d.prepDone).filter(k => k.startsWith('gen:') && d.prepDone[k]).map(k => Number(k.slice(4))) } : {}),
  };
  const prefs: Record<string, Row> = { 1: { id: 1, include_proposed: d.includeProposed } };
  const snapshot = { opts: d.opts, retired: d.retired, pillars: d.pillars, config: d.config, targets: d.targets };
  return { ideas, takes, stories, weeks, prefs, snapshot };
}

/* ---------- Save: write only the fields that changed ----------
 * Each row is compared with what was last saved, column by column, and only the changed columns are
 * written. So two places changing different fields of the same idea both keep their change.
 * The write is guarded by the row's updated_at: if the row changed somewhere else since this tab
 * loaded it, the guard misses, the changed fields are written anyway (this tab's edit is the most
 * recent thing you did), and the app reloads afterwards so you see both. */
const PK = { ideas: 'id', takes: 'n', stories: 'key', weeks: 'week', prefs: 'id' } as const;
type Table = keyof typeof PK;
const TABLES: Table[] = ['takes', 'stories', 'ideas', 'weeks', 'prefs']; // takes and stories first: ideas reference them

export function makeSyncer(initial: Data, initialStamps: Stamps, hooks: {
  onVersions: (v: Data['versions']) => void;
  onError: (msg: string) => void;
  /** A row had changed elsewhere; the store should reload once it's safe. */
  onConflict: (what: string) => void;
}) {
  type Saved = { rows: Record<Table, Record<string, Row>>; config: string };
  const snapshotOf = (d: Data): Saved => { const r = rowsOf(d); return { rows: { ideas: r.ideas, takes: r.takes, stories: r.stories, weeks: r.weeks, prefs: r.prefs }, config: JSON.stringify(r.snapshot) }; };
  let saved = snapshotOf(initial);
  let stamps: Stamps = structuredClone(initialStamps);
  let savedMaxN = initial.versions[0]?.n ?? 0;
  let pending: Data | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = Promise.resolve();
  let inFlight = 0; // saves scheduled or running

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const label = (t: Table, k: string, row: Row) => t === 'ideas' ? `"${row.title as string}"` : t === 'takes' ? `take ${k}` : t === 'stories' ? `story "${row.title as string}"` : t === 'weeks' ? `the week of ${k}` : 'your settings';

  async function writeRow(t: Table, k: string, cols: Row, row: Row, conflicts: string[]) {
    const stamp = stamps[t][k];
    if (!stamp) { // not in the database when this tab loaded: insert it (or merge with one another device just added)
      const res = await sb!.from(t).upsert({ ...row }, { onConflict: PK[t] }).select('updated_at');
      const out = must(res) as Row[]; stamps[t][k] = out[0]?.updated_at as string; return;
    }
    const guarded = must(await sb!.from(t).update(cols).eq(PK[t], k).eq('updated_at', stamp).select('updated_at')) as Row[];
    if (guarded.length) { stamps[t][k] = guarded[0].updated_at as string; return; }
    // Changed elsewhere since this tab loaded it. Write this tab's fields anyway, then reload.
    const forced = must(await sb!.from(t).update(cols).eq(PK[t], k).select('updated_at')) as Row[];
    if (forced.length) stamps[t][k] = forced[0].updated_at as string;
    conflicts.push(label(t, k, row));
  }

  async function flush(d: Data) {
    const next = snapshotOf(d);
    const conflicts: string[] = [];
    for (const t of TABLES) {
      for (const [k, row] of Object.entries(next.rows[t])) {
        const before = saved.rows[t][k];
        if (!before) { await writeRow(t, k, row, row, conflicts); continue; }
        const cols: Row = {};
        for (const c of Object.keys(row)) if (!same(row[c], before[c])) cols[c] = row[c];
        if (Object.keys(cols).length) await writeRow(t, k, cols, row, conflicts);
      }
      // Gone locally (an undo): archive, never delete. Weeks and prefs never disappear.
      if (t === 'ideas' || t === 'takes' || t === 'stories')
        for (const k of Object.keys(saved.rows[t])) if (!(k in next.rows[t])) await writeRow(t, k, { archived: true }, saved.rows[t][k], conflicts);
    }
    if (next.config !== saved.config) {
      // Every config change is a new version. Versions already saved can't change, so an undo is saved as a new version too.
      const snap = JSON.parse(next.config);
      let fresh = d.versions.filter(v => v.n > savedMaxN).reverse();
      if (!fresh.length) fresh = [{ n: savedMaxN + 1, date: '', label: 'Undo: back to the earlier setting', changes: [] }];
      const rows = fresh.map((v, k) => ({ n: savedMaxN + 1 + k, label: v.label, changes: v.changes, snapshot: snap }));
      const ins = await sb!.from('config_versions').insert(rows);
      if (ins.error && (ins.error as { code?: string }).code === '23505') conflicts.push('your config'); // another device saved a version with this number first
      else must(ins);
      if (!ins.error) savedMaxN += rows.length;
      const all = must(await sb!.from('config_versions').select('n,label,changes,created_at').order('n', { ascending: false })) as Row[];
      hooks.onVersions(all.map(v => ({ n: v.n as number, date: String(v.created_at).slice(0, 10), label: v.label as string, changes: v.changes as Data['versions'][number]['changes'] })));
    }
    saved = next;
    if (conflicts.length) hooks.onConflict(conflicts.slice(0, 2).join(' and ') + (conflicts.length > 2 ? ` and ${conflicts.length - 2} more` : ''));
  }

  return {
    /** Save soon; rapid changes (typing, dragging) fold into one save. */
    queue(d: Data) {
      pending = d;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const d2 = pending!; pending = null; inFlight++;
        running = running.then(() => flush(d2)).catch(e => hooks.onError(e instanceof Error ? e.message : String(e))).finally(() => { inFlight--; });
      }, 400);
    },
    /** Nothing waiting to save and nothing saving: safe to replace the data with a fresh load. */
    idle: () => !pending && inFlight === 0,
    /** After a fresh load: compare future changes with what's in the database now. */
    rebase(d: Data, s: Stamps) { saved = snapshotOf(d); stamps = structuredClone(s); savedMaxN = d.versions[0]?.n ?? 0; },
  };
}
