# Photo Guess

A small party game for friends:

1. One person creates a room and shares an anonymous upload link.
2. Each friend visits the link whenever they're free, types their name, and uploads N photos. Names are kept private.
3. Game night: the host opens the game view, others join from their phones via a QR code or short room code.
4. The host advances through photos in a random order. Everyone guesses who uploaded each one. After each reveal: stats + leaderboard.

Hosted free on **GitHub Pages** + **Supabase** (free tier). Photos and game state auto-delete after 7 days.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- React Router (HashRouter — Pages-friendly)
- Supabase (Postgres, Storage, Realtime, Edge Functions, pg_cron) — _added in later commits_

## Local development

```bash
npm install
npm run dev
```

Then open the URL Vite prints. The app is served under `/photo-game/` to match the GitHub Pages base path.

## Build

```bash
npm run build
npm run preview
```

## Deploy

Deployment is automated by `.github/workflows/deploy.yml` — every push to `main`:

1. Applies any pending Supabase migrations from `supabase/migrations/` via `supabase db push` (the **migrate** job).
2. Builds the Vite app with the Supabase env vars (the **build** job).
3. Publishes the static output to GitHub Pages (the **deploy** job).

### One-time setup

1. In the GitHub repo: **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
2. Enable **pg_cron** in the Supabase Dashboard (Database → Extensions). Without this, the first migration push will fail — the rest of the migration relies on `cron.schedule`.
3. Add the following **Repository secrets** (Settings → Secrets and variables → Actions):

   | Secret | What it is |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL, e.g. `https://abcd1234.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Project anon/public API key |
   | `SUPABASE_ACCESS_TOKEN` | Personal access token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens). Used by the CLI to authenticate. |
   | `SUPABASE_PROJECT_REF` | Project ref (the `abcd1234` from the project URL). |
   | `SUPABASE_DB_PASSWORD` | The database password you set when creating the project. |

   `VITE_*` are baked into the static bundle (safe to expose; Supabase RLS controls real access). The others stay server-side, only the migrate job sees them.

   You can add these as **Repository secrets** (apply to all jobs) or under the **`github-pages` environment** (Settings → Environments → github-pages). All three jobs in this workflow target the `github-pages` environment, so either location works.

4. Confirm the repo name matches the Vite base path. The base is set to `/photo-game/` in `vite.config.ts` — if you rename the repo, update that value to match (or set it to `/` for a user/org Pages site).

After the first successful run, the app is live at `https://<your-user>.github.io/photo-game/` and your Supabase schema is up to date.

### Manual deploy

A `workflow_dispatch` trigger is included, so you can also run the workflow from the **Actions** tab at any time.

### SPA fallback

The workflow copies `dist/index.html` to `dist/404.html` after build. Combined with `HashRouter`, this means deep links like `https://<user>.github.io/photo-game/#/r/ABC12` always load correctly, even on a hard refresh.

## Supabase setup

_To be added in commit 3._
