-- Run after 202610200001_wavo_listening_queue.sql in the Supabase SQL Editor.
-- A listening room can carry one playlist: its identity, a full track snapshot
-- for guests, and the host's repeat/shuffle choices.
alter table public.wavo_listening_rooms
  add column if not exists playlist_id text,
  add column if not exists playlist_title text,
  add column if not exists playlist_cover_url text,
  add column if not exists playlist_track_count integer not null default 0,
  add column if not exists playlist_duration_ms integer not null default 0,
  add column if not exists playlist_tracks jsonb not null default '[]'::jsonb,
  add column if not exists repeat_mode text not null default 'off',
  add column if not exists shuffle boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_playlist_id') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_playlist_id
      check (playlist_id is null or char_length(playlist_id) between 1 and 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_playlist_title') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_playlist_title
      check (playlist_title is null or char_length(playlist_title) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_playlist_cover') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_playlist_cover
      check (playlist_cover_url is null or char_length(playlist_cover_url) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_playlist_count') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_playlist_count
      check (playlist_track_count between 0 and 10000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_playlist_duration') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_playlist_duration
      check (playlist_duration_ms between 0 and 864000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_playlist_tracks_array') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_playlist_tracks_array
      check (jsonb_typeof(playlist_tracks) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_repeat_mode') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_repeat_mode
      check (repeat_mode in ('off', 'all', 'one'));
  end if;
end;
$$;

-- Kept outside the block above so re-running the migration can widen an
-- existing limit after the snapshot format changes.
alter table public.wavo_listening_rooms
  drop constraint if exists wavo_listening_playlist_tracks_size;
alter table public.wavo_listening_rooms
  add constraint wavo_listening_playlist_tracks_size
  check (octet_length(playlist_tracks::text) <= 1000000);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wavo_listening_rooms') then
    alter publication supabase_realtime add table public.wavo_listening_rooms;
  end if;
end;
$$;
notify pgrst, 'reload schema';
