-- Run after 202610190002_wavo_listening_rooms.sql in the Supabase SQL Editor.
-- The host owns playback; guests submit permission-checked queue requests.
alter table public.wavo_listening_rooms
  add column if not exists allow_guest_add boolean not null default true,
  add column if not exists allow_guest_skip boolean not null default false,
  add column if not exists allow_guest_reorder boolean not null default false,
  add column if not exists queue_snapshot jsonb not null default '[]'::jsonb;

alter table public.wavo_listening_members
  add column if not exists can_add boolean,
  add column if not exists can_skip boolean,
  add column if not exists can_reorder boolean;

create or replace function public.wavo_guard_listening_member()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.room_id <> old.room_id or new.user_id <> old.user_id or
     new.invited_by <> old.invited_by or new.created_at <> old.created_at then
    raise exception 'Listening membership identity cannot change';
  end if;
  if old.status = 'invited' and new.status = 'active' and
     new.user_id = (select auth.uid()) and
     new.can_add is not distinct from old.can_add and
     new.can_skip is not distinct from old.can_skip and
     new.can_reorder is not distinct from old.can_reorder then
    new.joined_at := clock_timestamp();
    return new;
  end if;
  if old.status = 'active' and new.status = 'active' and
     new.joined_at is not distinct from old.joined_at and
     public.wavo_is_room_host(old.room_id) then
    return new;
  end if;
  raise exception 'Only invite acceptance or host permission changes are allowed';
end;
$$;

drop policy if exists "Hosts set member permissions" on public.wavo_listening_members;
create policy "Hosts set member permissions" on public.wavo_listening_members
for update to authenticated using (status = 'active' and public.wavo_is_room_host(room_id))
with check (status = 'active' and public.wavo_is_room_host(room_id));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_queue_array') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_queue_array check (jsonb_typeof(queue_snapshot) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wavo_listening_queue_size') then
    alter table public.wavo_listening_rooms
      add constraint wavo_listening_queue_size check (octet_length(queue_snapshot::text) <= 100000);
  end if;
end;
$$;

create table if not exists public.wavo_listening_commands (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.wavo_listening_rooms(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('add', 'skip', 'move')),
  track_id text check (track_id is null or char_length(track_id) between 1 and 500),
  from_index integer check (from_index is null or from_index between 0 and 9999),
  to_index integer check (to_index is null or to_index between 0 and 9999),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint wavo_listening_command_shape check (
    (kind = 'add' and track_id is not null and from_index is null and to_index is null) or
    (kind = 'skip' and track_id is null and from_index is null and to_index is null) or
    (kind = 'move' and track_id is null and from_index is not null and to_index is not null)
  )
);
create index if not exists wavo_listening_commands_pending
  on public.wavo_listening_commands (room_id, created_at, id) where processed_at is null;

create or replace function public.wavo_guard_listening_command()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.room_id <> old.room_id or new.actor_id <> old.actor_id or
     new.kind <> old.kind or new.track_id is distinct from old.track_id or
     new.from_index is distinct from old.from_index or new.to_index is distinct from old.to_index or
     new.created_at <> old.created_at or old.processed_at is not null or new.processed_at is null then
    raise exception 'Only pending commands may be marked processed';
  end if;
  return new;
end;
$$;
drop trigger if exists wavo_listening_command_update on public.wavo_listening_commands;
create trigger wavo_listening_command_update before update on public.wavo_listening_commands
for each row execute function public.wavo_guard_listening_command();

alter table public.wavo_listening_commands enable row level security;
revoke all on public.wavo_listening_commands from anon;
drop policy if exists "Room participants can read queue commands" on public.wavo_listening_commands;
create policy "Room participants can read queue commands" on public.wavo_listening_commands
for select to authenticated using (
  public.wavo_is_room_host(room_id) or public.wavo_is_active_listener(room_id)
);
drop policy if exists "Participants may request permitted queue actions" on public.wavo_listening_commands;
create policy "Participants may request permitted queue actions" on public.wavo_listening_commands
for insert to authenticated with check (
  actor_id = (select auth.uid()) and processed_at is null and
  (public.wavo_is_room_host(room_id) or
    (public.wavo_is_active_listener(room_id) and exists (
      select 1 from public.wavo_listening_rooms r
      join public.wavo_listening_members m on m.room_id = r.id and m.user_id = (select auth.uid()) and m.status = 'active'
      where r.id = room_id and r.active and
        ((kind = 'add' and coalesce(m.can_add, r.allow_guest_add)) or
         (kind = 'skip' and coalesce(m.can_skip, r.allow_guest_skip)) or
         (kind = 'move' and coalesce(m.can_reorder, r.allow_guest_reorder)))
    )))
);
drop policy if exists "Hosts mark queue commands processed" on public.wavo_listening_commands;
create policy "Hosts mark queue commands processed" on public.wavo_listening_commands
for update to authenticated using (public.wavo_is_room_host(room_id) and processed_at is null)
with check (public.wavo_is_room_host(room_id));
grant select, insert, update on public.wavo_listening_commands to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wavo_listening_commands') then
    alter publication supabase_realtime add table public.wavo_listening_commands;
  end if;
end;
$$;
notify pgrst, 'reload schema';
