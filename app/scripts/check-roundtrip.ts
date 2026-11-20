/* Checks that loading from Supabase and turning the data back into rows changes nothing.
 * Uses the secret key (read-only here: it only selects). Run: ../scripts/with-env npx tsx scripts/check-roundtrip.ts */
// Node 20 has no WebSocket; this check never uses realtime, so a stub is enough.
(globalThis as { WebSocket?: unknown }).WebSocket ??= class {};
const { createClient } = await import('@supabase/supabase-js');
import { loadAll, rowsOf } from '../src/lib/remote';
const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { db: { schema: 'content' }, auth: { persistSession: false } });
const d = await loadAll(c);
const rows = rowsOf(d);
const { data: raw, error } = await c.from('ideas').select('*').eq('archived', false);
if (error) throw error;
let diffs = 0;
for (const r of raw!) {
  const mine = rows.ideas[r.id as string];
  for (const [k, v] of Object.entries(mine)) {
    if (JSON.stringify(v) !== JSON.stringify(r[k])) { diffs++; if (diffs <= 8) console.log('diff', r.id, k, JSON.stringify(r[k])?.slice(0, 60), '->', JSON.stringify(v)?.slice(0, 60)); }
  }
}
console.log(`ideas ${d.ideas.length}, takes ${Object.keys(d.takes).length}, stories ${Object.keys(d.stories).length}, versions ${d.versions.length}; field differences: ${diffs}`);
