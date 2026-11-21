/* One small store: the data (saved in this browser) plus screen state (not saved).
 * Every change clones the data, so undo is "put the old copy back". No database yet (stage E). */
import { useSyncExternalStore } from 'react';
import type { Data, Idea } from './types';
import { seed } from './seed';
import { CUR_WEEK, syncWeek, today } from './dates';
import { loadWithStamps, makeSyncer, remoteEnabled } from './remote';

const KEY = 'mh-content-planner-v1';

export type SheetState =
  | { kind: 'field'; id: string; k: string }
  | { kind: 'text'; id: string; k: string }
  | { kind: 'reject'; id: string }
  | { kind: 'ondeck'; id: string }
  | { kind: 'date'; id: string }
  | { kind: 'own'; id: string }
  | { kind: 'chat'; id: string }
  | { kind: 'add' }
  | { kind: 'addFromIdeas' }
  | { kind: 'reset' };

export interface Ui {
  week: string;
  ideasTab: 'proposed' | 'backlog' | 'rejected';
  dimOpen: Record<string, boolean>;
  lockConfirm: boolean;
  backTo: 'ideas' | 'plan' | 'film';
  filmDay: string | null; // null: the film day from Config
  focus: number | null;
  scriptOpen: Record<string, boolean>;
  openVersion: number | null;
  editing: string | null;
  adding: string | null;
  retiredOpen: Record<string, boolean>;
  sheet: SheetState | null;
  toast: { msg: string; undo: Data | null; id: number } | null;
  flash: string | null;
}

/** Scheduled ideas publish on their own once the post date passes. */
function autoPublish(d: Data) {
  const t = today();
  d.ideas.forEach(i => { if (i.status === 'scheduled' && i.postDate && i.postDate <= t && !i.past) i.status = 'published'; });
  return d;
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw) as Data; if (d && d.schema === 2 && Array.isArray(d.ideas)) return autoPublish(d); }
  } catch { /* fall through to seed */ }
  return autoPublish(seed());
}
/* Two modes. Local (no Supabase settings): the prototype on seed data in this browser.
 * Remote: everything loads from Supabase after sign-in and each change is saved there. */
export type Mode = 'local' | 'signedOut' | 'loading' | 'ready' | 'error';
let mode: Mode = remoteEnabled ? 'loading' : 'local';
let modeError = '';
let syncer: ReturnType<typeof makeSyncer> | null = null;

function save(d: Data) {
  if (mode === 'local') { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: keeps working, just won't survive a reload */ } }
  else if (mode === 'ready' && syncer) syncer.queue(d);
}

let data: Data = remoteEnabled ? seed() : load();
if (!remoteEnabled) syncWeek(data.config.filmWeekday); // remote: loadAll does this once the config arrives
let ui: Ui = {
  week: CUR_WEEK, ideasTab: 'proposed', dimOpen: {}, lockConfirm: false, backTo: 'plan',
  filmDay: null, focus: null, scriptOpen: {}, openVersion: null, editing: null, adding: null,
  retiredOpen: {}, sheet: null, toast: null, flash: null,
};
let snap: { data: Data; ui: Ui; mode: Mode; modeError: string } = { data, ui, mode, modeError };
const listeners = new Set<() => void>();
const emit = () => { snap = { data, ui, mode, modeError }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useStore() { return useSyncExternalStore(subscribe, () => snap); }
export const getData = () => data;
export const getUi = () => ui;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, undo: Data | null = null) {
  clearTimeout(toastTimer);
  ui = { ...ui, toast: { msg, undo, id: Date.now() } };
  emit();
  toastTimer = setTimeout(() => { ui = { ...ui, toast: null }; emit(); }, undo ? 6000 : 2800);
}

/** Change the data. `msg` shows a toast; `undoable` adds Undo that restores the data as it was. */
export function update(fn: (d: Data) => void, msg?: string, undoable = false) {
  const prev = data;
  const next = structuredClone(data);
  fn(next);
  data = autoPublish(next);
  save(data);
  if (msg) toast(msg, undoable ? prev : null); else emit();
}
/** Change the data without saving a toast or history: used while dragging. */
export function updateQuiet(fn: (d: Data) => void) { const next = structuredClone(data); fn(next); data = next; save(data); emit(); }
export function restore(d: Data) { data = d; save(data); ui = { ...ui, toast: null }; emit(); }

export function setUi(p: Partial<Ui>) { ui = { ...ui, ...p }; emit(); }
export function openSheet(s: SheetState) { setUi({ sheet: s }); }
export function closeSheet() { setUi({ sheet: null }); }

export function setMode(m: Mode, err = '') { mode = m; modeError = err; emit(); }

/** After sign-in: load from Supabase, publish anything whose date has passed, then save changes as they happen. */
export async function startRemote() {
  setMode('loading');
  try {
    const { data: loaded, stamps } = await loadWithStamps();
    const baseline = structuredClone(loaded); // what's in the database now
    data = autoPublish(loaded);
    ui = { ...ui, week: CUR_WEEK }; // loadWithStamps settled the week from the film-day setting
    syncer = makeSyncer(baseline, stamps, {
      onVersions: v => { data = { ...data, versions: v }; emit(); },
      onError: msg => toast(`Couldn't save to Supabase: ${msg}. Reload to see what's saved.`),
      onConflict: what => { refreshNote = `${what} also changed somewhere else. Showing both changes.`; void refresh(); },
    });
    setMode('ready');
    syncer.queue(data); // saves anything autoPublish moved; a no-op otherwise
  } catch (e) { setMode('error', e instanceof Error ? e.message : String(e)); }
}

let refreshNote = '';
let refreshing = false;
/** Pick up changes made elsewhere (phone, laptop, agents). Waits until nothing is waiting to save, so it
 * never replaces an edit that hasn't reached the database. Undo is dropped: it would restore stale rows. */
export async function refresh(): Promise<void> {
  if (mode !== 'ready' || !syncer || refreshing) return;
  if (!syncer.idle()) { setTimeout(() => { void refresh(); }, 600); return; }
  refreshing = true;
  try {
    const { data: fresh, stamps } = await loadWithStamps();
    if (!syncer.idle()) return; // you changed something while it loaded; the next refresh picks it up
    syncer.rebase(structuredClone(fresh), stamps);
    data = autoPublish(fresh);
    if (refreshNote) { const n = refreshNote; refreshNote = ''; ui = { ...ui, toast: null }; toast(n); }
    else { if (ui.toast?.undo) ui = { ...ui, toast: null }; emit(); }
    syncer.queue(data);
  } catch { /* offline or signed out: the next refresh tries again */ }
  finally { refreshing = false; }
}

export function resetToSeed() {
  if (mode !== 'local') return;
  const prev = data;
  data = autoPublish(seed());
  save(data);
  ui = { ...ui, week: CUR_WEEK, dimOpen: {}, lockConfirm: false, focus: null, scriptOpen: {}, sheet: null };
  toast('Back to the seed data.', prev);
}

export const findIdea = (d: Data, id: string): Idea | undefined => d.ideas.find(i => i.id === id);
