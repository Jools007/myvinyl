# Guest Crates — Changelog

Track what shipped, when, and how to verify. Newest first.

---

## Format

```markdown
### Phase N — Title (YYYY-MM-DD)
**Commit:** `abc1234` · **Prod:** yes/no · **DB migration:** yes/no

**Shipped**
- bullet

**Verify**
- [ ] check

**Rollback**
- note
```

---

## Planned

### Phase 0 — Schema & backfill
**Commit:** _pending_ · **Prod:** no · **DB migration:** yes

**Shipped**
- `collections` table
- `records.collection_id` (nullable → backfilled)
- Personal crate row per existing user
- RLS policies

**Verify**
- [ ] Prod app unchanged — `/collection` loads, record count correct
- [ ] `select count(*) from records where collection_id is null` → 0

**Rollback**
- App ignores new columns; safe to leave tables in place

---

### Phase 1 — Guest crates (demo mode)
**Commit:** _pending_ · **Prod:** no · **DB migration:** required (Phase 0 first)

**Shipped**
- `src/lib/collections.ts` + `useCollections` + scoped `useCollection`
- Crate switcher in collection hero
- Guest crate banner + remove guest crate
- Import modal: personal vs friend's Discogs
- URLs: `/crates/:slug` (personal stays `/collection`)
- 1,500 vinyl cap · 5 guest crates cap
- Guest mode: enrich/play/PDF/labels/insights OK; add/delete/clear blocked
- Discogs adds from header go to personal crate while viewing guest
- Graceful fallback if `collections` table missing (legacy behavior)

**Deploy order**
1. Run `supabase/migrations/20260616100000_guest_crates_phase0.sql`
2. Run `supabase/migrations/20260616100001_backfill_personal_crates.sql`
3. Verify prod still loads on **old** bundle (optional)
4. `npm run build` → `vercel --prod`

**Verify**
- [ ] Personal crate unchanged at `/collection`
- [ ] Guest import → `/crates/:slug` isolated from personal
- [ ] Switcher + insights scoped to active crate
- [ ] Remove guest crate returns to personal

**Rollback**
- Redeploy previous Vercel build; guest rows remain in DB

---

### Phase 2 — Invite & claim
**Commit:** _pending_ · **Prod:** no · **DB migration:** maybe (`claim_token_hash`)

**Shipped**
- `/c/:slug?invite=` landing
- Claim on signup → ownership transfer
- Importer guest copy removed after claim
- Copy invite link UI

**Verify**
- [ ] Invalid token rejected
- [ ] Claimed user sees full collection at `/collection`
- [ ] Importer no longer sees transferred crate

**Rollback**
- Disable claim route; guest crates still usable in demo mode

---

### Phase 3 — Scale (800–1k)
**Commit:** _pending_ · **Prod:** no · **DB migration:** no

**Shipped**
- Virtualized collection list
- Enrichment progress per crate
- Performance tuning for large guest imports

**Verify**
- [ ] 800+ record crate scrolls smoothly
- [ ] Full enrichment completes without UI freeze

---

## Shipped to prod

### Rating column compact pills (2026-06-16)
**Commit:** `44c8c98` · **Prod:** yes · **DB migration:** no

**Shipped**
- Compact rating pills in collection table (unrelated to guest crates)

**Verify**
- [x] https://myvinyl-nine.vercel.app/collection — rating column consistent

---

## References

- Design spec: [`2026-06-16-design.md`](./2026-06-16-design.md)
- Deploy workflow: [`../../AGENTS.md`](../../AGENTS.md)