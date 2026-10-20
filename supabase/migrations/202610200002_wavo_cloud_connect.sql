-- Additive Wavo Cloud / Connect schema. Existing social and listening tables are untouched.
-- Apply only after confirming the three earlier Wavo migrations in this project.

begin;

do $$
begin
  if to_regclass('public.wavo_profiles') is null or
     to_regclass('public.wavo_friendships') is null or
     to_regclass('public.wavo_messages') is null or
     to_regclass('public.wavo_listening_rooms') is null or
     to_regclass('public.wavo_listening_members') is null or
     to_regclass('public.wavo_listening_commands') is null then
    raise exception 'Existing Wavo social/listening schema is required before cloud migration';
  end if;
end;
$$;

create table if not exists public.wavo_sync_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('like', 'album', 'artist', 'catalog_playlist', 'playlist', 'history', 'queue', 'settings', 'theme', 'smart_rule', 'privacy')),
  document_id text not null check (char_length(document_id) between 1 and 500),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  last_mutation_id uuid,
  primary key (user_id, kind, document_id),
  constraint wavo_sync_payload_size check (octet_length(payload::text) <= case when kind = 'playlist' then 2000000 else 500000 end)
);
create index if not exists wavo_sync_documents_user_changed
  on public.wavo_sync_documents (user_id, updated_at, kind, document_id);
alter table public.wavo_sync_documents enable row level security;
revoke all on public.wavo_sync_documents from anon, authenticated;
drop policy if exists "Owners read cloud documents" on public.wavo_sync_documents;
create policy "Owners read cloud documents" on public.wavo_sync_documents
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.wavo_sync_documents to authenticated;

-- A privacy reset must also reject old plays uploaded by a device that was offline.
create table if not exists public.wavo_history_resets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cleared_before timestamptz not null
);
alter table public.wavo_history_resets enable row level security;
revoke all on public.wavo_history_resets from anon, authenticated;
drop policy if exists "Owners read history reset" on public.wavo_history_resets;
create policy "Owners read history reset" on public.wavo_history_resets
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.wavo_history_resets to authenticated;

-- Compare-and-swap protects concurrent devices. A repeated mutation ID is idempotent.
create or replace function public.wavo_apply_sync_document(
  p_kind text, p_document_id text, p_payload jsonb,
  p_deleted boolean, p_base_revision bigint, p_mutation_id uuid
)
returns table (applied boolean, server_revision bigint, server_payload jsonb,
  server_deleted boolean, server_updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := (select auth.uid());
  existing public.wavo_sync_documents%rowtype;
begin
  if owner is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_kind not in ('like', 'album', 'artist', 'catalog_playlist', 'playlist', 'history', 'queue', 'settings', 'theme', 'smart_rule', 'privacy') or
     p_document_id is null or char_length(p_document_id) not between 1 and 500 or
     p_payload is null or octet_length(p_payload::text) > case when p_kind = 'playlist' then 2000000 else 500000 end or
     p_deleted is null or p_base_revision is null or p_base_revision < 0 or p_mutation_id is null then
    raise exception 'Invalid sync document' using errcode = '22023';
  end if;

  if p_kind = 'history' and not p_deleted then
    if p_payload->>'listenedAt' is null then
      raise exception 'History timestamp is required' using errcode = '22023';
    end if;
    if exists (select 1 from public.wavo_history_resets r where r.user_id = owner and
      (p_payload->>'listenedAt')::timestamptz <= r.cleared_before) then
      p_payload := '{}'::jsonb;
      p_deleted := true;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text || ':' || p_kind || ':' || p_document_id, 0));
  select * into existing from public.wavo_sync_documents
    where user_id = owner and kind = p_kind and document_id = p_document_id for update;

  if found and existing.last_mutation_id = p_mutation_id then
    return query select true, existing.revision, existing.payload,
      existing.deleted_at is not null, existing.updated_at;
    return;
  end if;
  if (found and existing.revision <> p_base_revision) or (not found and p_base_revision <> 0) then
    return query select false, coalesce(existing.revision, 0::bigint),
      coalesce(existing.payload, '{}'::jsonb), existing.deleted_at is not null,
      existing.updated_at;
    return;
  end if;

  if found then
    update public.wavo_sync_documents d set
      payload = p_payload, revision = d.revision + 1,
      deleted_at = case when p_deleted then clock_timestamp() else null end,
      updated_at = clock_timestamp(), last_mutation_id = p_mutation_id
    where d.user_id = owner and d.kind = p_kind and d.document_id = p_document_id
    returning * into existing;
  else
    insert into public.wavo_sync_documents
      (user_id, kind, document_id, payload, deleted_at, last_mutation_id)
    values (owner, p_kind, p_document_id, p_payload,
      case when p_deleted then clock_timestamp() else null end, p_mutation_id)
    returning * into existing;
  end if;
  return query select true, existing.revision, existing.payload,
    existing.deleted_at is not null, existing.updated_at;
end;
$$;
revoke all on function public.wavo_apply_sync_document(text,text,jsonb,boolean,bigint,uuid) from public;
grant execute on function public.wavo_apply_sync_document(text,text,jsonb,boolean,bigint,uuid) to authenticated;

create table if not exists public.wavo_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  platform text not null check (char_length(platform) between 1 and 40),
  supports_volume boolean not null default true,
  accepts_control boolean not null default true,
  last_seen_at timestamptz not null default now(),
  playback_snapshot jsonb not null default '{}'::jsonb,
  primary key (user_id, device_id),
  constraint wavo_device_snapshot_size check (octet_length(playback_snapshot::text) <= 100000)
);
create index if not exists wavo_devices_online on public.wavo_devices (user_id, last_seen_at desc);
alter table public.wavo_devices enable row level security;
revoke all on public.wavo_devices from anon;
drop policy if exists "Owners manage devices" on public.wavo_devices;
create policy "Owners manage devices" on public.wavo_devices
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.wavo_devices to authenticated;

create table if not exists public.wavo_active_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id uuid not null,
  selected_at timestamptz not null default now(),
  foreign key (user_id, device_id) references public.wavo_devices(user_id, device_id) on delete cascade
);
alter table public.wavo_active_devices enable row level security;
revoke all on public.wavo_active_devices from anon;
drop policy if exists "Owners select playback device" on public.wavo_active_devices;
create policy "Owners select playback device" on public.wavo_active_devices
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.wavo_active_devices to authenticated;

create table if not exists public.wavo_device_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_device_id uuid not null,
  target_device_id uuid not null,
  kind text not null check (kind in ('play', 'pause', 'next', 'previous', 'seek', 'volume', 'queue', 'transfer')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds'),
  processed_at timestamptz,
  foreign key (user_id, source_device_id) references public.wavo_devices(user_id, device_id) on delete cascade,
  foreign key (user_id, target_device_id) references public.wavo_devices(user_id, device_id) on delete cascade,
  constraint wavo_device_command_size check (octet_length(payload::text) <= 100000),
  constraint wavo_device_command_distinct check (source_device_id <> target_device_id)
);
create index if not exists wavo_device_commands_pending
  on public.wavo_device_commands (user_id, target_device_id, created_at)
  where processed_at is null;
alter table public.wavo_device_commands enable row level security;
revoke all on public.wavo_device_commands from anon;
drop policy if exists "Owners read device commands" on public.wavo_device_commands;
create policy "Owners read device commands" on public.wavo_device_commands
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Owners send device commands" on public.wavo_device_commands;
create policy "Owners send device commands" on public.wavo_device_commands
  for insert to authenticated with check (
    user_id = (select auth.uid()) and processed_at is null and
    expires_at > now() and expires_at <= now() + interval '60 seconds' and
    exists (select 1 from public.wavo_devices d where d.user_id = (select auth.uid()) and
      d.device_id = target_device_id and d.accepts_control)
  );
drop policy if exists "Owners acknowledge device commands" on public.wavo_device_commands;
create policy "Owners acknowledge device commands" on public.wavo_device_commands
  for update to authenticated using (user_id = (select auth.uid()) and processed_at is null)
  with check (user_id = (select auth.uid()) and processed_at is not null);
grant select, insert on public.wavo_device_commands to authenticated;
grant update (processed_at) on public.wavo_device_commands to authenticated;

create table if not exists public.wavo_play_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null check (char_length(event_id) between 1 and 200),
  track_id text not null check (char_length(track_id) between 1 and 500),
  track_snapshot jsonb not null,
  context jsonb,
  played_duration_ms integer not null check (played_duration_ms between 0 and 86400000),
  completed boolean not null default false,
  skipped boolean not null default false,
  listened_at timestamptz not null default now(),
  primary key (user_id, event_id),
  constraint wavo_event_snapshot_size check (octet_length(track_snapshot::text) <= 50000)
);
create index if not exists wavo_play_events_time on public.wavo_play_events (user_id, listened_at desc);
create index if not exists wavo_play_events_track on public.wavo_play_events (user_id, track_id, listened_at desc);
alter table public.wavo_play_events enable row level security;
revoke all on public.wavo_play_events from anon;
drop policy if exists "Owners read play events" on public.wavo_play_events;
create policy "Owners read play events" on public.wavo_play_events
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Owners insert play events" on public.wavo_play_events;
create policy "Owners insert play events" on public.wavo_play_events
  for insert to authenticated with check (user_id = (select auth.uid()) and
    not exists (select 1 from public.wavo_history_resets r where r.user_id = (select auth.uid())
      and listened_at <= r.cleared_before));
drop policy if exists "Owners delete play events" on public.wavo_play_events;
create policy "Owners delete play events" on public.wavo_play_events
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.wavo_play_events to authenticated;

-- A privacy reset also covers older history documents no longer kept in local storage.
create or replace function public.wavo_clear_listening_history(p_before timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid := (select auth.uid());
begin
  if owner is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_before is null or p_before > now() + interval '5 minutes' then
    raise exception 'Invalid cutoff' using errcode = '22023';
  end if;
  insert into public.wavo_history_resets (user_id, cleared_before) values (owner, p_before)
    on conflict (user_id) do update set cleared_before =
      greatest(public.wavo_history_resets.cleared_before, excluded.cleared_before);
  delete from public.wavo_play_events where user_id = owner and listened_at <= p_before;
  update public.wavo_sync_documents set payload = '{}'::jsonb, deleted_at = clock_timestamp(),
    updated_at = clock_timestamp(), revision = revision + 1, last_mutation_id = null
    where user_id = owner and kind = 'history' and deleted_at is null and updated_at <= p_before;
end;
$$;
revoke all on function public.wavo_clear_listening_history(timestamptz) from public;
grant execute on function public.wavo_clear_listening_history(timestamptz) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['wavo_sync_documents','wavo_devices','wavo_active_devices','wavo_device_commands'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute pg_catalog.format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';

commit;
