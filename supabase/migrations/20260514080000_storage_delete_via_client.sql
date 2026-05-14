-- Supabase recently locked down direct DELETE on storage.objects from SQL
-- (even SECURITY DEFINER functions hit "Direct deletion from storage
-- tables is not allowed. Use the Storage API instead."). Both
-- admin_delete_room and cleanup_expired_rooms used that pattern, so both
-- need to stop and hand the storage-object cleanup off elsewhere.
--
-- admin_delete_room now returns the list of storage paths for the room
-- it deleted; the client follows up with supabase.storage.from(...).remove
-- which goes through the proper Storage API path.
--
-- cleanup_expired_rooms is daemon code with no client to lean on, so it
-- just drops the DB rows (cascades handle uploaders/photos/players/
-- guesses). The storage objects orphan until somebody runs the admin
-- delete flow on those rooms before they expire — acceptable for the
-- free tier; if it becomes a problem we'll wire an edge function.

drop function if exists public.admin_delete_room(text, uuid);

create or replace function public.admin_delete_room(
  p_admin_token text,
  p_room_id     uuid
) returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths text[];
begin
  if not public._is_admin(p_admin_token) then
    raise exception 'unauthorized';
  end if;

  -- Collect paths before deleting the photos rows.
  select coalesce(array_agg(storage_path), array[]::text[]) into v_paths
    from public.photos
    where room_id = p_room_id;

  -- Cascades clean uploaders, photos, players, guesses.
  delete from public.rooms where id = p_room_id;

  return v_paths;
end;
$$;

revoke all on function public.admin_delete_room(text, uuid) from public;
grant execute on function public.admin_delete_room(text, uuid) to anon;

-- DB-only cleanup. Storage objects orphan; rooms still get reaped on
-- their expires_at boundary so DB stays tidy.
create or replace function public.cleanup_expired_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.rooms where expires_at < now();
end;
$$;
