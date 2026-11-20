# Mellonhead content planner: local prototype (stage D)

A working front end on seed data, built from the round-2 mockups and MQ's answers.
No database, no login, no agents yet. Changes are saved in the browser you use, per device.

## Two modes

- **Supabase (your real data):** when `app/.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, the app asks you to sign in with an emailed link and saves every change to Supabase. Only the publishable key goes in that file; the secret key stays in `~/.config/mellonhead/supabase.env`.
- **Local prototype:** without `.env.local`, it runs on the seed data in your browser, with "Reset to seed data".

## Run it

    cd ~/Projects/mellonhead-internal-operations/app
    npm install      # first time only
    npm run dev      # http://localhost:5180

On your phone (same Wi-Fi): http://<your-mac>.local:5180

## What's where

- `src/lib/seed.ts`: seed data (ideas, 18 takes, story bank, config). Past weeks are example rows.
- `src/lib/store.ts`: the data store; undo; reset to seed (local mode only).
- `src/lib/remote.ts`: Supabase sign-in, load, and saving changed rows (never deletes; archives).
- `scripts/build-import.ts`: the one-time import (already run 2026-11-19). `scripts/check-roundtrip.ts`: checks load-and-save changes nothing.
- `src/lib/logic.ts`: readiness rule (D31), mix (brief §6.3), status moves, run of show.
- `src/screens/`: Ideas, Plan week, Idea page, Film, Config.
- Reset to seed data: the link at the top of every screen, or Config > Prototype.

## Rules carried over

- No keys, database URLs or exported data in this folder.
- Client stories stay blinded. Nothing hard-deletes; reject and retire are both reversible.
