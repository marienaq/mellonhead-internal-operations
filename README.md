# Mellonhead internal operations

Internal tools for running Mellonhead, a one-person AI-at-work consultancy. First up: a **content planner** for a daily short-video practice: an idea bank, weekly planning against a target mix, an idea page that turns fields into a pitch, and a film-day run of show.

Built in the open. The planning approach, brand world and agent skills live in the main Mellonhead repo; this repo holds the app.

## What's here

| Folder | What it is |
|---|---|
| `app/` | The web app: React, Vite and TypeScript. See `app/README.md` to run it. |
| `supabase/` | Database schema (migrations) for Supabase: row-level security, one owner, no hard deletes. |
| `design/mockups/` | The clickable mockups from the design rounds. |
| `scripts/with-env` | Runs a command with keys loaded from `~/.config/mellonhead/supabase.env`, without printing them. |
| `.claude/agents/` | The product manager and product designer roles used to plan and design the app with Claude. |

## Run it without any accounts

```
cd app && npm install && npm run dev
```

With no Supabase settings, it runs as a local prototype on sample data saved in your browser.

## Security notes

- No keys live in this repo. The browser only ever gets the Supabase **publishable** key; row-level security limits all data to the owner's login, and sign-ups are off.
- Nothing can hard-delete: a database trigger refuses deletes, even with the secret key. Rows are archived.
- Local credentials stay in `~/.config/mellonhead/` (and a git-ignored `.config/`).

## License

Code: MIT (see `LICENSE`). The Mellonhead name, logo and the felt-world artwork in `app/public/assets/` and `design/mockups/assets/` are not covered by the MIT license; all rights reserved.
