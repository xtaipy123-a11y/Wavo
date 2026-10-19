-- Run after 202610190001_wavo_social.sql in the Wavo Supabase SQL Editor.
-- Every participant streams the same catalog track on their own device.
create table if not exists public.wavo_listening_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  track_id text check (track_id is null or char_length(track_id) between 1 and 500),
  track_title text check (track_title is null or char_length(track_title) <= 500),
  position_ms integer not null default 0 check (position_ms between 0 and 86400000),
  is_playing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wavo_listening_rooms_host on public.wavo_listening_rooms (host_id, created_at desc);
create unique index if not exists wavo_one_active_listening_room_per_host
on public.wavo_listening_rooms (host_id) where active;

create table if not exists public.wavo_listening_members (
  room_id uuid not null references public.wavo_listening_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('invited', 'active')),
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (room_id, user_id)
);
create index if not exists wavo_listening_members_user on public.wavo_listening_members (user_id, status, created_at desc);

-- Security-definer lookups avoid recursive RLS checks when a room and its
-- membership are queried together. They expose no data to the client.
create or replace function public.wavo_is_active_listener(room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wavo_listening_members m
    where m.room_id = room and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;
create or replace function public.wavo_is_room_host(room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wavo_listening_rooms r
    where r.id = room and r.host_id = (select auth.uid()) and r.active
  );
$$;
create or replace function public.wavo_room_is_active(room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.wavo_listening_rooms r where r.id = room and r.active);
$$;
revoke all on function public.wavo_is_active_listener(uuid), public.wavo_is_room_host(uuid), public.wavo_room_is_active(uuid) from public;
grant execute on function public.wavo_is_active_listener(uuid), public.wavo_is_room_host(uuid), public.wavo_room_is_active(uuid) to authenticated;

create or replace function public.wavo_add_listening_host()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.wavo_listening_members (room_id, user_id, invited_by, status, joined_at)
  values (new.id, new.host_id, new.host_id, 'active', now());
  return new;
end;
$$;
drop trigger if exists wavo_listening_host_member on public.wavo_listening_rooms;
create trigger wavo_listening_host_member after insert on public.wavo_listening_rooms
for each row execute function public.wavo_add_listening_host();

create or replace function public.wavo_guard_listening_room()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.host_id <> old.host_id or new.created_at <> old.created_at or not old.active then
    raise exception 'Room identity cannot change and ended rooms cannot restart';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists wavo_listening_room_update on public.wavo_listening_rooms;
create trigger wavo_listening_room_update before update on public.wavo_listening_rooms
for each row execute function public.wavo_guard_listening_room();

create or replace function public.wavo_guard_listening_member()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.room_id <> old.room_id or new.user_id <> old.user_id or
     new.invited_by <> old.invited_by or new.created_at <> old.created_at or
     old.status <> 'invited' or new.status <> 'active' then
    raise exception 'Only accepting a pending listening invitation is allowed';
  end if;
  new.joined_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists wavo_listening_member_update on public.wavo_listening_members;
create trigger wavo_listening_member_update before update on public.wavo_listening_members
for each row execute function public.wavo_guard_listening_member();

alter table public.wavo_listening_rooms enable row level security;
alter table public.wavo_listening_members enable row level security;
revoke all on public.wavo_listening_rooms, public.wavo_listening_members from anon;

create policy "Participants can read listening rooms" on public.wavo_listening_rooms
for select to authenticated using (
  host_id = (select auth.uid()) or exists (
    select 1 from public.wavo_listening_members m
    where m.room_id = id and m.user_id = (select auth.uid())
  )
);
create policy "Users can host listening rooms" on public.wavo_listening_rooms
for insert to authenticated with check (host_id = (select auth.uid()) and active);
create policy "Hosts control their listening rooms" on public.wavo_listening_rooms
for update to authenticated using (host_id = (select auth.uid()) and active)
with check (host_id = (select auth.uid()));

create policy "Participants can see room members" on public.wavo_listening_members
for select to authenticated using (user_id = (select auth.uid()) or public.wavo_is_active_listener(room_id));
create policy "Hosts can invite accepted friends" on public.wavo_listening_members
for insert to authenticated with check (
  public.wavo_is_room_host(room_id) and invited_by = (select auth.uid()) and
  user_id <> (select auth.uid()) and status = 'invited' and joined_at is null and
  exists (
    select 1 from public.wavo_friendships f
    where f.status = 'accepted' and
      ((f.requester_id = (select auth.uid()) and f.addressee_id = user_id) or
       (f.addressee_id = (select auth.uid()) and f.requester_id = user_id))
  )
);
create policy "Invitees can join active rooms" on public.wavo_listening_members
for update to authenticated using (user_id = (select auth.uid()) and status = 'invited')
with check (user_id = (select auth.uid()) and status = 'active' and public.wavo_room_is_active(room_id));
create policy "Members may leave and hosts may remove members" on public.wavo_listening_members
for delete to authenticated using (user_id = (select auth.uid()) or public.wavo_is_room_host(room_id));

grant select, insert, update on public.wavo_listening_rooms to authenticated;
grant select, insert, update, delete on public.wavo_listening_members to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wavo_listening_rooms') then
    alter publication supabase_realtime add table public.wavo_listening_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wavo_listening_members') then
    alter publication supabase_realtime add table public.wavo_listening_members;
  end if;
end;
$$;
notify pgrst, 'reload schema';
