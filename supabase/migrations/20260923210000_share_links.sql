-- Public read-only share links for crates (collections).
-- One row per collection. expires_at is reserved for a later expiry UI;
-- a null or future expires_at is the active link.
-- Authenticated crate_shares (viewer accounts) are a different feature and are unchanged.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon;

-- ---------------------------------------------------------------------------
-- share_links
-- collection_id is the list/crate id (public.collections.id).
-- ---------------------------------------------------------------------------
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null unique references public.collections (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint share_links_token_format check (token ~ '^[A-Za-z0-9_-]{16,64}$')
);

comment on table public.share_links is
  'One active public read link per crate. Token grants SELECT only.';

create index if not exists share_links_created_by_idx
  on public.share_links (created_by);

alter table public.share_links enable row level security;

revoke all on table public.share_links from public, anon;
grant select, insert, update, delete on table public.share_links to authenticated;

drop policy if exists share_links_select_own on public.share_links;
create policy share_links_select_own
  on public.share_links
  for select
  to authenticated
  using (created_by = auth.uid());

drop policy if exists share_links_insert_own on public.share_links;
create policy share_links_insert_own
  on public.share_links
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.collections c
      where c.id = collection_id
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists share_links_update_own on public.share_links;
create policy share_links_update_own
  on public.share_links
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.collections c
      where c.id = collection_id
        and c.owner_user_id = auth.uid()
    )
  );

drop policy if exists share_links_delete_own on public.share_links;
create policy share_links_delete_own
  on public.share_links
  for delete
  to authenticated
  using (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Request token (header x-share-token). Not granted to API roles.
-- ---------------------------------------------------------------------------
create or replace function private.request_share_token()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  raw text;
  token text;
begin
  raw := nullif(current_setting('request.headers', true), '');
  if raw is null then
    return null;
  end if;
  token := nullif(raw::json ->> 'x-share-token', '');
  if token is null or token !~ '^[A-Za-z0-9_-]{16,64}$' then
    return null;
  end if;
  return token;
exception
  when others then
    return null;
end;
$$;

create or replace function private.shared_collection_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.collection_id
  from public.share_links s
  where s.token = private.request_share_token()
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

create or replace function private.shared_collection_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.owner_user_id
  from public.collections c
  where c.id = private.shared_collection_id();
$$;

create or replace function private.record_visible_via_share(
  p_user_id uuid,
  p_collection_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.collections c
    where c.id = private.shared_collection_id()
      and (
        p_collection_id = c.id
        or (
          p_collection_id is null
          and c.kind = 'personal'
          and p_user_id = c.owner_user_id
        )
      )
  );
$$;

revoke all on function private.request_share_token() from public;
revoke all on function private.shared_collection_id() from public;
revoke all on function private.shared_collection_owner_id() from public;
revoke all on function private.record_visible_via_share(uuid, uuid) from public;

grant execute on function private.shared_collection_id() to anon;
grant execute on function private.shared_collection_owner_id() to anon;
grant execute on function private.record_visible_via_share(uuid, uuid) to anon;

-- Anon may read the shared crate, its records, and the owner's first name.
-- No insert/update/delete policies exist for the share token.
drop policy if exists collections_select_via_share_token on public.collections;
create policy collections_select_via_share_token
  on public.collections
  for select
  to anon
  using (id = private.shared_collection_id());

drop policy if exists records_select_via_share_token on public.records;
create policy records_select_via_share_token
  on public.records
  for select
  to anon
  using (private.record_visible_via_share(user_id, collection_id));

do $$
begin
  if to_regclass('public.user_profiles') is not null then
    execute 'drop policy if exists user_profiles_select_via_share_token on public.user_profiles';
    execute $policy$
      create policy user_profiles_select_via_share_token
        on public.user_profiles
        for select
        to anon
        using (user_id = private.shared_collection_owner_id())
    $policy$;
  end if;
end $$;

-- Any write that presents a share token is rejected, including the owner.
create or replace function private.reject_share_token_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.request_share_token() is not null then
    raise exception 'shared lists are read-only'
      using errcode = '42501';
  end if;
  return null;
end;
$$;

revoke all on function private.reject_share_token_write() from public;

drop trigger if exists records_reject_share_token_write on public.records;
create trigger records_reject_share_token_write
  before insert or update or delete
  on public.records
  for each statement
  execute function private.reject_share_token_write();

drop trigger if exists collections_reject_share_token_write on public.collections;
create trigger collections_reject_share_token_write
  before insert or update or delete
  on public.collections
  for each statement
  execute function private.reject_share_token_write();

drop trigger if exists share_links_reject_share_token_write on public.share_links;
create trigger share_links_reject_share_token_write
  before insert or update or delete
  on public.share_links
  for each statement
  execute function private.reject_share_token_write();
