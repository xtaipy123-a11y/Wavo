-- Additive extensions to the existing friendships and listening rooms.
-- Existing rows, invitations, permissions, and messages are retained.

begin;

do $$
begin
  if to_regclass('public.wavo_friendships') is null or
     to_regclass('public.wavo_listening_rooms') is null or
     to_regprocedure('public.wavo_is_room_host(uuid)') is null or
     to_regprocedure('public.wavo_is_active_listener(uuid)') is null or
     not exists (select 1 from information_schema.columns where table_schema = 'public'
       and table_name = 'wavo_listening_rooms' and column_name = 'queue_snapshot') then
    raise exception 'Existing Wavo friendship and listening queue schema is required before social extension';
  end if;
end;
$$;

create table if not exists public.wavo_shared_playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_playlist_id text not null check (char_length(source_playlist_id) between 1 and 500),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_playlist_id)
);

create table if not exists public.wavo_playlist_collaborators (
  playlist_id uuid not null references public.wavo_shared_playlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'invited' check (status in ('invited', 'active')),
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (playlist_id, user_id)
);
create index if not exists wavo_playlist_collaborators_user on public.wavo_playlist_collaborators (user_id, status);

-- These functions avoid recursive RLS checks across playlists and collaborators.
create or replace function public.wavo_can_read_shared_playlist(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wavo_shared_playlists p where p.id = p_id and
      (p.owner_id = (select auth.uid()) or exists (
        select 1 from public.wavo_playlist_collaborators c
        where c.playlist_id = p.id and c.user_id = (select auth.uid()) and c.status in ('invited', 'active')
      ))
  );
$$;
create or replace function public.wavo_can_edit_shared_playlist(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wavo_shared_playlists p where p.id = p_id and
      (p.owner_id = (select auth.uid()) or exists (
        select 1 from public.wavo_playlist_collaborators c
        where c.playlist_id = p.id and c.user_id = (select auth.uid()) and
          c.status = 'active' and c.role = 'editor'
      ))
  );
$$;
revoke all on function public.wavo_can_read_shared_playlist(uuid), public.wavo_can_edit_shared_playlist(uuid) from public;
grant execute on function public.wavo_can_read_shared_playlist(uuid), public.wavo_can_edit_shared_playlist(uuid) to authenticated;

create table if not exists public.wavo_shared_playlist_items (
  playlist_id uuid not null references public.wavo_shared_playlists(id) on delete cascade,
  item_id uuid not null default gen_random_uuid(),
  track_id text not null check (char_length(track_id) between 1 and 500),
  track_snapshot jsonb not null check (octet_length(track_snapshot::text) <= 50000),
  position numeric not null default 0,
  added_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (playlist_id, item_id),
  unique (playlist_id, track_id)
);
create index if not exists wavo_shared_playlist_items_order on public.wavo_shared_playlist_items (playlist_id, position, item_id);

alter table public.wavo_shared_playlists enable row level security;
alter table public.wavo_playlist_collaborators enable row level security;
alter table public.wavo_shared_playlist_items enable row level security;
revoke all on public.wavo_shared_playlists, public.wavo_playlist_collaborators, public.wavo_shared_playlist_items from anon;

drop policy if exists "Participants read shared playlists" on public.wavo_shared_playlists;
create policy "Participants read shared playlists" on public.wavo_shared_playlists
  for select to authenticated using (public.wavo_can_read_shared_playlist(id));
drop policy if exists "Owners create shared playlists" on public.wavo_shared_playlists;
create policy "Owners create shared playlists" on public.wavo_shared_playlists
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "Editors update shared playlists" on public.wavo_shared_playlists;
create policy "Editors update shared playlists" on public.wavo_shared_playlists
  for update to authenticated using (public.wavo_can_edit_shared_playlist(id))
  with check (public.wavo_can_edit_shared_playlist(id));
drop policy if exists "Owners delete shared playlists" on public.wavo_shared_playlists;
create policy "Owners delete shared playlists" on public.wavo_shared_playlists
  for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, delete on public.wavo_shared_playlists to authenticated;
grant update (title, description, updated_at) on public.wavo_shared_playlists to authenticated;

drop policy if exists "Participants read playlist invitations" on public.wavo_playlist_collaborators;
create policy "Participants read playlist invitations" on public.wavo_playlist_collaborators
  for select to authenticated using (
    user_id = (select auth.uid()) or public.wavo_can_read_shared_playlist(playlist_id)
  );
drop policy if exists "Owners invite friends to playlists" on public.wavo_playlist_collaborators;
create policy "Owners invite friends to playlists" on public.wavo_playlist_collaborators
  for insert to authenticated with check (
    invited_by = (select auth.uid()) and user_id <> (select auth.uid()) and
    status = 'invited' and joined_at is null and
    exists (select 1 from public.wavo_shared_playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())) and
    exists (select 1 from public.wavo_friendships f where f.status = 'accepted' and
      ((f.requester_id = (select auth.uid()) and f.addressee_id = user_id) or
       (f.addressee_id = (select auth.uid()) and f.requester_id = user_id)))
  );
drop policy if exists "Invitees accept playlist access" on public.wavo_playlist_collaborators;
create policy "Invitees accept playlist access" on public.wavo_playlist_collaborators
  for update to authenticated using (user_id = (select auth.uid()) and status = 'invited')
  with check (user_id = (select auth.uid()) and status = 'active' and joined_at is not null);
drop policy if exists "Owners and invitees remove access" on public.wavo_playlist_collaborators;
create policy "Owners and invitees remove access" on public.wavo_playlist_collaborators
  for delete to authenticated using (user_id = (select auth.uid()) or exists (
    select 1 from public.wavo_shared_playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())
  ));
grant select, insert, delete on public.wavo_playlist_collaborators to authenticated;
grant update (status, joined_at) on public.wavo_playlist_collaborators to authenticated;

drop policy if exists "Participants read shared tracks" on public.wavo_shared_playlist_items;
create policy "Participants read shared tracks" on public.wavo_shared_playlist_items
  for select to authenticated using (public.wavo_can_read_shared_playlist(playlist_id));
drop policy if exists "Editors add shared tracks" on public.wavo_shared_playlist_items;
create policy "Editors add shared tracks" on public.wavo_shared_playlist_items
  for insert to authenticated with check (public.wavo_can_edit_shared_playlist(playlist_id) and added_by = (select auth.uid()));
drop policy if exists "Editors update shared tracks" on public.wavo_shared_playlist_items;
create policy "Editors update shared tracks" on public.wavo_shared_playlist_items
  for update to authenticated using (public.wavo_can_edit_shared_playlist(playlist_id))
  with check (public.wavo_can_edit_shared_playlist(playlist_id));
drop policy if exists "Editors remove shared tracks" on public.wavo_shared_playlist_items;
create policy "Editors remove shared tracks" on public.wavo_shared_playlist_items
  for delete to authenticated using (public.wavo_can_edit_shared_playlist(playlist_id));
grant select, insert, delete on public.wavo_shared_playlist_items to authenticated;
grant update (position, updated_at) on public.wavo_shared_playlist_items to authenticated;

create table if not exists public.wavo_listening_votes (
  room_id uuid not null references public.wavo_listening_rooms(id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 500),
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, track_id, voter_id)
);
create index if not exists wavo_listening_votes_track on public.wavo_listening_votes (room_id, track_id);
alter table public.wavo_listening_votes enable row level security;
revoke all on public.wavo_listening_votes from anon;
drop policy if exists "Room participants read votes" on public.wavo_listening_votes;
create policy "Room participants read votes" on public.wavo_listening_votes
  for select to authenticated using (public.wavo_is_room_host(room_id) or public.wavo_is_active_listener(room_id));
drop policy if exists "Room participants vote once" on public.wavo_listening_votes;
create policy "Room participants vote once" on public.wavo_listening_votes
  for insert to authenticated with check (
    voter_id = (select auth.uid()) and
    (public.wavo_is_room_host(room_id) or public.wavo_is_active_listener(room_id)) and
    exists (select 1 from public.wavo_listening_rooms r where r.id = room_id and r.active and
      exists (select 1 from jsonb_array_elements(r.queue_snapshot) item where item->>'id' = track_id))
  );
drop policy if exists "Voters withdraw votes" on public.wavo_listening_votes;
create policy "Voters withdraw votes" on public.wavo_listening_votes
  for delete to authenticated using (voter_id = (select auth.uid()));
grant select, insert, delete on public.wavo_listening_votes to authenticated;

create table if not exists public.wavo_friend_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  visibility text not null default 'nobody' check (visibility in ('nobody', 'friends')),
  track_id text check (track_id is null or char_length(track_id) <= 500),
  track_title text check (track_title is null or char_length(track_title) <= 500),
  artist_name text check (artist_name is null or char_length(artist_name) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.wavo_friend_activity enable row level security;
revoke all on public.wavo_friend_activity from anon;
drop policy if exists "Owners and friends read activity" on public.wavo_friend_activity;
create policy "Owners and friends read activity" on public.wavo_friend_activity
  for select to authenticated using (
    user_id = (select auth.uid()) or (visibility = 'friends' and updated_at > now() - interval '2 minutes' and exists (
      select 1 from public.wavo_friendships f where f.status = 'accepted' and
        ((f.requester_id = user_id and f.addressee_id = (select auth.uid())) or
         (f.addressee_id = user_id and f.requester_id = (select auth.uid())))
    ))
  );
drop policy if exists "Owners publish activity" on public.wavo_friend_activity;
create policy "Owners publish activity" on public.wavo_friend_activity
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.wavo_friend_activity to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['wavo_shared_playlists','wavo_playlist_collaborators','wavo_shared_playlist_items','wavo_listening_votes','wavo_friend_activity'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute pg_catalog.format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';

commit;
