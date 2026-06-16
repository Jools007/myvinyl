# Guest Crates — Deploy Steps

Run in this order. Do **not** skip Phase 0 before shipping Phase 1 app code.

## 1. Supabase SQL (Phase 0)

In Supabase → SQL Editor, run:

1. `supabase/migrations/20260616100000_guest_crates_phase0.sql`
2. `supabase/migrations/20260616100001_backfill_personal_crates.sql`

Confirm:

```sql
select count(*) from records where collection_id is null;
-- expect 0

select kind, count(*) from collections group by kind;
-- expect one personal row per user with records
```

## 2. App deploy (Phase 1)

```bash
cd /Users/juliangallagher/my-vinyl
npm run build
npx vercel --prod
```

## 3. Smoke test

- [ ] `/collection` — personal crate, same record count as before
- [ ] Import → Friend's collection → guest crate at `/crates/:slug`
- [ ] Insights / PDF / play work on guest crate
- [ ] Search-add still lands on personal crate while viewing guest

## Rollback

Redeploy previous Vercel deployment. DB changes are safe to leave in place.