# My Vinyl — Project Snapshot

> **Purpose:** Complete reference document for recovering or rebuilding the app if refactoring breaks something.  
> **Last updated:** June 2026  
> **Repo:** `https://github.com/Jools007/myvinyl.git` (branch: `main`)  
> **Workspace:** `/Users/juliangallagher/my-vinyl`

---

## Project Overview

**My Vinyl** (branded **MyVinyl** in the UI) is a premium vinyl collection manager built for serious collectors and DJs who own large physical libraries (often 500–2,000+ records).

### What it does

- Catalog vinyl you own (LPs, EPs, singles) with rich metadata
- Search and import from **Discogs**
- Enrich tracks with **BPM**, **Camelot key**, and **vibe tags** for DJ-style mixing
- Browse and filter your collection (grid, shelf, list views)
- Recommend **what to play next** using harmonic (Camelot) and BPM compatibility
- Scan barcodes to find releases
- Print **crate labels** for physical organization
- Sync collection data to **Supabase** per authenticated user

### Who it's for

- Vinyl collectors who want more than a spreadsheet
- DJs who play physical records and need BPM/key context at a glance
- People who care about mood, vibe, and musical memory — not just catalog data

### Core user loop

```
Add record (Discogs / barcode / manual)
  → Browse & filter collection
    → Play mode (recommendations + queue)
      → Print crate labels
```

### Design direction

Warm, moody, premium dark aesthetic with excellent typography, Framer Motion transitions, and a polished light/dark/system theme toggle.

---

## Tech Stack

### Frontend

| Technology | Version (approx.) | Role |
|------------|-------------------|------|
| **Vite** | 8.x | Build tool & dev server |
| **React** | 19.x | UI framework |
| **TypeScript** | 6.x | Type safety |
| **Tailwind CSS** | 4.x (`@tailwindcss/vite`) | Styling |
| **Framer Motion** | 12.x | Animations |
| **Lucide React** | 1.x | Icons |
| **Sonner** | 2.x | Toast notifications |
| **html5-qrcode** | 2.x | Barcode scanning |
| **clsx** | 2.x | Class name utilities |

### Backend / data services

| Service | Role |
|---------|------|
| **Supabase** | Authentication (email/password) + PostgreSQL `records` table |
| **Discogs API** | Search, release detail, barcode lookup, collection import |
| **Spotify API** | Track previews, BPM/key (dev server only) |
| **Last.fm API** | Vibe tags, album wiki, similar artists/tracks (dev server only) |
| **YouTube** | Audio playback fallback via InnerTube (dev server only) |
| **Deezer** | Enrichment candidate source (dev server only) |

### Dev-only infrastructure

| Piece | Role |
|-------|------|
| `server/api-plugin.ts` | Vite middleware exposing `/api/*` routes during `npm run dev` |
| Port **5174** | Default dev server port |

### Production hosting

| Target | Notes |
|--------|-------|
| **Vercel** (static) | Deploy `dist/` after `npm run build` |
| No Node runtime in prod | `/api/*` routes are **not** deployed unless you add Vercel serverless functions separately |

### Fonts

- **DM Sans** + **Inter** (Google Fonts, loaded in `index.html`)

---

## Current Features

### Authentication & user account

- [x] Supabase email/password sign up and sign in (`src/contexts/AuthContext.tsx`)
- [x] Session persistence via Supabase client
- [x] User menu with email initial avatar and sign out (`src/components/Auth/UserMenu.tsx`)
- [x] Login screen with branded logo (`src/components/Auth/Login.tsx`)
- [x] Per-user record isolation (`user_id` on all Supabase rows)

### Collection management

- [x] Fetch, add, update, delete records via Supabase (`src/lib/records.ts`)
- [x] Debounced auto-persist on edits (`src/hooks/useCollection.ts`)
- [x] Loading state: "Loading your collection…" (`src/components/CollectionLoading.tsx`)
- [x] Error state with retry (`src/components/CollectionLoadError.tsx`)
- [x] Empty state with CTA (`src/components/EmptyCollection.tsx`)
- [x] Clear collection modal with selective modes (`src/components/ClearCollectionModal.tsx`)
- [x] Demo data loader for testing (`src/lib/seed.ts`)

### Views & browsing

- [x] **Grid view** (`src/components/GridView.tsx`, `src/components/RecordCard.tsx`)
- [x] **Shelf view** — physical crate aesthetic (`src/components/ShelfView.tsx`)
- [x] **List view** — track-level BPM/key columns (`src/components/CollectionListView.tsx`)
- [x] Collection hero header (`src/components/CollectionHero.tsx`)
- [x] Filters: search, genre, format, BPM range, Camelot (`src/components/CollectionFilters.tsx`)
- [x] Record detail modal with edit, delete, play, refresh metadata (`src/components/RecordDetailModal.tsx`)

### Adding records

- [x] Discogs typeahead search bar (`src/components/DiscogsSearchBar.tsx`)
- [x] Discover add panel — full add/edit flow (`src/components/DiscoverAddPanel.tsx`)
- [x] Legacy add record modal (`src/components/AddRecordModal.tsx`)
- [x] Barcode scanner modal (`src/components/BarcodeScannerModal.tsx`)
- [x] Manual fields: artist, title, year, format, condition, genres, BPM, Camelot, vibes, notes
- [x] Discogs release detail fetch populates tracklist, cover, genres
- [x] CD-only releases filtered out (vinyl-first app)

### Discogs integration (client-side)

- [x] Direct Discogs API calls from browser (`src/lib/discogsDirect.ts`)
- [x] Requires `VITE_DISCOGS_TOKEN` at build time
- [x] Search, barcode search, release detail, user collection import
- [x] Bulk import with tracklist hydration (`src/lib/discogsImport.ts`, `src/components/DiscogsImportModal.tsx`)
- [x] Cover images via direct `i.discogs.com` CDN URLs (`src/lib/discogsCover.ts`)

### Track enrichment

- [x] Per-track BPM, Camelot key, vibe tags stored on `Track` objects inside `tracklist` JSON
- [x] Sequential per-track enrichment with live UI updates (`src/lib/tracks.ts`, `useCollection.enrichReleaseInCollection`)
- [x] Manual "Enrich" button on list view rows
- [x] Background migration: refresh tracklists + enrich pending records (`src/lib/recordMigration.ts`)
- [x] **Dev:** Full server enrichment via Spotify/Last.fm/Deezer (`server/enrich-track.ts`)
- [x] **Production:** Client-side fallback with Discogs hints + genre-based BPM/Camelot estimates (`src/lib/clientEnrichment.ts`)
- [x] Estimated values flagged with `bpmEstimated` / `keyEstimated` on tracks
- [x] UI hints when live site uses estimates (`ENRICHMENT_ESTIMATE_HINT`)

### Play mode

- [x] Play Next panel with now-playing artwork (`src/components/PlayNextPanel.tsx`)
- [x] Harmonic + BPM + vibe + genre scoring (`src/lib/recommendations.ts`)
- [x] Play queue management (`src/lib/playSession.ts`)
- [x] Mark records as played (`markPlayed` in `useCollection`)
- [x] Camelot wheel distance helpers (`src/lib/camelot.ts`)

### Audio previews (dev server)

- [x] Spotify 30s preview lookup (`/api/spotify/audio`)
- [x] YouTube audio fallback (`/api/play/audio`, `src/lib/youtubePlayer.ts`)
- [x] Preview hooks (`src/hooks/useTrackPreview.ts`, `src/hooks/useSpotifyPreview.ts`)
- [ ] **Not available on Vercel static hosting** (see Known Issues)

### Labels

- [x] Label print page with record picker (`src/components/LabelPrint.tsx`)
- [x] Crate label component (`src/components/labels/CrateLabel.tsx`)
- [x] Label inspect/edit modal (`src/components/labels/LabelInspectModal.tsx`)
- [x] Label content helpers (`src/lib/labelContent.ts`)
- [x] Print-friendly CSS (`no-print` classes)

### Settings & onboarding

- [x] Theme: light / dark / system (`src/hooks/useTheme.ts`, `src/components/ThemeToggle.tsx`)
- [x] View mode preference (grid vs shelf) — stored in localStorage
- [x] Onboarding flow with starter vibe selection (`src/components/Onboarding.tsx`)
- [x] Starter vibe selector (`src/components/StarterVibeSelector.tsx`)
- [x] Vibe discovery panel (`src/components/VibeDiscovery.tsx`) — Last.fm powered, dev only

### Navigation

- [x] Three main pages: **Collection**, **Play**, **Labels** (`src/components/Navigation.tsx`)
- [x] Quick actions: barcode scan, add record, user menu

### App settings storage (localStorage only)

| Key | Contents |
|-----|----------|
| `myvinyl:settings` | Theme, view mode, onboarding flag, starter vibe |
| `myvinyl:force-tracklist-refresh-v1` | Background migration checkpoint |
| `myvinyl:track-enrich-v2` | Background enrichment migration checkpoint |

> **Records are NOT in localStorage.** They live exclusively in Supabase.

---

## Database Schema

### Current production schema (Supabase)

The running app uses a **single flattened table** — not the future Drizzle schema described in `docs/schema-full.md`.

#### Table: `records`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Record ID; generated by Supabase on insert |
| `user_id` | `uuid` (FK) | References `auth.users.id`; scopes data per user |
| `title` | `text` | Album/release title |
| `artist` | `text` | Primary artist |
| `year` | `text` or `int` | Release year (stored flexibly) |
| `format` | `text` | e.g. `LP`, `12" Single`, `EP` |
| `genre` | `text[]` or `text` | Genres/styles; may be array or comma-separated |
| `cover_image` | `text` | Direct Discogs CDN URL (`https://i.discogs.com/...`) |
| `tracklist` | `jsonb` | Array of `Track` objects (see below) |
| `condition` | `text` | Goldmine-style: `Mint`, `NM`, `VG+`, `VG`, `G+`, `G`, `P` |
| `discogs_id` | `int` | Discogs release ID (nullable) |
| `bpm` | `int` | Denormalized BPM from primary track (nullable) |
| `barcode` | `text` | Barcode if scanned (nullable; often null) |
| `created_at` | `timestamptz` | When record was added |

#### `tracklist` JSON shape (`Track` type)

```ts
interface Track {
  id: string;
  title: string;
  position?: string;       // e.g. "A1", "B2"
  duration?: string;
  artist?: string;
  bpm?: number;
  camelotKey?: string;     // e.g. "8A"
  musicalKey?: string;
  bpmEstimated?: boolean;
  keyEstimated?: boolean;
  vibeTags: string[];
  discogsTrackId?: number;
  isPrimary?: boolean;
  spotifyPreviewUrl?: string;
  spotifyTrackId?: string;
}
```

#### App-level type mapping

| DB column | App field (`VinylRecord`) |
|-----------|---------------------------|
| `id` | `id` |
| `discogs_id` | `discogsId` |
| `title` | `title` |
| `artist` | `artist` |
| `year` | `year` |
| `format` | `format` |
| `genre` | `genres[]` |
| `cover_image` | `coverUrl` (normalized via `resolveDiscogsCoverUrl`) |
| `tracklist` | `tracks[]` |
| `condition` | `condition` |
| `created_at` | `addedAt` |
| `bpm` | primary track BPM (denormalized on write) |

#### Row-Level Security (expected)

Supabase should have RLS policies ensuring users can only `SELECT` / `INSERT` / `UPDATE` / `DELETE` rows where `user_id = auth.uid()`. Verify in Supabase dashboard if access issues occur.

#### Auth

Uses Supabase Auth (`auth.users`). No custom `users` table in the app schema.

#### Future schema (not implemented)

`docs/schema-full.md` and `SCHEMA.md` describe a target normalized schema (`releases`, `collection_items`, `tracks`, `enrichment_snapshots`, etc.) for a future Next.js + Drizzle migration. **Do not confuse this with the live `records` table.**

---

## API Integrations

### 1. Discogs API (client-side — works on Vercel)

| Detail | Value |
|--------|-------|
| **Base URL** | `https://api.discogs.com` |
| **Auth** | `Authorization: Discogs token=${VITE_DISCOGS_TOKEN}` |
| **Code** | `src/lib/discogsDirect.ts` |
| **User-Agent** | `MyVinyl/1.0 +{origin}` |

**Endpoints used:**

| Endpoint | Purpose |
|----------|---------|
| `GET /database/search` | Release search + barcode search |
| `GET /releases/{id}` | Full release detail + tracklist + images |
| `GET /users/{user}/collection/folders/0/releases` | Bulk collection import |

**Cover images:** Served directly from `i.discogs.com` / `img.discogs.com` — never proxied.

### 2. Supabase (client-side — works on Vercel)

| Detail | Value |
|--------|-------|
| **Code** | `src/lib/supabase.ts`, `src/lib/records.ts` |
| **Auth** | Email/password via `@supabase/supabase-js` |
| **Data** | CRUD on `records` table |

### 3. Dev-server APIs (local only — `server/api-plugin.ts`)

These routes are registered by the Vite plugin and **do not exist on Vercel static hosting**.

| Route | Method | Purpose | Env vars |
|-------|--------|---------|----------|
| `/api/enrich` | GET | Per-track BPM/key/vibes from Spotify + Last.fm + Discogs + genre fallback | `DISCOGS_TOKEN`, `SPOTIFY_*`, `LASTFM_API_KEY` |
| `/api/spotify/audio` | GET | Spotify track match + 30s preview URL | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| `/api/play/audio` | GET | Spotify preview, then YouTube audio fallback | `SPOTIFY_*`, `YOUTUBE_API_KEY` |
| `/api/album-info` | GET | Album description (Discogs notes + Last.fm wiki) | `LASTFM_API_KEY` |
| `/api/lastfm/similar` | GET | Similar artists and tracks | `LASTFM_API_KEY` |
| `/api/lastfm/vibe` | GET | Top tracks by tag for vibe discovery | `LASTFM_API_KEY` |

**Removed routes (do not re-add for Vercel):**

- `/api/discogs/*` — replaced by client-side `discogsDirect.ts`
- `/api/image` — replaced by direct `i.discogs.com` URLs

### 4. Client-side enrichment fallback (production)

| Detail | Value |
|--------|-------|
| **Code** | `src/lib/clientEnrichment.ts` |
| **Triggered when** | `import.meta.env.DEV` is false (production builds skip `/api/enrich` entirely) |
| **Provides** | Discogs release hints + genre-based BPM/Camelot estimates |
| **Does NOT provide** | Spotify previews, Last.fm vibe tags, Deezer data |

---

## Known Issues

### Vercel (production static hosting) vs local dev

| Feature | Local (`npm run dev`) | Vercel (`dist/` static) |
|---------|----------------------|-------------------------|
| Supabase auth + records | ✅ Works | ✅ Works (needs `VITE_SUPABASE_*` at build time) |
| Discogs search/import | ✅ Works | ✅ Works (needs `VITE_DISCOGS_TOKEN` at build time) |
| Cover images | ✅ Direct CDN | ✅ Direct CDN (`i.discogs.com`) |
| Full track enrichment (Spotify/Last.fm) | ✅ `/api/enrich` | ❌ Not available — client estimates only |
| Spotify 30s previews | ✅ `/api/spotify/audio` | ❌ Returns not found / network error |
| YouTube audio playback | ✅ `/api/play/audio` | ❌ Not available |
| Last.fm vibe discovery | ✅ `/api/lastfm/vibe` | ❌ Returns empty array (graceful) |
| Album wiki descriptions | ✅ Last.fm enhanced | ⚠️ Discogs notes only |
| `/api/enrich` 404 errors | N/A | ✅ **Fixed** — production build tree-shakes `/api/enrich` call |
| `/api/image` 404 errors | N/A | ✅ **Fixed** — proxy removed; CDN URLs only |

### Enrichment behavior on live site

- BPM and Camelot values are **genre-based estimates** unless Discogs release notes contain explicit BPM/key text
- Tracks show `bpmEstimated` / `keyEstimated` flags
- UI displays `ENRICHMENT_ESTIMATE_HINT` in add/edit flows and record detail refresh
- Background enrichment migration runs with client fallback (no longer skipped in production)

### Cover image edge cases

- Legacy records may have stored `/api/image?url=...` proxy URLs in `cover_image` — `resolveDiscogsCoverUrl()` unwraps these on read
- Invalid or non-CDN URLs show the vinyl placeholder artwork
- Images use `referrerPolicy="no-referrer"` on all `<img>` tags

### Other known limitations

- **No offline support** — requires network for Supabase and Discogs
- **No pagination** — entire collection loaded at once (may be slow at 2,000+ records)
- **Discogs rate limits** — bulk import throttled; 429 errors surface as user-facing messages
- **CD releases** — filtered out by design (vinyl-first)
- **CONTEXT.md / SCHEMA.md** — partially outdated (still mention localStorage in places); **this snapshot and `src/lib/records.ts` are authoritative for persistence**
- **Play audio** — 22s client timeout for YouTube fallback; do not shorten without retesting

### If something breaks after refactor — quick checks

```bash
cd /Users/juliangallagher/my-vinyl
npm run build          # Must pass TypeScript + Vite build
npm run dev            # Dev server on http://localhost:5174
```

Verify production bundle has no dead API calls:

```bash
# Should print: false
node -e "const fs=require('fs');const f=require('child_process').execSync('ls dist/assets/index-*.js').toString().trim();console.log(fs.readFileSync(f,'utf8').includes('/api/enrich'))"
```

---

## Folder Structure

```
my-vinyl/
├── index.html                 # HTML shell, theme flash prevention, fonts
├── package.json
├── vite.config.ts             # Vite + React + Tailwind + apiPlugin
├── tsconfig.json              # App TypeScript config
├── tsconfig.app.json
├── tsconfig.node.json         # Node/Vite config types
├── eslint.config.js
├── .env.example               # Template for all env vars
├── .gitignore
├── README.md                  # Quick start guide
├── PROJECT_SNAPSHOT.md        # ← This file
├── MISSION.md                 # Product vision
├── ROADMAP.md                 # Phase planning
├── SCHEMA.md                  # Data model summary (partially outdated)
├── CONTEXT.md                 # Agent context (partially outdated)
│
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── images/                # Hero/marketing photography
│
├── dist/                      # Production build output (generated, deploy this)
│
├── server/                    # Dev-only API middleware (NOT deployed to Vercel)
│   ├── api-plugin.ts          # Vite plugin — registers all /api/* routes
│   ├── discogs.ts             # Server-side Discogs helpers (enrich cache)
│   ├── spotify.ts             # Spotify search + audio features
│   ├── lastfm.ts              # Last.fm album/similar/vibe
│   ├── youtube.ts               # YouTube search
│   ├── deezer.ts              # Deezer enrichment candidates
│   ├── play-audio.ts          # Spotify → YouTube playback resolver
│   ├── enrich-track.ts        # Main enrichment orchestrator
│   ├── enrich-candidates.ts   # Collect BPM/key candidates from APIs
│   ├── enrich-scoring.ts      # Score and pick best BPM/key
│   ├── enrich-timeout.ts      # Timeout wrapper
│   ├── bpm.ts                 # Genre BPM/Camelot estimation
│   ├── camelot-wheel.ts       # Camelot wheel helpers
│   ├── key.ts                 # Musical key → Camelot conversion
│   ├── track-match.ts         # Title/artist fuzzy matching
│   ├── track-title.ts         # Title normalization
│   ├── studio-album.ts        # Studio vs compilation detection
│   └── play-audio-log.ts      # Debug logging
│
├── scripts/
│   ├── debug-enrich.mjs
│   ├── debug-play-audio.mjs
│   └── debug-spotify-preview.mjs
│
├── docs/
│   ├── schema-full.md         # Future Drizzle/PostgreSQL schema (NOT live)
│   ├── AGENTS.md
│   └── README.md
│
└── src/
    ├── main.tsx               # React entry point
    ├── App.tsx                # Main app shell, routing, modals
    ├── index.css              # Global styles + design tokens
    │
    ├── contexts/
    │   └── AuthContext.tsx     # Supabase auth state
    │
    ├── hooks/
    │   ├── useCollection.ts   # Central state: records, settings, enrich, persist
    │   ├── useTheme.ts
    │   ├── useTrackPreview.ts
    │   └── useSpotifyPreview.ts
    │
    ├── components/
    │   ├── Auth/
    │   │   ├── Login.tsx
    │   │   └── UserMenu.tsx
    │   ├── labels/
    │   │   ├── CrateLabel.tsx
    │   │   └── LabelInspectModal.tsx
    │   ├── AddRecordModal.tsx
    │   ├── BackgroundSyncIndicator.tsx
    │   ├── BarcodeScannerModal.tsx
    │   ├── ClearCollectionModal.tsx
    │   ├── CollectionDiscogsFloating.tsx
    │   ├── CollectionFilters.tsx
    │   ├── CollectionHero.tsx
    │   ├── CollectionListView.tsx
    │   ├── CollectionLoadError.tsx
    │   ├── CollectionLoading.tsx
    │   ├── DiscoverAddPanel.tsx
    │   ├── DiscogsImportModal.tsx
    │   ├── DiscogsSearch.tsx
    │   ├── DiscogsSearchBar.tsx
    │   ├── EmptyCollection.tsx
    │   ├── ErrorBoundary.tsx
    │   ├── GridView.tsx
    │   ├── LabelPrint.tsx
    │   ├── MyVinylBrandMark.tsx
    │   ├── Navigation.tsx
    │   ├── Onboarding.tsx
    │   ├── PlayNextPanel.tsx
    │   ├── RecordArtwork.tsx
    │   ├── RecordCard.tsx
    │   ├── RecordDetailModal.tsx
    │   ├── ShelfView.tsx
    │   ├── StarterVibeSelector.tsx
    │   ├── ThemeToggle.tsx
    │   └── VibeDiscovery.tsx
    │
    └── lib/
        ├── api.ts              # API facade (enrich, playback, album info, Discogs exports)
        ├── camelot.ts          # Camelot wheel math
        ├── clientEnrichment.ts # Production enrichment fallback
        ├── collectionClear.ts
        ├── discogs.ts          # Re-exports from api.ts
        ├── discogsCover.ts     # Cover URL normalization (i.discogs.com)
        ├── discogsDirect.ts    # Browser-side Discogs API
        ├── discogsImport.ts    # Bulk collection import logic
        ├── formats.ts          # Vinyl format helpers
        ├── labelContent.ts
        ├── playSession.ts      # Play queue / selection
        ├── recommendations.ts  # Play Next scoring
        ├── recordMigration.ts  # Background tracklist + enrich migration
        ├── records.ts          # Supabase CRUD (THE persistence layer)
        ├── seed.ts             # Demo records
        ├── storage.ts          # localStorage settings + ID generation
        ├── supabase.ts         # Supabase client init
        ├── tracks.ts           # Track enrichment, migration, merge helpers
        ├── types.ts            # VinylRecord, Track, AppSettings types
        ├── vibes.ts            # Vibe tag suggestions + config
        └── youtubePlayer.ts    # YouTube iframe player wrapper
```

### Most critical files (touch with care)

| File | Why it matters |
|------|----------------|
| `src/lib/records.ts` | All Supabase persistence |
| `src/hooks/useCollection.ts` | App state orchestration |
| `src/lib/api.ts` | API routing between dev server and client fallback |
| `src/lib/discogsDirect.ts` | All live Discogs functionality |
| `src/lib/discogsCover.ts` | Cover image loading on Vercel |
| `src/lib/clientEnrichment.ts` | Production BPM/key estimates |
| `src/lib/tracks.ts` | Track enrichment pipeline |
| `server/api-plugin.ts` | Dev-only API surface |
| `vite.config.ts` | Wires dev API plugin |

---

## Environment Variables

### Required on Vercel (build + runtime)

These **`VITE_` prefixed** variables must be set in the Vercel dashboard **before building**. Vite inlines them at build time; changing them requires a redeploy.

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | Supabase project URL | [Supabase Dashboard → Settings → API](https://supabase.com/dashboard/project/_/settings/api) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | Same as above |
| `VITE_DISCOGS_TOKEN` | Discogs personal access token for browser API calls | [Discogs Developer Settings](https://www.discogs.com/settings/developers) |

> Without `VITE_DISCOGS_TOKEN`, search/import/barcode features throw `DiscogsUnavailableError`.  
> Without Supabase vars, the app throws at startup in `src/lib/supabase.ts`.

### Local development only (`.env.local`)

Copy from `.env.example`. These are used by the Vite dev server middleware.

| Variable | Required locally? | Description |
|----------|-------------------|-------------|
| `DISCOGS_TOKEN` | Recommended | Server-side Discogs for `/api/enrich` cache |
| `SPOTIFY_CLIENT_ID` | Optional | Spotify previews + enrichment |
| `SPOTIFY_CLIENT_SECRET` | Optional | Spotify previews + enrichment |
| `LASTFM_API_KEY` | Optional | Vibe tags, album wiki, similar tracks |
| `YOUTUBE_API_KEY` | Optional | Improves YouTube search for audio fallback |

> `DISCOGS_TOKEN` and `VITE_DISCOGS_TOKEN` are usually the **same** Discogs personal access token.  
> `DISCOGS_TOKEN` is never exposed to the browser.  
> `VITE_DISCOGS_TOKEN` is compiled into the client bundle — use a token with appropriate Discogs permissions.

### NOT needed on Vercel (unless you add serverless API routes)

| Variable | Why not needed |
|----------|----------------|
| `DISCOGS_TOKEN` | No server middleware in static deploy |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | No `/api/spotify` or `/api/enrich` |
| `LASTFM_API_KEY` | No `/api/lastfm` |
| `YOUTUBE_API_KEY` | No `/api/play/audio` |

### Vercel setup checklist

1. Create project linked to `https://github.com/Jools007/myvinyl.git`
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_DISCOGS_TOKEN`
5. Deploy
6. Verify: sign in, collection loads, Discogs search works, covers display, enrichment shows estimates (not errors)

### Local setup checklist

```bash
git clone https://github.com/Jools007/myvinyl.git
cd my-vinyl
npm install
cp .env.example .env.local
# Fill in all keys in .env.local
npm run dev
# Open http://localhost:5174
```

---

## Recovery Commands

```bash
# Full clean rebuild
rm -rf node_modules dist
npm install
npm run build

# Lint
npm run lint

# Preview production build locally
npm run build && npm run preview
```

---

## Related documentation

| File | Contents |
|------|----------|
| `README.md` | Quick start & deployment summary |
| `MISSION.md` | Product vision and design direction |
| `ROADMAP.md` | Feature phases |
| `SCHEMA.md` | Data model principles (target architecture) |
| `docs/schema-full.md` | Future Drizzle DDL (not live) |
| `.env.example` | Environment variable template |

---

*If this snapshot conflicts with older docs (`CONTEXT.md`, `SCHEMA.md`), trust the code in `src/lib/records.ts`, `src/hooks/useCollection.ts`, and `src/lib/api.ts` as the source of truth.*