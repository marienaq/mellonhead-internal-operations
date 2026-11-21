import { useEffect } from 'react';
import { closeSheet, getData, getUi, setMode, startRemote, useStore } from './lib/store';
import { CUR_WEEK, makingWeek } from './lib/dates';
import { getSession, remoteEnabled, sb } from './lib/remote';
import { go, useRoute } from './lib/router';
import { Icon, ResetSheet, SignIn, Toast } from './components/ui';
import { AddFromIdeasSheet, AddIdeaSheet, IdeasScreen, OnDeckSheet, RejectSheet } from './screens/Ideas';
import { PlanScreen } from './screens/Plan';
import { ChatSheet, DateSheet, FieldSheet, IdeaPage, OwnHookSheet, TextSheet } from './screens/IdeaPage';
import { FilmScreen } from './screens/Film';
import { ConfigScreen } from './screens/Config';

let remoteStarted = false; // module-level so React's double effect in development doesn't load twice

const NAV = [['ideas', 'Ideas', Icon.ideas], ['plan', 'Plan week', Icon.plan], ['film', 'Film', Icon.film], ['config', 'Config', Icon.config]] as const;

function SheetHost() {
  const { ui } = useStore();
  const s = ui.sheet;
  if (!s) return null;
  // Keyed so each opening starts with fresh form state.
  const key = JSON.stringify(s);
  switch (s.kind) {
    case 'field': return <FieldSheet key={key} id={s.id} k={s.k} />;
    case 'text': return <TextSheet key={key} id={s.id} k={s.k} />;
    case 'reject': return <RejectSheet key={key} id={s.id} />;
    case 'ondeck': return <OnDeckSheet key={key} id={s.id} />;
    case 'date': return <DateSheet key={key} id={s.id} />;
    case 'own': return <OwnHookSheet key={key} id={s.id} />;
    case 'chat': return <ChatSheet key={key} id={s.id} />;
    case 'add': return <AddIdeaSheet key={key} />;
    case 'addFromIdeas': return <AddFromIdeasSheet key={key} />;
    case 'reset': return <ResetSheet key={key} />;
  }
}

export function App() {
  const r = useRoute();
  const { ui, mode } = useStore();
  useEffect(() => {
    if (!remoteEnabled || !sb) return;
    const begin = () => { if (!remoteStarted) { remoteStarted = true; void startRemote(); } };
    void getSession().then(s => (s ? begin() : setMode('signedOut')));
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) begin();
      if (event === 'SIGNED_OUT') { remoteStarted = false; setMode('signedOut'); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const active = r.screen === 'idea' ? ui.backTo : r.screen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && getUi().sheet) closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { closeSheet(); }, [r]);
  // A tab left open past the weekly rollover: reload when it comes back, so the new week loads clean.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible' && makingWeek(undefined, getData().config.filmWeekday) !== CUR_WEEK) location.reload(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);
  if (mode !== 'local' && mode !== 'ready') return <><SignIn /><Toast /></>;

  return <>
    <div className="app">
      <nav className="rail" aria-label="Main">
        <div className="rail-band" aria-hidden="true"><img src="/assets/trail-band.jpg" alt="" /></div>
        <div className="rail-brand">Mellonhead<small>Content planner</small></div>
        <div style={{ display: 'grid', gap: 4 }}>{NAV.map(([k, l, ic]) => <button key={k} aria-current={active === k ? 'page' : undefined} onClick={() => go(k)}>{ic}{l}</button>)}</div>
        <div className="rail-foot">{mode === 'local' ? 'Local prototype · seed data' : 'Saved to Supabase'}</div>
      </nav>
      <main>
        {r.screen === 'ideas' && <IdeasScreen />}
        {r.screen === 'plan' && <PlanScreen />}
        {r.screen === 'film' && <FilmScreen />}
        {r.screen === 'config' && <ConfigScreen />}
        {r.screen === 'idea' && <IdeaPage id={r.id} />}
      </main>
    </div>
    <nav className="tabbar" aria-label="Main">{NAV.map(([k, l, ic]) => <button key={k} className="tab" aria-current={active === k ? 'page' : undefined} onClick={() => go(k)}><span className="tab-ico">{ic}</span>{l}</button>)}</nav>
    <SheetHost />
    <Toast />
  </>;
}
