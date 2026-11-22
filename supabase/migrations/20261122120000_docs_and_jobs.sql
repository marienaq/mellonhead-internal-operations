-- Docs and jobs: the content the skills read (cards, briefs, format briefs, references, the skills themselves)
-- moves into the database, and the app gets a jobs table for work its backend does with Claude
-- (product/story-generation-design-2026-11-21.md). Adds only: nothing existing changes.
--
-- The backend (Netlify functions) acts as MQ, with her sign-in token, so these tables use the same owner-only rules
-- as every other table here. No secret key is needed on the server.

-- ---------- Docs ----------
-- One row per document. `path` is where the file lived in the mellonhead repo (marketing/tiktok/...), kept as its
-- name so cards, briefs and ideas' links still point at the same thing after the files retire.
create table content.docs (
  path text primary key check (path ~ '^[A-Za-z0-9.][A-Za-z0-9._/ ()-]*$' and path !~ '\.\.' and path !~ '^\.\.?/'),
  kind text not null check (kind in ('card', 'brief', 'format', 'reference', 'skill', 'storyboard', 'hooks')),
  title text not null default '',
  body text not null check (length(body) <= 400000),
  idea_id text references content.ideas (id),   -- storyboards and hooks files: the idea they were made for
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index docs_kind_idx on content.docs (kind) where not archived;
create index docs_idea_idx on content.docs (idea_id) where idea_id is not null;

-- ---------- Jobs ----------
-- One row per run of backend work on an idea. The app starts a job, the worker moves it along, and the page
-- watches it. `step` is what it is doing now; `message` is what she reads (why it stopped, what it made).
create table content.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('story')),
  idea_id text not null references content.ideas (id),
  step text not null default 'queued' check (step in ('queued', 'hooks', 'storyboard', 'done', 'stopped', 'failed')),
  message text not null default '',
  options jsonb not null default '{}' check (jsonb_typeof(options) = 'object'),
  usage jsonb not null default '{}' check (jsonb_typeof(usage) = 'object'),   -- tokens per step, for cost
  started_at timestamptz,
  finished_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
-- One live story job per idea: a second tap while one runs is refused, not doubled.
create unique index jobs_one_live_idx on content.jobs (idea_id, kind) where step in ('queued', 'hooks', 'storyboard');
create index jobs_idea_idx on content.jobs (idea_id, created_at desc);

-- ---------- Triggers, same rules as the rest of the schema ----------
create trigger docs_touch before insert or update on content.docs for each row execute function content.touch();
create trigger jobs_touch before insert or update on content.jobs for each row execute function content.touch();
create trigger docs_no_delete before delete on content.docs for each row execute function content.no_delete();
create trigger jobs_no_delete before delete on content.jobs for each row execute function content.no_delete();

-- ---------- Access ----------
alter table content.docs enable row level security;
alter table content.jobs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['docs', 'jobs'] loop
    execute format('create policy owner_select on content.%I for select to authenticated using (content.is_owner())', t);
    execute format('create policy owner_insert on content.%I for insert to authenticated with check (content.is_owner())', t);
    execute format('create policy owner_update on content.%I for update to authenticated using (content.is_owner()) with check (content.is_owner())', t);
  end loop;
end $$;

revoke all on content.docs, content.jobs from anon, authenticated;
grant select, insert, update on content.docs, content.jobs to authenticated, service_role;
revoke truncate on all tables in schema content from anon, authenticated, service_role;
