# Share My List

Owners share a crate with a single public link. Visitors get the main MyVinyl app for that crate — collection, filters, search, play, insights, and label printing — without any way to save changes. The share token cannot add, edit, or remove records.

## URL

Local (`npm run dev`, Vite port **5174**):

```text
http://127.0.0.1:5174/s/<token>
```

Production:

```text
https://myvinyl-nine.vercel.app/s/<token>
```

The token is the `share_links.token` value (URL-safe, 16–64 characters). The same shell is available at:

```text
/s/<token>
/s/<token>/insights
/s/<token>/play
/s/<token>/play/<recordId>/<trackId>
/s/<token>/labels
```

Visitors can be logged out. Reads use an anonymous Supabase client that sends `x-share-token` and no session. Play, print, insights, filters, and in-list search run in the browser. Create, update, delete, enrich write-back, imports, scans, and share-link edits are not offered, and the database trigger still rejects writes that present the share token.

## Data

`share_links.collection_id` references `collections.id` (a personal or guest crate). One row per crate. `expires_at` is nullable and unused in the v1 UI; a null or future timestamp stays active.

Authenticated viewer grants in `crate_shares` are unchanged.

## Apply the migration

The SQL file is `supabase/migrations/20260923210000_share_links.sql`.

If it is not already on the MyVinyl Supabase project, paste that file into the Supabase SQL editor and run it. Then reload the API schema if new tables do not appear immediately.

## Access rules

- Signed-in owners can select, insert, update, and delete their own `share_links` rows.
- Anonymous clients can `SELECT` the shared collection, its records, and the owner's `user_profiles.first_name` when the request includes header `x-share-token`.
- There is no insert, update, or delete policy for that token.
- A before-statement trigger rejects any write on `records`, `collections`, or `share_links` that presents `x-share-token` (`42501`, shared lists are read-only).
