-- Daily cleanup now also removes storage objects, not just DB rows.
--
-- Originally cleanup_expired_rooms() only deleted public.rooms (relying on
-- cascades for the child tables). That left the underlying JPEGs in the
-- room-photos bucket dangling — they'd accumulate forever and eventually
-- bust the free-tier quota.
--
-- This version deletes the matching storage.objects rows first. Supabase
-- fires its internal storage hook when a row is removed from
-- storage.objects, which drops the underlying file from object storage.
-- It's the same pattern admin_delete_room uses, just driven by the daily
-- cron schedule installed in 0001_init.sql.
--
-- No edge function is needed — pg_cron + SECURITY DEFINER + the storage
-- hook handles the whole flow inside Postgres.

create or replace function public.cleanup_expired_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_expired_ids
    from public.rooms where expires_at < now();

  if array_length(v_expired_ids, 1) is null then
    return;
  end if;

  -- Storage first; deleting these rows triggers the hook that removes the
  -- actual files from the room-photos bucket. Paths look like
  -- {room_id}/{uuid}.jpg, so split_part picks out the room_id prefix.
  delete from storage.objects
    where bucket_id = 'room-photos'
      and split_part(name, '/', 1) = any (
        select id::text from unnest(v_expired_ids) as id
      );

  -- Then the rooms; cascades sweep uploaders, photos, players, guesses.
  delete from public.rooms where id = any (v_expired_ids);
end;
$$;
