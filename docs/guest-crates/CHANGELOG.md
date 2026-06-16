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
**Commit:** _pending_ · **Prod:** no · **DB migration:** no (uses Phase 0)

**Shipped**
- Crate switcher (collection hero)
- Guest crate banner
- Import friend's Discogs → guest crate
- 1,000 vinyl cap · 5 guest crates cap
- Scoped enrich, insights, play, PDF, labels
- Add/barcode/clear guarded to personal crate

**Verify**
- [ ] Personal crate byte-for-byte behavior vs pre-deploy
- [ ] Guest import does not appear in personal crate
- [ ] Switching crates updates insights + collection list
- [ ] PDF/labels title uses guest crate name

**Rollback**
- Redeploy previous Vercel build; guest data remains in DB

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