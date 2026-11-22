/* POST /api/story { ideaId, replace? }: start "Make hooks and storyboard" for one idea.
 * Checks it can run, records a job (one live job per idea, enforced by the database), and hands the job to the
 * background worker. Answers right away; the page watches the job. Runs as MQ: her sign-in token, her row rules. */
import type { Config } from '@netlify/functions';
import { asUser, bearer, startStory } from '../lib/story';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const token = bearer(req);
  if (!token) return json(401, { error: 'Sign in first.' });
  let body: { ideaId?: unknown; replace?: unknown; mode?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request.' }); }
  const ideaId = typeof body.ideaId === 'string' ? body.ideaId : '';
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(ideaId)) return json(400, { error: 'Bad idea id.' });
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: "The Anthropic key isn't set up on the server yet." });

  const sb = asUser(token);
  const { data: who, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !who.user) return json(401, { error: 'Your sign-in has expired. Reload the page.' });

  const mode = body.mode === 'storyboard' ? 'storyboard' : 'both';
  const started = await startStory(sb, ideaId, body.replace === true, async jobId => {
    // Background functions answer 202 at once and keep running (up to 15 minutes).
    const r = await fetch(new URL('/.netlify/functions/story-worker-background', req.url), {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jobId }),
    });
    return r.status === 202;
  }, mode);
  return json(started.status, started.body);
};

export const config: Config = { path: '/api/story' };
