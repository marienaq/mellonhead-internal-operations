/* The background half of "Make hooks and storyboard" (a Netlify background function: up to 15 minutes).
 * Claims the job, writes hooks, then the storyboard, saving each to the idea as it lands so the page fills in.
 * Runs as MQ with her sign-in token; the job only runs once (the claim is a guarded update from 'queued'). */
import { asUser, bearer, runStory } from '../lib/story';

export default async (req: Request) => {
  const token = bearer(req);
  let jobId = '';
  try { jobId = String(((await req.json()) as { jobId?: unknown }).jobId ?? ''); } catch { return; }
  if (!token || !/^[0-9a-f-]{36}$/.test(jobId)) return;
  await runStory(asUser(token), jobId);
};
