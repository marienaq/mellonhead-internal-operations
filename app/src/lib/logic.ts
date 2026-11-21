import type { Block, Data, Idea, OptKey, Status } from './types';
import { addDays, CUR_WEEK, md, today } from './dates';
import { findIdea, getData, toast, update } from './store';

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const WEEK_STATUSES: Status[] = ['on deck', 'in progress', 'scheduled', 'published'];
export const FLOW: Status[] = ['proposed', 'on deck', 'in progress', 'scheduled', 'published'];
export const PERSONAS: [import('./types').Persona, string][] = [['Dawn', 'wants it good for people'], ['Alex', 'wants the how'], ['Paloma', 'wants the plot']];
export const DEFAULT_TIPS = { Dawn: 'Say who it helps, early.', Alex: 'Give one step they can try Monday.', Paloma: 'Open on the moment, not the lesson.' };

export const pillarColor = (d: Data, n: string) => d.pillars.find(p => p.name === n)?.color || 'var(--line)';
export const isRetired = (d: Data, k: string, v: string) => (d.retired[k as OptKey] || []).includes(v);
export const takeShort = (d: Data, n: number | null) => (n && d.takes[n] ? d.takes[n].short : '');

/* ---------- Readiness light: a simple rule (D31) ----------
 * Green: her take in her words plus a story or source. Yellow: one of those. Red: neither.
 * A beat waiting on someone else is not her gap (D46). */
export type Level = 'green' | 'yellow' | 'red';
export function readiness(i: Idea): { level: Level; missing: string[]; summary: string } {
  const take = !!i.take && !i.drafted.includes('take');
  const storyOrSource = !!i.story || !!i.sourceLink;
  const missing: string[] = [];
  if (!take) missing.push(i.take ? 'Needs your take, in your words (the one here is drafted)' : 'Needs your take');
  if (!storyOrSource) missing.push('Needs a story or a source');
  const level: Level = take && storyOrSource ? 'green' : take || storyOrSource ? 'yellow' : 'red';
  const summary = level === 'green' ? `Your take and ${i.story ? 'a story' : 'a source'}` : missing[0].replace(/ \(.*\)$/, '');
  return { level, missing, summary };
}
export const LEVEL_TEXT: Record<Level, string> = {
  green: 'Green: your take and a story or source',
  yellow: 'Yellow: one of the two from you',
  red: 'Red: mostly drafted, not much from you yet',
};
export const gapsOf = (i: Idea) => i.beats.map((b, n) => ({ n: n + 1, gap: b.gap })).filter(g => g.gap);
export const waitsOf = (i: Idea) => i.beats.map((b, n) => ({ n: n + 1, who: b.waitingOn })).filter(g => g.who);

/* ---------- Mix (brief §6.3) ---------- */
/** An idea that's decided not to be in a series. series can't be null in the database ('' means not decided yet). */
export const NO_SERIES = 'none';
export const inSeries = (i: Idea) => !!i.series && i.series !== NO_SERIES;

/** Jessi Jean's 3-2-1 weekly mix (foundation.md). A week aims for 3 authority, 2 storyline, 1 personality, 1 follow the signal. */
export const TYPE_HELP: Record<string, string> = {
  authority: 'You teach or advise: what to do, how it works, what you would do. Builds trust in what you know.',
  storyline: 'Part of an ongoing story people follow: a series, what you are building, what happened next. Brings people back.',
  personality: 'Shows who you are: opinions, humor, life outside work. Makes people like you, not just learn from you.',
  'follow the signal': 'More of what already landed: a follow-up or new angle on a video that got comments, saves or shares.',
};

export const LOCK: Record<string, 'min' | 'max'> = { 'style.each': 'min', 'style.others': 'min', 'style.series': 'max', 'hh.gap': 'min', 'cta.with': 'min', 'feeling.each': 'min' };
export const TARGET_LABEL: Record<string, string> = {
  'type.authority': 'Authority', 'type.storyline': 'Storyline', 'type.personality': 'Personality', 'type.follow the signal': 'Follow the signal',
  'pillar.Value': 'Value', 'pillar.Messy': 'Messy', 'pillar.Building': 'Building', 'pillar.Perspective': 'Perspective', 'pillar.Grounded': 'Grounded',
  'style.each': 'Any one style', 'style.others': "Other people's stories", 'style.series': 'Running series episodes',
  'camera.talking': 'Talking head', 'hh.gap': 'Gap between harm and help', 'cta.with': 'Videos with a call to action', 'feeling.each': 'Any one feeling',
};
export interface MixRow { key: string; label: string; sub?: string; color?: string; match: (i: Idea) => boolean; matchLabel?: string; count: number; scale: number; lo: number; hi: number; bad: boolean }
export interface Dim { id: string; title: string; win: number; note?: string; rows: MixRow[]; off: boolean; line: string }

export function counted(d: Data, w: string) {
  return d.ideas.filter(i => (i.week === w && ['on deck', 'in progress', 'scheduled'].includes(i.status)) || (d.includeProposed && i.status === 'proposed'));
}
export function targetText(d: Data, key: string) {
  const [lo, hi] = d.targets[key]; const lock = LOCK[key];
  if (lock === 'min') return `at most ${hi}`;
  if (lock === 'max') return `at least ${lo}`;
  return lo === hi ? `target ${lo}` : `target ${lo} to ${hi}`;
}
export const rowFlagText = (r: { count: number; lo: number; hi: number }) => (r.count < r.lo ? `${r.lo - r.count} short` : r.count > r.hi ? `${r.count - r.hi} over` : '');

export function computeMix(d: Data, w: string): Dim[] {
  const c = counted(d, w); const n = (f: (i: Idea) => boolean) => c.filter(f).length;
  const prev = d.ideas.filter(i => i.week === addDays(w, -7) && WEEK_STATUSES.includes(i.status));
  type R = Omit<MixRow, 'lo' | 'hi' | 'bad'>;
  const dims: { id: string; title: string; win: number; note?: string; rows: R[] }[] = [];
  dims.push({ id: 'type', title: 'Type', win: 7, rows: d.opts.type.map(t => ({ key: 'type.' + t, label: cap(t), match: (i: Idea) => i.type === t, count: n(i => i.type === t), scale: 5 })).filter(r => d.targets[r.key]) });
  dims.push({ id: 'pillar', title: 'Pillar', win: 14, note: `This week plus ${prev.length} videos from the week of ${md(addDays(w, -7))}`, rows: d.pillars.map(p => ({ key: 'pillar.' + p.name, label: p.name, color: p.color, match: (i: Idea) => i.pillar === p.name, count: n(i => i.pillar === p.name) + prev.filter(i => i.pillar === p.name).length, scale: 8 })).filter(r => d.targets[r.key]) });
  const styles = [...new Set(c.map(i => i.style).filter(Boolean))];
  const others = (i: Idea) => ['AI-ITA', 'workplace advice'].includes(i.style);
  dims.push({ id: 'style', title: 'Content style', win: 7, rows: [
    ...styles.map(s => ({ key: 'style.each', label: cap(s), match: (i: Idea) => i.style === s, count: n(i => i.style === s), scale: 5 })),
    { key: 'style.others', label: "Other people's stories", sub: 'AI-ITA and workplace advice', match: others, count: n(others), scale: 7 },
    { key: 'style.series', label: 'Running series episodes', match: (i: Idea) => inSeries(i), count: n(i => inSeries(i)), scale: 7 }] });
  const nonTalk = [...new Set(c.filter(i => i.onCamera && i.onCamera !== 'talking head').map(i => i.onCamera))];
  dims.push({ id: 'camera', title: 'On camera', win: 7, note: nonTalk.length ? 'Also this week: ' + nonTalk.join(', ') : '', rows: [{ key: 'camera.talking', label: 'Talking head', match: i => i.onCamera === 'talking head', count: n(i => i.onCamera === 'talking head'), scale: 7 }] });
  const harm = n(i => i.harmHelp === 'harm'), help = n(i => i.harmHelp === 'help'), neu = n(i => i.harmHelp === 'neutral');
  const big = harm >= help ? 'harm' : 'help';
  dims.push({ id: 'hh', title: 'Harm or help', win: 7, note: `Harm ${harm} · Help ${help} · Neutral ${neu} (doesn't count)`, rows: [{ key: 'hh.gap', label: 'Gap between harm and help', match: i => i.harmHelp === big, matchLabel: big, count: Math.abs(harm - help), scale: 5 }] });
  const withCta = (i: Idea) => !!i.cta && i.cta !== 'none';
  dims.push({ id: 'cta', title: 'Call to action', win: 7, note: c.filter(withCta).map(i => i.cta).join(', '), rows: [{ key: 'cta.with', label: 'Videos with one', match: withCta, count: n(withCta), scale: 7 }] });
  const used = d.opts.feeling.concat(d.retired.feeling).filter(f => n(i => i.feeling === f) > 0);
  dims.push({ id: 'feeling', title: 'Feeling', win: 7, note: 'Not used: ' + (d.opts.feeling.filter(f => !used.includes(f)).join(', ') || 'none'), rows: used.map(f => ({ key: 'feeling.each', label: cap(f), match: (i: Idea) => i.feeling === f, count: n(i => i.feeling === f), scale: 7 })) });

  return dims.map(dm => {
    const rows: MixRow[] = dm.rows.map(r => { const [lo, hi] = d.targets[r.key]; return { ...r, lo, hi, bad: r.count < lo || r.count > hi }; });
    const out: Dim = { ...dm, rows, off: rows.some(r => r.bad), line: '' };
    out.line = dimLine(out, { harm, help, neu, n: c.length });
    return out;
  });
}
function dimLine(d: Dim, x: { harm: number; help: number; neu: number; n: number }) {
  if (d.id === 'camera') return `Talking head ${d.rows[0].count} of ${x.n}${d.note ? ' · ' + d.note.replace('Also this week: ', 'plus ') : ''}`;
  if (d.id === 'hh') return `Harm ${x.harm} · Help ${x.help} · Neutral ${x.neu}`;
  if (d.id === 'cta') return `${d.rows[0].count} with one${d.note ? ': ' + d.note : ''}`;
  if (d.id === 'style') return d.rows.filter(r => r.key === 'style.each').map(r => `${r.label} ${r.count}`).join(' · ') + ` · series ${d.rows[d.rows.length - 1].count}`;
  return d.rows.map(r => `${r.label} ${r.count}`).join(' · ') || 'Nothing counted yet';
}
export const dimFlag = (d: Dim) => { const r = d.rows.find(r => r.bad); return r ? `${r.label} ${r.count}, ${rowFlagText(r)}` : ''; };
export function fixesFor(data: Data, d: Dim, w: string) {
  return d.rows.filter(r => r.bad).map(r => {
    const short = r.count < r.lo, gap = short ? r.lo - r.count : r.count - r.hi;
    const name = r.key === 'hh.gap' ? `${cap(r.matchLabel || '')} is ahead of ${r.matchLabel === 'harm' ? 'help' : 'harm'} by ${r.count}` : `${r.label}: ${r.count}, ${targetText(data, r.key)}`;
    if (short) {
      const cands = data.ideas.filter(i => ['proposed', 'backlog'].includes(i.status) && r.match(i)).slice(0, 3);
      return { key: r.key + r.label, text: `${name}. Add ${gap}.`, cands, act: 'on' as const, empty: r.key === 'type.follow the signal' ? 'Nothing proposed has this type yet. One gets suggested from your top videos once results come in.' : 'Nothing in New or Backlog fits. Add an idea, or ask Orca for one.' };
    }
    const cands = counted(data, w).filter(i => i.status === 'on deck' && i.week === w && r.match(i));
    return { key: r.key + r.label, text: `${name}. Take ${gap} off.`, cands, act: 'off' as const, empty: '' };
  });
}

/* ---------- Versions (Config history) ---------- */
export function addVersion(d: Data, label: string, change: { field: string; from: string; to: string }) {
  // Every change is its own version: saved versions are history and never edited.
  const top = d.versions[0];
  d.versions.unshift({ n: (top?.n ?? 0) + 1, date: today(), label, changes: [change] });
  return d.versions[0].n;
}

/* ---------- Takes ---------- */
export function addTake(d: Data, text: string, pillar = '') {
  const n = Math.max(...Object.keys(d.takes).map(Number)) + 1;
  const words = text.split(/\s+/);
  const short = words.slice(0, 6).join(' ').replace(/[.,;:!?]+$/, '').toLowerCase();
  d.takes[n] = { short: words.length > 6 ? short + '...' : short, text, pillar, onCamera: 'ready' };
  return n;
}
export const nextTakeNumber = (d: Data) => Math.max(...Object.keys(d.takes).map(Number)) + 1;

/* ---------- Idea fields ---------- */
export const REHOOK: Record<string, string> = { feeling: 'feeling', take: 'take', summary: 'angle', style: 'content style', onCamera: 'on-camera setup' };
export const LABEL: Record<string, string> = { pillar: 'Pillar', type: 'Type', feeling: 'Feeling', style: 'Content style', onCamera: 'On camera', voice: 'Voice', harmHelp: 'Harm, help or neutral', cta: 'Call to action', take: 'Take', story: 'Story', series: 'Series', safety: 'Client safety', summary: 'The angle' };
export const LOOK: [keyof Idea['look'], string][] = [['setup', 'Setup'], ['outfit', 'Outfit'], ['location', 'Location'], ['props', 'Props'], ['edit', 'Edit notes']];
export const CTA_PHRASE: Record<string, string> = { none: 'no call to action', follow: 'a follow ask', Mellonmail: 'a Mellonmail plug', 'resource landing page': 'a resource link', 'GitHub link': 'a GitHub link', 'comment question': 'a comment question' };

export function nextEp(d: Data, name: string, self: Idea) {
  const eps = d.ideas.filter(x => x.series === name && x.id !== self.id).map(x => x.ep || 0);
  return (eps.length ? Math.max(...eps) : 0) + 1;
}

export function setField(id: string, k: string, v: string) {
  let msg = 'Saved.';
  update(d => {
    const i = findIdea(d, id)!; let from: unknown;
    if (k.startsWith('look.')) { const lk = k.slice(5) as keyof Idea['look']; from = i.look[lk]; i.look[lk] = v; }
    else if (k === 'take') { from = i.take; i.take = v ? Number(v) : null; }
    else if (k === 'story') { from = i.story; i.story = v || null; }
    else if (k === 'series') { from = i.series; i.series = v; i.ep = v && v !== NO_SERIES ? (from === v ? i.ep : nextEp(d, v, i)) : null; }
    else { from = (i as unknown as Record<string, unknown>)[k]; (i as unknown as Record<string, unknown>)[k] = v; }
    const wasDrafted = i.drafted.includes(k);
    i.drafted = i.drafted.filter(x => x !== k);
    const changed = String(from ?? '') !== String(v ?? '');
    if (changed && REHOOK[k] && i.hooks.length) {
      const show = (x: unknown) => (k === 'take' ? (x ? '#' + x : '') : k === 'summary' ? '' : String(x ?? ''));
      i.rehook = { field: k, from: k === 'summary' ? 'the earlier wording' : show(from), to: k === 'summary' ? 'your new wording' : show(v) };
      msg = `${cap(REHOOK[k])} changed. Re-hook needed.`;
    } else if (changed) msg = k.startsWith('look.') ? 'Saved. Hooks unchanged.' : 'Saved.';
    else msg = wasDrafted ? 'Confirmed.' : 'No change.';
  }, undefined);
  toast(msg);
}

export function move(id: string, to: Status, extra: { week?: string; note?: string } = {}) {
  const wk = extra.week || findIdea(getData(), id)?.week || CUR_WEEK;
  const msg: Partial<Record<Status, string>> = { 'on deck': `On deck for the week of ${md(wk)}.`, proposed: 'Back to New.', backlog: 'Moved to backlog.', rejected: 'Rejected. Your note is saved.', 'in progress': 'In progress.' };
  update(d => {
    const i = findIdea(d, id)!;
    i.status = to;
    if (to === 'on deck' || to === 'in progress') { i.week = wk; if (to === 'on deck' && d.locked[wk]) i.addedAfterLock = true; }
    if (to === 'proposed' || to === 'backlog' || to === 'rejected') { i.week = null; i.addedAfterLock = false; }
    if (extra.note !== undefined) i.rejectNote = extra.note;
  }, msg[to] || 'Saved.', true);
}

/* ---------- Film ---------- */
export const GENERAL_PREP = ['Charge the mic and the phone', 'Clear the desk, camera left', 'Phone on do not disturb'];
export const filmIdeas = (d: Data) => d.ideas.filter(i => i.week === CUR_WEEK && ['on deck', 'in progress'].includes(i.status));
export function buildRos(d: Data): Block[] {
  const blocks: Block[] = [];
  filmIdeas(d).forEach(i => {
    const outfit = i.look.outfit || 'Outfit not set yet';
    let b = blocks.find(b => b.outfit === outfit); if (!b) blocks.push(b = { outfit, groups: [] });
    const setup = [i.look.setup, i.look.location].filter(Boolean).join(' · ') || 'Setup not set yet';
    let g = b.groups.find(g => g.setup === setup); if (!g) b.groups.push(g = { setup, ids: [] });
    g.ids.push(i.id);
  });
  return blocks;
}
/** The run of show, rebuilt when the set of videos or their outfit/setup changes; otherwise her order stands. */
export function currentRos(d: Data): Block[] {
  const fresh = buildRos(d);
  if (!d.ros) return fresh;
  const sig = (bs: Block[]) => bs.map(b => b.outfit + ':' + b.groups.map(g => g.setup + '=' + [...g.ids].sort().join(',')).join('|')).sort().join('/');
  return sig(fresh) === sig(d.ros) ? d.ros : fresh;
}
