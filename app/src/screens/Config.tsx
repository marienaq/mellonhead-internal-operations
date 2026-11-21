import { useState } from 'react';
import type { Data, OptKey } from '../lib/types';
import { addDays, DEFAULT_FILM_WEEKDAY, filmDate, fmtDate, md, wmd } from '../lib/dates';
import { addVersion, LOCK, TARGET_LABEL } from '../lib/logic';
import { checkWeek, getUi, setUi, toast, update, useStore } from '../lib/store';
import { Band, Icon, ProtoBar, asset } from '../components/ui';

const FILM_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

type CfgKey = 'throughline' | 'mission' | 'person' | 'vibe' | 'advice';
const CFG_LABEL: Record<CfgKey, string> = { throughline: 'Through-line', mission: 'Mission', person: 'The person', vibe: 'Voice: vibe', advice: 'Voice: advice' };

function Editable({ k, text }: { k: string; text: string }) {
  const { ui } = useStore();
  const [v, setV] = useState(text);
  if (ui.editing !== k) return <button className="editable" onClick={() => { setV(text); setUi({ editing: k }); }}>{text}<span className="pen">Edit</span></button>;
  return <div style={{ display: 'grid', gap: 8 }}><textarea autoFocus value={v} onChange={e => setV(e.target.value)} />
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn ghost sm" onClick={() => setUi({ editing: null })}>Cancel</button>
      <button className="btn primary sm" onClick={() => {
        const nv = v.trim(); setUi({ editing: null }); if (nv === text) return;
        let n = 0;
        update(d => {
          let field: string;
          if (k.startsWith('pillar')) { const p = d.pillars[+k.slice(6)]; p.desc = nv; field = `Pillar: ${p.name}`; }
          else { d.config[k as CfgKey] = nv; field = CFG_LABEL[k as CfgKey]; }
          n = addVersion(d, `${field} edited`, { field, from: text, to: nv });
        });
        toast(`Saved as version ${n}.`);
      }}>Save as new version</button></div></div>;
}

function Chips({ d, k }: { d: Data; k: OptKey }) {
  const { ui } = useStore();
  const ret = d.retired[k] || [];
  const [nv, setNv] = useState('');
  function add() {
    const v = nv.trim(); setNv(''); setUi({ adding: null });
    if (k === 'series' && v.toLowerCase() === 'none') { toast('"none" is reserved for "not part of a series". Pick another name.'); return; }
    if (!v || d.opts[k].includes(v)) return;
    update(dd => { dd.opts[k].push(v); dd.retired[k] = (dd.retired[k] || []).filter(o => o !== v); addVersion(dd, 'Option list changed', { field: k, from: '', to: `Added "${v}"` }); }, `Added "${v}". Saved as a new version.`);
  }
  return <>
    <div className="chips">
      {d.opts[k].map(o => <span className="vchip" key={o}>{o}<button className="x" aria-label={`Retire ${o}`} onClick={() =>
        update(dd => { dd.opts[k] = dd.opts[k].filter(x => x !== o); dd.retired[k].push(o); addVersion(dd, 'Option list changed', { field: k, from: o, to: `Retired "${o}"` }); }, `Retired "${o}". New ideas won't offer it; past ideas keep it.`, true)}>{Icon.x}</button></span>)}
      {ui.adding === k
        ? <form className="chipbtn" onSubmit={e => { e.preventDefault(); add(); }}><input type="text" autoFocus value={nv} onChange={e => setNv(e.target.value)} onBlur={add} placeholder="New value" aria-label="New value" /></form>
        : <button className="chipbtn" onClick={() => setUi({ adding: k })}>{Icon.plus} Add</button>}
    </div>
    {ret.length > 0 && <>
      <button className="retired-toggle" aria-expanded={!!ui.retiredOpen[k]} onClick={() => setUi({ retiredOpen: { ...getUi().retiredOpen, [k]: !ui.retiredOpen[k] } })}><span className="chev">{Icon.chev}</span>Retired ({ret.length})</button>
      {ui.retiredOpen[k] && <div className="chips">{ret.map(o => <span className="vchip retired" key={o}>{o}<button className="restore" onClick={() =>
        update(dd => { dd.retired[k] = dd.retired[k].filter(x => x !== o); dd.opts[k].push(o); addVersion(dd, 'Option list changed', { field: k, from: '', to: `Restored "${o}"` }); }, `Restored "${o}".`)}>Restore</button></span>)}</div>}
    </>}
  </>;
}

function RangeRow({ d, k }: { d: Data; k: string }) {
  const [lo, hi] = d.targets[k]; const lock = LOCK[k]; const win = k.startsWith('pillar') ? 14 : 7;
  const step = (end: 'lo' | 'hi', delta: number) => {
    const r = d.targets[k]; const idx = end === 'lo' ? 0 : 1; const nv = r[idx] + delta;
    if (nv < 0 || nv > 14 || (idx === 0 && nv > r[1]) || (idx === 1 && nv < r[0])) return;
    update(dd => { const from = `${r[0]} to ${r[1]}`; dd.targets[k][idx] = nv; addVersion(dd, 'Mix ranges changed', { field: TARGET_LABEL[k], from, to: `${dd.targets[k][0]} to ${dd.targets[k][1]}` }); });
  };
  const Step = ({ end, v }: { end: 'lo' | 'hi'; v: number }) => <span className="stepper"><button aria-label={`Lower ${end === 'lo' ? 'minimum' : 'maximum'}`} onClick={() => step(end, -1)}>−</button><output className="num">{v}</output><button aria-label={`Raise ${end === 'lo' ? 'minimum' : 'maximum'}`} onClick={() => step(end, 1)}>+</button></span>;
  const grp = ({ type: 'Type', pillar: 'Pillar' } as Record<string, string>)[k.split('.')[0]] || '';
  return <div className="range-row"><span className="lab">{TARGET_LABEL[k]}<small>{grp} {win} days</small></span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {lock === 'min' ? <><span className="to">at most</span><Step end="hi" v={hi} /></> : lock === 'max' ? <><span className="to">at least</span><Step end="lo" v={lo} /></> : <><Step end="lo" v={lo} /><span className="to">to</span><Step end="hi" v={hi} /></>}
    </span></div>;
}

export function ConfigScreen() {
  const { data: d, ui, mode } = useStore();
  const cur = d.versions[0];
  const next = addDays(d.config.lastCheckin, d.config.cadenceWeeks * 7);
  const lists: [OptKey, string, string][] = [['feeling', 'Feelings', 'each video names one'], ['style', 'Content styles', ''], ['series', 'Series', 'ideas pick from this list'], ['onCamera', 'On-camera setups', ''], ['voice', 'Voices and characters', ''], ['cta', 'Calls to action', ''], ['hookFormat', 'Hook formats', '']];
  const jump = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const cadence = (delta: number) => { const v = d.config.cadenceWeeks + delta; if (v < 1 || v > 26) return; update(dd => { const from = dd.config.cadenceWeeks; dd.config.cadenceWeeks = v; addVersion(dd, 'Check-in cadence changed', { field: 'Check-in cadence', from: `every ${from} weeks`, to: `every ${v} weeks` }); }); };
  return <>
    <ProtoBar />
    <Band pos="62% 30%" />
    <header className="screen-head"><div><p className="eyebrow">Read by every agent</p><h1>Config</h1></div><span className="tag">version {cur.n} · {md(cur.date)}</span></header>
    <div className="card agent-note"><img className="felt-c" src={asset('griz')} alt="Griz the felt bear" /><p><strong>Every agent reads this</strong><span className="muted">Each change saves as a new version, so you can see what the plan was when a video was made.</span></p></div>
    <nav className="jump" aria-label="Config sections" style={{ marginTop: 16 }}>
      {[['cfg-positioning', 'Positioning'], ['cfg-lists', 'Option lists'], ['cfg-ranges', 'Mix ranges'], ['cfg-film', 'Film day'], ['cfg-checkin', 'Check-in'], ['cfg-history', 'History'], ...(mode === 'local' ? [['cfg-proto', 'Prototype']] : [])].map(([id, l]) => <a key={id} href={'#' + id} onClick={jump(id)}>{l}</a>)}
    </nav>

    <section className="section" id="cfg-positioning"><h2>Positioning</h2>
      <div className="card cfg">
        <div className="cfg-item"><span className="k">Through-line <span className="chip" style={{ textTransform: 'none', letterSpacing: 0 }}>every video carries it</span></span><Editable k="throughline" text={d.config.throughline} /></div>
        <div className="cfg-item"><span className="k">Mission</span><Editable k="mission" text={d.config.mission} /></div>
        <div className="cfg-item"><span className="k">The person</span><Editable k="person" text={d.config.person} /></div>
      </div>
      <div className="card cfg">
        <div className="cfg-item"><span className="k">Pillars</span></div>
        {d.pillars.map((p, n) => <div className="cfg-item pillar-row" key={p.name}><span className="dot" style={{ background: p.color }} /><div style={{ display: 'grid', gap: 2, minWidth: 0 }}><strong>{p.name}</strong><Editable k={'pillar' + n} text={p.desc} /><span className="muted" style={{ fontSize: 13 }}>Carries the through-line: {p.carries}</span></div></div>)}
      </div>
      <div className="card cfg">
        <div className="cfg-item"><span className="k">Voice: vibe</span><Editable k="vibe" text={d.config.vibe} /></div>
        <div className="cfg-item"><span className="k">Voice: advice</span><Editable k="advice" text={d.config.advice} /></div>
      </div>
    </section>

    <section className="section" id="cfg-lists"><h2>Option lists</h2>
      <p className="muted small" style={{ marginTop: -4 }}>Tap x to retire a value. New ideas won't offer it; past ideas keep it.</p>
      <div className="card cfg">{lists.map(([k, l, s]) => <div className="cfg-item" key={k}><span className="k">{l} <span className="count-pill num">{d.opts[k].length}</span>{s && <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, marginLeft: 'auto' }}>{s}</span>}</span><Chips d={d} k={k} /></div>)}</div>
    </section>

    <section className="section" id="cfg-ranges"><h2>Mix ranges</h2>
      <div className="card cfg">{Object.keys(d.targets).map(k => <RangeRow key={k} d={d} k={k} />)}</div>
      <p className="muted small">Same ranges as the meters on Plan week. Drag there or step here.</p>
    </section>

    <section className="section" id="cfg-film"><h2>Film day</h2>
      <div className="card cfg"><div className="range-row"><span className="lab">You film on<small>This week that's {wmd(filmDate(d.config.filmWeekday))}</small></span>
        <span className="seg" role="group" aria-label="Film day">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((l, k) => {
          const n = k + 1, cur = d.config.filmWeekday ?? DEFAULT_FILM_WEEKDAY;
          return <button key={l} aria-pressed={cur === n} onClick={() => { if (cur === n) return; update(dd => { dd.config.filmWeekday = n; addVersion(dd, 'Film day changed', { field: 'Film day', from: FILM_NAMES[cur - 1], to: FILM_NAMES[n - 1] }); }); checkWeek(); }}>{l}</button>;
        })}</span></div></div>
    </section>

    <section className="section" id="cfg-checkin"><h2>Check-in cadence</h2>
      <div className="card cfg"><div className="range-row"><span className="lab">Every<small>The app and Orca in Slack both prompt you</small></span>
        <span className="stepper"><button aria-label="Fewer weeks" onClick={() => cadence(-1)}>−</button><output className="num">{d.config.cadenceWeeks}</output><button aria-label="More weeks" onClick={() => cadence(1)}>+</button><span className="to">weeks</span></span></div>
        <div className="range-row"><span className="lab">Last check-in</span><span className="num">{fmtDate(d.config.lastCheckin)}</span></div>
        <div className="range-row"><span className="lab">Next check-in</span><strong className="num">{fmtDate(next)}</strong></div></div>
    </section>

    <section className="section" id="cfg-history"><h2>Version history</h2>
      <div className="card"><ul className="versions">{d.versions.map((v, n) => <li key={v.n}>
        <button className={`ver ${n === 0 ? 'current' : ''}`} aria-expanded={ui.openVersion === v.n} onClick={() => setUi({ openVersion: ui.openVersion === v.n ? null : v.n })}>
          <span className="vn num">v{v.n}</span><span style={{ minWidth: 0 }}><strong style={{ fontWeight: 600 }}>{v.label}</strong><br /><span className="vd">{fmtDate(v.date)}{n === 0 ? ' · current' : ''}</span></span><span className="chev">{Icon.chev}</span></button>
        {ui.openVersion === v.n && <div className="diff">{v.changes.length ? v.changes.map((c, k) => <div key={k}><span className="eyebrow">{c.field}</span><p className="was">{c.from}</p><p>{c.to}</p></div>) : <p className="muted">The starting point: everything as it was in foundation.md.</p>}</div>}
      </li>)}</ul></div>
    </section>

    {mode === 'local' && <section className="section" id="cfg-proto"><h2>Prototype</h2>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <p className="small">Everything here is saved in this browser only, on this device. Your phone and laptop each keep their own copy until the database arrives (stage E).</p>
        <div><button className="btn" onClick={() => setUi({ sheet: { kind: 'reset' } })}>Reset to seed data</button></div>
      </div>
    </section>}
  </>;
}
