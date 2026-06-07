# MyVinyl Data Schema (summary)

> **Today:** `VinylRecord` + `Track` in `src/lib/types.ts` → `localStorage`.  
> **Target:** Next.js 15 · PostgreSQL · Drizzle — full DDL: [`docs/schema-full.md`](./docs/schema-full.md).

## Design principles

| Principle | Rule |
|-----------|------|
| **Track-centric mixing** | BPM, Camelot key, musical key, and vibe tags live on **tracks**, not releases. |
| **Immutable catalog** | Discogs `releases` are snapshots; sync to refresh, never user-edit canonical fields. |
| **Personal layer** | Ownership, condition, notes, crate → `collection_items`. |
| **Multiple copies** | One `release` → many `collection_items`. |
| **Vinyl-first** | Format, condition, pressing, crate location are first-class on the **copy** (release row in the app). |
| **Enrichment per track** | API BPM/key/vibes in `track_enrichment_snapshots`; overrides on `tracks` / item-track joins. |
| **Scale** | Index `user_id`, FKs, facets; paginate 500–2000+ records. |

## Entity overview

```text
users → collections? → collection_items → releases (catalog)
                         ├── item_vibe_tags → vibe_tags   (track-scoped in target DB)
                         └── play_events                    (track-scoped)
releases → tracks → track_enrichment_snapshots
releases → release_artists/artists, release_genres/genres, release_images
user_settings · recommendation_cache?
```

## Domain model (app — `src/lib/types.ts`)

`VinylRecord` = one **release** (your copy). `Track` = one row on the label/tracklist.

```ts
export interface Track {
  id: string;
  title: string;
  position?: string;
  duration?: string;
  artist?: string;
  bpm?: number;
  camelotKey?: string;
  musicalKey?: string;
  vibeTags: string[];
  discogsTrackId?: number;
  isPrimary?: boolean;
}

export interface VinylRecord {
  id: string;
  discogsId?: number;
  artist: string;
  title: string;
  year?: string;
  format?: string;
  coverUrl?: string;
  genres: string[];
  condition: RecordCondition;
  notes?: string;
  tracks: Track[];
  lastPlayedAt?: string;
  addedAt: string;
}
```

### What belongs where

| **Release (`VinylRecord`)** | **Track (`Track`)** |
|-----------------------------|---------------------|
| title, artist, year | title, position, duration, track artist |
| format, coverUrl, genres (catalog) | bpm, camelotKey, musicalKey |
| condition, notes (your copy) | vibeTags |
| discogsId, addedAt | discogsTrackId |
| lastPlayedAt (denormalized) | — |

Never store BPM, Camelot, or vibe tags on the release object.

## TypeScript domain types (target DB)

Catalog and collection layers stay separate; musical fields attach to **tracks**.

```ts
export type RecordCondition = 'mint' | 'nm' | 'vg_plus' | 'vg' | 'g_plus' | 'g' | 'p';
export type SleeveCondition = RecordCondition | 'generic' | 'no_cover';
export type VinylFormat = 'lp' | 'ep' | 'single_7' | 'single_12' | 'picture_disc' | 'lathe_cut' | 'other';
export type CatalogSource = 'discogs' | 'manual' | 'musicbrainz';

export interface Release {
  id: string;
  discogsReleaseId: number | null;
  catalogSource: CatalogSource;
  title: string;
  year: number | null;
  coverImageUrl: string | null;
  artists: { id: string; name: string; role: string }[];
  genres: string[];
  tracks: CatalogTrack[];
  importedAt: string;
}

export interface CatalogTrack {
  id: string;
  releaseId: string;
  title: string;
  position: string | null;
  duration: string | null;
  artist: string | null;
}

export interface TrackEnrichment {
  trackId: string;
  bpm: number | null;
  camelotKey: string | null;
  musicalKey: string | null;
  provider: 'spotify' | 'lastfm' | 'discogs' | 'manual' | 'estimated';
  isEstimated: boolean;
}

export interface CollectionItem {
  id: string;
  userId: string;
  releaseId: string;
  release: Release;
  vinylFormat: VinylFormat;
  mediaCondition: RecordCondition;
  sleeveCondition: SleeveCondition | null;
  /** Per-track overrides and tags — source of truth for mixing metadata */
  tracks: CollectionTrack[];
  personalNotes: string | null;
  characterBlurb: string | null;
  crateLocation: string | null;
  lastPlayedAt: string | null;
  lastPlayedTrackId: string | null;
  playCount: number;
  isFavorite: boolean;
  addedAt: string;
}

export interface CollectionTrack {
  trackId: string;
  catalog: CatalogTrack;
  enrichment: TrackEnrichment | null;
  bpmOverride: number | null;
  camelotKeyOverride: string | null;
  vibeTags: { id: string; slug: string; label: string; weight: number }[];
}

export function resolveTrackBpm(
  track: { bpmOverride: number | null },
  enrichment: TrackEnrichment | null
): number | null {
  return track.bpmOverride ?? enrichment?.bpm ?? null;
}
```

## Migration from flat `VinylRecord`

Older stored rows had BPM, Camelot, and vibes on the release. Move them onto a single default track when migrating:

| Old field (release) | New home |
|---------------------|----------|
| `discogsId` | `releases.discogs_release_id` |
| `artist`, `title`, `year`, `coverUrl`, `genres` | `releases` + artists/genres |
| `format`, `condition`, `notes` | `collection_items` |
| `bpm`, `camelotKey`, `vibeTags` | **`tracks`** (+ enrichment snapshots) |
| `lastPlayedAt` | `collection_items` + `play_events.track_id` |

**App helper:** `primaryTrack(release)` — first track for list/card UI until the UI is fully track-aware.

**Drizzle enums, `pgTable` blocks, query patterns:** [`docs/schema-full.md`](./docs/schema-full.md) (add `tracks` / `track_enrichment_snapshots` when implementing tables).