-- Private user music and releases. Apply after the existing Wavo social migration.
-- No existing friendships, messages, playlists or listening rooms are changed.
do $$ begin
  if to_regclass('public.wavo_friendships') is null or to_regclass('public.wavo_messages') is null then
    raise exception 'Install the existing Wavo social schema before private music';
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wavo-private-music', 'wavo-private-music', false, 52428800,
  array['audio/mpeg','audio/wav','audio/x-wav','audio/flac','audio/mp4','audio/aac',
        'audio/ogg','audio/webm','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.wavo_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  artist_name text not null check (char_length(trim(artist_name)) between 1 and 200),
  duration_ms integer not null default 0 check (duration_ms between 0 and 86400000),
  mime_type text not null check (mime_type in ('audio/mpeg','audio/wav','audio/x-wav','audio/flac','audio/mp4','audio/aac','audio/ogg','audio/webm')),
  byte_size bigint not null check (byte_size between 1 and 52428800),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint wavo_upload_owner_path check (storage_path like owner_id::text || '/audio/' || id::text || '.%')
);
create index if not exists wavo_uploads_owner_created on public.wavo_uploads (owner_id, created_at desc);

create table if not exists public.wavo_releases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('single','ep','album')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  artist_name text not null check (char_length(trim(artist_name)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wavo_release_cover_path check (cover_path is null or cover_path like owner_id::text || '/covers/' || id::text || '.%')
);
create index if not exists wavo_releases_owner_created on public.wavo_releases (owner_id, created_at desc);

create table if not exists public.wavo_release_tracks (
  release_id uuid not null references public.wavo_releases(id) on delete cascade,
  upload_id uuid not null references public.wavo_uploads(id) on delete cascade,
  position integer not null check (position between 0 and 999),
  primary key (release_id, upload_id),
  unique (release_id, position)
);
create index if not exists wavo_release_tracks_upload on public.wavo_release_tracks (upload_id);

create table if not exists public.wavo_release_grants (
  release_id uuid not null references public.wavo_releases(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  access_mode text not null check (access_mode in ('friend','link')),
  created_at timestamptz not null default now(),
  primary key (release_id, recipient_id)
);
create index if not exists wavo_release_grants_recipient on public.wavo_release_grants (recipient_id, created_at desc);

create table if not exists public.wavo_release_links (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{32}$'),
  release_id uuid not null references public.wavo_releases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  claim_count integer not null default 0 check (claim_count between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists wavo_release_links_owner on public.wavo_release_links (owner_id, release_id);

create or replace function public.wavo_can_access_release(p_release_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wavo_releases r where r.id = p_release_id and
      (r.owner_id = (select auth.uid()) or exists (
        select 1 from public.wavo_release_grants g
        where g.release_id = r.id and g.recipient_id = (select auth.uid()) and
          (g.access_mode = 'link' or exists (
            select 1 from public.wavo_friendships f where f.status = 'accepted' and
              ((f.requester_id = r.owner_id and f.addressee_id = g.recipient_id) or
               (f.addressee_id = r.owner_id and f.requester_id = g.recipient_id))
          ))
      ))
  );
$$;

create or replace function public.wavo_can_access_upload(p_upload_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wavo_uploads u where u.id = p_upload_id and
      (u.owner_id = (select auth.uid()) or exists (
        select 1 from public.wavo_release_tracks rt where rt.upload_id = u.id and
          public.wavo_can_access_release(rt.release_id)
      ))
  );
$$;

create or replace function public.wavo_can_access_media_path(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select split_part(p_path, '/', 1) = (select auth.uid())::text or
    exists (select 1 from public.wavo_uploads u where u.storage_path = p_path and public.wavo_can_access_upload(u.id)) or
    exists (select 1 from public.wavo_releases r where r.cover_path = p_path and public.wavo_can_access_release(r.id));
$$;

revoke all on function public.wavo_can_access_release(uuid), public.wavo_can_access_upload(uuid),
  public.wavo_can_access_media_path(text) from public;
grant execute on function public.wavo_can_access_release(uuid), public.wavo_can_access_upload(uuid),
  public.wavo_can_access_media_path(text) to authenticated;

alter table public.wavo_uploads enable row level security;
alter table public.wavo_releases enable row level security;
alter table public.wavo_release_tracks enable row level security;
alter table public.wavo_release_grants enable row level security;
alter table public.wavo_release_links enable row level security;
revoke all on public.wavo_uploads, public.wavo_releases, public.wavo_release_tracks,
  public.wavo_release_grants, public.wavo_release_links from anon;

drop policy if exists "Accessible private uploads" on public.wavo_uploads;
create policy "Accessible private uploads" on public.wavo_uploads for select to authenticated
  using (public.wavo_can_access_upload(id));
drop policy if exists "Owners create uploads" on public.wavo_uploads;
create policy "Owners create uploads" on public.wavo_uploads for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists "Owners edit uploads" on public.wavo_uploads;
create policy "Owners edit uploads" on public.wavo_uploads for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Owners remove uploads" on public.wavo_uploads;
create policy "Owners remove uploads" on public.wavo_uploads for delete to authenticated
  using (owner_id = (select auth.uid()));
grant select, insert, delete on public.wavo_uploads to authenticated;
grant update (title, artist_name, duration_ms) on public.wavo_uploads to authenticated;

drop policy if exists "Accessible private releases" on public.wavo_releases;
create policy "Accessible private releases" on public.wavo_releases for select to authenticated
  using (public.wavo_can_access_release(id));
drop policy if exists "Owners create releases" on public.wavo_releases;
create policy "Owners create releases" on public.wavo_releases for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists "Owners edit releases" on public.wavo_releases;
create policy "Owners edit releases" on public.wavo_releases for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Owners remove releases" on public.wavo_releases;
create policy "Owners remove releases" on public.wavo_releases for delete to authenticated
  using (owner_id = (select auth.uid()));
grant select, insert, delete on public.wavo_releases to authenticated;
grant update (title, artist_name, description, cover_path, updated_at) on public.wavo_releases to authenticated;

drop policy if exists "Accessible release tracks" on public.wavo_release_tracks;
create policy "Accessible release tracks" on public.wavo_release_tracks for select to authenticated
  using (public.wavo_can_access_release(release_id));
drop policy if exists "Owners add their uploads" on public.wavo_release_tracks;
create policy "Owners add their uploads" on public.wavo_release_tracks for insert to authenticated
  with check (exists (select 1 from public.wavo_releases r where r.id = release_id and r.owner_id = (select auth.uid()))
    and exists (select 1 from public.wavo_uploads u where u.id = upload_id and u.owner_id = (select auth.uid())));
drop policy if exists "Owners remove release tracks" on public.wavo_release_tracks;
create policy "Owners remove release tracks" on public.wavo_release_tracks for delete to authenticated
  using (exists (select 1 from public.wavo_releases r where r.id = release_id and r.owner_id = (select auth.uid())));
grant select, insert, delete on public.wavo_release_tracks to authenticated;

drop policy if exists "Participants see music grants" on public.wavo_release_grants;
create policy "Participants see music grants" on public.wavo_release_grants for select to authenticated
  using (recipient_id = (select auth.uid()) or exists
    (select 1 from public.wavo_releases r where r.id = release_id and r.owner_id = (select auth.uid())));
drop policy if exists "Recipients or owners revoke music grants" on public.wavo_release_grants;
create policy "Recipients or owners revoke music grants" on public.wavo_release_grants for delete to authenticated
  using (recipient_id = (select auth.uid()) or exists
    (select 1 from public.wavo_releases r where r.id = release_id and r.owner_id = (select auth.uid())));
grant select, delete on public.wavo_release_grants to authenticated;

drop policy if exists "Owners see release links" on public.wavo_release_links;
create policy "Owners see release links" on public.wavo_release_links for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists "Owners revoke release links" on public.wavo_release_links;
create policy "Owners revoke release links" on public.wavo_release_links for delete to authenticated
  using (owner_id = (select auth.uid()));
grant select, delete on public.wavo_release_links to authenticated;

drop policy if exists "Owners upload private music" on storage.objects;
create policy "Owners upload private music" on storage.objects for insert to authenticated
  with check (bucket_id = 'wavo-private-music' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Granted users read private music" on storage.objects;
create policy "Granted users read private music" on storage.objects for select to authenticated
  using (bucket_id = 'wavo-private-music' and public.wavo_can_access_media_path(name));
drop policy if exists "Owners remove private music" on storage.objects;
create policy "Owners remove private music" on storage.objects for delete to authenticated
  using (bucket_id = 'wavo-private-music' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.wavo_messages add column if not exists release_id uuid references public.wavo_releases(id) on delete set null;
create index if not exists wavo_messages_release on public.wavo_messages (release_id) where release_id is not null;

create or replace function public.wavo_guard_release_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.release_id is not null and not exists (
    select 1 from public.wavo_releases r join public.wavo_release_grants g on g.release_id = r.id
    where r.id = new.release_id and r.owner_id = new.sender_id and g.recipient_id = new.recipient_id
  ) then raise exception 'The recipient has no access to this release'; end if;
  return new;
end;
$$;
drop trigger if exists wavo_release_message_guard on public.wavo_messages;
create trigger wavo_release_message_guard before insert on public.wavo_messages
  for each row execute function public.wavo_guard_release_message();

create or replace function public.wavo_share_release(p_release_id uuid, p_recipient_id uuid, p_body text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_message_id uuid; v_body text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
  select owner_id into v_owner from public.wavo_releases where id = p_release_id;
  if v_owner is distinct from (select auth.uid()) then raise exception 'Only the owner can share this release'; end if;
  if not exists (select 1 from public.wavo_friendships f where f.status = 'accepted' and
    ((f.requester_id = v_owner and f.addressee_id = p_recipient_id) or
     (f.addressee_id = v_owner and f.requester_id = p_recipient_id))) then
    raise exception 'This person is not an accepted friend';
  end if;
  v_body := coalesce(nullif(trim(p_body), ''), 'Hat eigene Musik mit dir geteilt.');
  if char_length(v_body) > 4000 then raise exception 'Message too long'; end if;
  insert into public.wavo_release_grants (release_id, recipient_id, access_mode)
    values (p_release_id, p_recipient_id, 'friend') on conflict (release_id, recipient_id) do nothing;
  insert into public.wavo_messages (sender_id, recipient_id, body, release_id)
    values (v_owner, p_recipient_id, v_body, p_release_id) returning id into v_message_id;
  return v_message_id;
end;
$$;

create or replace function public.wavo_create_release_link(p_release_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not exists (select 1 from public.wavo_releases where id = p_release_id and owner_id = (select auth.uid())) then
    raise exception 'Only the owner can create a share link';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.wavo_release_links (token_hash, release_id, owner_id, expires_at)
    values (md5(v_token), p_release_id, (select auth.uid()), now() + interval '30 days');
  return v_token;
end;
$$;

create or replace function public.wavo_claim_release_link(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_link public.wavo_release_links%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
  if p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid share link'; end if;
  select * into v_link from public.wavo_release_links
    where token_hash = md5(p_token) and expires_at > now() for update;
  if not found then raise exception 'Share link expired or revoked'; end if;
  if v_link.owner_id = (select auth.uid()) then return v_link.release_id; end if;
  if exists (select 1 from public.wavo_release_grants where release_id = v_link.release_id and recipient_id = (select auth.uid())) then
    update public.wavo_release_grants set access_mode = 'link'
      where release_id = v_link.release_id and recipient_id = (select auth.uid());
    return v_link.release_id;
  end if;
  if v_link.claim_count >= 100 then raise exception 'Share link has reached its limit'; end if;
  update public.wavo_release_links set claim_count = claim_count + 1 where token_hash = v_link.token_hash;
  insert into public.wavo_release_grants (release_id, recipient_id, access_mode)
    values (v_link.release_id, (select auth.uid()), 'link') on conflict (release_id, recipient_id) do nothing;
  return v_link.release_id;
end;
$$;

revoke all on function public.wavo_share_release(uuid, uuid, text),
  public.wavo_create_release_link(uuid), public.wavo_claim_release_link(text) from public;
grant execute on function public.wavo_share_release(uuid, uuid, text),
  public.wavo_create_release_link(uuid), public.wavo_claim_release_link(text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wavo_release_grants') then
    alter publication supabase_realtime add table public.wavo_release_grants;
  end if;
end $$;
notify pgrst, 'reload schema';
