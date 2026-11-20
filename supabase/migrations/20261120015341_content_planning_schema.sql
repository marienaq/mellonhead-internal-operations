-- Content planning: first schema (stage E).
-- Rules from the brief: one user (MQ) reads and writes through the app; agents use the `mh` CLI with the
-- secret key. Nothing can hard-delete: rows are archived. Client stories stay blinded (a field, not a policy).

create schema if not exists content;

-- ---------- Who may use the app ----------
-- One row: MQ's auth user id. Added after she creates her login (see supabase/README.md).
create table content.app_users (
  user_id uuid primary key references auth.users (id),
  added_at timestamptz not null default now()
);

create or replace function content.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from content.app_users where user_id = auth.uid());
$$;

-- ---------- Shared helpers ----------
create or replace function content.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
                             nullif(current_setting('mh.actor', true), ''), 'system');
  return new;
end $$;

-- Hard deletes are blocked for everyone who connects through the API, including the secret key.
create or replace function content.no_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Rows are never deleted here. Set archived = true instead.' using errcode = 'P0001';
end $$;

-- ---------- Banks ----------
create table content.takes (
  n integer primary key,
  short text not null,
  text text not null,
  pillar text not null default '',
  on_camera text not null default 'ready',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table content.stories (
  key text primary key,
  title text not null,
  pillar text not null default '',
  known text not null default '',
  missing text not null default '',
  on_camera text not null default 'blinded',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------- Ideas ----------
create table content.ideas (
  id text primary key,
  title text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'on deck', 'in progress', 'scheduled', 'published', 'backlog', 'rejected')),
  week date,                       -- the Monday of the week she makes it
  post_date date,
  summary text not null default '',
  pillar text not null default '',
  type text not null default '',
  style text not null default '',
  on_camera text not null default '',
  voice text not null default '',
  feeling text not null default '',
  harm_help text not null default '',
  cta text not null default '',
  cta_link text,
  take_n integer references content.takes (n),
  story_key text references content.stories (key),
  series text not null default '',
  ep integer,
  safety text not null default 'clear' check (safety in ('blinded', 'clear')),
  origin text not null default 'agent' check (origin in ('experience', 'read', 'research', 'client', 'agent')),
  brief text not null default '',
  source_label text,
  source_url text,
  hooks jsonb not null default '[]',       -- [{spoken, onscreen, frame, format, payoff, rec}]
  chosen text,                             -- hook index as text, 'own', or null
  own_hook text,
  rehook jsonb,                            -- {field, from, to} or null
  beats jsonb not null default '[]',       -- [{t, gap?, waitingOn?}]
  gut jsonb not null default '{}',         -- {Dawn: 'yes' | 'not sure' | 'no'}
  tips jsonb,                              -- {Dawn, Alex, Paloma}
  notes jsonb not null default '[]',       -- [{who, text}]
  drafted text[] not null default '{}',    -- field names an agent filled in and she hasn't confirmed
  script jsonb not null default '[]',      -- [{t, d, g?}] verbatim lines
  prep jsonb not null default '[]',        -- ["Print the letter"]
  prep_done integer[] not null default '{}',
  filmed boolean not null default false,
  slate text not null default '',
  look jsonb not null default '{"setup":"","outfit":"","location":"","props":"","edit":""}',
  reject_note text,
  added_after_lock boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index ideas_status_idx on content.ideas (status) where not archived;
create index ideas_week_idx on content.ideas (week) where not archived;

-- ---------- Weeks ----------
create table content.weeks (
  week date primary key,               -- Monday
  reviewed_on date,                    -- "Done reviewing this week"; triggers nothing
  film_day date,
  ros jsonb,                           -- run of show order: [{outfit, groups:[{setup, ids:[]}]}]
  general_prep_done integer[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------- Config: every change is a new version ----------
-- `snapshot` holds the whole config at that version: positioning, pillars, option lists, retired values,
-- mix targets, check-in cadence. The current config is the highest n.
create table content.config_versions (
  n integer primary key,
  label text not null,
  changes jsonb not null default '[]',   -- [{field, from, to}]
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by text
);
create view content.config_current with (security_invoker = true) as
  select * from content.config_versions order by n desc limit 1;

-- Per-user switches that aren't config (for example "count proposed").
create table content.prefs (
  id integer primary key default 1 check (id = 1),
  include_proposed boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------- Triggers ----------
do $$
declare t text;
begin
  foreach t in array array['takes', 'stories', 'ideas', 'weeks', 'prefs'] loop
    execute format('create trigger %I_touch before insert or update on content.%I for each row execute function content.touch()', t, t);
  end loop;
  foreach t in array array['takes', 'stories', 'ideas', 'weeks', 'config_versions', 'prefs', 'app_users'] loop
    execute format('create trigger %I_no_delete before delete on content.%I for each row execute function content.no_delete()', t, t);
  end loop;
end $$;

-- Config versions are history: never edited after they're written.
create or replace function content.no_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Config versions are history. Add a new version instead.' using errcode = 'P0001';
end $$;
create trigger config_versions_no_update before update on content.config_versions
  for each row execute function content.no_update();

-- ---------- Access ----------
-- RLS on everything. Only the owner (MQ's login) reads and writes through the app.
-- The `mh` CLI uses the secret key, which bypasses RLS but still can't delete (triggers above).
alter table content.app_users enable row level security;
alter table content.takes enable row level security;
alter table content.stories enable row level security;
alter table content.ideas enable row level security;
alter table content.weeks enable row level security;
alter table content.config_versions enable row level security;
alter table content.prefs enable row level security;

create policy owner_read on content.app_users for select to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['takes', 'stories', 'ideas', 'weeks', 'prefs'] loop
    execute format('create policy owner_select on content.%I for select to authenticated using (content.is_owner())', t);
    execute format('create policy owner_insert on content.%I for insert to authenticated with check (content.is_owner())', t);
    execute format('create policy owner_update on content.%I for update to authenticated using (content.is_owner()) with check (content.is_owner())', t);
  end loop;
end $$;
create policy owner_select on content.config_versions for select to authenticated using (content.is_owner());
create policy owner_insert on content.config_versions for insert to authenticated with check (content.is_owner());

-- Grants: anonymous visitors get nothing. Logged-in users get select/insert/update (RLS narrows it to MQ).
-- No delete grant for anyone.
revoke all on all tables in schema content from anon, authenticated;
grant usage on schema content to authenticated, service_role;
grant select, insert, update on content.takes, content.stories, content.ideas, content.weeks, content.prefs to authenticated;
grant select, insert on content.config_versions to authenticated;
grant select on content.config_current, content.app_users to authenticated;
grant select, insert, update on all tables in schema content to service_role;
grant select on content.config_current to service_role;
grant execute on function content.is_owner() to authenticated;
revoke execute on function content.is_owner() from anon, public;
