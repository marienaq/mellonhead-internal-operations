import { useState } from 'react';
import type { Data, Idea, Origin } from '../lib/types';
import { CUR_WEEK, md, WEEKS, weekKind } from '../lib/dates';
import { addTake, move, nextTakeNumber, readiness, WEEK_STATUSES } from '../lib/logic';
import { closeSheet, getData, openSheet, setUi, toast, update, useStore } from '../lib/store';
import { currentScreen, go } from '../lib/router';
import { Band, Icon, PillarChip, ProtoBar, ReadyDot, Sheet, SrcLine, asset } from '../components/ui';

export function openIdea(id: string) {
  const s = currentScreen();
  if (s === 'ideas' || s === 'plan' || s === 'film') setUi({ backTo: s });
  go('idea-' + encodeURIComponent(id));
}

function HookLine({ i }: { i: Idea }) {
  if (!i.hooks.length) return <p className="hookline">Hooks arrive on the next agent pass</p>;
  if (i.chosen === null) return <p className="hookline pick">{i.hooks.length} hooks to pick</p>;
  const spoken = i.chosen === 'own' ? i.ownHook : i.hooks[i.chosen]?.spoken;
  return <p className="hookline">"{spoken}"</p>;
}

function IdeaCard({ d, i }: { d: Data; i: Idea }) {
  return <article className="card idea-card">
    {i.rehook && <span className="rehook-badge">Re-hook needed</span>}
    <h3>{i.title}</h3>
    <div className="idea-meta"><PillarChip d={d} p={i.pillar} />{i.feeling && <span className="chip">{i.feeling}</span>}{i.style && <span className="chip">{i.style}</span>}</div>
    <ReadyDot i={i} />
    <SrcLine i={i} />
    {i.status === 'rejected' ? <p className="why"><b>Why not</b>{i.rejectNote || 'No note'}</p> : <HookLine i={i} />}
    <div className="card-actions">
      {i.status === 'proposed' && <>
        <button className="btn sm go" onClick={() => openSheet({ kind: 'ondeck', id: i.id })}>Put on deck</button>
        <button className="btn sm" onClick={() => move(i.id, 'backlog')}>Backlog</button>
        <button className="btn sm" onClick={() => openSheet({ kind: 'reject', id: i.id })}>Reject</button></>}
      {i.status === 'backlog' && <>
        <button className="btn sm go" onClick={() => openSheet({ kind: 'ondeck', id: i.id })}>Put on deck</button>
        <button className="btn sm" onClick={() => move(i.id, 'proposed')}>Move to New</button></>}
      {i.status === 'rejected' && <button className="btn sm" onClick={() => move(i.id, 'proposed')}>Bring back</button>}
      <button className="btn sm open" onClick={() => openIdea(i.id)}>Open {Icon.chev}</button>
    </div>
  </article>;
}

export function IdeasScreen() {
  const { data: d, ui } = useStore();
  const tabs: [typeof ui.ideasTab, string][] = [['proposed', 'New'], ['backlog', 'Backlog'], ['rejected', 'Rejected']];
  const order = { red: 0, yellow: 1, green: 2 };
  const list = d.ideas.filter(i => i.status === ui.ideasTab && !i.past)
    .sort((a, b) => ui.ideasTab === 'proposed' ? (b.added || 0) - (a.added || 0) || order[readiness(a).level] - order[readiness(b).level] : 0);
  const nNew = d.ideas.filter(i => i.status === 'proposed').length;
  return <>
    <ProtoBar />
    <Band pos="18% 62%" />
    <header className="screen-head">
      <div><p className="eyebrow">Idea bank</p><h1>Ideas</h1></div>
      <button className="btn primary" onClick={() => openSheet({ kind: 'add' })}>{Icon.plus} Add an idea</button>
    </header>
    <div className="card agent-note"><img className="felt-c" src={asset('bev')} alt="Bev, the felt beaver" />
      <p><strong>{nNew} ideas waiting on you</strong><span className="muted">From Sunday's pitch and your own adds. Put the good ones on deck for a week; a rejection note helps the next pitch.</span></p></div>
    <div className="tabs" role="tablist" style={{ marginTop: 18 }}>
      {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={ui.ideasTab === k} onClick={() => setUi({ ideasTab: k })}>{l} <span className="count-pill num">{d.ideas.filter(i => i.status === k).length}</span></button>)}
    </div>
    <div className="section" style={{ marginTop: 14 }}>
      {list.length ? <div className="idea-grid">{list.map(i => <IdeaCard key={i.id} d={d} i={i} />)}</div>
        : <div className="card empty"><img className="felt-c" src={asset('bev')} alt="" style={{ width: 72, height: 72 }} /><p><strong>Nothing here</strong></p>
          <p className="muted small">{ui.ideasTab === 'rejected' ? 'Ideas you reject land here with your note.' : ui.ideasTab === 'backlog' ? 'Ideas you want to keep for later land here.' : 'All caught up. Orca pitches new ones Sunday night.'}</p></div>}
    </div>
    <p className="example-note">Readiness: green, your take and a story or source; yellow, one of the two; red, mostly drafted.</p>
  </>;
}

/* ---------- Sheets that start from Ideas ---------- */
export function RejectSheet({ id }: { id: string }) {
  const i = getData().ideas.find(x => x.id === id)!;
  const [note, setNote] = useState('');
  return <Sheet>
    <h3>Why not?</h3><p className="hint">A short note helps the next pitch. "{i.title}"</p>
    <textarea id="reject-note" autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="Not my voice, or did one like it last week" />
    <div className="quick">{['Not my voice', 'Too much like last week', 'Too negative', 'Not for Alex', 'Dunks on someone'].map(q =>
      <button key={q} onClick={() => setNote(n => (n ? n.replace(/\.?\s*$/, '. ') + q : q))}>{q}</button>)}</div>
    <div className="sheet-actions"><button className="btn ghost" onClick={closeSheet}>Cancel</button>
      <button className="btn primary" onClick={() => { closeSheet(); move(id, 'rejected', { note: note.trim() || 'No note' }); }}>Reject</button></div>
  </Sheet>;
}

export function OnDeckSheet({ id }: { id: string }) {
  const d = getData(); const i = d.ideas.find(x => x.id === id)!;
  return <Sheet>
    <h3>Put on deck</h3><p className="hint">"{i.title}"</p>
    <div className="optlist">{WEEKS.filter(w => weekKind(w) !== 'past').map(w => {
      const n = d.ideas.filter(x => x.week === w && WEEK_STATUSES.includes(x.status)).length;
      return <button key={w} className="opt" onClick={() => { closeSheet(); move(id, 'on deck', { week: w }); }}>
        <span>Week of {md(w)} <small>{w === CUR_WEEK ? 'making now, film Wed Nov 25' : 'next week'}</small></span><small className="num">{n} on deck</small></button>;
    })}</div>
  </Sheet>;
}

export function AddFromIdeasSheet() {
  const { data: d, ui } = useStore();
  const list = d.ideas.filter(i => ['proposed', 'backlog'].includes(i.status));
  return <Sheet>
    <h3>Add from ideas</h3><p className="hint">Tap one to put it on deck for the week of {md(ui.week)}. The mix updates.</p>
    <div className="optlist">{list.map(i =>
      <button key={i.id} className="opt pick-row" onClick={() => move(i.id, 'on deck', { week: ui.week })}>
        <span>{i.title} {i.status === 'backlog' && <small>(backlog)</small>}</span><span className="chip">{i.style || 'no style yet'}</span><ReadyDot i={i} /></button>)}
      {!list.length && <p className="muted">Nothing in New or Backlog.</p>}
    </div>
    <div className="sheet-actions"><button className="btn primary" onClick={closeSheet}>Done</button></div>
  </Sheet>;
}

/* ---------- Add an idea: four things (F2) ---------- */
export function AddIdeaSheet() {
  const d = getData();
  const [src, setSrc] = useState<Origin>('experience');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [text, setText] = useState('');
  const [take, setTake] = useState('');
  const [newTake, setNewTake] = useState('');
  const [toBank, setToBank] = useState(true);
  const [dest, setDest] = useState<'proposed' | 'on deck' | 'backlog'>('proposed');
  const sources: [Origin, string][] = [['experience', 'Something that happened to me'], ['read', 'Something I read'], ['research', 'Research'], ['client', 'A client story']];
  const needsLink = src === 'read' || src === 'research';
  const textLabel = src === 'experience' || src === 'client' ? 'What happened, in your words' : src === 'read' ? 'What is the story, and why did it catch you?' : 'What did you find?';

  function save() {
    if (!title.trim()) { toast('Add a working title to save it.'); document.getElementById('add-title')?.focus(); return; }
    const id = 'new-' + Date.now();
    const before = getData(); // every update clones, so this copy stays as it was: Undo restores it
    let takeN: number | null = null;
    update(dd => {
      if (take === 'new' && newTake.trim()) takeN = addTake(dd, newTake.trim());
      else if (take && take !== 'new') takeN = Number(take);
      let sourceLink = null;
      if (link.trim() && needsLink) { let label = link.trim(); try { label = new URL(label).hostname.replace(/^www\./, ''); } catch { /* keep as typed */ } sourceLink = { label, url: link.trim() }; }
      const storyKey = src === 'experience' && toBank ? 'own-' + id : null;
      if (storyKey) dd.stories[storyKey] = { title: title.trim(), pillar: '', known: text.trim(), missing: 'Drafted by agents on the next pass', onCamera: 'ready' };
      dd.ideas.push({
        id, title: title.trim(), status: dest, week: dest === 'on deck' ? CUR_WEEK : null, postDate: null, summary: text.trim(),
        pillar: '', type: '', style: '', onCamera: '', voice: 'Mariena', feeling: '', harmHelp: '', cta: '',
        take: takeN, story: storyKey, series: '', ep: null, safety: src === 'client' ? 'blinded' : 'clear', origin: src, brief: '', sourceLink,
        hooks: [], chosen: null, rehook: null, beats: [], gut: {}, tips: null, drafted: [], script: [], prep: [], slate: '',
        look: { setup: '', outfit: '', location: '', props: '', edit: '' }, added: Date.now(),
        notes: [{ who: 'You in the app', text: 'Added by hand.' + (storyKey ? ' Saved to the story bank too.' : '') }],
      });
    });
    closeSheet();
    if (dest !== 'on deck') setUi({ ideasTab: dest });
    const n = takeN && take === 'new' ? `Take #${takeN} saved to your bank. ` : '';
    toast(n + (dest === 'on deck' ? 'Saved and on deck for Nov 23. Orca will draft the rest.' : 'Saved. Orca will draft the rest on the next pass.'), before);
    if (currentScreen() !== 'ideas') go('ideas');
  }
  return <Sheet>
    <h3>Add an idea</h3><p className="hint">Four things now. Agents draft the rest (pillar, type, feeling, hooks, storyboard), marked drafted until you confirm.</p>
    <form className="form" onSubmit={e => { e.preventDefault(); save(); }}>
      <div><span className="lbl">Where did it come from?</span><div className="optlist">{sources.map(([k, l]) =>
        <button type="button" key={k} className="opt" aria-pressed={src === k} onClick={() => setSrc(k)}>{l}</button>)}</div></div>
      <div><label htmlFor="add-title">Working title</label><input type="text" id="add-title" value={title} onChange={e => setTitle(e.target.value)} placeholder={src === 'experience' ? 'The day the team stopped using the agents' : 'Boss wants AI in every performance review'} /></div>
      {needsLink && <div><label htmlFor="add-link">Link to the {src === 'read' ? 'post or article' : 'research'} <span className="opt-l">(optional; it counts as a source)</span></label><input type="url" id="add-link" value={link} onChange={e => setLink(e.target.value)} placeholder="https://" /></div>}
      <div><label htmlFor="add-text">{textLabel}</label><textarea id="add-text" value={text} onChange={e => setText(e.target.value)} placeholder="Talk it out. Dictation works here." /></div>
      <div><label htmlFor="add-take">Your take <span className="opt-l">(optional: pick one from your takes bank, or add a new one)</span></label>
        <select id="add-take" value={take} onChange={e => setTake(e.target.value)}>
          <option value="">I'll add it later</option>
          {Object.entries(d.takes).map(([n, t]) => <option key={n} value={n}>#{n} {t.short}</option>)}
          <option value="new">Add a new take...</option>
        </select>
        {take === 'new' && <><input type="text" value={newTake} onChange={e => setNewTake(e.target.value)} autoFocus placeholder="Say it the way you'd say it on camera" style={{ marginTop: 8 }} />
          <p className="muted small" style={{ marginTop: 4 }}>Saved to your takes bank as #{nextTakeNumber(d)}.</p></>}
      </div>
      {src === 'experience' && <button type="button" className="switch" role="switch" aria-checked={toBank} onClick={() => setToBank(!toBank)}><span className="sw" />Also save to my story bank</button>}
      <div><span className="lbl">Where it goes</span><span className="seg" role="group">{([['proposed', 'New'], ['on deck', 'On deck, week of Nov 23'], ['backlog', 'Backlog']] as const).map(([k, l]) =>
        <button type="button" key={k} aria-pressed={dest === k} onClick={() => setDest(k)}>{l}</button>)}</span></div>
    </form>
    <div className="sheet-actions"><button className="btn ghost" onClick={closeSheet}>Cancel</button><button className="btn primary" onClick={save}>Save idea</button></div>
  </Sheet>;
}
