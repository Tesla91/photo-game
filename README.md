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
cp .env.example .env   # then fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Then open the URL Vite prints. The app is served under `/photo-game/` to match the GitHub Pages base path.

`.env` is gitignored — never commit credentials. The two values you need are in **Supabase Dashboard → Project Settings → API** (Project URL + anon/public key). Both are safe to ship to browsers; RLS controls real access.

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

You need one Supabase project (free tier is fine). One-time steps:

### 1. Create the project

[supabase.com](https://supabase.com) → New Project. Pick any region close to your friends. Save the project URL and anon/public API key — they go into GitHub Actions secrets (see [Deploy](#deploy)) and into a local `.env` file (see [Local development](#local-development)).

### 2. Enable required extensions

Database → Extensions → enable **`pg_cron`** (Supabase forces this into the `pg_catalog` schema — that's the only choice; just click Enable). `pgcrypto` is enabled automatically by the migration.

### 3. Apply the migration

The deploy workflow runs `supabase db push` on every push to `main` (see [Deploy](#deploy)) — once the workflow secrets are set, migrations apply automatically. If you want to run them manually before that's wired up:

```bash
# requires the Supabase CLI: https://supabase.com/docs/guides/cli
supabase link --project-ref <your-ref>
supabase db push
```

The migration creates:

- Tables: `rooms`, `uploaders`, `photos`, `players`, `guesses`
- RLS: anon can read all tables (writes go through RPC only)
- RPCs: `create_room`, `add_uploader`, `add_photo`, `start_game`, `next_photo`, `reveal_current_photo`, `join_as_player`, `submit_guess`
- Realtime publication on all five tables
- `cleanup_expired_rooms()` scheduled daily at 04:00 UTC via pg_cron

### 4. Storage bucket

Created automatically by the migration in `supabase/migrations/20260514020000_storage_bucket.sql` — the `room-photos` bucket is public with a 10 MB per-file cap and the anon-read / anon-write policies the upload flow needs. No dashboard click required.

### 5. (Optional) Sanity-check the schema

In the SQL editor, run:

```sql
select * from public.create_room(3);  -- create a test room
```

It should return one row with a 5-character `code` and a long `host_token`. Now you're ready to wire up the app (commit 4 onward).

### Admin page

The `/admin` route lets you list every room with its photo/uploader counts, expiry, and host token, and delete a room (including its photos in storage). It's gated by a single admin token that the migration generates on first run. Find it once via:

```sql
select admin_token from public.admin_config;
```

Then paste it into the form at `/admin`. Rotate the token anytime with:

```sql
update public.admin_config set admin_token = '<your-new-token>' where id = 1;
```

The route isn't linked from the main UI — bookmark `/<base>/#/admin`.

### Note on cleanup

`cleanup_expired_rooms()` runs daily at 04:00 UTC via pg_cron and deletes the `rooms` rows that have passed their `expires_at` (cascades clean `uploaders`, `photos`, `players`, and `guesses`).

To trigger it manually run in the SQL editor:

```sql
select public.cleanup_expired_rooms();
```

**Storage cleanup**: Supabase blocks `DELETE FROM storage.objects` via SQL, so the cron only cleans DB rows. Files orphan in the `room-photos` bucket until somebody deletes the room through the **/admin** page (which does drop the underlying files via the Storage API). For friend-group volumes on the free tier the orphan rate is well below the 1 GB ceiling; if it ever becomes a problem we'll wire an edge function to mop up.
