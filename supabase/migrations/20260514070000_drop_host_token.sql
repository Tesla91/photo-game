-- URL-only hosting: drop host_token entirely.
--
-- The host_token paste flow was friction for a casual party game — anyone
-- on the team chat already shares the room code freely, and friends with
-- the code are exactly the trust set that should be able to host. So:
--
--   • /host/<code> in the app now means "I'm the host" by URL knowledge
--     alone. No localStorage credential required.
--   • The rooms.host_token column is removed.
--   • start_game / next_photo / reveal_current_photo no longer take a
--     host_token argument — they just check that the room exists and is
--     in the right state.
--   • verify_host_token is removed (no rejoin form needed).
--   • create_room no longer returns host_token.
--   • admin_list_rooms no longer surfaces host_token.

-- Drop the existing function signatures before we remove their last
-- column dependency.
drop function if exists public.create_room(int, text);
drop function if exists public.start_game(text, text);
drop function if exists public.next_photo(text, text);
drop function if exists public.reveal_current_photo(text, text);
drop function if exists public.verify_host_token(text, text);
drop function if exists public.admin_list_rooms(text);

-- Now drop the column.
alter table public.rooms drop column host_token;

-- Recreate the RPCs without host_token.

create or replace function public.create_room(
  p_photos_per_player int,
  p_host_message      text default null
) returns table (room_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code     text;
  v_room_id  uuid;
  v_attempts int := 0;
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
      insert into public.rooms (code, photos_per_player, host_message)
      values (v_code, p_photos_per_player, nullif(trim(p_host_message), ''))
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      if v_attempts > 10 then raise; end if;
    end;
  end loop;

  return query select v_room_id, v_code;
end;
$$;

revoke all on function public.create_room(int, text) from public;
grant execute on function public.create_room(int, text) to anon;

create or replace function public.start_game(p_room_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id        uuid;
  v_first_photo_id uuid;
  v_photo_count    int;
begin
  select id into v_room_id from public.rooms
    where code = p_room_code and state = 'uploading';
  if v_room_id is null then
    raise exception 'unauthorized or wrong state';
  end if;

  select count(*) into v_photo_count
    from public.photos where room_id = v_room_id;
  if v_photo_count = 0 then
    raise exception 'no photos uploaded yet';
  end if;

  with shuffled as (
    select id, row_number() over (order by random()) as ord
    from public.photos where room_id = v_room_id
  )
  update public.photos p
     set play_order = s.ord
    from shuffled s
   where p.id = s.id;

  select id into v_first_photo_id
    from public.photos
    where room_id = v_room_id and play_order = 1;

  update public.rooms
     set state = 'in_game', current_photo_id = v_first_photo_id
   where id = v_room_id;
end;
$$;

revoke all on function public.start_game(text) from public;
grant execute on function public.start_game(text) to anon;

create or replace function public.next_photo(p_room_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id          uuid;
  v_current_photo_id uuid;
  v_current_order    int;
  v_current_revealed boolean;
  v_next_id          uuid;
begin
  select r.id, r.current_photo_id into v_room_id, v_current_photo_id
    from public.rooms r
   where r.code = p_room_code and r.state = 'in_game';

  if v_room_id is null then
    raise exception 'unauthorized or wrong state';
  end if;

  if v_current_photo_id is not null then
    select revealed, play_order
      into v_current_revealed, v_current_order
      from public.photos where id = v_current_photo_id;
    if not v_current_revealed then
      raise exception 'reveal the current photo first';
    end if;
  end if;

  select id into v_next_id
    from public.photos
    where room_id = v_room_id
      and play_order = coalesce(v_current_order, 0) + 1;

  if v_next_id is null then
    update public.rooms
       set state = 'finished', current_photo_id = null
     where id = v_room_id;
    return null;
  end if;

  update public.rooms set current_photo_id = v_next_id where id = v_room_id;
  return v_next_id;
end;
$$;

revoke all on function public.next_photo(text) from public;
grant execute on function public.next_photo(text) to anon;

create or replace function public.reveal_current_photo(p_room_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id  uuid;
  v_photo_id uuid;
begin
  select r.id, r.current_photo_id into v_room_id, v_photo_id
    from public.rooms r
   where r.code = p_room_code and r.state = 'in_game';

  if v_room_id is null then
    raise exception 'unauthorized or wrong state';
  end if;
  if v_photo_id is null then
    raise exception 'no current photo';
  end if;

  update public.photos set revealed = true where id = v_photo_id;
end;
$$;

revoke all on function public.reveal_current_photo(text) from public;
grant execute on function public.reveal_current_photo(text) to anon;

create or replace function public.admin_list_rooms(p_admin_token text)
returns table (
  id                uuid,
  code              text,
  state             text,
  photos_per_player int,
  host_message      text,
  uploader_count    bigint,
  photo_count       bigint,
  created_at        timestamptz,
  expires_at        timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_admin(p_admin_token) then
    raise exception 'unauthorized';
  end if;

  return query
    select
      r.id,
      r.code,
      r.state,
      r.photos_per_player,
      r.host_message,
      (select count(*) from public.uploaders u where u.room_id = r.id),
      (select count(*) from public.photos p where p.room_id = r.id),
      r.created_at,
      r.expires_at
    from public.rooms r
    order by r.created_at desc;
end;
$$;

revoke all on function public.admin_list_rooms(text) from public;
grant execute on function public.admin_list_rooms(text) to anon;
