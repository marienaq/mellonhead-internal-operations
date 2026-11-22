import { useState } from 'react';
import { INNER_WORLD_LABEL, type Data, type Gut, type Idea, type InnerWorld, type OptKey } from '../lib/types';
import { addDays, CUR_WEEK, md, today, wmd } from '../lib/dates';
import { addTake, addVersion, CTA_PHRASE, DEFAULT_TIPS, FLOW, gapsOf, isRetired, LABEL, LEVEL_TEXT, LOOK, move, nextEp, nextTakeNumber, PERSONAS, personaWants, readiness, REHOOK, setField, waitsOf, NO_SERIES, inSeries, TYPE_HELP } from '../lib/logic';
import { closeSheet, findIdea, getData, openSheet, toast, update, useStore } from '../lib/store';
import { go } from '../lib/router';
import { Icon, NeedsTag, PEG, ProtoBar, Sheet, WaitingTag, asset } from '../components/ui';

/* A tappable word in the pitch paragraph. Solid underline: hers. Dashed: drafted by an agent. */
function Bp({ i, k, text }: { i: Idea; k: string; text?: string }) {
  const v = (i as unknown as Record<string, unknown>)[k];
  const empty = (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) && !(k === 'story' && i.noStory);
  const d = getData();
  const cls = empty ? 'empty' : i.drafted.includes(k) ? 'is-drafted' : '';
  const ret = !empty && typeof v === 'string' && isRetired(d, k, v) ? ' (retired)' : '';
  return <button className={`bp ${cls}`} onClick={() => openSheet({ kind: 'field', id: i.id, k })}
    aria-label={`${LABEL[k]}: ${empty ? 'not set' : String(v)}${i.drafted.includes(k) ? ', drafted' : ''}`}>
    {empty ? 'add ' + LABEL[k].toLowerCase() : (text || String(v)) + ret}</button>;
}

const listOf = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

function Pitch({ d, i }: { d: Data; i: Idea }) {
  const takeTxt = i.take ? `take #${i.take}, "${d.takes[i.take]?.short ?? ''}"` : '';
  const article = /^[aeiou]/i.test(i.pillar || 'x') ? 'An' : 'A';
  return <p className="pitch">
    {i.pillar ? article : 'A'} <Bp i={i} k="pillar" /> <Bp i={i} k="type" /> video in <Bp i={i} k="style" /> style, <Bp i={i} k="onCamera" />, voiced by <Bp i={i} k="voice" />.{' '}
    It should leave Alex feeling <Bp i={i} k="feeling" />, shows AI as <Bp i={i} k="harmHelp" />, argues <Bp i={i} k="take" text={takeTxt} /> and ends with <Bp i={i} k="cta" text={CTA_PHRASE[i.cta] || i.cta} />.{' '}
    {inSeries(i) ? <>It's episode {i.ep || '?'} of <Bp i={i} k="series" /></> : <>It's <Bp i={i} k="series" text="not part of a series" /></>}
    {i.story ? <>, built on the story <Bp i={i} k="story" text={d.stories[i.story]?.title} /></> : i.noStory ? <>, with <Bp i={i} k="story" text="no story from the bank" /></> : <>, with <Bp i={i} k="story" /></>}. Client safety: <Bp i={i} k="safety" />.{' '}
    It's planned for <Bp i={i} k="channels" text={listOf(i.channels)} />{d.config.innerWorld && <> and speaks to <Bp i={i} k="innerWorld" text={listOf(i.innerWorld.map(w => INNER_WORLD_LABEL[w]))} /></>}.
  </p>;
}

function StageLine({ d, i }: { d: Data; i: Idea }) {
  const making = ['in progress', 'scheduled', 'published'].includes(i.status);
  const steps: [string, boolean][] = making
    ? [['filmed', !!d.filmed[i.id] || i.status !== 'in progress'], ['rough cut', i.status !== 'in progress'], ['polished', i.status !== 'in progress']]
    : [['storyboarded', i.beats.length > 0], ['take added', !!i.take && !i.drafted.includes('take')], ['hook picked', i.chosen !== null && !i.rehook]];
  return <div className="stage-line" aria-label="Stage">{steps.map(([l, y]) => <span key={l} className={y ? 'y' : 'n'}>{l}</span>)}</div>;
}

export function Beats({ i, style }: { i: Idea; style?: React.CSSProperties }) {
  return <ol className="beats" style={style}>{i.beats.map((b, n) =>
    <li key={n}><span>{b.t}{b.gap && <> <NeedsTag text={b.gap} /></>}{b.waitingOn && <> <WaitingTag who={b.waitingOn} /></>}</span></li>)}</ol>;
}

const GUT_CLASS: Record<Gut, [string, string]> = { yes: ['yes', 'Yes'], 'not sure': ['unsure', 'Not sure'], no: ['no', 'No'] };

export function IdeaPage({ id }: { id: string }) {
  const { data: d, ui } = useStore();
  const [note, setNote] = useState('');
  const i = findIdea(d, id);
  if (!i || i.past) return <><ProtoBar /><p style={{ marginTop: 20 }}>That idea isn't here. <button className="btn sm" onClick={() => go('ideas')}>Back to Ideas</button></p></>;
  const flowIdx = FLOW.indexOf(i.status);
  const r = readiness(i);
  const gaps = gapsOf(i), waits = waitsOf(i);
  const tips = i.tips || DEFAULT_TIPS;
  const backLabel = { ideas: 'Ideas', plan: 'Plan week', film: 'Film' }[ui.backTo];

  function statusTo(s: string) {
    if (!i || i.status === s) return;
    if (s === 'published') return toast('Published moves on its own when the post date passes.');
    if (s === 'scheduled') return openSheet({ kind: 'date', id: i.id });
    move(i.id, s as Idea['status']);
  }

  return <>
    <ProtoBar />
    <button className="back" onClick={() => go(ui.backTo)}>{Icon.back} {backLabel}</button>
    <header style={{ padding: '6px 0 4px' }}>
      <h1 className="idea-title">{i.title}</h1>
      <div className="flow" role="group" aria-label="Status">{FLOW.map((s, k) =>
        <button key={s} onClick={() => statusTo(s)} className={`${k < flowIdx ? 'past' : ''} ${s === 'published' ? 'auto' : ''}`} aria-current={i.status === s ? 'step' : undefined}
          title={s === 'published' ? 'Moves on its own when the post date passes' : undefined}>{s}</button>)}</div>
      <div className="status-side">
        {['backlog', 'rejected'].includes(i.status) && <span className="st">{i.status}</span>}
        {i.status !== 'backlog' && <button className="pillbtn" onClick={() => move(i.id, 'backlog')}>Backlog</button>}
        {i.status !== 'rejected' && <button className="pillbtn" onClick={() => openSheet({ kind: 'reject', id: i.id })}>Reject</button>}
        {i.week && <span className="muted small">Week of {md(i.week)}{i.postDate ? ` · ${i.status === 'scheduled' ? 'posts' : i.status === 'published' ? 'posted' : 'planned'} ${wmd(i.postDate)}` : ''}</span>}
      </div>
      <StageLine d={d} i={i} />
      {i.status === 'rejected' && i.rejectNote && <p className="why" style={{ marginTop: 10 }}><b>Why not</b>{i.rejectNote}</p>}
    </header>

    <div className="top-row">
      <div className="card ready"><span className={`lamp ${r.level}`} aria-hidden="true"><i /><i /><i /></span>
        <div className="what"><strong>{LEVEL_TEXT[r.level]}</strong><span>{r.missing.length ? r.missing.join(' · ') : 'Nothing missing from you.'}</span>
          {gaps.length > 0 && <span className="waiting"><img className="peg-xs" src={PEG} alt="" />In the storyboard: {gaps.map(g => `beat ${g.n}, ${g.gap}`).join(' · ')}</span>}
          {waits.length > 0 && <span className="waiting" style={{ fontWeight: 500 }}>{waits.map(g => <WaitingTag key={g.n} who={`${g.who} (beat ${g.n})`} />)}</span>}
        </div></div>
      <button className="btn chatbtn" onClick={() => openSheet({ kind: 'chat', id: i.id })}>{Icon.chat} Chat about it</button>
    </div>

    <section className="section"><h2>Design brief</h2>
      <div className="design">
        <div className="card brief">
          <Pitch d={d} i={i} />
          <div className="bp-legend"><span><i />yours</span><span><i className="d" />drafted by an agent: tap to confirm or change</span></div>
          <div className="angle"><span className="eyebrow">The angle {i.drafted.includes('summary') && <span className="drafted">drafted</span>}</span>
            <button onClick={() => openSheet({ kind: 'text', id: i.id, k: 'summary' })}>{i.summary || <span className="muted">Add the angle</span>}</button></div>
          <div className="links">
            <div className="linkrow"><span className="k">Source</span><span>{i.sourceLink ? <a href={i.sourceLink.url} target="_blank" rel="noopener noreferrer">{i.sourceLink.label} {Icon.link}</a>
              : <span className="muted">{({ experience: 'Your own experience. No link.', agent: 'Your notes', research: 'Research', client: 'A client story. No link.', read: 'No link yet' } as Record<string, string>)[i.origin] || 'None yet'}</span>}</span></div>
            <div className="linkrow"><span className="k">Brief</span><span>{i.brief ? <span className="mono">{i.brief}</span> : <span className="muted">Orca writes the brief on the next pass</span>}</span></div>
            {i.links.map((l, n) => <div className="linkrow" key={n}><span className="k">{l.label}</span><span><LinkOrPath url={l.url} /></span></div>)}
            <div><button className="btn sm ghost" onClick={() => openSheet({ kind: 'links', id: i.id })}>{i.links.length ? 'Edit links' : 'Add a link'}</button></div>
          </div>
          {i.safety === 'blinded' && <div className="nox"><img className="felt-c" src={asset('nox')} alt="Nox the felt owl" /><span><strong>Blinded.</strong> Say "a team I worked with." No names on screen.</span></div>}
        </div>
        <div className="card look"><h3>Look <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>feeds the run of show</span></h3>
          {LOOK.map(([k, l]) => <button key={k} className="field" onClick={() => openSheet({ kind: 'text', id: i.id, k: 'look.' + k })}>
            <span className="k">{l}</span><span className={`v ${k === 'edit' ? 'long' : ''}`}>{i.look[k] || <span className="muted" style={{ fontWeight: 400 }}>Add</span>}</span><span className="chev">{Icon.chev}</span></button>)}
        </div>
      </div>
    </section>

    <section className="section" id="hooks"><h2>Hooks <span className="count-pill num">{i.hooks.length}</span></h2>
      {i.rehook && <div className="rehook" role="status"><strong><span className="rehook-badge">Re-hook needed</span></strong>
        <p>You changed the {REHOOK[i.rehook.field]} from <strong>{i.rehook.from || 'blank'}</strong> to <strong>{i.rehook.to}</strong>. Cody rebuilds the hooks on the next pass. You can still pick one of these, or write your own; either clears the flag.</p></div>}
      {i.hooks.length ? <div className="hooks">{i.hooks.map((h, n) =>
        <article key={n} className={`card hook ${i.chosen === n ? 'chosen' : ''} ${i.rehook ? 'stale' : ''}`}>
          <div className="top"><span className="chip">{h.format}</span>{h.rec && <span className="tag sm">recommended</span>}</div>
          {i.rehook && <span className="made-before">Made before your change</span>}
          <p className="spoken">"{h.spoken}"</p>
          <dl><div><dt>On-screen text</dt><dd>{h.onscreen}</dd></div><div><dt>First frame</dt><dd>{h.frame}</dd></div><div><dt>Payoff lands</dt><dd>{h.payoff}</dd></div></dl>
          <button className={`btn ${i.chosen === n ? 'primary' : ''}`} onClick={() => { const had = !!i.rehook; update(dd => { const x = findIdea(dd, i.id)!; x.chosen = n; x.rehook = null; }, had ? 'Hook picked. Re-hook cleared.' : 'Hook picked.'); }}>
            {i.chosen === n ? <>{Icon.check} Chosen</> : 'Pick this hook'}</button>
        </article>)}</div>
        : <div className="card" style={{ padding: '14px 16px' }}><p className="muted">Cody writes 3 to 5 hooks on the next agent pass.</p></div>}
      {i.chosen === 'own' && <div className="card" style={{ padding: 14 }}><span className="eyebrow">Your own hook</span><p className="spoken" style={{ fontWeight: 600, marginTop: 4 }}>"{i.ownHook}"</p></div>}
      <div><button className="btn" onClick={() => openSheet({ kind: 'own', id: i.id })}>Write my own hook</button></div>
    </section>

    <section className="section"><h2>Storyboard</h2>
      <div className="card" style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
        {i.beats.length ? <><p className="muted small">Drafted by Mark from whatever is here. {gaps.length ? 'Where your words would make it better, he marks it.' : 'Nothing waiting on you.'}</p><Beats i={i} /></>
          : <p className="muted">Mark drafts beats on the next pass with whatever is here, and marks where your words would make it better.</p>}
      </div></section>

    <section className="section"><h2>Gut check</h2>
      <p className="gut-key">Would they keep watching? Tap a light to change it; it cycles TBD, yes, not sure, no. <span><i style={{ background: 'var(--go)' }} />yes</span><span><i style={{ background: 'var(--caution)' }} />not sure</span><span><i style={{ background: 'var(--gut-no)' }} />no</span></p>
      <div className="gutlist">{PERSONAS.map(p => { const w = personaWants(d, p);
        const g = i.gut[p] ? GUT_CLASS[i.gut[p]!] : null;
        const cycle = () => update(dd => { const x = findIdea(dd, i.id)!; const order: (Gut | undefined)[] = [undefined, 'yes', 'not sure', 'no']; const nx = order[(order.indexOf(x.gut[p]) + 1) % 4]; if (nx) x.gut[p] = nx; else delete x.gut[p]; });
        return <div className="card gcard" key={p}>
          <span className="who">{p}<small>{w}</small></span>
          <button className={`gmark ${g ? g[0] : ''}`} onClick={cycle} aria-label={`Would ${p} keep watching? ${g ? g[1] : 'TBD'}. Tap to change.`}><i />{g ? g[1] : 'TBD'}</button>
          <p className="tip"><b>Director's tip</b>{tips[p]}{!i.tips && <span className="muted"> (placeholder until Orca's crew drafts one)</span>}</p></div>;
      })}</div>
    </section>

    <section className="section"><h2>Your notes and Slack replies</h2>
      <div className="card">{i.notes.length ? i.notes.map((n, k) => <div className="note" key={k}><span className="who" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{/^You/.test(n.who) && <img className="peg-xs" src={PEG} alt="" />}{n.who}</span><p>{n.text}</p></div>)
        : <div className="note"><p className="muted">No notes yet. Replies in the #tiktok thread show up here once Slack is connected.</p></div>}
        <div className="note"><label className="who" htmlFor={'note-' + i.id}>Add a note</label>
          <form style={{ display: 'flex', gap: 8 }} onSubmit={e => { e.preventDefault(); const t = note.trim(); if (!t) return; update(dd => { findIdea(dd, i.id)!.notes.push({ who: `You in the app, ${md(today())}`, text: t }); }); setNote(''); }}>
            <input type="text" id={'note-' + i.id} value={note} onChange={e => setNote(e.target.value)} placeholder="Tighter open, start on the letter" /><button className="btn" type="submit">Add</button></form></div>
      </div></section>
    <div style={{ height: 12 }} />
  </>;
}

/* ---------- Sheets for the Idea page ---------- */
export function FieldSheet({ id, k }: { id: string; k: string }) {
  const { data: d } = useStore();
  const [newVal, setNewVal] = useState('');
  if (k === 'channels') return <ChannelsSheet id={id} />;
  if (k === 'innerWorld') return <InnerWorldSheet id={id} />;
  const i = findIdea(d, id)!;
  let opts: string[];
  if (k === 'pillar') opts = d.pillars.map(p => p.name);
  else if (k === 'take') opts = Object.keys(d.takes);
  else if (k === 'story') opts = ['', ...Object.keys(d.stories)];
  else if (k === 'series') opts = [NO_SERIES, ...d.opts.series];
  else opts = d.opts[k as OptKey];
  // Story: '' is the decision "no story"; nothing is pressed while it isn't picked yet.
  const curVal = k === 'story' && !i.story && !i.noStory ? '\u0000' : String((i as unknown as Record<string, unknown>)[k] ?? '');
  // A retired value stays on this idea until she picks another; it isn't offered to anything new.
  if (curVal && curVal !== '\u0000' && !opts.includes(curVal) && k !== 'take' && k !== 'story' && !(k === 'series' && curVal === NO_SERIES)) opts = [curVal, ...opts];
  const drafted = i.drafted.includes(k);
  const label = (o: string) => k === 'take' ? <><span>#{o} {d.takes[+o].short}</span><small>{d.takes[+o].text}</small></>
    : k === 'type' && TYPE_HELP[o] ? <><span>{o}</span><small>{TYPE_HELP[o]}</small></>
    : k === 'story' ? (o ? <>{d.stories[o].title} <small>{d.stories[o].onCamera}</small></> : <><span>N/A</span><small>It doesn't need a story from the bank.</small></>)
    : k === 'series' ? (o !== NO_SERIES ? <>{o} <small>next: episode {nextEp(d, o, i)}</small></> : 'Not part of a series')
    : <>{o}{isRetired(d, k, o) ? <small> (retired)</small> : null}</>;
  return <Sheet>
    <h3>{LABEL[k]}</h3>
    <p className="hint">{REHOOK[k] ? 'Changing this sets re-hook needed.' : 'Changing this keeps the hooks as they are.'}{drafted ? ' Drafted by an agent: confirm it or pick another.' : ''}{k === 'take' || k === 'story' ? ' From your bank.' : ''}</p>
    {curVal && curVal !== '\u0000' && isRetired(d, k, curVal) && <p className="hint">"{curVal}" is retired. It stays on this idea until you pick another.</p>}
    <div className="optlist">
      {k === 'type' && <p className="muted small">A week aims for 3 authority, 2 storyline, 1 personality and 1 follow the signal.</p>}
      {opts.map(o => <button key={o || 'none'} className={`opt${k === 'take' || (k === 'type' && TYPE_HELP[o]) || (k === 'story' && !o) ? ' col' : ''}`} aria-pressed={curVal === o} onClick={() => { closeSheet(); setField(id, k, o); }}><span>{label(o)}</span></button>)}
      {(k === 'series' || k === 'take') && <form className="opt" style={{ gap: 8 }} onSubmit={e => {
        e.preventDefault(); const v = newVal.trim(); if (!v) return; closeSheet();
        if (k === 'take') { let n = 0; update(dd => { n = addTake(dd, v, findIdea(dd, id)!.pillar); }); toast(`Saved to your takes bank as #${n}.`); setField(id, 'take', String(n)); }
        else if (v.toLowerCase() === NO_SERIES) { toast('"none" is reserved for "not part of a series". Pick another name.'); return; }
        else { update(dd => { if (!dd.opts.series.includes(v)) { dd.opts.series.push(v); addVersion(dd, 'Series added', { field: 'Series', from: '', to: `Added "${v}"` }); } }); setField(id, 'series', v); }
      }}>
        <input type="text" value={newVal} onChange={e => setNewVal(e.target.value)} aria-label={k === 'take' ? 'New take' : 'New series name'} placeholder={k === 'take' ? 'Add a new take, in your words' : 'New series name'} style={{ border: 0, padding: 0 }} />
        <button className="btn sm" type="submit">Add</button></form>}
      {k === 'take' && <p className="muted small">A new take is saved to your takes bank as #{nextTakeNumber(d)}, in your words.</p>}
    </div>
    {drafted && <div className="sheet-actions"><button className="btn primary" onClick={() => { closeSheet(); setField(id, k, curVal); }}>Confirm as drafted</button></div>}
  </Sheet>;
}

export function TextSheet({ id, k }: { id: string; k: string }) {
  const i = findIdea(getData(), id)!;
  const isLook = k.startsWith('look.');
  const cur = isLook ? i.look[k.slice(5) as keyof Idea['look']] : i.summary;
  const [v, setV] = useState(cur);
  const label = isLook ? LOOK.find(l => 'look.' + l[0] === k)![1] : 'The angle';
  return <Sheet>
    <h3>{label}</h3><p className="hint">{k === 'summary' ? 'Changing the angle sets re-hook needed.' : "Look changes don't affect hooks."}</p>
    <textarea autoFocus value={v} onChange={e => setV(e.target.value)} />
    <div className="sheet-actions"><button className="btn ghost" onClick={closeSheet}>Cancel</button><button className="btn primary" onClick={() => { closeSheet(); setField(id, k, v.trim()); }}>Save</button></div>
  </Sheet>;
}

export function DateSheet({ id }: { id: string }) {
  const i = findIdea(getData(), id)!;
  const [v, setV] = useState(i.postDate || addDays(i.week || CUR_WEEK, 7));
  return <Sheet>
    <h3>When does it post?</h3><p className="hint">Scheduled means edited and waiting to publish. It moves to published on its own after this date.</p>
    <label htmlFor="sheet-date" className="small" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Post date</label>
    <input type="date" id="sheet-date" value={v} onChange={e => setV(e.target.value)} />
    <div className="sheet-actions"><button className="btn ghost" onClick={closeSheet}>Cancel</button>
      <button className="btn primary" disabled={!v} onClick={() => {
        closeSheet(); const past = v <= today();
        update(dd => { const x = findIdea(dd, id)!; x.postDate = v; x.week = x.week || CUR_WEEK; x.status = 'scheduled'; },
          past ? 'That date has passed, so it shows as published.' : `Scheduled. Posts ${wmd(v)}.`, true);
      }}>Schedule it</button></div>
  </Sheet>;
}

export function OwnHookSheet({ id }: { id: string }) {
  const i = findIdea(getData(), id)!;
  const [v, setV] = useState(i.ownHook || '');
  return <Sheet>
    <h3>Write my own hook</h3><p className="hint">Your first spoken line. It replaces the picked option and clears re-hook needed.</p>
    <textarea autoFocus value={v} onChange={e => setV(e.target.value)} />
    <div className="sheet-actions"><button className="btn ghost" onClick={closeSheet}>Cancel</button>
      <button className="btn primary" onClick={() => { const t = v.trim(); if (!t) return; closeSheet(); update(dd => { const x = findIdea(dd, id)!; x.ownHook = t; x.chosen = 'own'; x.rehook = null; }, 'Your hook is chosen.'); }}>Use this hook</button></div>
  </Sheet>;
}

/* "Chat about it" (D50): a page can't open iTerm on its own, so the prototype gives a command to copy.
 * Later: an "Open in iTerm" button on the session manager (localhost:7433); then a queued request via Supabase. */
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
export function ChatSheet({ id }: { id: string }) {
  const d = getData(); const i = findIdea(d, id)!;
  const r = readiness(i);
  const prompt = [
    `Act as the producer for my daily TikTok. Let's work on this idea together.`,
    `Idea: ${i.title} (id ${i.id}, status ${i.status}${i.week ? `, week of ${md(i.week)}` : ''}).`,
    i.summary && `Angle: ${i.summary}`,
    `Pillar ${i.pillar || 'not set'}, feeling ${i.feeling || 'not set'}, style ${i.style || 'not set'}, take ${i.take ? `#${i.take} "${d.takes[i.take]?.text}"` : 'not set'}${i.drafted.includes('take') ? ' (drafted)' : ''}.`,
    i.safety === 'blinded' && 'Client story: blinded. Never name the client.',
    `Readiness ${r.level}: ${r.missing.join('; ') || 'nothing missing'}.`,
    `Start by asking me what's missing from me, one question at a time.`,
  ].filter(Boolean).join(' ');
  const cmd = `cd ~/Projects/mellonhead && claude ${shq(prompt)}`;
  const [copied, setCopied] = useState(false);
  return <Sheet>
    <h3>Chat about it <span className="stub">prototype</span></h3>
    <p className="hint">Opens Claude in iTerm with this idea loaded. Copy the command and paste it into iTerm. The producer agent isn't built yet, so this starts plain Claude in your mellonhead folder with a producer brief.</p>
    <div className="cmd">{cmd}</div>
    <div className="sheet-actions">
      <a className="btn ghost" href="http://localhost:7433" target="_blank" rel="noopener noreferrer">Session manager {Icon.link}</a>
      <button className="btn primary" onClick={async () => { try { await navigator.clipboard.writeText(cmd); setCopied(true); } catch { toast("Couldn't copy here. Select the text and copy it."); } }}>{copied ? <>{Icon.check} Copied</> : 'Copy command'}</button>
    </div>
    <p className="muted small" style={{ marginTop: 10 }}>Next: an "Open in iTerm" button on your session manager. After Supabase: a request your Mac picks up, which also works from your phone.</p>
  </Sheet>;
}

/** A web link opens in a new tab; a repo path shows as text to copy. */
function LinkOrPath({ url }: { url: string }) {
  return /^https?:\/\//i.test(url) ? <a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\/(www\.)?/i, '').slice(0, 48)} {Icon.link}</a> : <span className="mono">{url}</span>;
}

/* Links beyond the brief and the source: short brief, story card, storyboard, hooks file, assets. */
export function LinksSheet({ id }: { id: string }) {
  const { data: d } = useStore();
  const i = findIdea(d, id)!;
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  return <Sheet>
    <h3>Links</h3>
    <p className="hint">The brief and the source have their own places. Add the rest here: a web link or a path in the repo.</p>
    <div className="optlist">
      {i.links.map((l, n) => <div className="opt" key={n} style={{ justifyContent: 'space-between', gap: 8 }}>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><b>{l.label}</b> <small><LinkOrPath url={l.url} /></small></span>
        <button className="btn sm ghost" onClick={() => update(dd => { const x = findIdea(dd, id)!; x.links = x.links.filter((_, k) => k !== n); }, `Removed "${l.label}".`)}>Remove</button></div>)}
      <form className="opt" style={{ display: 'grid', gap: 8 }} onSubmit={e => {
        e.preventDefault(); const u = url.trim(); if (!u) return;
        const lb = label.trim() || u.split('/').filter(Boolean).pop() || u;
        update(dd => { findIdea(dd, id)!.links.push({ label: lb, url: u }); }, `Added "${lb}".`); setLabel(''); setUrl('');
      }}>
        <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="What it is (story card, storyboard)" aria-label="Link label" />
        <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://... or marketing/tiktok/..." aria-label="Link or path" />
        <button className="btn sm" type="submit">Add</button></form>
    </div>
  </Sheet>;
}

/* Channels: pick any. The list is in Config. */
function ChannelsSheet({ id }: { id: string }) {
  const { data: d } = useStore();
  const i = findIdea(d, id)!;
  const drafted = i.drafted.includes('channels');
  const opts = [...d.opts.channel, ...i.channels.filter(c => !d.opts.channel.includes(c))];
  const toggle = (c: string) => update(dd => {
    const x = findIdea(dd, id)!;
    x.channels = x.channels.includes(c) ? x.channels.filter(y => y !== c) : opts.filter(o => o === c || x.channels.includes(o));
    x.drafted = x.drafted.filter(f => f !== 'channels');
  });
  return <Sheet>
    <h3>Channels</h3>
    <p className="hint">Pick every channel it's planned for. Changing this keeps the hooks as they are.{drafted ? ' Drafted by an agent: confirm it or change it.' : ''}</p>
    <div className="optlist">{opts.map(c => <button key={c} className="opt" aria-pressed={i.channels.includes(c)} onClick={() => toggle(c)}>
      <span>{c}{isRetired(d, 'channel', c) ? <small> (retired)</small> : null}</span></button>)}</div>
    <div className="sheet-actions">{drafted && <button className="btn" onClick={() => update(dd => { const x = findIdea(dd, id)!; x.drafted = x.drafted.filter(f => f !== 'channels'); }, 'Confirmed.')}>Confirm as drafted</button>}
      <button className="btn primary" onClick={closeSheet}>Done</button></div>
  </Sheet>;
}

/* Which parts of the person's inner world it speaks to (from Config). Optional; pick any. */
function InnerWorldSheet({ id }: { id: string }) {
  const { data: d } = useStore();
  const i = findIdea(d, id)!;
  const iw = d.config.innerWorld ?? {};
  const keys = (Object.keys(INNER_WORLD_LABEL) as (keyof InnerWorld)[]).filter(k => iw[k]);
  const toggle = (k: keyof InnerWorld) => update(dd => {
    const x = findIdea(dd, id)!;
    // Adding keeps whatever was there (an agent's pick, or a field since blanked in Config), in Config's order.
    const order = Object.keys(INNER_WORLD_LABEL);
    x.innerWorld = x.innerWorld.includes(k) ? x.innerWorld.filter(y => y !== k) : [...x.innerWorld, k].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    x.drafted = x.drafted.filter(f => f !== 'innerWorld');
  });
  return <Sheet>
    <h3>Speaks to</h3>
    <p className="hint">Optional. Which part of the person's inner world this one connects to. From Config.</p>
    <div className="optlist">{keys.map(k => <button key={k} className="opt col" aria-pressed={i.innerWorld.includes(k)} onClick={() => toggle(k)}>
      <span><span>{INNER_WORLD_LABEL[k]}</span><small>{iw[k]}</small></span></button>)}</div>
    <div className="sheet-actions"><button className="btn primary" onClick={closeSheet}>Done</button></div>
  </Sheet>;
}
