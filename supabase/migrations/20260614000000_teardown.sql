-- TEARDOWN: removes every database object this project created.
--
-- Applied by `supabase db push` from the teardown workflow
-- (.github/workflows/teardown.yml) when the decommission branch is merged
-- to main. After this runs the Supabase project is an empty shell you can
-- delete by hand in the dashboard (Project Settings → General → Delete project).
--
-- Storage NOTE: Supabase blocks direct DELETE on storage.objects from SQL
-- ("Direct deletion from storage tables is not allowed. Use the Storage API
-- instead."), so the storage objects and the room-photos bucket are emptied
-- and dropped by the workflow via the Storage API before this migration runs.
-- This migration only removes the storage *policies*, which are plain SQL
-- objects.

-- ---------- 1. Unschedule the cleanup cron job ------------------------------
-- Guarded: local clones / preview branches don't have pg_cron enabled.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cleanup-expired-rooms') then
      perform cron.unschedule('cleanup-expired-rooms');
    end if;
  end if;
end $$;

-- ---------- 2. Drop every RPC function in public ----------------------------
-- Loop over the catalog so we don't have to track each overloaded signature
-- (create_room/start_game/next_photo/etc. all had multiple versions over time).
do $$
declare
  r record;
begin
  for r in
    select 'drop function if exists '
             || quote_ident(n.nspname) || '.' || quote_ident(p.proname)
             || '(' || pg_get_function_identity_arguments(p.oid) || ') cascade;' as stmt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute r.stmt;
  end loop;
end $$;

-- ---------- 3. Drop all tables (cascades clear FKs, policies, indexes) -------
drop table if exists public.guesses   cascade;
drop table if exists public.players   cascade;
drop table if exists public.photos    cascade;
drop table if exists public.uploaders cascade;
drop table if exists public.rooms     cascade;

-- ---------- 4. Drop the storage policies ------------------------------------
drop policy if exists "anon read room-photos"  on storage.objects;
drop policy if exists "anon write room-photos" on storage.objects;
