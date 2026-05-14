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

Deployment is automated by `.github/workflows/deploy.yml` — every push to `main` builds the app and publishes it to GitHub Pages.

### One-time setup

1. In the GitHub repo: **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
2. Add the following **Repository secrets** (Settings → Secrets and variables → Actions):
   - `VITE_SUPABASE_URL` — your Supabase project URL (e.g. `https://abcd1234.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` — your Supabase project anon/public API key

   _These are wired into `vite build` at deploy time. Both are safe to expose to browsers; Supabase RLS controls real access._

3. Confirm the repo name matches the Vite base path. The base is set to `/photo-game/` in `vite.config.ts` — if you rename the repo, update that value to match (or set it to `/` for a user/org Pages site).

After the first successful run, the app is live at `https://<your-user>.github.io/photo-game/`.

### Manual deploy

A `workflow_dispatch` trigger is included, so you can also run the workflow from the **Actions** tab at any time.

### SPA fallback

The workflow copies `dist/index.html` to `dist/404.html` after build. Combined with `HashRouter`, this means deep links like `https://<user>.github.io/photo-game/#/r/ABC12` always load correctly, even on a hard refresh.

## Supabase setup

_To be added in commit 3._
