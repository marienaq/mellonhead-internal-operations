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
export async function loadWithStamps(c: SupabaseClient<any, any, any> = sb as unknown as SupabaseClient<any, any, any>, settleWeek = true): Promise<{ data: Data; stamps: Stamps }> {
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
  // Settle the week before picking this week's run of show below. Only on the first load: a later refresh
  // that finds a new week reloads the page instead, so nothing from last week is saved into the new one.
  if (settleWeek) syncWeek(snap.config.filmWeekday);
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
 * Each row is compared with what was last saved, column by column, and only changed columns are written,
 * so two places changing different fields of the same idea both keep their change.
 *
 * Writes are guarded by the row's updated_at. When the guard misses (the row changed elsewhere since this
 * tab loaded it), the row is read back and merged:
 *   - list-like columns merge: ticks (prep_done, general_prep_done) keep both sides' adds and removes;
 *     notes keep everyone's entries.
 *   - any other column this tab changed is written; if the other side changed that same column too,
 *     that's a real clash and she's told her change replaced theirs.
 * Then the app reloads so she sees the other side's changes.
 *
 * Progress is recorded row by row, so a save that fails halfway retries only what's left, and the
 * syncer stays "dirty" (not idle) until it succeeds: a refresh never replaces unsaved edits. */
const PK = { ideas: 'id', takes: 'n', stories: 'key', weeks: 'week', prefs: 'id' } as const;
type Table = keyof typeof PK;
const TABLES: Table[] = ['takes', 'stories', 'ideas', 'weeks', 'prefs']; // takes and stories first: ideas reference them
const SET_COLS = new Set(['prep_done', 'general_prep_done']);
const APPEND_COLS = new Set(['notes']);

/** JSON with object keys sorted, so jsonb from Postgres (which reorders keys) compares equal to the same value here. */
export function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, (x as Row)[k]])) : x));
}
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

/** Merge a list column: start from theirs, apply what this tab added and removed since its base. */
function mergeList(col: string, base: unknown, mine: unknown, theirs: unknown): unknown[] {
  const b = Array.isArray(base) ? base : [], m = Array.isArray(mine) ? mine : [], t = Array.isArray(theirs) ? theirs : [];
  const key = (x: unknown) => canon(x);
  const bk = new Set(b.map(key)), mk = new Set(m.map(key));
  const added = m.filter(x => !bk.has(key(x)));
  const removed = new Set(b.filter(x => !mk.has(key(x))).map(key));
  const out = t.filter(x => !removed.has(key(x)));
  const have = new Set(out.map(key));
  for (const x of added) if (!have.has(key(x))) { out.push(x); have.add(key(x)); }
  if (SET_COLS.has(col)) return (out as number[]).sort((x, y) => x - y);
  return out;
}

export type SyncHooks = {
  onVersions: (v: Data['versions']) => void;
  onError: (msg: string) => void;
  /** Rows changed elsewhere were merged; reload to show them. `clash` names rows where her change replaced someone else's. */
  onConflict: (clash: string | null) => void;
  /** A new take's number was already used in the database (another device, an agent, or an archived take): it was saved as `to`. */
  onRenumberTake: (from: number, to: number) => void;
};

export function makeSyncer(initial: Data, initialStamps: Stamps, hooks: SyncHooks, client?: SupabaseClient<any, any, any>) {
  const db = (client ?? sb) as SupabaseClient<any, any, any>; // a stand-in client in tests
  type Saved = { rows: Record<Table, Record<string, Row>>; config: string };
  const snapshotOf = (d: Data): Saved => { const r = rowsOf(d); return { rows: { ideas: r.ideas, takes: r.takes, stories: r.stories, weeks: r.weeks, prefs: r.prefs }, config: canon(r.snapshot) }; };
  let saved = snapshotOf(initial);
  let stamps: Stamps = structuredClone(initialStamps);
  let savedMaxN = initial.versions[0]?.n ?? 0;
  const savedVersionKeys = new Set<string>();
  /** Rows merged with another place's changes that her screen doesn't show yet (until the refresh). Every
   * write to them reads and merges first, so a later edit can't silently overwrite the other side. */
  const unseen = new Set<string>();
  let pending: Data | null = null;
  let failed: Data | null = null; // the last data a failed save was trying to write; retried until it lands
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let running = Promise.resolve();
  let inFlight = 0;
  let seq = 0; // bumps on every queued change: a refresh compares it before and after loading

  const label = (t: Table, k: string, row: Row) => t === 'ideas' ? `"${row.title as string}"` : t === 'takes' ? `take ${k}` : t === 'stories' ? `story "${row.title as string}"` : t === 'weeks' ? `the week of ${k}` : 'your settings';

  /** Write one row. Returns the row as it now stands in the database (as far as this tab's columns go). */
  async function writeRow(t: Table, k: string, cols: Row, base: Row | undefined, row: Row, out: { merged: boolean; clashes: string[] }): Promise<Row> {
    const stamp = stamps[t][k];
    if (!stamp) {
      // New here. Insert; if the key is already taken, it isn't new after all.
      const ins = await db.from(t).insert({ ...row }).select('updated_at');
      if (!ins.error) { stamps[t][k] = (ins.data as Row[])[0]?.updated_at as string; return row; }
      if ((ins.error as { code?: string }).code !== '23505') throw new Error(ins.error.message);
      if (t === 'takes') throw Object.assign(new Error('take number taken'), { takeTaken: true });
      // Another device created the same key (for example this week's row): merge into theirs below, with no base.
    }
    // List columns (ticks, notes) always merge with what's in the database now, so another place's
    // items survive even when this tab's copy of the row is current.
    const hasList = Object.keys(cols).some(c => SET_COLS.has(c) || APPEND_COLS.has(c));
    const guarded = stamp && !hasList && !unseen.has(`${t}:${k}`) ? must(await db.from(t).update(cols).eq(PK[t], k).eq('updated_at', stamp).select('updated_at')) as Row[] : [];
    if (guarded.length) { stamps[t][k] = guarded[0].updated_at as string; return row; }

    // Changed elsewhere since this tab loaded it (or created elsewhere), or a list column. Read it and merge;
    // the write is guarded by the stamp just read, and goes again if another write slipped in between.
    for (let attempt = 0; ; attempt++) {
    const cur = must(await db.from(t).select('*').eq(PK[t], k).maybeSingle()) as Row | null;
    if (!cur) throw new Error(`${label(t, k, row)} is missing from the database`);
    const final: Row = {};
    let clash = false;
    for (const c of Object.keys(cols)) {
      if (SET_COLS.has(c) || APPEND_COLS.has(c)) final[c] = mergeList(c, base?.[c], cols[c], cur[c]);
      else {
        final[c] = cols[c];
        if (!same(cur[c], cols[c]) && (!base || !same(cur[c], base[c]))) clash = true; // they changed this column too
      }
    }
    const changes = Object.keys(final).some(c => !same(final[c], cur[c]));
    if (changes) {
      const forced = must(await db.from(t).update(final).eq(PK[t], k).eq('updated_at', cur.updated_at).select('updated_at')) as Row[];
      if (!forced.length) { if (attempt < 4) continue; throw new Error(`${label(t, k, row)} kept changing while saving. Try again.`); }
      stamps[t][k] = forced[0].updated_at as string;
    } else stamps[t][k] = cur.updated_at as string;
    // Did the other side change anything this tab doesn't have? Then reload to show it.
    out.merged = out.merged || Object.keys(cur).some(c => c !== 'updated_at' && c !== 'updated_by' && c !== 'created_at' && c in row && !same(cur[c], c in final ? final[c] : row[c]));
    if (clash) out.clashes.push(label(t, k, row));
    if (Object.keys(cur).some(c => c in row && c !== 'updated_at' && !same(cur[c], c in final ? final[c] : row[c]))) unseen.add(`${t}:${k}`);
    // Record what THIS tab has, not the merged row: the next save then writes only her next changes
    // (list columns merge again against the database), and an undo diffs only her own columns.
    // The refresh that follows brings the other side's values onto her screen.
    return row;
    }
  }

  /** Free in the database (archived takes too) and not used by any take this tab has. */
  async function nextFreeTake(local: Iterable<string>): Promise<number> {
    const top = must(await db.from('takes').select('n').order('n', { ascending: false }).limit(1)) as Row[];
    return Math.max((top[0]?.n as number) ?? 0, ...[...local].map(Number), ...Object.keys(saved.rows.takes).map(Number)) + 1;
  }

  async function flush(d: Data) {
    const next = snapshotOf(d);
    const out = { merged: false, clashes: [] as string[] };
    const takeMap = new Map<number, number>();
    for (const t of TABLES) {
      for (const [k, row0] of Object.entries(next.rows[t])) {
        let row = row0;
        if (t === 'ideas' && takeMap.has(row.take_n as number)) row = { ...row, take_n: takeMap.get(row.take_n as number) };
        const base = saved.rows[t][k];
        const cols: Row = {};
        if (base) { for (const c of Object.keys(row)) if (!same(row[c], base[c])) cols[c] = row[c]; if (!Object.keys(cols).length) continue; }
        try {
          saved.rows[t][k] = await writeRow(t, k, base ? cols : row, base, row, out);
        } catch (e) {
          if (!(e as { takeTaken?: boolean }).takeTaken) throw e;
          const to = await nextFreeTake([...Object.keys(next.rows.takes), ...takeMap.values()].map(String));
          const moved = { ...row, n: to };
          const ins = must(await db.from('takes').insert(moved).select('updated_at')) as Row[];
          stamps.takes[String(to)] = ins[0]?.updated_at as string;
          takeMap.set(Number(k), to);
          saved.rows.takes[String(to)] = moved;
          hooks.onRenumberTake(Number(k), to);
        }
      }
      // Gone locally (an undo): archive, never delete. Weeks and prefs never disappear.
      if (t === 'ideas' || t === 'takes' || t === 'stories')
        for (const k of Object.keys(saved.rows[t])) if (!(k in next.rows[t]) && !(t === 'takes' && [...takeMap.values()].includes(Number(k)))) {
          await writeRow(t, k, { archived: true }, saved.rows[t][k], { ...saved.rows[t][k], archived: true }, out);
          delete saved.rows[t][k];
        }
    }
    if (next.config !== saved.config) await saveConfig(d, JSON.parse(next.config), out);
    if (out.clashes.length || out.merged) hooks.onConflict(out.clashes.length ? out.clashes.slice(0, 2).join(' and ') + (out.clashes.length > 2 ? ` and ${out.clashes.length - 2} more` : '') : null);
  }

  /** Every config change is a new, immutable version. Her changes since her last save are laid over the
   * latest version in the database (whoever saved it), key by key inside each section, and numbered after it.
   * So a change saved elsewhere is never reverted by her next save. */
  async function saveConfig(d: Data, mine: Row, out: { merged: boolean; clashes: string[] }) {
    const base = JSON.parse(saved.config) as Row;
    const pendingVersions = d.versions.filter(v => v.key && !savedVersionKeys.has(v.key)).reverse();
    const fresh = pendingVersions.length ? pendingVersions : [{ label: 'Undo: back to the earlier setting', changes: [] as Data['versions'][number]['changes'], key: undefined as string | undefined }];
    const OBJ = new Set(['config', 'opts', 'retired', 'targets']); // merged key by key; anything else (pillars) as a whole
    for (let attempt = 0; attempt < 4; attempt++) {
      const top = must(await db.from('config_versions').select('n,label,changes,snapshot').order('n', { ascending: false }).limit(fresh.length)) as Row[];
      const topN = (top[0]?.n as number) ?? 0;
      const theirs = (top[0]?.snapshot ?? base) as Row;
      const someoneElse = topN > savedMaxN;
      const snap: Row = structuredClone(theirs);
      for (const sec of new Set([...Object.keys(mine), ...Object.keys(base)])) {
        if (OBJ.has(sec)) {
          const m = (mine[sec] ?? {}) as Row, bs = (base[sec] ?? {}) as Row, th = (theirs[sec] ?? {}) as Row;
          const merged: Row = { ...th };
          for (const f of new Set([...Object.keys(m), ...Object.keys(bs)])) if (!same(m[f], bs[f])) {
            // Option lists merge item by item (her adds and removes over theirs); other values are taken whole.
            if ((sec === 'opts' || sec === 'retired') && Array.isArray(m[f])) { merged[f] = mergeList(f, bs[f], m[f], th[f]); continue; }
            if (f in m) merged[f] = m[f]; else delete merged[f];
            if (someoneElse && !same(th[f], bs[f]) && !same(th[f], m[f])) out.clashes.push(`config: ${f}`);
          }
          snap[sec] = merged;
        } else if (!same(mine[sec], base[sec])) {
          snap[sec] = mine[sec];
          if (someoneElse && !same(theirs[sec], base[sec]) && !same(theirs[sec], mine[sec])) out.clashes.push(`config: ${sec}`);
        }
      }
      if (someoneElse) out.merged = true;
      // A retry after a lost response: if the newest versions are already this save, don't insert them twice.
      const already = someoneElse && top.length >= fresh.length && fresh.every((v, j) => {
        const r = top[fresh.length - 1 - j];
        return r && r.label === v.label && same(r.changes, v.changes) && same(r.snapshot, snap);
      });
      if (!already) {
        const rows = fresh.map((v, j) => ({ n: topN + 1 + j, label: v.label, changes: v.changes, snapshot: snap }));
        const ins = await db.from('config_versions').insert(rows);
        if (ins.error && (ins.error as { code?: string }).code === '23505') continue; // numbered at the same moment as another save: go again
        if (ins.error) throw new Error(ins.error.message);
        savedMaxN = topN + rows.length;
      } else savedMaxN = topN;
      for (const v of fresh) if (v.key) savedVersionKeys.add(v.key);
      saved.config = canon(mine); // what she has; her next change is laid over the latest version again
      const all = must(await db.from('config_versions').select('n,label,changes,created_at').order('n', { ascending: false })) as Row[];
      hooks.onVersions(all.map(v => ({ n: v.n as number, date: String(v.created_at).slice(0, 10), label: v.label as string, changes: v.changes as Data['versions'][number]['changes'] })));
      return;
    }
    throw new Error('Config kept changing elsewhere while saving. Try again.');
  }

  function schedule(d: Data, wait: number) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const d2 = pending ?? d; pending = null; inFlight++;
      running = running.then(async () => {
        try { await flush(d2); failed = null; } // a later save covers earlier ones: it compares with what was last saved
        catch (e) {
          failed = d2;
          hooks.onError(e instanceof Error ? e.message : String(e));
          clearTimeout(retryTimer);
          retryTimer = setTimeout(() => { if (!pending && failed) { const f = failed; pending = f; schedule(f, 0); } }, 8000);
        } finally { inFlight--; }
      });
    }, wait);
  }

  return {
    /** Save soon; rapid changes (typing, dragging) fold into one save. */
    queue(d: Data) { pending = d; seq++; schedule(d, 400); },
    /** Nothing waiting, nothing saving, nothing failed: safe to replace the data with a fresh load. */
    idle: () => !pending && inFlight === 0 && !failed,
    /** Changes queued so far; a refresh that saw this change during its load must not apply. */
    seq: () => seq,
    /** Is this locally made config version saved yet? */
    versionSaved: (key: string) => savedVersionKeys.has(key),
    /** After a fresh load: compare future changes with what's in the database now. */
    rebase(d: Data, s: Stamps) { saved = snapshotOf(d); stamps = structuredClone(s); savedMaxN = d.versions[0]?.n ?? 0; unseen.clear(); },
  };
}
