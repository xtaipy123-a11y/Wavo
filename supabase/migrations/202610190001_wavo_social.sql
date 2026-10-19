-- Run this migration once in the Supabase SQL Editor for the Wavo project.
-- The desktop client uses only the publishable key; RLS protects every row.
create table if not exists public.wavo_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint wavo_username_format check (username ~ '^[a-z0-9_]{3,40}$')
);

create or replace function public.wavo_sync_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_name text;
begin
  requested_name := left(lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9_]', '', 'g')), 40);
  if length(requested_name) < 3 then requested_name := 'user_' || left(replace(new.id::text, '-', ''), 12); end if;
  insert into public.wavo_profiles (user_id, username, display_name, avatar_url)
  values (
    new.id,
    requested_name,
    left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), requested_name), 80),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url;
  return new;
exception when unique_violation then
  insert into public.wavo_profiles (user_id, username, display_name, avatar_url)
  values (
    new.id,
    'user_' || left(replace(new.id::text, '-', ''), 12),
    left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'Wavo user'), 80),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists wavo_profile_on_auth_user on auth.users;
create trigger wavo_profile_on_auth_user
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.wavo_sync_profile();

do $$
declare
  existing_user record;
  requested_name text;
begin
  for existing_user in select id, raw_user_meta_data from auth.users loop
    requested_name := left(lower(regexp_replace(coalesce(existing_user.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9_]', '', 'g')), 40);
    if length(requested_name) < 3 then requested_name := 'user_' || left(replace(existing_user.id::text, '-', ''), 12); end if;
    begin
      insert into public.wavo_profiles (user_id, username, display_name, avatar_url)
      values (
        existing_user.id,
        requested_name,
        left(coalesce(nullif(existing_user.raw_user_meta_data->>'display_name', ''), requested_name), 80),
        nullif(existing_user.raw_user_meta_data->>'avatar_url', '')
      )
      on conflict (user_id) do nothing;
    exception when unique_violation then
      insert into public.wavo_profiles (user_id, username, display_name, avatar_url)
      values (
        existing_user.id,
        'user_' || left(replace(existing_user.id::text, '-', ''), 12),
        left(coalesce(nullif(existing_user.raw_user_meta_data->>'display_name', ''), 'Wavo user'), 80),
        nullif(existing_user.raw_user_meta_data->>'avatar_url', '')
      )
      on conflict (user_id) do nothing;
    end;
  end loop;
end;
$$;

create table if not exists public.wavo_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wavo_no_self_friendship check (requester_id <> addressee_id)
);
create unique index if not exists wavo_friendship_pair
on public.wavo_friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create or replace function public.wavo_guard_friendship_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id or
     new.created_at <> old.created_at or old.status <> 'pending' or new.status <> 'accepted' then
    raise exception 'Only accepting a pending friendship is allowed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists wavo_friendship_update_guard on public.wavo_friendships;
create trigger wavo_friendship_update_guard before update on public.wavo_friendships
for each row execute function public.wavo_guard_friendship_update();

create table if not exists public.wavo_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  playlist_snapshot jsonb,
  created_at timestamptz not null default now(),
  constraint wavo_message_content check (char_length(trim(body)) > 0 or playlist_snapshot is not null),
  constraint wavo_message_snapshot_size check (playlist_snapshot is null or octet_length(playlist_snapshot::text) <= 500000),
  constraint wavo_message_distinct_users check (sender_id <> recipient_id)
);
create index if not exists wavo_messages_conversation on public.wavo_messages (sender_id, recipient_id, created_at desc);
create index if not exists wavo_messages_received on public.wavo_messages (recipient_id, created_at desc);

alter table public.wavo_profiles enable row level security;
alter table public.wavo_friendships enable row level security;
alter table public.wavo_messages enable row level security;

revoke all on public.wavo_profiles, public.wavo_friendships, public.wavo_messages from anon;

create policy "Signed-in users can find profiles" on public.wavo_profiles
for select to authenticated using (true);

create policy "Participants can read friendships" on public.wavo_friendships
for select to authenticated using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy "Users can invite others" on public.wavo_friendships
for insert to authenticated with check (requester_id = (select auth.uid()) and status = 'pending');
create policy "Recipients can accept invitations" on public.wavo_friendships
for update to authenticated using (addressee_id = (select auth.uid()) and status = 'pending')
with check (addressee_id = (select auth.uid()) and status = 'accepted');
create policy "Participants can remove friendships" on public.wavo_friendships
for delete to authenticated using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

create policy "Participants can read messages" on public.wavo_messages
for select to authenticated using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "Friends can send messages" on public.wavo_messages
for insert to authenticated with check (
  sender_id = (select auth.uid()) and exists (
    select 1 from public.wavo_friendships f
    where f.status = 'accepted' and
      ((f.requester_id = sender_id and f.addressee_id = recipient_id) or
       (f.addressee_id = sender_id and f.requester_id = recipient_id))
  )
);

grant select on public.wavo_profiles to authenticated;
grant select, insert, update, delete on public.wavo_friendships to authenticated;
grant select, insert on public.wavo_messages to authenticated;

-- Supabase Realtime broadcasts only rows visible through the policies above.
alter publication supabase_realtime add table public.wavo_friendships;
alter publication supabase_realtime add table public.wavo_messages;

-- Make the new tables visible to the Supabase Data API immediately.
notify pgrst, 'reload schema';
