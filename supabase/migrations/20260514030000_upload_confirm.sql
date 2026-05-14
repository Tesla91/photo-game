-- Upload review + confirm flow
--
-- 1. rooms.host_message — optional text the host writes when creating
--    the room. The upload page shows it on the thank-you screen after
--    a player confirms ("Thanks Alice! Game will be played in Rome on
--    Saturday."). Nullable; when null the upload page shows a generic
--    message.
--
-- 2. create_room(p_photos_per_player, p_host_message) — extends the
--    RPC signature with the new field. Postgres can't append a default
--    parameter to an existing function via `create or replace`, so we
--    drop the int-only variant and recreate.
--
-- 3. delete_photo(p_room_code, p_upload_token, p_photo_id) — new RPC
--    so a player can remove one of their own photos before confirming.
--    Same auth pattern as add_photo: room must be in 'uploading' state
--    and the upload_token must match the uploader who owns the row.
--
-- 4. storage.objects "anon delete room-photos" policy — so the client
--    can also drop the actual file after deleting the DB row. Without
--    this, removed files would linger until the 7-day cleanup.
--
-- 5. alter table photos replica identity full — so realtime DELETE
--    events on photos include room_id in the payload. Without this,
--    the host dashboard's filter (`room_id=eq.<id>`) would never match
--    delete events and the live photo counts would only ever tick up.

-- ---------- 1. rooms.host_message ------------------------------------------

alter table public.rooms add column host_message text;

-- ---------- 2. create_room extended ----------------------------------------

drop function if exists public.create_room(int);

create or replace function public.create_room(
  p_photos_per_player int,
  p_host_message      text default null
) returns table (room_id uuid, code text, host_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code       text;
  v_host_token text := public._generate_token();
  v_room_id    uuid;
  v_attempts   int  := 0;
begin
  if p_photos_per_player is null
     or p_photos_per_player < 1
     or p_photos_per_player > 20 then
    raise exception 'photos_per_player must be between 1 and 20';
  end if;

  loop
    v_attempts := v_attempts + 1;
    v_code := public._generate_code();
    begin
      insert into public.rooms (code, photos_per_player, host_token, host_message)
      values (v_code, p_photos_per_player, v_host_token, nullif(trim(p_host_message), ''))
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      if v_attempts > 10 then raise; end if;
    end;
  end loop;

  return query select v_room_id, v_code, v_host_token;
end;
$$;

revoke all on function public.create_room(int, text) from public;
grant execute on function public.create_room(int, text) to anon;

-- ---------- 3. delete_photo ------------------------------------------------

create or replace function public.delete_photo(
  p_room_code    text,
  p_upload_token text,
  p_photo_id     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id     uuid;
  v_room_state  text;
  v_uploader_id uuid;
begin
  select r.id, r.state into v_room_id, v_room_state
    from public.rooms r where r.code = p_room_code;

  if v_room_id is null then
    raise exception 'room not found';
  end if;
  if v_room_state <> 'uploading' then
    raise exception 'room is not accepting changes';
  end if;

  select u.id into v_uploader_id
    from public.uploaders u
    where u.room_id = v_room_id and u.upload_token = p_upload_token;
  if v_uploader_id is null then
    raise exception 'invalid upload token';
  end if;

  delete from public.photos
    where id = p_photo_id and uploader_id = v_uploader_id;
end;
$$;

revoke all on function public.delete_photo(text, text, uuid) from public;
grant execute on function public.delete_photo(text, text, uuid) to anon;

-- ---------- 4. anon delete on room-photos ----------------------------------

drop policy if exists "anon delete room-photos" on storage.objects;
create policy "anon delete room-photos"
  on storage.objects for delete to anon
  using (bucket_id = 'room-photos');

-- ---------- 5. replica identity for photo DELETE events --------------------

alter table public.photos replica identity full;
