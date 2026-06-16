-- Guest Crates Phase 0: backfill personal collection per user
-- Run AFTER 20260616100000_guest_crates_phase0.sql
-- Idempotent: safe to re-run

-- 1. Create personal crate for every user who has records but no personal collection
insert into public.collections (owner_user_id, kind, name, slug)
select distinct r.user_id, 'personal', 'My Crate', 'my-crate'
from public.records r
where not exists (
  select 1
  from public.collections c
  where c.owner_user_id = r.user_id
    and c.kind = 'personal'
);

-- 2. Attach orphan records to personal crate
update public.records r
set collection_id = c.id
from public.collections c
where c.owner_user_id = r.user_id
  and c.kind = 'personal'
  and r.collection_id is null;

-- 3. Sync record_count on personal collections
update public.collections c
set record_count = sub.cnt,
    updated_at = now()
from (
  select collection_id, count(*)::int as cnt
  from public.records
  where collection_id is not null
  group by collection_id
) sub
where c.id = sub.collection_id;