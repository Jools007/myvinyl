# Brainstorm: Manual add without Discogs

**Status:** Future — not for current sprint  
**Date:** 2026-06-12  
**Context:** User wants to add dad's 60s/70s vinyl (mostly no barcodes). Today all add paths require a Discogs release match.

---

## Problem

- Barcode scan rarely works on vintage pressings.
- Discogs search works but is slow for large crates and fails when a release isn't catalogued.
- No path to add **artist / title / year / condition** only and enrich later (or never link Discogs).

## Proposed feature (future)

**Manual crate entry** — add a record without `discogsId`:

- Required: artist, title
- Optional: year, label, catalog number, format, condition, cover photo (upload or URL), notes
- Tracks: single default track or simple track list (title per side/track, no API)
- `addSource: 'manual-offline'` or extend existing `manual`
- Still eligible for BPM/key enrichment if track titles exist (looser matching)
- Insights: show separately ("X records not linked to Discogs") with nudge to match later

## UX sketch

- **Add vinyl** modal: tab or link — "Can't find on Discogs? Add manually"
- Optional **Match to Discogs later** from record detail (search + link without re-adding)
- Bulk: CSV import (artist, title, year) as stretch goal

## Why defer

- Current focus: finish enrichment, push prod, fix Insights.
- Discogs search + Import covers most of user's library today.
- Manual add touches persistence, detail modal, enrichment matching, Insights tiers.

## Related

- `docs/brainstorm/2026-06-12-play-dj-collector-research.md` — Play / DJ direction
- Existing: `AddRecordModal`, `DiscoverAddPanel` — Discogs-required save flow