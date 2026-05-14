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

_To be added in commit 3._
