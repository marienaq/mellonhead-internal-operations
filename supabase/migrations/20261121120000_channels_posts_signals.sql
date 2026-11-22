-- Step 2 from gap-analysis-2026-11-20.md §5 (items 6 to 8; status history, item 9, dropped 11/21 as overkill): what the markdown holds that the schema had no place for.
-- Adds only. Nothing existing is renamed, rewritten or dropped, so the app that's live now keeps working
-- before and after this runs.

-- ---------- On each idea ----------
-- 3.1 Channels it's planned for (TikTok, LinkedIn, YouTube, Mellonmail). The choices live in config.
alter table content.ideas add column channels text[] not null default '{}';

-- 3.6 More than one link. `brief` stays the brief; these are the rest: short brief, story card, storyboard,
-- hooks file, assets folder. [{label, url}] where url is a web link or a repo path.
alter table content.ideas add column links jsonb not null default '[]'
  check (jsonb_typeof(links) = 'array');

-- "No story" as a decision. story_key null used to mean both "not picked yet" and "decided: none".
alter table content.ideas add column no_story boolean not null default false;
-- The two stay consistent whichever one a write sets (an older app copy, a merge of two devices, an agent):
-- turning "no story" on clears the story; setting a story turns "no story" off. The app always writes both.
create or replace function content.story_decision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.no_story and not old.no_story and new.story_key is not distinct from old.story_key then
    new.story_key := null;
  elsif new.story_key is not null then
    new.no_story := false;
  end if;
  return new;
end $$;
create trigger ideas_story_decision before insert or update on content.ideas
  for each row execute function content.story_decision();
alter table content.ideas add constraint ideas_no_story_or_story check (not (no_story and story_key is not null));

-- Which part of the person's inner world it speaks to (config.innerWorld keys: coreProblem, hurting, tried,
-- thinking, afraid, wants). Optional. On the idea for now; moves to each post when one idea becomes several posts.
alter table content.ideas add column inner_world text[] not null default '{}';

-- {"views": 1200, "open_rate": 41.5}: an object of named, non-negative numbers below a quadrillion.
create or replace function content.only_counts(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(j) = 'object'
     and not exists (select 1 from jsonb_each(j) e
                     where e.key = ''
                        or case when jsonb_typeof(e.value) = 'number' then (e.value)::numeric < 0 or (e.value)::numeric >= 1e15 else true end);
$$;

-- ---------- Posts: one idea going out on one channel (3.4) ----------
-- The real posted date and the link, so signals have something to attach to. Different framings per channel
-- come later (MQ, 11/21). id is a uuid the writer can make up front, so a retried insert can't make a second row.
create table content.posts (
  id uuid primary key default gen_random_uuid(),
  idea_id text not null references content.ideas (id),
  channel text not null,
  posted_on date,                           -- the day it went out; null while it's planned
  url text,
  hook_format text not null default '',    -- the hook format the video opened with (hook-research.md §2), or "her own"
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
-- One live post per idea and channel.
create unique index posts_idea_channel_idx on content.posts (idea_id, channel) where not archived;

-- ---------- Signals: what landed (3.3) ----------
-- One row per check of a post. The numbers differ by platform (TikTok views and saves, Kit open and click rates,
-- LinkedIn impressions...), so they're one object keyed by the platform's own names; the list per channel lives
-- in the app and the CLI. Numbers only, never negative. What people said is always worth more than the numbers.
create table content.signals (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references content.posts (id),
  recorded_on date not null default current_date,
  numbers jsonb not null default '{}' check (content.only_counts(numbers)),
  said text not null default '',            -- what people said, in their words
  notice text not null default '',          -- what she notices
  more_of_this text check (more_of_this in ('yes', 'no', 'maybe')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index signals_post_idx on content.signals (post_id, recorded_on desc) where not archived;

-- ---------- Who changed it ----------
-- Agents write with the secret key, which carries no email. They name themselves in an `x-mh-actor` header
-- (the `mh` CLI sends it), so a row's updated_by says "mh content (Orca)" rather than "system". A signed-in email always wins,
-- so the header can't make a change look like hers.
create or replace function content.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
                             left(nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-mh-actor', ''), 80),
                             nullif(current_setting('mh.actor', true), ''), 'system');
  return new;
end $$;

-- ---------- Triggers, same rules as the first schema ----------
create trigger posts_touch before insert or update on content.posts for each row execute function content.touch();
create trigger signals_touch before insert or update on content.signals for each row execute function content.touch();
create trigger posts_no_delete before delete on content.posts for each row execute function content.no_delete();
create trigger signals_no_delete before delete on content.signals for each row execute function content.no_delete();

-- ---------- Access ----------
alter table content.posts enable row level security;
alter table content.signals enable row level security;

do $$
declare t text;
begin
  foreach t in array array['posts', 'signals'] loop
    execute format('create policy owner_select on content.%I for select to authenticated using (content.is_owner())', t);
    execute format('create policy owner_insert on content.%I for insert to authenticated with check (content.is_owner())', t);
    execute format('create policy owner_update on content.%I for update to authenticated using (content.is_owner()) with check (content.is_owner())', t);
  end loop;
end $$;

revoke all on content.posts, content.signals from anon, authenticated;
grant select, insert, update on content.posts, content.signals to authenticated, service_role;
-- The no-delete triggers don't fire on TRUNCATE, so nobody gets it (Supabase's default privileges may have granted it).
revoke truncate on all tables in schema content from anon, authenticated, service_role;
