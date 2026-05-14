-- Game-play rules + realtime convenience
--
-- 1. guesses.room_id (denormalised from photos.room_id) so realtime
--    subscribers can filter `room_id=eq.<id>` on the guesses table.
--    Without this, every client would need to receive every guess
--    insert across the whole project and discard the irrelevant ones.
--
-- 2. submit_guess: populate the new room_id column and reject any
--    attempt to guess on your own photo (the client should hide the
--    UI in that case, but enforce on the server too).
--
-- 3. next_photo: refuse to advance while the current photo is still
--    unrevealed. The host's UI disables Next until Reveal is hit;
--    this is defense in depth so a stale tab or a manual RPC call
--    can't skip past photos.

-- ---------- guesses.room_id -------------------------------------------------

alter table public.guesses add column room_id uuid;

update public.guesses g
set room_id = ph.room_id
from public.photos ph
where g.photo_id = ph.id;

alter table public.guesses alter column room_id set not null;

alter table public.guesses
  add constraint guesses_room_id_fk
  foreign key (room_id) references public.rooms(id) on delete cascade;

create index if not exists guesses_room_idx on public.guesses (room_id);

-- ---------- submit_guess ----------------------------------------------------

create or replace function public.submit_guess(
  p_room_code           text,
  p_session_token       text,
  p_photo_id            uuid,
  p_guessed_uploader_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id             uuid;
  v_current_photo_id    uuid;
  v_player_id           uuid;
  v_player_uploader_id  uuid;
  v_actual_uploader_id  uuid;
  v_is_correct          boolean;
begin
  select r.id, r.current_photo_id
    into v_room_id, v_current_photo_id
    from public.rooms r
   where r.code = p_room_code and r.state = 'in_game';

  if v_room_id is null then
    raise exception 'game not in progress';
  end if;
  if v_current_photo_id is distinct from p_photo_id then
    raise exception 'can only guess on the current photo';
  end if;

  select id, uploader_id
    into v_player_id, v_player_uploader_id
    from public.players
   where room_id = v_room_id and session_token = p_session_token;
  if v_player_id is null then
    raise exception 'invalid session';
  end if;

  select uploader_id into v_actual_uploader_id
    from public.photos where id = p_photo_id;

  if v_player_uploader_id = v_actual_uploader_id then
    raise exception 'cannot guess on your own photo';
  end if;

  v_is_correct := (v_actual_uploader_id = p_guessed_uploader_id);

  insert into public.guesses (photo_id, player_id, guessed_uploader_id, is_correct, room_id)
  values (p_photo_id, v_player_id, p_guessed_uploader_id, v_is_correct, v_room_id)
  on conflict (photo_id, player_id) do nothing;
end;
$$;

revoke all on function public.submit_guess(text, text, uuid, uuid) from public;
grant execute on function public.submit_guess(text, text, uuid, uuid) to anon;

-- ---------- next_photo ------------------------------------------------------

create or replace function public.next_photo(p_room_code text, p_host_token text)
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
   where r.code = p_room_code
     and r.host_token = p_host_token
     and r.state = 'in_game';

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

revoke all on function public.next_photo(text, text) from public;
grant execute on function public.next_photo(text, text) to anon;
