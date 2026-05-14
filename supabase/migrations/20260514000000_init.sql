-- ============================================================================
-- Photo Guess - initial schema, RLS, RPC API, and cleanup schedule
-- ============================================================================
-- Threat model: a casual party game for friends. Read access is open (anon
-- can SELECT every table); the client is trusted not to display uploader info
-- before reveal. All writes go through SECURITY DEFINER RPC functions that
-- check tokens (host_token / upload_token / session_token).
-- ============================================================================

create extension if not exists pgcrypto;

-- pg_cron must be enabled via the Supabase Dashboard (Database → Extensions →
-- pg_cron, schema = pg_catalog) before this migration runs. Enabling it via
-- `create extension` requires privileges the migration role does not have
-- on hosted Supabase. The cron.schedule() call near the bottom assumes the
-- extension is already enabled.

-- ---------- Tables -----------------------------------------------------------

create table public.rooms (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  photos_per_player   int  not null check (photos_per_player between 1 and 20),
  state               text not null default 'uploading'
                        check (state in ('uploading', 'in_game', 'finished')),
  current_photo_id    uuid,  -- FK added after photos table exists
  host_token          text not null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default now() + interval '7 days'
);

create table public.uploaders (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms(id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 40),
  upload_token    text not null,
  created_at      timestamptz not null default now(),
  unique (room_id, name)
);

create index uploaders_room_idx on public.uploaders (room_id);

create table public.photos (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms(id) on delete cascade,
  uploader_id     uuid not null references public.uploaders(id) on delete cascade,
  storage_path    text not null,
  play_order      int,
  revealed        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index photos_room_play_order_idx on public.photos (room_id, play_order);
create index photos_uploader_idx        on public.photos (uploader_id);

alter table public.rooms
  add constraint rooms_current_photo_fk
  foreign key (current_photo_id) references public.photos(id) on delete set null;

create table public.players (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms(id) on delete cascade,
  uploader_id     uuid not null references public.uploaders(id) on delete cascade,
  session_token   text not null,
  joined_at       timestamptz not null default now(),
  unique (room_id, uploader_id)
);

create index players_room_idx on public.players (room_id);

create table public.guesses (
  id                    uuid primary key default gen_random_uuid(),
  photo_id              uuid not null references public.photos(id) on delete cascade,
  player_id             uuid not null references public.players(id) on delete cascade,
  guessed_uploader_id   uuid not null references public.uploaders(id),
  is_correct            boolean not null,
  submitted_at          timestamptz not null default now(),
  unique (photo_id, player_id)
);

create index guesses_photo_idx on public.guesses (photo_id);

-- ---------- RLS: read-open, write-closed -------------------------------------

alter table public.rooms      enable row level security;
alter table public.uploaders  enable row level security;
alter table public.photos     enable row level security;
alter table public.players    enable row level security;
alter table public.guesses    enable row level security;

create policy "rooms read"      on public.rooms     for select to anon using (true);
create policy "uploaders read"  on public.uploaders for select to anon using (true);
create policy "photos read"     on public.photos    for select to anon using (true);
create policy "players read"    on public.players   for select to anon using (true);
create policy "guesses read"    on public.guesses   for select to anon using (true);

-- No INSERT/UPDATE/DELETE policies for anon. Writes are gated by RPC below.

-- ---------- Helpers ----------------------------------------------------------

create or replace function public._generate_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no I, L, O, 0, 1
  result   text := '';
  i        int;
begin
  for i in 1..5 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public._generate_token()
returns text
language sql
as $$
  select encode(gen_random_bytes(24), 'base64');
$$;

-- ---------- RPC: create_room -------------------------------------------------

create or replace function public.create_room(p_photos_per_player int)
returns table (room_id uuid, code text, host_token text)
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
      insert into public.rooms (code, photos_per_player, host_token)
      values (v_code, p_photos_per_player, v_host_token)
      returning id into v_room_id;
      exit;
    exception when unique_violation then
      if v_attempts > 10 then raise; end if;
    end;
  end loop;

  return query select v_room_id, v_code, v_host_token;
end;
$$;

revoke all on function public.create_room(int) from public;
grant execute on function public.create_room(int) to anon;

-- ---------- RPC: add_uploader ------------------------------------------------

create or replace function public.add_uploader(p_room_code text, p_name text)
returns table (uploader_id uuid, upload_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id     uuid;
  v_room_state  text;
  v_uploader_id uuid;
  v_token       text := public._generate_token();
begin
  select id, state into v_room_id, v_room_state
    from public.rooms where code = p_room_code;

  if v_room_id is null then
    raise exception 'room not found';
  end if;
  if v_room_state <> 'uploading' then
    raise exception 'room is not accepting uploads';
  end if;

  insert into public.uploaders (room_id, name, upload_token)
  values (v_room_id, trim(p_name), v_token)
  returning id into v_uploader_id;

  return query select v_uploader_id, v_token;
end;
$$;

revoke all on function public.add_uploader(text, text) from public;
grant execute on function public.add_uploader(text, text) to anon;

-- ---------- RPC: add_photo ---------------------------------------------------

create or replace function public.add_photo(
  p_room_code     text,
  p_upload_token  text,
  p_storage_path  text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id            uuid;
  v_room_state         text;
  v_photos_per_player  int;
  v_uploader_id        uuid;
  v_count              int;
  v_photo_id           uuid;
begin
  select r.id, r.state, r.photos_per_player
    into v_room_id, v_room_state, v_photos_per_player
    from public.rooms r where r.code = p_room_code;

  if v_room_id is null then
    raise exception 'room not found';
  end if;
  if v_room_state <> 'uploading' then
    raise exception 'room is not accepting uploads';
  end if;

  select u.id into v_uploader_id
    from public.uploaders u
    where u.room_id = v_room_id and u.upload_token = p_upload_token;

  if v_uploader_id is null then
    raise exception 'invalid upload token';
  end if;

  select count(*) into v_count
    from public.photos
    where uploader_id = v_uploader_id;

  if v_count >= v_photos_per_player then
    raise exception 'photo limit reached (% of %)', v_count, v_photos_per_player;
  end if;

  insert into public.photos (room_id, uploader_id, storage_path)
  values (v_room_id, v_uploader_id, p_storage_path)
  returning id into v_photo_id;

  return v_photo_id;
end;
$$;

revoke all on function public.add_photo(text, text, text) from public;
grant execute on function public.add_photo(text, text, text) to anon;

-- ---------- RPC: start_game --------------------------------------------------

create or replace function public.start_game(p_room_code text, p_host_token text)
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
    where code = p_room_code
      and host_token = p_host_token
      and state = 'uploading';

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

revoke all on function public.start_game(text, text) from public;
grant execute on function public.start_game(text, text) to anon;

-- ---------- RPC: next_photo --------------------------------------------------
-- Advances to the next photo; if there is no next photo, transitions the
-- room to 'finished'. Returns the next photo id, or NULL if finished.

create or replace function public.next_photo(p_room_code text, p_host_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id        uuid;
  v_current_order  int;
  v_next_id        uuid;
begin
  select r.id, p.play_order
    into v_room_id, v_current_order
    from public.rooms r
    left join public.photos p on p.id = r.current_photo_id
   where r.code = p_room_code
     and r.host_token = p_host_token
     and r.state = 'in_game';

  if v_room_id is null then
    raise exception 'unauthorized or wrong state';
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

-- ---------- RPC: reveal_current_photo ----------------------------------------

create or replace function public.reveal_current_photo(
  p_room_code  text,
  p_host_token text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id  uuid;
  v_photo_id uuid;
begin
  select r.id, r.current_photo_id
    into v_room_id, v_photo_id
    from public.rooms r
   where r.code = p_room_code
     and r.host_token = p_host_token
     and r.state = 'in_game';

  if v_room_id is null then
    raise exception 'unauthorized or wrong state';
  end if;
  if v_photo_id is null then
    raise exception 'no current photo';
  end if;

  update public.photos set revealed = true where id = v_photo_id;
end;
$$;

revoke all on function public.reveal_current_photo(text, text) from public;
grant execute on function public.reveal_current_photo(text, text) to anon;

-- ---------- RPC: join_as_player ----------------------------------------------
-- Idempotent: if the uploader already has a player row, returns the existing
-- session token. Otherwise creates a new player row.

create or replace function public.join_as_player(
  p_room_code   text,
  p_uploader_id uuid
) returns table (player_id uuid, session_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id        uuid;
  v_room_state     text;
  v_player_id      uuid;
  v_existing_token text;
  v_token          text := public._generate_token();
begin
  select r.id, r.state into v_room_id, v_room_state
    from public.rooms r where r.code = p_room_code;

  if v_room_id is null then
    raise exception 'room not found';
  end if;
  if v_room_state not in ('in_game', 'finished') then
    raise exception 'game has not started';
  end if;

  if not exists (
    select 1 from public.uploaders u
    where u.id = p_uploader_id and u.room_id = v_room_id
  ) then
    raise exception 'uploader not in this room';
  end if;

  select id, players.session_token
    into v_player_id, v_existing_token
    from public.players
   where room_id = v_room_id and uploader_id = p_uploader_id;

  if v_player_id is not null then
    return query select v_player_id, v_existing_token;
    return;
  end if;

  insert into public.players (room_id, uploader_id, session_token)
  values (v_room_id, p_uploader_id, v_token)
  returning id into v_player_id;

  return query select v_player_id, v_token;
end;
$$;

revoke all on function public.join_as_player(text, uuid) from public;
grant execute on function public.join_as_player(text, uuid) to anon;

-- ---------- RPC: submit_guess ------------------------------------------------
-- Returns void. The player intentionally does NOT learn whether they were
-- right; that information becomes available to everyone at reveal time.

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

  select id into v_player_id
    from public.players
   where room_id = v_room_id and session_token = p_session_token;
  if v_player_id is null then
    raise exception 'invalid session';
  end if;

  select uploader_id into v_actual_uploader_id
    from public.photos where id = p_photo_id;

  v_is_correct := (v_actual_uploader_id = p_guessed_uploader_id);

  insert into public.guesses (photo_id, player_id, guessed_uploader_id, is_correct)
  values (p_photo_id, v_player_id, p_guessed_uploader_id, v_is_correct)
  on conflict (photo_id, player_id) do nothing;
end;
$$;

revoke all on function public.submit_guess(text, text, uuid, uuid) from public;
grant execute on function public.submit_guess(text, text, uuid, uuid) to anon;

-- ---------- Realtime publication ---------------------------------------------
-- Supabase ships a `supabase_realtime` publication; we add our tables to it.

alter publication supabase_realtime add table
  public.rooms,
  public.uploaders,
  public.photos,
  public.players,
  public.guesses;

-- ---------- Cleanup: daily delete of expired rooms ---------------------------

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

-- Schedule daily cleanup, defensively: Supabase preview branches and local
-- supabase clones don't have pg_cron enabled, so the schedule is skipped
-- there with a notice instead of failing the whole migration.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cleanup-expired-rooms') then
      perform cron.unschedule('cleanup-expired-rooms');
    end if;
    perform cron.schedule(
      'cleanup-expired-rooms',
      '0 4 * * *',  -- 04:00 UTC daily
      $cmd$ select public.cleanup_expired_rooms() $cmd$
    );
  else
    raise notice 'pg_cron not installed; cleanup_expired_rooms() will not run on a schedule. Enable pg_cron in Supabase Dashboard → Database → Extensions if you want automatic cleanup.';
  end if;
end $$;
