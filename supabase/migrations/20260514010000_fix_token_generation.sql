-- Fix: _generate_token() was calling gen_random_bytes(), which lives in the
-- pgcrypto extension. On hosted Supabase pgcrypto is pre-installed into the
-- `extensions` schema, but our SECURITY DEFINER RPCs run with
-- `search_path = public`, so the function can't be resolved and every
-- create_room / add_uploader / join_as_player call fails with
-- "function gen_random_bytes(integer) does not exist".
--
-- Switching to two concatenated gen_random_uuid()s gives 252 bits of
-- entropy from a function that's built into Postgres core (pg_catalog),
-- so search_path stops mattering. The token shape changes from
-- base64(24 bytes) to 64 hex characters; any tokens issued before this
-- migration are still valid (they're stored as opaque strings).

create or replace function public._generate_token()
returns text
language sql
as $$
  select replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
$$;
