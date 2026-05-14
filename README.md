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

_To be added in commit 2._

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

### 4. Create the storage bucket

Storage → New bucket:

- **Name:** `room-photos`
- **Public bucket:** yes (photo UUIDs are unguessable, and all objects auto-delete with their room)

Then under Policies for the `room-photos` bucket, add two policies:

```sql
-- public read
create policy "anon read room-photos"
  on storage.objects for select
  using (bucket_id = 'room-photos');

-- anon upload
create policy "anon write room-photos"
  on storage.objects for insert to anon
  with check (bucket_id = 'room-photos');
```

(These can also be created via the Storage UI; pick "For full customization" and paste the policy bodies.)

### 5. (Optional) Sanity-check the schema

In the SQL editor, run:

```sql
select * from public.create_room(3);  -- create a test room
```

It should return one row with a 5-character `code` and a long `host_token`. Now you're ready to wire up the app (commit 4 onward).

### Note on cleanup

`cleanup_expired_rooms()` deletes expired room rows; cascades handle uploaders/photos/players/guesses. **Storage objects are not yet cleaned up by this function** — that's added in commit 12 via a Supabase Edge Function. Until then, expired Storage objects will linger but the free-tier ceiling is plenty for friend-group volumes.
