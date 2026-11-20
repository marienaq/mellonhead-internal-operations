import { useEffect, useState } from 'react';

export type Route = { screen: 'ideas' | 'plan' | 'film' | 'config' } | { screen: 'idea'; id: string };

function parse(): Route {
  const h = (location.hash || '#plan').slice(1);
  if (h.startsWith('idea-')) return { screen: 'idea', id: decodeURIComponent(h.slice(5)) };
  return { screen: (['ideas', 'plan', 'film', 'config'] as const).find(s => s === h) || 'plan' };
}

export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => { setR(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const go = (h: string) => { location.hash = h; };
export const currentScreen = () => parse().screen;
