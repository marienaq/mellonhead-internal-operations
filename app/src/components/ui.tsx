import { useState, type ReactNode } from 'react';
import { sendLink, signInWithGoogle, signOut } from '../lib/remote';
import type { Data, Idea } from '../lib/types';
import { cap, pillarColor, readiness } from '../lib/logic';
import { closeSheet, getUi, resetToSeed, restore, setUi, useStore } from '../lib/store';

const sv = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  ideas: <svg viewBox="0 0 24 24" {...sv} strokeWidth={1.8}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" /></svg>,
  plan: <svg viewBox="0 0 24 24" {...sv} strokeWidth={1.8}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M8 14.5l2.5 2.5L16 12.5" /></svg>,
  film: <svg viewBox="0 0 24 24" {...sv} strokeWidth={1.8}><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3z" /></svg>,
  config: <svg viewBox="0 0 24 24" {...sv} strokeWidth={1.8}><path d="M5 4v6M5 14v6M12 4v3M12 11v9M19 4v9M19 17v3" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="9" r="2" /><circle cx="19" cy="15" r="2" /></svg>,
  back: <svg width="20" height="20" viewBox="0 0 24 24" {...sv} strokeWidth={2}><path d="M15 5l-7 7 7 7" /></svg>,
  fwd: <svg width="20" height="20" viewBox="0 0 24 24" {...sv} strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>,
  chev: <svg width="16" height="16" viewBox="0 0 24 24" {...sv} strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>,
  x: <svg width="18" height="18" viewBox="0 0 24 24" {...sv} strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  grip: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7" /><circle cx="15" cy="6" r="1.7" /><circle cx="9" cy="12" r="1.7" /><circle cx="15" cy="12" r="1.7" /><circle cx="9" cy="18" r="1.7" /><circle cx="15" cy="18" r="1.7" /></svg>,
  check: <svg width="20" height="20" viewBox="0 0 24 24" {...sv} strokeWidth={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  link: <svg width="14" height="14" viewBox="0 0 24 24" {...sv} strokeWidth={2}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>,
  plus: <svg width="18" height="18" viewBox="0 0 24 24" {...sv} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>,
  chat: <svg width="20" height="20" viewBox="0 0 24 24" {...sv} strokeWidth={1.9}><path d="M4 5h16v11H9l-5 4z" /></svg>,
};

export const PEG = '/assets/peg-mariena.jpg';
export const asset = (n: string) => `/assets/${n}.jpg`;

export function Band({ pos }: { pos: string }) {
  return <div className="band" aria-hidden="true"><img src="/assets/trail-band.jpg" alt="" style={{ objectPosition: pos }} /></div>;
}

export function PillarChip({ d, p }: { d: Data; p: string }) {
  if (!p) return null;
  return <span className="chip"><span className="dot" style={{ background: pillarColor(d, p) }} />{p}</span>;
}

export function ReadyDot({ i }: { i: Idea }) {
  const r = readiness(i);
  return <span className={`rdot ${r.level}`}><i />{cap(r.level)}: {r.summary}</span>;
}

export function SrcLine({ i }: { i: Idea }) {
  if (i.sourceLink) return <span className="srcline">{Icon.link}<span>{i.sourceLink.label}</span></span>;
  const o = { experience: 'From your own experience', research: 'From research', client: 'Client story', agent: 'Drafted by agents from your notes', read: 'Something you read' }[i.origin];
  return <span className="srcline"><span>{o}</span></span>;
}

export function ProtoBar() {
  const { mode } = useStore();
  if (mode !== 'local') return <div className="protobar"><span>Saved to Supabase</span><button onClick={() => { void signOut(); }}>Sign out</button></div>;
  return <div className="protobar"><span>Local prototype · data saved in this browser</span>
    <button onClick={() => setUi({ sheet: { kind: 'reset' } })}>Reset to seed data</button></div>;
}

/* Sign in with Google; an emailed link is the fallback. New accounts can't be created here (sign-ups are off in Supabase). */
export function SignIn() {
  const { mode, modeError } = useStore();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [useEmail, setUseEmail] = useState(false);
  return <main style={{ maxWidth: 440, paddingTop: 0 }}>
    <Band pos="48% 72%" />
    <div className="card" style={{ padding: 20, marginTop: 20, display: 'grid', gap: 14 }}>
      <div><p className="eyebrow">Mellonhead</p><h1 style={{ fontSize: 24 }}>Content planner</h1></div>
      {mode === 'loading' ? <p className="muted">Loading your plan...</p>
        : mode === 'error' ? <><p><strong>Couldn't load your data.</strong></p><p className="small muted">{modeError}</p><div><button className="btn" onClick={() => location.reload()}>Try again</button> <button className="btn ghost" onClick={() => { void signOut(); }}>Sign out</button></div></>
        : sent ? <><p><strong>Check your email.</strong></p><p className="small muted">We sent a sign-in link to {email}. Open it on this device.</p><div><button className="btn ghost" onClick={() => setSent(false)}>Use a different email</button></div></>
        : !useEmail ? <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
            <button className="btn primary" disabled={busy} onClick={async () => { setErr(''); setBusy(true); try { await signInWithGoogle(); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); setBusy(false); } }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              {busy ? 'Opening Google...' : 'Sign in with Google'}</button>
            {err && <p className="small" role="alert">{err}</p>}
            <button className="btn ghost sm" onClick={() => setUseEmail(true)}>Email me a link instead</button>
          </div>
        : <form className="form" onSubmit={async e => {
            e.preventDefault(); setErr(''); setBusy(true);
            try { await sendLink(email.trim()); setSent(true); } catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(false); }
          }}>
            <div><label htmlFor="email">Your email</label><input type="email" id="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
            {err && <p className="small" role="alert">{err}</p>}
            <div><button className="btn primary" disabled={busy}>{busy ? 'Sending...' : 'Email me a sign-in link'}</button></div>
          </form>}
    </div>
  </main>;
}

export function Sheet({ children }: { children: ReactNode }) {
  return <>
    <div className="scrim" onClick={closeSheet} />
    <div className="sheet" role="dialog" aria-modal="true"><div className="grab" />{children}</div>
  </>;
}

export function ResetSheet() {
  return <Sheet>
    <h3>Reset to seed data?</h3>
    <p className="hint">Everything you changed in this browser goes back to how it started: ideas, takes, config and film-day ticks. You can undo right after.</p>
    <div className="sheet-actions"><button className="btn ghost" onClick={closeSheet}>Cancel</button><button className="btn primary" onClick={resetToSeed}>Reset</button></div>
  </Sheet>;
}

export function Toast() {
  const { ui } = useStore();
  if (!ui.toast) return null;
  const t = ui.toast;
  return <div className="toast" role="status" key={t.id}>
    <span>{t.msg}</span>
    {t.undo && <button onClick={() => { const u = getUi().toast?.undo; if (u) restore(u); }}>Undo</button>}
  </div>;
}

export function NeedsTag({ text }: { text: string }) { return <span className="needs">needs you: {text}</span>; }
export function WaitingTag({ who }: { who: string }) { return <span className="waiting-on">waiting on {who}</span>; }
