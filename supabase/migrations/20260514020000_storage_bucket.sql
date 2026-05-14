-- Create the room-photos storage bucket and the anon-accessible policies
-- the upload flow needs.
--
-- Public bucket: photo paths are unguessable UUIDs (room_id/<uuid>.jpg)
-- and every object is reaped with its room on the 7-day cleanup cron, so
-- there's nothing for an attacker to enumerate.
--
-- Anon write: the upload page hits Storage directly with the anon key.
-- add_photo() then validates the upload_token before registering the row
-- in `photos`, so a malicious anon can only upload orphaned junk that the
-- cleanup cron will eventually delete.
--
-- file_size_limit caps individual uploads at 10 MB; the client resizes
-- to ~1600px / 80% JPEG before upload so real uploads come in well under
-- that, but the cap protects the free-tier quota from accidental abuse.

insert into storage.buckets (id, name, public, file_size_limit)
values ('room-photos', 'room-photos', true, 10485760)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Policies are idempotent: drop-if-exists then create.
drop policy if exists "anon read room-photos" on storage.objects;
create policy "anon read room-photos"
  on storage.objects for select
  using (bucket_id = 'room-photos');

drop policy if exists "anon write room-photos" on storage.objects;
create policy "anon write room-photos"
  on storage.objects for insert to anon
  with check (bucket_id = 'room-photos');
