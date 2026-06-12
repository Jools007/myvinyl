# My Vinyl — Migration Plan

> **From:** Vite + React 19 + static Vercel (`dist/`)  
> **To:** Next.js 15 App Router + Vercel full-stack (Route Handlers + Server Actions)  
> **Reference:** `PROJECT_SNAPSHOT.md` for current state  
> **Goal:** Production parity with local dev — enrichment, audio previews, secure API keys, scalable foundation

---

## Current Limitations

The app works well locally but is **architecturally split** between what runs in the browser and what only exists on the Vite dev server.

| Limitation | Impact today |
|------------|--------------|
| **Static-only Vercel deploy** | `/api/enrich`, `/api/play/audio`, `/api/spotify/audio`, `/api/lastfm/*` do not exist in production |
| **Exposed Discogs token** | `VITE_DISCOGS_TOKEN` is compiled into the client bundle — acceptable for a personal app, not ideal long-term |
| **Client-side enrichment fallback** | Live site gets genre-based BPM/Camelot estimates only; no Spotify/Last.fm vibes or track-specific data |
| **No audio on production** | Spotify previews and YouTube fallback are dev-only |
| **Entire collection loaded at once** | No SSR, no pagination, no streaming — fine for small libraries, risky at 1,000+ records |
| **Dual code paths** | `import.meta.env.DEV` branches in `api.ts`; `clientEnrichment.ts` vs `server/enrich-track.ts` |
| **Flat Supabase schema** | Single `records` table with JSON `tracklist` — works, but blocks normalized catalog/enrichment versioning |
| **Settings in localStorage** | Theme/view mode not synced across devices |

**Why migrate now:** The product promise (BPM, Camelot, vibes, play recommendations, audio previews) is only fully delivered in `npm run dev`. Next.js on Vercel gives us real API routes, server-only secrets, and a path to the normalized schema in `docs/schema-full.md` without another platform change.

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel (Next.js 15)                       │
├─────────────────────────────────────────────────────────────────┤
│  app/                                                            │
│    (marketing)/layout.tsx          ← public shell (optional)     │
│    (app)/layout.tsx                ← auth gate, nav, providers   │
│    (app)/collection/page.tsx       ← collection views            │
│    (app)/play/page.tsx             ← play mode                   │
│    (app)/labels/page.tsx           ← label printer               │
│    api/enrich/route.ts             ← port server/enrich-track    │
│    api/play/audio/route.ts         ← port server/play-audio      │
│    api/spotify/audio/route.ts      ← port server/spotify         │
│    api/discogs/search/route.ts     ← server-side Discogs         │
│    api/discogs/release/[id]/route.ts                             │
│    api/album-info/route.ts         ← Last.fm + Discogs notes     │
│    api/lastfm/vibe/route.ts                                      │
├─────────────────────────────────────────────────────────────────┤
│  Server-only secrets (env, never NEXT_PUBLIC_*)                  │
│    DISCOGS_TOKEN, SPOTIFY_*, LASTFM_API_KEY, YOUTUBE_API_KEY     │
├─────────────────────────────────────────────────────────────────┤
│  Client (React 19 + Framer Motion + Tailwind v4)                 │
│    components/  ← migrated from src/components/                  │
│    hooks/       ← useCollection, useTrackPreview, etc.           │
├─────────────────────────────────────────────────────────────────┤
│  Shared lib/                                                     │
│    types, camelot, recommendations, discogsCover, tracks         │
├─────────────────────────────────────────────────────────────────┤
│  Supabase                                                        │
│    Auth (email/password) via @supabase/ssr                       │
│    PostgreSQL `records` table (Phase 1–3)                      │
│    Normalized schema (Phase 5+, optional)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Stack (target)

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 15** App Router | Route Handlers replace Vite `api-plugin.ts` |
| UI | **React 19** | Same version; mark interactive components `'use client'` |
| Styling | **Tailwind CSS v4** | Port `index.css` design tokens; keep CSS variables |
| Animation | **Framer Motion 12** | Client components only; no change to motion patterns |
| Auth | **Supabase Auth + `@supabase/ssr`** | Cookie-based sessions; middleware refresh |
| Database | **Supabase PostgreSQL** | Keep `records` table initially |
| Toasts | **Sonner** | Wrap in client provider in root layout |
| Icons | **Lucide React** | Unchanged |
| Barcode | **html5-qrcode** | Client-only (camera API) |
| Deployment | **Vercel** | Single project: frontend + API routes |

### What changes for the user

- **Nothing visible** in Phase 1–3 if done right — same UI, same flows
- **Production gains** full enrichment, Spotify previews, YouTube fallback, Last.fm vibes
- **Discogs token** moves server-side — search/import still feel instant via API routes

---

## Migration Phases

### Phase 0 — Prep & baseline (no Next.js yet)

**Goal:** Freeze a known-good state and define acceptance criteria.

| Task | Detail |
|------|--------|
| Tag release | Git tag `v0-vite-baseline` on current `main` |
| Document env | Confirm all keys in `.env.example`; audit Vercel dashboard |
| Smoke test checklist | Sign in, add record, enrich, play preview, print label, import Discogs |
| Decide repo strategy | **Recommended:** new branch `nextjs-migration` or folder `apps/web` in monorepo — pick one and stick to it |
| Copy assets | List `public/`, `index.css`, fonts — inventory for port |

**Exit criteria:** `PROJECT_SNAPSHOT.md` accurate; checklist passes on local `npm run dev`.

**Effort:** 0.5–1 day

---

### Phase 1 — Next.js scaffold + design system port

**Goal:** Empty Next app that looks like MyVinyl (theme, fonts, nav shell) with no features yet.

| Task | Detail |
|------|--------|
| `create-next-app` | Next 15, App Router, TypeScript, Tailwind v4, ESLint |
| Port `index.css` | Move design tokens (`--bg`, `--accent`, etc.) to `app/globals.css` |
| Port fonts | DM Sans + Inter via `next/font` (replace Google Fonts link) |
| Theme flash prevention | Port `index.html` inline script → layout or `next-themes` |
| Root layouts | `(app)/layout.tsx` with providers: Auth, Theme, Toaster |
| Port static assets | `public/favicon.svg`, `public/images/*` |
| Port `MyVinylBrandMark`, `Navigation`, `ThemeToggle` | Client components |
| Auth pages | Port `Login.tsx` → `app/login/page.tsx` |
| Supabase SSR setup | `lib/supabase/server.ts`, `client.ts`, `middleware.ts` for session refresh |

**Do not port yet:** collection, Discogs, enrichment, play mode.

**Exit criteria:** `npm run dev` shows login + empty shell with correct dark theme; Supabase sign-in works.

**Effort:** 2–3 days

---

### Phase 2 — Supabase + collection CRUD

**Goal:** Authenticated users can load, add, edit, delete records — same as today.

| Task | Detail |
|------|--------|
| Port `src/lib/types.ts` | → `lib/types.ts` |
| Port `src/lib/records.ts` | Use server client for RSC; browser client for optimistic UI |
| Port `useCollection.ts` | Stays client hook; fetch via Route Handler or Server Action |
| **Decision:** Server Actions vs Route Handlers for CRUD | See Key Decisions below |
| Port collection pages | Grid, shelf, list views as client components under `app/collection/` |
| Port modals | `RecordDetailModal`, `DiscoverAddPanel`, filters, empty/loading/error states |
| Port `localStorage` settings | `storage.ts` unchanged for Phase 2 |
| Verify RLS | Ensure `user_id = auth.uid()` policies on `records` |

**Exit criteria:** Full collection CRUD on Next dev server; data round-trips to same Supabase project.

**Effort:** 4–6 days

---

### Phase 3 — Server-side API routes (enrichment + audio)

**Goal:** Production Vercel has feature parity with local Vite dev server.

This is the **highest-value phase** — it fixes the core production gap.

| Task | Detail |
|------|--------|
| Move `server/` → `lib/server/` or keep co-located in `app/api/` handlers | Port modules as-is first, refactor later |
| `/api/enrich` | `app/api/enrich/route.ts` — wire `enrich-track.ts`, `enrich-scoring.ts`, etc. |
| `/api/spotify/audio` | `app/api/spotify/audio/route.ts` |
| `/api/play/audio` | `app/api/play/audio/route.ts` — keep 22s timeout behavior |
| `/api/album-info` | `app/api/album-info/route.ts` |
| `/api/lastfm/vibe` + `/api/lastfm/similar` | Route handlers |
| Port `src/lib/api.ts` | Remove `import.meta.env.DEV` branch; always call `/api/*` |
| Remove `VITE_DISCOGS_TOKEN` from client | After Phase 4; keep fallback until Discogs routes exist |
| Deprecate `clientEnrichment.ts` as primary | Keep as graceful fallback when APIs rate-limit or fail |
| Env on Vercel | Add `DISCOGS_TOKEN`, `SPOTIFY_*`, `LASTFM_API_KEY`, `YOUTUBE_API_KEY` (no `NEXT_PUBLIC_`) |

**Exit criteria:** Deploy preview on Vercel; enrich a record, hear Spotify preview, see Last.fm vibes — same as local.

**Effort:** 3–5 days

---

### Phase 4 — Server-side Discogs

**Goal:** Remove client-exposed Discogs token; all Discogs traffic via server.

| Current (client) | Target (server) |
|------------------|-----------------|
| `discogsDirect.ts` + `VITE_DISCOGS_TOKEN` | Route Handlers + `DISCOGS_TOKEN` |
| Browser → `api.discogs.com` | Server → `api.discogs.com` |

| Task | Detail |
|------|--------|
| `GET /api/discogs/search` | Query, barcode params |
| `GET /api/discogs/release/[id]` | Release detail + tracklist |
| `GET /api/discogs/collection` | Paginated import (username in query) |
| Port `discogsCover.ts` | Shared; still normalize to `i.discogs.com` — **no image proxy** |
| Update UI callers | `DiscogsSearchBar`, `BarcodeScannerModal`, `DiscogsImportModal`, add flows |
| Remove `VITE_DISCOGS_TOKEN` | From Vercel env and `.env.example` |
| Rate limiting | Return 429 with retry message (match current UX) |

**Exit criteria:** App works with zero Discogs keys in client bundle; grep `NEXT_PUBLIC` / bundle analysis clean.

**Effort:** 2–3 days

---

### Phase 5 — Play mode, labels, polish

**Goal:** Remaining pages and background jobs at parity.

| Task | Detail |
|------|--------|
| Port `PlayNextPanel`, recommendations, queue | `app/play/page.tsx` |
| Port `useTrackPreview`, `youtubePlayer` | Client; calls `/api/play/audio` |
| Port `LabelPrint`, `CrateLabel`, print CSS | `app/labels/page.tsx`; `no-print` classes |
| Port background migration | `recordMigration.ts` — runs client-side post-hydration (same pattern) |
| Port onboarding, vibe discovery | `Onboarding`, `VibeDiscovery` (Last.fm via API) |
| Barcode scanner | Client-only; unchanged |
| Responsive pass | See Risks — dedicated QA on mobile |

**Exit criteria:** All three nav tabs work; print preview correct; play recommendations score correctly.

**Effort:** 3–4 days

---

### Phase 6 — Cutover, decommission Vite

**Goal:** Next.js is production; Vite repo path archived.

| Task | Detail |
|------|--------|
| Final QA | Run smoke checklist on Vercel production URL |
| DNS / domain | Point domain to Next deployment |
| Remove Vite entry | Delete `vite.config.ts`, `index.html`, `src/main.tsx` or move to `legacy/` |
| Update docs | `README.md`, `PROJECT_SNAPSHOT.md`, `.env.example` |
| Monitor | Vercel logs for 502/429 on enrich and play routes |

**Exit criteria:** `main` builds with `next build`; no Vite in `package.json` scripts.

**Effort:** 1–2 days

---

### Phase 7 — Optional: schema normalization (post-migration)

**Goal:** Align database with `docs/schema-full.md` — **not required for launch**.

| Task | Detail |
|------|--------|
| Drizzle ORM + migrations | `releases`, `collection_items`, `tracks`, `enrichment_snapshots` |
| Data migration script | `records` JSON → normalized tables |
| Pagination + search | Server-side collection query with cursor |

**Defer until:** Collection CRUD and APIs are stable on Next.js.

**Effort:** 2–4 weeks (separate project)

---

## Key Technical Decisions

Decide these **before Phase 2** to avoid rework.

### 1. Repo layout

| Option | Pros | Cons |
|--------|------|------|
| **A. Replace in place** | Single repo, simple Vercel | `main` broken during migration unless branch discipline is strict |
| **B. `apps/web` monorepo** | Vite keeps running | More tooling upfront |
| **C. New repo, copy at end** | Clean history | Harder to diff during migration |

**Recommendation:** Option A on branch `nextjs-migration`; merge when Phase 6 passes QA.

### 2. Folder structure (Next.js)

```
app/
  (auth)/login/page.tsx
  (app)/
    layout.tsx              # AuthProvider, ThemeProvider, Toaster, Navigation
    collection/page.tsx
    play/page.tsx
    labels/page.tsx
  api/
    enrich/route.ts
    play/audio/route.ts
    discogs/search/route.ts
    ...
components/                 # Port from src/components/ (mostly 'use client')
hooks/                      # useCollection, useTheme, useTrackPreview
lib/
  supabase/                 # server.ts, client.ts, middleware.ts
  server/                   # Ported from server/ (enrich, spotify, discogs, etc.)
  types.ts
  records.ts
  tracks.ts
  api.ts                    # Client fetch facade → /api/*
  discogsCover.ts
  recommendations.ts
  ...
middleware.ts               # Supabase session refresh
```

### 3. Styling approach

| Decision | Recommendation |
|----------|----------------|
| Tailwind v4 | Keep — already used; port `index.css` tokens to `globals.css` |
| CSS variables | Keep `--bg`, `--text`, etc. — UI depends on them |
| Framer Motion | Client components only; wrap pages that animate |
| `clsx` | Keep for conditional classes |
| Print styles | Port `no-print` and label CSS verbatim |

**Do not** switch to CSS Modules or styled-components mid-migration.

### 4. State management

| Concern | Approach |
|---------|----------|
| Collection state | Keep `useCollection` hook (client) — proven, handles debounced persist + live enrich |
| Auth | `AuthContext` + Supabase SSR cookies |
| Settings | `localStorage` in Phase 2–5; optional `user_settings` table in Phase 7 |
| Server data | Start with client fetch; introduce RSC + `cache()` later for collection list |
| URL state | Filters stay in React state for Phase 2; consider `nuqs` later for shareable filter URLs |

**No Redux/Zustand** unless a concrete pain point appears.

### 5. Supabase integration pattern

| Layer | Pattern |
|-------|---------|
| Middleware | `@supabase/ssr` `updateSession` — refresh JWT on every request |
| Server Components | `createServerClient` for initial collection fetch (optional optimization) |
| Client mutations | Server Actions **or** Route Handlers called from `useCollection` |
| RLS | Keep existing policies; never use service role key in client |

**Recommendation for Phase 2:** Route Handlers (`/api/records`) mirroring current `records.ts` operations — minimal change to `useCollection`. Migrate to Server Actions in a later cleanup if desired.

### 6. Discogs: client → server

```
Before:  Browser --[VITE_DISCOGS_TOKEN]--> api.discogs.com
After:   Browser --> /api/discogs/* --> Server --[DISCOGS_TOKEN]--> api.discogs.com
```

- Reuse logic from `src/lib/discogsDirect.ts` in `lib/server/discogs.ts`
- Covers stay direct CDN URLs in DB — server returns normalized `coverUrl`, never proxies images
- User-Agent: `MyVinyl/1.0 +https://myvinyl.app` (or production domain)

### 7. Enrichment architecture

```
Browser                    Next.js API                    External
   |  GET /api/enrich          |                              |
   | ------------------------> |  Discogs (release cache)     |
   |                           |  Spotify (BPM, preview)      |
   |                           |  Last.fm (tags, key)         |
   |                           |  Deezer (candidates)         |
   |                           |  genre fallback (bpm.ts)     |
   | <------------------------ |                              |
```

- Port `server/enrich-track.ts` and dependencies **verbatim** first
- `clientEnrichment.ts` becomes fallback when `fetch('/api/enrich')` fails (network, 503, rate limit)
- Long-running enrich batches stay **client-orchestrated** (sequential per track with delays) — same as `enrichReleaseTracksSequential`

### 8. Audio playback

| Piece | Migration note |
|-------|----------------|
| `/api/play/audio` | Server Route Handler; port `play-audio.ts` + `youtube.ts` |
| `useTrackPreview` | Client hook; unchanged API surface |
| YouTube player | `youtubePlayer.ts` stays client-only (iframe) |
| Timeouts | Keep ~22s client timeout — documented in snapshot |
| CSP | Add `frame-src` for YouTube in `next.config.ts` headers if needed |

### 9. Preserving UI and animations

| Risk | Mitigation |
|------|------------|
| Framer Motion + RSC | Every animated component gets `'use client'` at top of file |
| Hydration mismatch | Theme script in layout; avoid rendering theme-dependent values on server without `suppressHydrationWarning` on `<html>` |
| Modal portals | `createPortal` still works; ensure `document` access only in `useEffect` |
| `AnimatePresence` | Wrap client page sections; don't animate Server Components |
| CSS load order | Single `globals.css` import in root layout |

**Strategy:** Port components file-by-file with `'use client'`; avoid rewriting markup during migration.

### 10. Environment variables (Next.js naming)

| Vite (old) | Next.js (new) | Exposure |
|------------|---------------|----------|
| `VITE_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Public |
| `VITE_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public |
| `VITE_DISCOGS_TOKEN` | **Remove** — use `DISCOGS_TOKEN` server-only | Secret |
| `DISCOGS_TOKEN` | `DISCOGS_TOKEN` | Secret |
| `SPOTIFY_CLIENT_ID` | `SPOTIFY_CLIENT_ID` | Secret |
| `SPOTIFY_CLIENT_SECRET` | `SPOTIFY_CLIENT_SECRET` | Secret |
| `LASTFM_API_KEY` | `LASTFM_API_KEY` | Secret |
| `YOUTUBE_API_KEY` | `YOUTUBE_API_KEY` | Secret |

---

## Risks and Things to Watch Out For

### High risk

| Risk | Mitigation |
|------|------------|
| **Breaking Supabase auth** | Implement SSR middleware early (Phase 1); test sign-in/out on every phase |
| **Enrichment regressions** | Port `server/` as copy-paste first; run `scripts/debug-enrich.mjs` against Next API |
| **Audio CSP / iframe blocks** | Test YouTube embed on Vercel preview; configure `headers` in `next.config` |
| **Framer Motion hydration errors** | Client-boundary audit; no motion on server-rendered trees |
| **Long API route timeouts** | Vercel Hobby = 10s serverless limit; enrich/play may need streaming, background job, or Pro plan — **test early in Phase 3** |

### Medium risk

| Risk | Mitigation |
|------|------------|
| Discogs rate limits during import | Keep batch delays from `discogsImport.ts`; surface 429 messages |
| Bundle size increase | Next + React 19 — monitor; dynamic import for barcode scanner |
| `useCollection` persist race | Keep debounce + `enrichActiveRecordIdRef` logic intact |
| Cover images | Never reintroduce `/api/image` proxy; keep `resolveDiscogsCoverUrl` |
| Mobile responsive gaps | Current UI is desktop-first — schedule responsive QA in Phase 5, not Phase 6 |

### Low risk / easy to miss

| Risk | Mitigation |
|------|------------|
| `localStorage` SSR crash | Guard with `typeof window !== 'undefined'` (already in `storage.ts`) |
| Print styles | Test `window.print()` on labels page after port |
| Demo seed data | Port `seed.ts` for dev testing |
| Debug scripts | Update `scripts/debug-*.mjs` base URL to `localhost:3000` |

### Do not do during migration

- Normalize database schema (Phase 7 only)
- Rewrite `useCollection` from scratch
- Change design tokens or typography
- Add new features (responsive redesign, new APIs)
- Re-expose API secrets to the client

---

## Estimated Effort per Phase

| Phase | Scope | Effort (solo dev) | Cumulative |
|-------|-------|-------------------|------------|
| **0** | Prep & baseline | 0.5–1 day | ~1 day |
| **1** | Next scaffold + design system | 2–3 days | ~4 days |
| **2** | Supabase + collection CRUD | 4–6 days | ~10 days |
| **3** | API routes (enrich + audio) | 3–5 days | ~15 days |
| **4** | Server-side Discogs | 2–3 days | ~18 days |
| **5** | Play, labels, polish | 3–4 days | ~22 days |
| **6** | Cutover & decommission Vite | 1–2 days | ~24 days |
| **7** | Schema normalization (optional) | 2–4 weeks | separate |

**Total to production parity:** ~4–5 weeks calendar time (solo), assuming part-time context switching and QA.

**Critical path:** Phase 1 → 2 → 3 → 6. Phases 4 and 5 can overlap partially with 3 if two people are available.

---

## Suggested first PR (after Phase 0)

```
feat(next): scaffold App Router with theme, auth, and empty shell

- create-next-app Next 15 + Tailwind v4
- port globals.css design tokens from index.css
- Supabase SSR middleware + login page
- Navigation + ThemeToggle (client)
- No collection or API routes yet
```

---

## Acceptance checklist (final cutover)

Use this identically on **Vite baseline** and **Next production** to confirm parity.

- [ ] Sign up / sign in / sign out
- [ ] Collection loads with loading and error states
- [ ] Add record via Discogs search
- [ ] Add record via barcode scan
- [ ] Bulk Discogs import (small batch)
- [ ] Cover images load (`i.discogs.com`)
- [ ] Enrich release — BPM + Camelot populated (not estimate-only)
- [ ] Spotify preview plays in Play mode
- [ ] YouTube fallback plays when no preview
- [ ] Play Next recommendations appear
- [ ] Mark record as played
- [ ] Print crate label
- [ ] Theme toggle (light / dark / system)
- [ ] Grid, shelf, and list views
- [ ] Edit and delete record
- [ ] No secrets in client bundle (`DISCOGS_TOKEN`, `SPOTIFY_SECRET` absent from JS)

---

## Related documents

| File | Use during migration |
|------|---------------------|
| `PROJECT_SNAPSHOT.md` | Source of truth for current behavior |
| `docs/schema-full.md` | Phase 7 target schema only |
| `server/api-plugin.ts` | Route map for Phase 3 |
| `src/lib/api.ts` | Client API facade to rewrite |
| `src/hooks/useCollection.ts` | State orchestration to preserve |
| `.env.example` | Env var migration reference |

---

*This plan prioritizes **production feature parity** and **UI preservation** over schema redesign. Ship Phases 1–6 first; treat normalized PostgreSQL as a follow-on project.*