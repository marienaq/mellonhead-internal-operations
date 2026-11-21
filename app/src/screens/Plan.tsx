import { useRef } from 'react';
import type { Data, Idea } from '../lib/types';
import { addDays, CUR_WEEK, filmDate, md, today, WEEKS, weekKind, weekSub, wmd } from '../lib/dates';
import { addVersion, computeMix, counted, dimFlag, fixesFor, LOCK, move, rowFlagText, TARGET_LABEL, targetText, WEEK_STATUSES } from '../lib/logic';
import type { Dim, MixRow } from '../lib/logic';
import { getData, getUi, openSheet, setUi, toast, update, updateQuiet, useStore } from '../lib/store';
import { go } from '../lib/router';
import { Band, Icon, PillarChip, ProtoBar, ReadyDot, asset } from '../components/ui';
import { openIdea } from './Ideas';

function Trail({ d, w }: { d: Data; w: string }) {
  const kind = weekKind(w); const items = d.ideas.filter(i => i.week === w && WEEK_STATUSES.includes(i.status));
  let cur: number;
  if (kind === 'past') cur = items.length && items.every(i => i.status === 'published') ? 5 : 4;
  else if (kind === 'future') cur = d.locked[w] ? 1 : 0;
  else if (items.length && items.every(i => i.status === 'scheduled' || i.status === 'published')) cur = 4;
  else if (items.some(i => d.filmed[i.id] || i.status !== 'on deck')) cur = 3;
  else cur = d.locked[w] ? 2 : 0;
  const stops = ['Pick ideas', 'Reviewed', w === CUR_WEEK ? `Film ${wmd(filmDate(d.config.filmWeekday)).split(',')[0]}` : 'Film', 'Edit and schedule', 'Posted'];
  const xs = [34, 102, 170, 238, 306], ys = [30, 18, 30, 18, 26];
  const path = 'M34 30 C 60 6, 80 8, 102 18 S 146 40, 170 30 S 214 8, 238 18 S 284 34, 306 26';
  return <div className="card trail" aria-label={`Week progress: ${stops[Math.min(cur, 4)]}`}>
    <div className="trail-in"><svg viewBox="0 0 340 46" aria-hidden="true">
      <path d={path} fill="none" stroke="var(--kraft)" strokeWidth="7" strokeLinecap="round" />
      <path d={path} fill="none" stroke="var(--kraft-ink)" strokeWidth="1.4" strokeDasharray="5 6" opacity=".55" />
      {xs.map((x, k) => {
        const y = ys[k];
        if (k === 4) return <g key={k} transform={`translate(${x - 12} ${y - 20})`}>{/* campfire: two crossed logs under the flame */}
          <g strokeLinecap="round"><path d="M1 25 L21 17" stroke="var(--kraft-ink)" strokeWidth="4.5" /><path d="M1 25 L21 17" stroke="var(--kraft)" strokeWidth="2" />
            <path d="M3 17 L23 25" stroke="var(--kraft-ink)" strokeWidth="4.5" /><path d="M3 17 L23 25" stroke="var(--kraft)" strokeWidth="2" /></g>
          <path d="M12 2 C 18 9, 20 13, 16 19 C 14 21, 10 21, 8 19 C 4 14, 8 9, 12 2Z" fill={cur >= 4 ? 'var(--coral)' : 'var(--line)'} />
          <path d="M12 10 C 14 13, 15 15, 13 18 C 12 19, 11 19, 10 18 C 9 16, 10 13, 12 10Z" fill={cur >= 4 ? 'var(--peach)' : 'var(--paper)'} /></g>;
        const done = k < cur, now = k === cur;
        return <circle key={k} cx={x} cy={y} r={now ? 9 : 7} fill={done ? 'var(--forest)' : 'var(--paper)'} stroke={now ? 'var(--coral)' : done ? 'var(--forest)' : 'var(--line)'} strokeWidth={now ? 4 : 2} />;
      })}
    </svg>
      <div className="trail-labels">{stops.map((s, k) => <span key={s} className={k === cur ? 'cur' : k < cur ? 'done' : ''}>{s}</span>)}</div>
    </div></div>;
}

function DeckCard({ d, i, w }: { d: Data; i: Idea; w: string }) {
  const post = i.status === 'scheduled' ? `Scheduled · posts ${wmd(i.postDate!)}` : i.status === 'published' ? `Published ${wmd(i.postDate!)}` : i.postDate ? `Planned post ${wmd(i.postDate)}` : 'No post day yet';
  const noHook = !i.hooks.length || i.chosen === null;
  const canX = i.status === 'on deck' && !d.filmed[i.id];
  return <article className="card deck-card">
    <div className="body">
      <button className="open-link" onClick={() => openIdea(i.id)}><h3>{i.title}</h3></button>
      <div className="deck-line"><span className={`st ${i.status.replace(' ', '-')}`}>{i.status}</span><PillarChip d={d} p={i.pillar} /><span>{i.type}</span><span>{post}</span>
        {d.locked[w] && i.addedAfterLock && <span className="after-lock">added after review</span>}</div>
      <div className="deck-line"><ReadyDot i={i} />{i.rehook && <span className="rehook-badge">Re-hook needed</span>}{noHook && !i.rehook && <span>No hook picked</span>}</div>
    </div>
    {canX ? <button className="xbtn" onClick={() => move(i.id, 'proposed')} aria-label={`Take ${i.title} off this week`}>{Icon.x}</button> : <span />}
  </article>;
}

/* A mix meter: drag either end of the green band. It saves when you let go, with undo (D9). */
function MeterRow({ d, r }: { d: Data; r: MixRow }) {
  const track = useRef<HTMLDivElement>(null);
  const cells = r.scale + 1; const pct = (v: number) => (v / cells * 100).toFixed(3) + '%';
  const lock = LOCK[r.key]; const [lo, hi] = d.targets[r.key];
  const bad = r.count < lo || r.count > hi;

  function setEnd(end: 'lo' | 'hi', v: number) {
    const cur = getData().targets[r.key]; v = Math.max(0, Math.min(r.scale, v));
    v = end === 'lo' ? Math.min(v, cur[1]) : Math.max(v, cur[0]);
    const idx = end === 'lo' ? 0 : 1; if (cur[idx] === v) return;
    updateQuiet(dd => { dd.targets[r.key][idx] = v; });
  }
  function commit(start: [number, number], before: Data) {
    const now = getData().targets[r.key]; if (now[0] === start[0] && now[1] === start[1]) return;
    updateQuiet(dd => { addVersion(dd, 'Mix ranges changed', { field: TARGET_LABEL[r.key], from: `${start[0]} to ${start[1]}`, to: `${now[0]} to ${now[1]}` }); });
    toast(`${r.label}: now ${targetText(getData(), r.key)}. Saved.`, before);
  }
  function onDown(e: React.PointerEvent<HTMLButtonElement>, end: 'lo' | 'hi') {
    e.preventDefault(); const h = e.currentTarget; h.focus(); h.setPointerCapture(e.pointerId);
    const before = getData(); const start = [...before.targets[r.key]] as [number, number];
    const mv = (ev: PointerEvent) => { const rect = track.current!.getBoundingClientRect(); const cell = rect.width / cells; const raw = Math.round((ev.clientX - rect.left) / cell); setEnd(end, end === 'lo' ? raw : raw - 1); };
    const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); commit(start, before); };
    h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  }
  function onKey(e: React.KeyboardEvent, end: 'lo' | 'hi') {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault(); const before = getData(); const start = [...before.targets[r.key]] as [number, number];
    setEnd(end, start[end === 'lo' ? 0 : 1] + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : -1)); commit(start, before);
  }
  return <div className={`mrow ${bad ? 'bad edge-on' : ''}`}>
    <div className="mrow-head">{r.color && <span className="dot" style={{ background: r.color }} />}<span className="lab">{r.label}</span><span className="cnt num">{r.count}</span><span className="tgt">{targetText(d, r.key)}</span>
      {bad ? <span className="flag">{rowFlagText({ count: r.count, lo, hi })}</span> : <span className="ok">on target</span>}</div>
    {r.sub && <span className="dim-note">{r.sub}</span>}
    <div className="track" ref={track}><span className="base" />
      {Array.from({ length: cells }, (_, v) => <span key={v} className="tick" style={{ left: pct(v + .5) }} />)}
      <span className="band2" style={{ left: pct(Math.min(lo, r.scale)), width: pct(Math.min(hi, r.scale) - Math.min(lo, r.scale) + 1) }} />
      {lock !== 'min' && <button className="h" role="slider" aria-label={`${r.label} minimum`} aria-valuemin={0} aria-valuemax={r.scale} aria-valuenow={lo} style={{ left: pct(lo) }} onPointerDown={e => onDown(e, 'lo')} onKeyDown={e => onKey(e, 'lo')} />}
      {lock !== 'max' && <button className="h" role="slider" aria-label={`${r.label} maximum`} aria-valuemin={0} aria-valuemax={r.scale} aria-valuenow={hi} style={{ left: pct(Math.min(hi, r.scale) + 1) }} onPointerDown={e => onDown(e, 'hi')} onKeyDown={e => onKey(e, 'hi')} />}
      <span className="marker num" style={{ left: pct(Math.min(r.count, r.scale) + .5) }}>{r.count}</span>
    </div>
    <div className="scale num" aria-hidden="true">{Array.from({ length: cells }, (_, v) => <span key={v} style={{ left: pct(v + .5) }}>{v}</span>)}</div>
  </div>;
}

function DimRow({ d, dim, w, open }: { d: Data; dim: Dim; w: string; open: boolean }) {
  const fx = dim.off ? fixesFor(d, dim, w) : [];
  return <article className={`card dimrow ${dim.off ? 'edge-on' : ''}`}>
    <button className="dim-toggle" aria-expanded={open} onClick={() => setUi({ dimOpen: { ...getUi().dimOpen, [dim.id]: !open } })}>
      <span className="t">{dim.title} <span className="win">{dim.win} days</span>{dim.off ? <span className="flag">{dimFlag(dim)}</span> : <span className="ok">on target</span>}</span>
      <span className="line">{dim.line}</span>
      <span className="chev">{Icon.chev}</span>
    </button>
    {open && <div className="dim-body">
      {fx.length > 0 && <div className="fixes"><span className="fx-h">What to change</span>{fx.map(f => <div className="fix" key={f.key}><p>{f.text}</p>
        {f.cands.length ? f.cands.map(c => <div className="cand" key={c.id}><span>{c.title} {c.status === 'backlog' && <span className="muted">(backlog)</span>}</span>
          {f.act === 'on' ? <button className="btn sm" onClick={() => move(c.id, 'on deck', { week: w })}>Put on deck</button> : <button className="btn sm" onClick={() => move(c.id, 'proposed')}>Take off</button>}</div>)
          : <p className="muted small" style={{ fontWeight: 400 }}>{f.empty}</p>}</div>)}</div>}
      {dim.note && <p className="dim-note">{dim.note}</p>}
      {dim.rows.map(r => <MeterRow key={r.key + r.label} d={d} r={r} />)}
      <p className="dim-note">Drag the ends of the green band to change a target. It saves right away.</p>
    </div>}
  </article>;
}

export function PlanScreen() {
  const { data: d, ui, mode } = useStore();
  const w = ui.week, kind = weekKind(w), wi = WEEKS.indexOf(w);
  const items = d.ideas.filter(i => i.week === w && WEEK_STATUSES.includes(i.status)).sort((a, b) => (a.postDate || '9').localeCompare(b.postDate || '9'));
  const setWeek = (k: number) => { const n = wi + k; if (n >= 0 && n < WEEKS.length) setUi({ week: WEEKS[n], lockConfirm: false }); };
  const head = <>
    <ProtoBar />
    <Band pos="48% 72%" />
    <div className="weeknav">
      <button className="arrow" disabled={wi <= 0} onClick={() => setWeek(-1)} aria-label="Previous week">{Icon.back}</button>
      <div className="mid"><p className="eyebrow">{kind === 'past' ? 'Past week' : kind === 'current' ? 'This week' : 'Next week'}</p><h1>Week of {md(w)}</h1><p className="sub">{weekSub(w, d.config.filmWeekday)}</p></div>
      <button className="arrow" disabled={wi >= WEEKS.length - 1} onClick={() => setWeek(1)} aria-label="Next week">{Icon.fwd}</button>
    </div>
    {d.locked[w] && <div style={{ display: 'grid', justifyItems: 'center', margin: '2px 0 8px' }}><span className="tag sm lockstamp">reviewed {wmd(d.locked[w])}</span></div>}
    <Trail d={d} w={w} />
  </>;

  if (kind === 'past') {
    const pub = items.filter(i => i.status === 'published').length;
    return <>{head}
      <section className="section"><h2>What was made <span className="count-pill num">{items.length}</span><span className="muted small" style={{ fontWeight: 500 }}>{pub} published, {items.length - pub} scheduled</span></h2>
        <div className="card">{items.map(i => <div className="past-row" key={i.id}><span className="tt">{i.title}</span><span className={`st ${i.status}`}>{i.status}</span>
          <span className="meta"><PillarChip d={d} p={i.pillar} /><span>{i.type}</span><span>{i.status === 'published' ? 'Posted' : 'Posts'} {wmd(i.postDate!)}</span></span></div>)}</div></section>
      <section className="section"><h2>Results <span className="chip">later</span></h2>
        <div className="card" style={{ padding: 16 }}><p className="small muted">Views, comments, saves and watch time arrive with the Sunday signal check once the app is connected. Results gets its own tab in round 3.</p></div></section>
      <p className="example-note">{mode === 'local' ? 'Past weeks are example rows in the prototype. ' : ''}Statuses move to published on their own once the post date passes.</p>
    </>;
  }

  const dims = items.length ? computeMix(d, w) : [];
  const nOff = dims.filter(x => x.off).length;
  const locked = d.locked[w];
  const markReviewed = () => update(dd => { dd.locked[w] = today(); }, `Marked reviewed ${md(today())}.`, true);
  return <>{head}
    {items.length > 0 && <section className="section" id="mix">
      <div className="mixhead"><div><h2 className="h2">The mix</h2><p className="muted small">{nOff ? `${nOff} of 7 off target` : 'All 7 on target'} · {counted(d, w).length} ideas counted · tap a line to see what to change</p></div>
        <button className="switch" role="switch" aria-checked={d.includeProposed} onClick={() => update(dd => { dd.includeProposed = !dd.includeProposed; })}><span className="sw" />Count proposed</button></div>
      <div className="dimlist">{dims.map(dim => <DimRow key={dim.id} d={d} dim={dim} w={w} open={!!ui.dimOpen[dim.id]} />)}</div>
    </section>}

    <section className="section"><h2>On deck <span className="count-pill num">{items.length}</span><span className="muted small" style={{ fontWeight: 500 }}>aim for 7</span></h2>
      {items.length ? <div className="deck">{items.map(i => <DeckCard key={i.id} d={d} i={i} w={w} />)}</div>
        : <div className="card empty"><figure className="polaroid" style={{ margin: 0 }}><img src={asset('bev')} alt="Bev the felt beaver with a notebook" /><figcaption>Bev</figcaption></figure>
          <p><strong>Nothing on deck for {md(w)} yet</strong></p><p className="muted small">Add ideas from your bank.</p></div>}
      <div><button className="btn" onClick={() => openSheet({ kind: 'addFromIdeas' })}>{Icon.plus} Add from ideas</button></div>
    </section>

    {items.length > 0 && <section className="section"><div className="card lockcard">
      <figure className="polaroid r" style={{ margin: 0 }}><img src={asset('jay')} alt="Jay the felt Steller's jay" /><figcaption>Jay</figcaption></figure>
      <div className="lc-body">{locked
        ? <><h2>Reviewed {wmd(locked)}</h2><p className="small">You looked the week over. You can still change it; anything added after this shows "added after review".</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{w === CUR_WEEK && <button className="btn" onClick={() => go('film')}>Open film day</button>}
            <button className="btn ghost" onClick={() => update(dd => { delete dd.locked[w]; dd.ideas.forEach(i => { i.addedAfterLock = false; }); }, 'Marked not reviewed.')}>Mark not reviewed</button></div></>
        : ui.lockConfirm
          ? <><h2>Mark reviewed with {nOff} off target?</h2><div className="confirm"><p className="small">{dims.filter(x => x.off).map(x => `${x.title}: ${dimFlag(x)}`).join(' · ')}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn primary" onClick={() => { setUi({ lockConfirm: false }); markReviewed(); }}>Mark reviewed anyway</button><button className="btn ghost" onClick={() => setUi({ lockConfirm: false })}>Keep planning</button></div></div></>
          : <><h2>Done reviewing this week?</h2><p className="small muted">A check for you that you've looked the week over. Nothing else changes.</p>
            <div><button className="btn primary lock-btn" onClick={() => (nOff ? setUi({ lockConfirm: true }) : markReviewed())}>Done reviewing this week</button></div></>}
      </div></div></section>}
    <p className="example-note">The mix counts on deck, in progress and scheduled ideas for this week. Pillar looks back 14 days{mode === 'local' && addDays(w, -7) < CUR_WEEK ? ' (last week is example rows)' : ''}.</p>
  </>;
}
