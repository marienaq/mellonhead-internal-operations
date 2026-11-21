import { useRef, useState } from 'react';
import type { Data, Idea } from '../lib/types';
import { CUR_WEEK, filmDate, filmDays, HOLIDAYS, holidaysInWeek, md, weekday } from '../lib/dates';
import { currentRos, DEFAULT_TIPS, filmIdeas, GENERAL_PREP, PERSONAS } from '../lib/logic';
import { findIdea, getData, getUi, setUi, toast, update, updateQuiet, useStore } from '../lib/store';
import { Band, Icon, PEG, ProtoBar, asset } from '../components/ui';
import { Beats } from './IdeaPage';
import { openIdea } from './Ideas';

function Ck({ d, k, text, slate }: { d: Data; k: string; text: string; slate?: string }) {
  const on = !!d.prepDone[k];
  return <li><button className="ck" aria-pressed={on} onClick={() => update(dd => { dd.prepDone[k] = !dd.prepDone[k]; })}>
    <span className="box">{on && Icon.check}</span><span className="txt">{text}</span>{slate ? <span className="slate-s">{slate}</span> : <span />}</button></li>;
}

/* A script line you can edit in place. Editing a drafted line makes it yours (D33). */
function ScriptLineEdit({ i, n }: { i: Idea; n: number }) {
  const l = i.script[n];
  return <div className="sline-wrap">
    <textarea className={`sline ${l.d ? 'is-drafted' : ''}`} rows={1} aria-label={`Script line ${n + 1}`} value={l.t}
      style={{ resize: 'none', fieldSizing: 'content' } as React.CSSProperties}
      onChange={e => { const v = e.target.value; updateQuiet(dd => { const s = findIdea(dd, i.id)!.script[n]; s.t = v; s.d = false; delete s.g; }); }} />
    {l.d ? <span className="drafted">drafted</span> : <span />}
    {l.g && <span className="needs" style={{ gridColumn: '1/-1', justifySelf: 'start' }}>needs you: {l.g}</span>}
  </div>;
}

function ScriptBlock({ i, open }: { i: Idea; open: boolean }) {
  const nd = i.script.filter(l => l.d).length, ng = i.script.filter(l => l.g).length;
  return <div style={{ display: 'grid', gap: 10 }}>
    <button className="script-toggle" aria-expanded={open} onClick={() => setUi({ scriptOpen: { ...getUi().scriptOpen, [i.id]: !open } })}>
      <span>Script <span className="muted small" style={{ fontWeight: 500 }}>{i.script.length ? `${i.script.length} lines${nd ? `, ${nd} drafted` : ''}${ng ? `, ${ng} need you` : ''}` : 'empty'}</span></span><span className="chev">{Icon.chev}</span></button>
    {open && <div className="script">{i.script.map((_, n) => <ScriptLineEdit key={n} i={i} n={n} />)}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn sm primary" disabled={!i.script.some(l => l.t.trim())} onClick={async () => {
          // Verbatim, one line per paragraph, ready to paste into a teleprompter app.
          const text = i.script.map(l => l.t.trim()).filter(Boolean).join('\n\n');
          const left = i.script.filter(l => l.g).length;
          try { await navigator.clipboard.writeText(text); toast(left ? `Script copied. ${left} line${left > 1 ? 's' : ''} still need${left > 1 ? '' : 's'} you.` : 'Script copied. Paste it into your teleprompter.'); }
          catch { toast("Couldn't copy here. Select the lines and copy them."); }
        }}>Copy for teleprompter</button>
        <button className="btn sm" onClick={() => update(dd => { findIdea(dd, i.id)!.script.push({ t: '', d: false }); })}>{Icon.plus} Add a line</button>
        <span className="muted small">Word for word what you'll say. Edit a drafted line and it becomes yours.</span></div></div>}
  </div>;
}

function VidCard({ d, i, open, focusMode, onGrip }: { d: Data; i: Idea; open: boolean; focusMode: boolean; onGrip?: (e: React.PointerEvent) => void }) {
  const h = i.chosen === 'own' ? { spoken: i.ownHook || '', onscreen: '', frame: '' } : i.chosen !== null ? i.hooks[i.chosen] : null;
  const done = !!d.filmed[i.id];
  const tips = i.tips || DEFAULT_TIPS;
  return <article className={`card vid ${done ? 'done' : ''}`} data-vid={i.id}>
    <div className="vid-top">
      <div className="tt"><span className="slate">{i.slate || 'SLATE TBD'}</span><h3>{i.title}</h3></div>
      {!focusMode && <button className="handle" onPointerDown={onGrip} aria-label={`Drag to reorder ${i.title}`}>{Icon.grip}</button>}
    </div>
    <div className="detail" style={{ display: 'grid', gap: 16 }}>
      {h ? <><div style={{ display: 'grid', gap: 4 }}><span className="say-l">Say first</span><p className="say">"{h.spoken}"</p></div>
        <div className="film-grid two"><div><span className="say-l">On-screen text</span><p className="v">{h.onscreen || '—'}</p></div><div><span className="say-l">First frame</span><p className="v">{h.frame || '—'}</p></div></div></>
        : <div className="nohook"><span>No hook picked yet</span><button className="btn sm" onClick={() => openIdea(i.id)}>Pick a hook</button></div>}
      {i.prep.length > 0 && <div><span className="say-l">Prep for this one</span><ul className="checklist vprep" style={{ marginTop: 8 }}>{i.prep.map((p, n) => <Ck key={n} d={d} k={`${i.id}:${n}`} text={p} />)}</ul></div>}
      {i.beats.length > 0 && <div><span className="say-l">Beats</span><Beats i={i} style={{ marginTop: 8 }} /></div>}
      <div className="film-tips"><span className="say-l">Director's tips</span>{PERSONAS.map(([p]) => <p key={p}><b>{p}:</b> {tips[p]}</p>)}</div>
      <div className="film-grid two">
        <div><span className="say-l">Voice</span><p className="v">{i.voice}</p></div>
        <div><span className="say-l">Feeling</span><p className="v">{i.feeling}</p></div>
        <div><span className="say-l">Props</span><p className="v">{i.look.props || 'None'}</p></div>
        <div><span className="say-l">Call to action</span><p className="v">{i.cta}{i.ctaLink && i.cta !== 'none' ? ': ' + i.ctaLink : ''}</p></div>
      </div>
      <ScriptBlock i={i} open={open} />
      {i.look.edit && <div><span className="say-l">Edit notes for Descript</span><p className="edit-notes" style={{ marginTop: 6 }}>{i.look.edit}</p></div>}
    </div>
    <button className="filmed-btn" aria-pressed={done} onClick={() => {
      const wasOnDeck = !d.filmed[i.id] && i.status === 'on deck';
      update(dd => { dd.filmed[i.id] = !dd.filmed[i.id]; const x = findIdea(dd, i.id)!; if (dd.filmed[i.id] && x.status === 'on deck') x.status = 'in progress'; },
        wasOnDeck ? 'Filmed. Status moved to in progress.' : d.filmed[i.id] ? 'Marked not filmed.' : 'Filmed.');
    }}><span className="box">{done && Icon.check}</span>{done ? 'Filmed' : 'Mark filmed'}</button>
  </article>;
}

export function FilmScreen() {
  const { data: d, ui } = useStore();
  const [wake, setWake] = useState(false);
  const listRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const ros = currentRos(d);
  const FILM_DAY = filmDate(d.config.filmWeekday);
  const shown = ui.filmDay ?? FILM_DAY;
  const hols = holidaysInWeek(CUR_WEEK);

  const head = <>
    <ProtoBar />
    <Band pos="84% 74%" />
    <div className="film-head"><div><p className="eyebrow">Run of show</p><h1 style={{ fontSize: 26 }}>Film day</h1>{hols.map(h => <span key={h} className="tag sm" style={{ marginTop: 6, marginRight: 6 }}>{weekday(h)} is {HOLIDAYS[h]}</span>)}</div>
      <figure className="polaroid r" style={{ margin: 0, width: 88 }}><img src={PEG} alt="Peg-doll Mariena" /><figcaption>you</figcaption></figure></div>
    <div className="days">{filmDays(d.config.filmWeekday).map(({ day, short, label }) => <button key={day} className="day" aria-pressed={shown === day} onClick={() => setUi({ filmDay: day === FILM_DAY ? null : day, focus: null })}>{short}<small>{label}{HOLIDAYS[day] ? ' · holiday' : ''}</small></button>)}</div>
  </>;
  if (shown !== FILM_DAY) return <>{head}<div className="card empty" style={{ marginTop: 20 }}><figure className="polaroid" style={{ margin: 0 }}><img src={asset('jay')} alt="Jay the felt jay" /><figcaption>Jay</figcaption></figure>
    <h2 style={{ fontSize: 18 }}>Nothing to film this day</h2><p className="muted small">This week's run of show is on {weekday(FILM_DAY)}. It has {filmIdeas(d).length} videos.</p>
    <button className="btn" onClick={() => setUi({ filmDay: null })}>Go to {weekday(FILM_DAY)}</button></div></>;

  const all = ros.flatMap(b => b.groups.flatMap(g => g.ids)).map(id => findIdea(d, id)).filter((x): x is Idea => !!x);
  const nDone = all.filter(i => d.filmed[i.id]).length;
  const prepKeys = GENERAL_PREP.map((_, n) => 'gen:' + n).concat(all.flatMap(i => i.prep.map((_, n) => `${i.id}:${n}`)));
  const nPrepDone = prepKeys.filter(k => d.prepDone[k]).length;

  async function keepOn() {
    try { await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<unknown> } }).wakeLock.request('screen'); setWake(true); }
    catch { toast("This browser won't keep the screen on."); }
  }

  /* Drag the grip to reorder within a setup. The new order saves when you let go. */
  function grip(e: React.PointerEvent, bn: number, gn: number, id: string) {
    e.preventDefault();
    // Listen on window: React moves the card in the DOM while you drag, which would drop pointer capture on the grip.
    const listKey = `${bn}:${gn}`; const before = getData();
    const start = [...ros[bn].groups[gn].ids];
    let order = start;
    const mv = (ev: PointerEvent) => {
      const list = listRefs.current[listKey]; if (!list) return;
      const others = order.filter(x => x !== id);
      const cards = others.map(x => list.querySelector<HTMLElement>(`[data-vid="${CSS.escape(x)}"]`)!);
      let idx = cards.findIndex(c => { const r = c.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (idx < 0) idx = others.length;
      const next = [...others.slice(0, idx), id, ...others.slice(idx)];
      if (next.join() !== order.join()) {
        order = next;
        updateQuiet(dd => { const r = currentRos(dd).map(b => ({ ...b, groups: b.groups.map(g => ({ ...g, ids: [...g.ids] })) })); r[bn].groups[gn].ids = next; dd.ros = r; });
      }
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (order.join() !== start.join()) toast('Filming order saved.', before); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  const top = <>{head}
    <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}><span className="num">{nDone} of {all.length} filmed</span><span className="muted num" style={{ fontWeight: 500 }}>{ros.length} outfits</span></div>
      <div className="progress"><i style={{ width: `${all.length ? nDone / all.length * 100 : 0}%` }} /></div>
      <div className="film-tools">{ui.focus === null ? <button className="btn" onClick={() => setUi({ focus: 0 })}>One at a time</button> : <button className="btn" onClick={() => setUi({ focus: null })}>Show the whole list</button>}
        <button className="btn ghost" onClick={keepOn}>{wake ? 'Screen stays on' : 'Keep screen on'}</button></div>
    </div>
    <section className="card" style={{ marginTop: 18 }}><div className="prep-head"><h2>Before you start</h2><span className="muted small num">{nPrepDone} of {prepKeys.length} done</span></div>
      <ul className="checklist">{GENERAL_PREP.map((t, n) => <Ck key={'gen' + n} d={d} k={'gen:' + n} text={t} />)}
        {all.flatMap(i => i.prep.map((p, n) => <Ck key={i.id + n} d={d} k={`${i.id}:${n}`} text={p} slate={i.slate} />))}</ul></section>
  </>;

  if (!all.length) return <>{top}<div className="card empty" style={{ marginTop: 20 }}><p><strong>Nothing on deck to film</strong></p><p className="muted small">Put ideas on deck for the week of {md(CUR_WEEK)} on Plan week.</p></div></>;

  if (ui.focus !== null) {
    const idx = Math.max(0, Math.min(ui.focus, all.length - 1)); const i = all[idx];
    const bn = ros.findIndex(b => b.groups.some(g => g.ids.includes(i.id)));
    const g = ros[bn].groups.find(g => g.ids.includes(i.id))!;
    return <div className="film">{top}
      <div className="block"><div className="block-head"><span className="tag">outfit {bn + 1}</span><h2>{ros[bn].outfit}</h2></div><p className="setup">{g.setup}</p>
        <VidCard d={d} i={i} open={!!ui.scriptOpen[i.id]} focusMode /></div>
      <div className="focusnav"><button className="btn" disabled={idx === 0} onClick={() => { setUi({ focus: idx - 1 }); window.scrollTo(0, 0); }}>Previous</button>
        <span className="num" style={{ fontWeight: 700 }}>{idx + 1} / {all.length}</span>
        <button className="btn primary" disabled={idx === all.length - 1} onClick={() => { setUi({ focus: idx + 1 }); window.scrollTo(0, 0); }}>Next</button></div></div>;
  }

  return <div className="film">{top}
    <div>{ros.map((b, bn) => <section className="block" key={b.outfit}>
      <div className="block-head"><span className="tag">outfit {bn + 1}</span><h2 style={{ flex: 1 }}>{b.outfit}</h2></div>
      {b.groups.map((g, gn) => <div key={g.setup} style={{ display: 'grid', gap: 12 }}><p className="setup">{g.setup}</p>
        <div className="vlist" ref={el => { listRefs.current[`${bn}:${gn}`] = el; }}>
          {g.ids.map(id => { const i = findIdea(d, id); return i ? <VidCard key={id} d={d} i={i} open={!!ui.scriptOpen[id]} focusMode={false} onGrip={e => grip(e, bn, gn, id)} /> : null; })}</div></div>)}
    </section>)}</div>
    <p className="example-note">Drag the grip to reorder within a setup. Grouped by outfit, then setup, so you change clothes and move the camera as little as possible.</p>
  </div>;
}
