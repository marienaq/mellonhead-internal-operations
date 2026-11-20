# Supabase: mellonhead-internal

Project ref `zrxzmdtenpdvtszwqwjp` (us-east-2). Schema `content` for content planning.

- Keys and the database password live in `~/.config/mellonhead/supabase.env` (mode 600), never here.
- Run CLI commands through `scripts/with-env`, which loads that file without printing it:
  `scripts/with-env supabase db push --remote`
- Migrations are in `migrations/`; every schema change is a new file.

## Rules built into the schema
- Only MQ's login (a row in `content.app_users`) can read or write through the app (RLS).
- Nobody can delete rows, including the secret key the `mh` CLI uses. Archive instead (`archived = true`).
- Config changes are new rows in `content.config_versions`; old versions can't be edited.
