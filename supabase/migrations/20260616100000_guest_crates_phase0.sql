-- Guest Crates Phase 0: additive schema only
-- Safe to run on prod before app deploy. Current app ignores these objects.
-- See docs/guest-crates/2026-06-16-design.md

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------
create table if not exists public.collections (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null references auth.users (id) on delete cascade,
  imported_by_user_id uuid references auth.users (id) on delete set null,
  kind                text not null check (kind in ('personal', 'guest', 'pending_claim')),
  name                text not null,
  slug                text not null,
  discogs_username    text,
  record_count        int not null default 0 check (record_count >= 0),
  claim_token_hash    text,
  claimed_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists collections_one_personal_per_user
  on public.collections (owner_user_id)
  where kind = 'personal';

create unique index if not exists collections_owner_slug
  on public.collections (owner_user_id, slug);

create index if not exists collections_owner_kind
  on public.collections (owner_user_id, kind);

-- ---------------------------------------------------------------------------
-- records.collection_id (nullable until backfill)
-- ---------------------------------------------------------------------------
alter table public.records
  add column if not exists collection_id uuid references public.collections (id) on delete cascade;

create index if not exists records_collection_id
  on public.records (collection_id);

-- ---------------------------------------------------------------------------
-- RLS: collections
-- ---------------------------------------------------------------------------
alter table public.collections enable row level security;

drop policy if exists collections_select_own on public.collections;
create policy collections_select_own
  on public.collections for select
  using (owner_user_id = auth.uid());

drop policy if exists collections_insert_own on public.collections;
create policy collections_insert_own
  on public.collections for insert
  with check (owner_user_id = auth.uid());

drop policy if exists collections_update_own on public.collections;
create policy collections_update_own
  on public.collections for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists collections_delete_own on public.collections;
create policy collections_delete_own
  on public.collections for delete
  using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: records — extend existing policies with collection ownership
-- (Keep user_id checks; add collection path for guest crates.)
-- If policies already exist, apply equivalent logic in Supabase dashboard.
-- ---------------------------------------------------------------------------

-- NOTE: Run backfill script after this migration:
-- docs/guest-crates/scripts/backfill-personal-crates.sql (Phase 0 deploy step)