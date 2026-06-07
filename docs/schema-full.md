# MyVinyl — Full Drizzle / PostgreSQL Schema

> **Summary:** [`../SCHEMA.md`](../SCHEMA.md) — principles, entity diagram, TypeScript domain types.  
> **Target stack:** Next.js 15 · PostgreSQL · Drizzle ORM · read [`../MISSION.md`](../MISSION.md) before changing tables.

---

## Enums (PostgreSQL + TypeScript)

### Drizzle (`src/db/schema/enums.ts`)

```ts
import { pgEnum } from 'drizzle-orm/pg-core';

/** Goldmine / Discogs-style grading for a physical copy */
export const recordConditionEnum = pgEnum('record_condition', [
  'mint',
  'nm',
  'vg_plus',
  'vg',
  'g_plus',
  'g',
  'p',
]);

export const sleeveConditionEnum = pgEnum('sleeve_condition', [
  'mint',
  'nm',
  'vg_plus',
  'vg',
  'g_plus',
  'g',
  'p',
  'generic',
  'no_cover',
]);

/** Physical media — vinyl-focused; extend later for CD/tape if needed */
export const vinylFormatEnum = pgEnum('vinyl_format', [
  'lp',
  'ep',
  'single_7',
  'single_12',
  'picture_disc',
  'lathe_cut',
  'other',
]);

export const catalogSourceEnum = pgEnum('catalog_source', [
  'discogs',
  'manual',
  'musicbrainz',
]);

export const enrichmentProviderEnum = pgEnum('enrichment_provider', [
  'spotify',
  'lastfm',
  'discogs',
  'manual',
  'estimated',
]);

export const starterVibeEnum = pgEnum('starter_vibe', [
  'soul',
  'jazz',
  'house',
  'hip_hop',
  'techno',
  'disco',
  'funk',
  'ambient',
  'latin',
  'reggae',
]);
```

### TypeScript unions (app layer)

```ts
export type RecordCondition =
  | 'mint' | 'nm' | 'vg_plus' | 'vg' | 'g_plus' | 'g' | 'p';

export type SleeveCondition = RecordCondition | 'generic' | 'no_cover';

export type VinylFormat =
  | 'lp' | 'ep' | 'single_7' | 'single_12' | 'picture_disc' | 'lathe_cut' | 'other';

export type CatalogSource = 'discogs' | 'manual' | 'musicbrainz';

export type StarterVibe =
  | 'soul' | 'jazz' | 'house' | 'hip_hop' | 'techno' | 'disco'
  | 'funk' | 'ambient' | 'latin' | 'reggae';
```

---

## Core tables (Drizzle)

### Users & settings

```ts
import {
  pgTable, uuid, text, timestamp, jsonb, boolean, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { starterVibeEnum } from './enums';

/** Auth identity — NextAuth / Clerk / custom; one row per human */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  starterVibe: starterVibeEnum('starter_vibe'),
  theme: text('theme').notNull().default('system'), // 'light' | 'dark' | 'system'
  defaultViewMode: text('default_view_mode').notNull().default('grid'),
  onboardingComplete: boolean('onboarding_complete').notNull().default(false),
  /** Future: default BPM tolerance, Camelot mixing mode, label template id */
  preferences: jsonb('preferences').$type<UserPreferences>().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type UserPreferences = {
  bpmTolerance?: number;
  showEstimatedBpm?: boolean;
  labelTemplateId?: string;
};
```

---

### Catalog layer (immutable releases)

```ts
import {
  pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { catalogSourceEnum } from './enums';

/**
 * Canonical release — sourced from Discogs (or manual catalog entry).
 * Treat as immutable: updates create a new snapshot or sync job, not user edits.
 */
export const releases = pgTable(
  'releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** External catalog identity */
    discogsReleaseId: integer('discogs_release_id').unique(),
    catalogSource: catalogSourceEnum('catalog_source').notNull().default('discogs'),
    catalogUri: text('catalog_uri'), // e.g. https://www.discogs.com/release/123

    /** Display fields (frozen at import time) */
    title: text('title').notNull(),
    year: integer('year'),
    country: text('country'),
    labelName: text('label_name'),
    catalogNumber: text('catalog_number'),
    barcode: text('barcode'),

    /** Primary cover — CDN URL; optional local cache path in metadata */
    coverImageUrl: text('cover_image_url'),

    /** Raw Discogs payload for re-sync / debugging (optional, compress in prod) */
    discogsSnapshot: jsonb('discogs_snapshot'),

    /** Search helpers — denormalised for full-text */
    searchVector: text('search_vector'), // maintained by trigger or app on write

    importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
    /** Last time we refreshed from Discogs API (still immutable to end-user) */
    catalogSyncedAt: timestamp('catalog_synced_at', { withTimezone: true }),

    metadata: jsonb('metadata').$type<ReleaseMetadata>().default({}),
  },
  (t) => [
    index('releases_discogs_idx').on(t.discogsReleaseId),
    index('releases_title_idx').on(t.title),
  ]
);

export type ReleaseMetadata = {
  formats?: string[];       // Discogs format strings
  styles?: string[];
  notes?: string;           // Discogs release notes (may contain BPM hints)
  tracklist?: { position?: string; title: string; duration?: string }[];
};

/** Normalised artists — many-to-many with releases */
export const artists = pgTable('artists', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sortName: text('sort_name'),
  discogsArtistId: integer('discogs_artist_id').unique(),
});

export const releaseArtists = pgTable(
  'release_artists',
  {
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    role: text('role').default('primary'), // 'primary' | 'featured' | 'remixer'
    position: integer('position').default(0),
  },
  (t) => [uniqueIndex('release_artists_uniq').on(t.releaseId, t.artistId, t.role)]
);

export const genres = pgTable('genres', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
});

export const releaseGenres = pgTable(
  'release_genres',
  {
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('release_genres_uniq').on(t.releaseId, t.genreId)]
);

export const releaseImages = pgTable('release_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id')
    .notNull()
    .references(() => releases.id, { onDelete: 'cascade' }),
  uri: text('uri').notNull(),
  type: text('type'), // 'primary' | 'secondary'
  width: integer('width'),
  height: integer('height'),
});
```

---

### Enrichment (derived, versioned — not user-owned)

```ts
import {
  pgTable, uuid, integer, text, timestamp, real, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { enrichmentProviderEnum } from './enums';

/**
 * API-derived musical metadata (BPM, Camelot, energy).
 * Separate from releases so we can refresh without mutating catalog rows.
 * Prefer one "active" row per release + provider via valid_to IS NULL.
 */
export const enrichmentSnapshots = pgTable(
  'enrichment_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),

    provider: enrichmentProviderEnum('provider').notNull(),
    bpm: integer('bpm'),
    camelotKey: text('camelot_key'), // e.g. '8A'
    musicalKey: text('musical_key'), // e.g. 'Am'
    energy: real('energy'),
    danceability: real('danceability'),

    /** Track-level match on Spotify (if applicable) */
    spotifyTrackId: text('spotify_track_id'),

    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }), // null = current
  },
  (t) => [
    index('enrichment_release_idx').on(t.releaseId),
    uniqueIndex('enrichment_active_uniq').on(t.releaseId, t.provider),
  ]
);
```

---

### Personal layer (collection & copies)

```ts
import {
  pgTable, uuid, text, integer, timestamp, jsonb, boolean, index,
} from 'drizzle-orm/pg-core';
import {
  recordConditionEnum,
  sleeveConditionEnum,
  vinylFormatEnum,
} from './enums';

/** Optional folder: "Living room crate", "DJ bag" */
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A physical record the user owns — the heart of MyVinyl.
 * Multiple items can point at the same release (duplicate copies).
 */
export const collectionItems = pgTable(
  'collection_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'restrict' }),
    collectionId: uuid('collection_id').references(() => collections.id, {
      onDelete: 'set null',
    }),

    // ── Vinyl-specific (personal) ─────────────────────────────
    vinylFormat: vinylFormatEnum('vinyl_format').notNull().default('lp'),
    mediaCondition: recordConditionEnum('media_condition').notNull().default('nm'),
    sleeveCondition: sleeveConditionEnum('sleeve_condition'),
    isSealed: boolean('is_sealed').default(false),
    pressingNotes: text('pressing_notes'), // "Original UK", "Reissue 2014"

    // ── Overrides (user knows better than APIs) ───────────────
    bpmOverride: integer('bpm_override'),
    camelotKeyOverride: text('camelot_key_override'),

    // ── Memory & workflow ─────────────────────────────────────
    personalNotes: text('personal_notes'),
    characterBlurb: text('character_blurb'), // "Feel it again" — mood description
    crateLocation: text('crate_location'),   // "Shelf B / Row 3"
    acquiredAt: timestamp('acquired_at', { withTimezone: true }),
    purchasePrice: integer('purchase_price_cents'),
    currency: text('currency').default('GBP'),

    // ── Play / recommendations ────────────────────────────────
    lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
    playCount: integer('play_count').notNull().default(0),
    isFavorite: boolean('is_favorite').default(false),
    isArchived: boolean('is_archived').default(false), // soft-hide from browse

    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),

    metadata: jsonb('metadata').$type<CollectionItemMetadata>().default({}),
  },
  (t) => [
    index('items_user_idx').on(t.userId),
    index('items_release_idx').on(t.releaseId),
    index('items_last_played_idx').on(t.userId, t.lastPlayedAt),
    index('items_crate_idx').on(t.userId, t.crateLocation),
  ]
);

export type CollectionItemMetadata = {
  /** Manual entry when no Discogs match */
  manualArtist?: string;
  manualTitle?: string;
  /** Import batch id for bulk CSV */
  importBatchId?: string;
  /** Label print preferences per copy */
  labelNotes?: string;
};
```

---

### Vibe tags (extensible dictionary)

```ts
export const vibeTags = pgTable('vibe_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** null = system tag; set = user-created */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(), // 'peak-time', 'late-night'
  label: text('label').notNull(),
  color: text('color'), // hex accent for UI
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('vibe_tags_user_slug').on(t.userId, t.slug),
]);

export const itemVibeTags = pgTable(
  'item_vibe_tags',
  {
    itemId: uuid('item_id')
      .notNull()
      .references(() => collectionItems.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => vibeTags.id, { onDelete: 'cascade' }),
    /** User-assigned weight for recommendations (1–5) */
    weight: integer('weight').default(3),
  },
  (t) => [uniqueIndex('item_vibe_tags_uniq').on(t.itemId, t.tagId)]
);
```

---

### Play history & recommendations

```ts
export const playEvents = pgTable(
  'play_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => collectionItems.id, { onDelete: 'cascade' }),
    playedAt: timestamp('played_at', { withTimezone: true }).defaultNow().notNull(),
    /** Context for future ML / rules engine */
    context: text('context'), // 'play_mode' | 'manual' | 'set'
    starterVibe: starterVibeEnum('starter_vibe'),
    metadata: jsonb('metadata').$type<{ sessionId?: string; bpmAtPlay?: number }>().default({}),
  },
  (t) => [
    index('play_events_user_time_idx').on(t.userId, t.playedAt),
    index('play_events_item_idx').on(t.itemId),
  ]
);

/** Optional cache for expensive recommendation queries */
export const recommendationCache = pgTable('recommendation_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  anchorItemId: uuid('anchor_item_id').references(() => collectionItems.id),
  payload: jsonb('payload').notNull(), // ranked item ids + scores
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
```

---

## Query patterns (Next.js 15 App Router)

| Use case | Pattern |
|----------|---------|
| Collection grid | `collectionItems` ⋈ `releases` ⋈ `releaseArtists` ⋈ active `enrichmentSnapshots` |
| Add from Discogs | Upsert `releases` + `release_*` → insert `collectionItems` |
| Play Next | Load last `playEvents` → score siblings by Camelot distance + vibe tag overlap |
| Search | Postgres `tsvector` on `releases.search_vector` + filter `item_vibe_tags` |
| Large libraries | Paginate with cursor on `(added_at, id)`; avoid N+1 via Drizzle `with` relational API |

---

## Future extensions (schema-ready)

- **Bulk import:** `import_batches` + `metadata.importBatchId` on items  
- **Want list / marketplace:** `wishlist_items` referencing `releases`  
- **Set lists:** `set_lists` + `set_list_items` (ordered `collection_items`)  
- **Multi-user households:** `collections.user_id` unchanged; share via `collection_shares`  
- **AI character blurbs:** `character_blurb` + `metadata.aiGeneratedAt` — no catalog mutation  

---

## File layout (recommended)

```text
src/db/
  schema/
    enums.ts
    users.ts
    catalog.ts      # releases, artists, genres
    collection.ts   # items, tags, play_events
    enrichment.ts
  index.ts          # export * from schema
  client.ts         # drizzle(pool)
```

---

*Schema version: 1.0 — full DDL. See [`../SCHEMA.md`](../SCHEMA.md) for the lightweight summary.*