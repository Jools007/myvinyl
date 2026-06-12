# My Vinyl — Serverless Migration Plan

> **Strategy:** Keep **Vite + React 19** frontend; add **Vercel Serverless Functions** for `/api/*` in production.  
> **Not doing:** Next.js migration (see `MIGRATION_PLAN.md` for why that was deferred).  
> **Reference:** `PROJECT_SNAPSHOT.md` for current architecture.

---

## Why This Approach (Not Next.js Right Now)

| Factor | Serverless on Vite | Full Next.js migration |
|--------|-------------------|------------------------|
| **Scope** | Add `api/` + `vercel.json`; refactor `server/` | Rebuild routing, layouts, SSR, auth middleware |
| **UI risk** | Near zero — same components, same `src/` | High — `'use client'` boundaries, hydration, port every page |
| **Time to production APIs** | ~1–2 weeks | ~4–5 weeks |
| **Existing investment** | `server/` logic already written and tested locally | Throw away Vite entry, `api-plugin`, `index.html` patterns |
| **Team focus** | Fix the actual problem (missing `/api` on Vercel) | Platform change while UI/responsive work is pending |

**The real gap today:** Production is a static `dist/` folder. The Vite dev plugin (`server/api-plugin.ts`) serves enrichment, Spotify, Last.fm, and YouTube routes locally — they simply do not exist on Vercel.

**Serverless gives us a real backend without changing the frontend stack.** We already have the business logic in `server/`; we need thin HTTP adapters Vercel can deploy alongside the Vite build.

---

## How Vercel + Vite Works Together

```
Browser (React SPA from dist/)
    │
    ├── GET /collection          → dist/index.html (SPA rewrite)
    ├── GET /api/enrich          → Vercel Serverless Function
    ├── GET /api/play/audio      → Vercel Serverless Function
    └── GET /api/discogs/search  → Vercel Serverless Function (new)
```

1. **`npm run build`** produces static assets in `dist/` (unchanged).
2. **`api/` folder** at the **project root** (not inside `src/`) defines serverless functions.
3. **`vercel.json`** tells Vercel:
   - Build command + output directory (`dist`)
   - Rewrite non-API traffic to `index.html` for client-side routing
   - Leave `/api/*` to serverless handlers

Vercel automatically deploys both the static build and the `api/` functions in a single project.

---

## Target Folder Structure

```
my-vinyl/
├── api/                          # NEW — Vercel Serverless Functions (production)
│   ├── _lib/                     # Shared handler utilities (not a route)
│   │   ├── env.ts                # Read process.env with validation
│   │   ├── response.ts           # json(), error helpers
│   │   └── cors.ts               # Optional CORS for dev
│   ├── enrich.ts                 # GET /api/enrich
│   ├── album-info.ts             # GET /api/album-info
│   ├── spotify/
│   │   └── audio.ts              # GET /api/spotify/audio
│   ├── play/
│   │   └── audio.ts              # GET /api/play/audio
│   ├── lastfm/
│   │   ├── vibe.ts               # GET /api/lastfm/vibe
│   │   └── similar.ts            # GET /api/lastfm/similar
│   └── discogs/                  # Phase 3 — server-side Discogs
│       ├── search.ts             # GET /api/discogs/search
│       ├── release/
│       │   └── [id].ts           # GET /api/discogs/release/:id
│       └── collection.ts         # GET /api/discogs/collection
│
├── server/                       # KEEP — shared business logic (no HTTP)
│   ├── handlers/                 # NEW — extracted route logic
│   │   ├── enrich.ts
│   │   ├── play-audio.ts
│   │   ├── spotify-audio.ts
│   │   ├── album-info.ts
│   │   ├── lastfm-vibe.ts
│   │   └── lastfm-similar.ts
│   ├── enrich-track.ts           # Unchanged orchestration
│   ├── spotify.ts
│   ├── lastfm.ts
│   ├── play-audio.ts
│   ├── discogs.ts
│   └── ...                       # Existing modules
│
├── server/api-plugin.ts          # KEEP for dev — thin dispatcher → handlers/
│
├── src/                          # Unchanged Vite frontend
│   ├── lib/
│   │   ├── api.ts                # Always fetch /api/* (remove DEV-only branch)
│   │   ├── discogsDirect.ts      # Phase 3 → calls /api/discogs/*
│   │   └── clientEnrichment.ts   # Fallback only when API fails
│   └── components/               # Unchanged
│
├── vercel.json                   # NEW — SPA + API config
├── vite.config.ts                # Unchanged (api-plugin for local dev)
├── package.json                  # Add @vercel/node (devDep)
└── dist/                         # Static output (generated)
```

### Routing map

| URL | File | Source logic |
|-----|------|--------------|
| `/api/enrich` | `api/enrich.ts` | `server/handlers/enrich.ts` |
| `/api/album-info` | `api/album-info.ts` | `server/handlers/album-info.ts` |
| `/api/spotify/audio` | `api/spotify/audio.ts` | `server/handlers/spotify-audio.ts` |
| `/api/play/audio` | `api/play/audio.ts` | `server/handlers/play-audio.ts` |
| `/api/lastfm/vibe` | `api/lastfm/vibe.ts` | `server/handlers/lastfm-vibe.ts` |
| `/api/lastfm/similar` | `api/lastfm/similar.ts` | `server/handlers/lastfm-similar.ts` |
| `/api/discogs/search` | `api/discogs/search.ts` | `server/discogs.ts` + `discogsDirect` parsers |
| `/api/discogs/release/[id]` | `api/discogs/release/[id].ts` | `server/discogs.ts` `getRelease` |
| `/api/discogs/collection` | `api/discogs/collection.ts` | `server/discogs.ts` collection page |

---

## Moving `server/` Logic Into API Routes

### Principle: handlers once, two thin entry points

```
┌─────────────────────┐     ┌─────────────────────┐
│  server/api-plugin  │     │  api/*.ts (Vercel)  │
│  (Vite dev only)    │     │  (production)       │
└─────────┬───────────┘     └─────────┬───────────┘
          │                           │
          └───────────┬───────────────┘
                      ▼
          ┌───────────────────────┐
          │  server/handlers/*.ts  │  ← pure functions, no req/res types
          └───────────┬───────────┘
                      ▼
          ┌───────────────────────┐
          │  server/enrich-track   │
          │  server/spotify        │
          │  server/play-audio     │
          │  ...                   │
          └───────────────────────┘
```

### Step 1 — Extract handlers from `api-plugin.ts`

Move each route block into `server/handlers/enrich.ts` (etc.) as an async function:

```ts
// server/handlers/enrich.ts
export type EnrichQuery = { artist: string; title: string; /* ... */ };

export async function handleEnrich(query: EnrichQuery, env: ApiEnv) {
  // Logic currently inside api-plugin /api/enrich block
  return { coverUrl, genres, bpm, /* ... */ };
}
```

### Step 2 — Vercel function (thin wrapper)

```ts
// api/enrich.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleEnrich } from '../server/handlers/enrich';
import { getApiEnv } from './_lib/env';
import { json } from './_lib/response';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const env = getApiEnv();
    const result = await handleEnrich(parseEnrichQuery(req.query), env);
    return json(res, 200, result);
  } catch (e) {
    return json(res, 502, { error: e instanceof Error ? e.message : 'API error' });
  }
}
```

### Step 3 — Slim down `api-plugin.ts`

Replace inline route bodies with calls to the same `handle*` functions. Dev and production share identical logic.

### What stays in `server/` (not duplicated)

- `enrich-track.ts`, `enrich-candidates.ts`, `enrich-scoring.ts`
- `spotify.ts`, `lastfm.ts`, `youtube.ts`, `deezer.ts`
- `play-audio.ts`, `bpm.ts`, `camelot-wheel.ts`, `track-match.ts`
- `discogs.ts` (server-side Discogs client)

### Import from `src/` in API routes

`api-plugin.ts` already imports `resolveDiscogsCoverUrl` from `src/lib/discogsCover.ts`. Vercel bundles `api/` with access to the repo root — this works, but prefer:

- **Shared pure utils** in `server/` or `api/_lib/`
- Avoid importing React or browser-only code into `api/`

---

## Environment Variables

### Target state

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | Client (build-time) | Supabase — browser needs this |
| `VITE_SUPABASE_ANON_KEY` | Client (build-time) | Supabase anon key |
| `DISCOGS_TOKEN` | Server only | Discogs API (enrich cache + `/api/discogs/*`) |
| `SPOTIFY_CLIENT_ID` | Server only | Spotify previews + enrichment |
| `SPOTIFY_CLIENT_SECRET` | Server only | Spotify previews + enrichment |
| `LASTFM_API_KEY` | Server only | Vibes, album wiki, similar |
| `YOUTUBE_API_KEY` | Server only | YouTube audio fallback search |

### Phased removal of `VITE_DISCOGS_TOKEN`

| Phase | Change |
|-------|--------|
| **Now** | `VITE_DISCOGS_TOKEN` still used by `discogsDirect.ts` in browser |
| **Phase 3** | Add `/api/discogs/*`; switch `discogsDirect.ts` to fetch API routes |
| **Phase 4** | Remove `VITE_DISCOGS_TOKEN` from Vercel + `.env.example`; token never in client bundle |

### Vercel dashboard setup

**Production environment** (all deployments):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
DISCOGS_TOKEN=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
LASTFM_API_KEY=...
YOUTUBE_API_KEY=...          # optional but recommended
```

**Important:** Do **not** prefix server secrets with `VITE_`. Only Supabase public keys stay as `VITE_*`.

### Local development (`.env.local`)

Same keys as today. Vite loads them for:
- `api-plugin.ts` via `loadEnv` in `vite.config.ts`
- Client `VITE_*` vars

For `vercel dev` (optional Phase 2+): reads `.env.local` automatically.

---

## New Production Capabilities

After migration, **live Vercel matches local dev** for:

| Capability | Endpoint | User-visible result |
|------------|----------|---------------------|
| **Full track enrichment** | `/api/enrich` | Real BPM/key from Spotify/Last.fm; vibe tags; not estimate-only |
| **Spotify 30s previews** | `/api/spotify/audio` | Preview buttons work in Play mode |
| **YouTube audio fallback** | `/api/play/audio` | Playback when Spotify has no preview |
| **Album descriptions** | `/api/album-info` | Last.fm wiki text in add flow |
| **Vibe discovery** | `/api/lastfm/vibe` | Starter vibe / discovery panel populated |
| **Similar artists/tracks** | `/api/lastfm/similar` | Discovery features (if enabled in UI) |
| **Server-side Discogs** (Phase 3) | `/api/discogs/*` | Search/import without exposed token |

`clientEnrichment.ts` remains a **fallback** when API returns 503/502 or times out — not the primary path.

---

## Migration Phases

### Phase 0 — Prep (half day)

- [ ] Tag current `main` as `v0-static-baseline`
- [ ] Confirm Vercel project: build `npm run build`, output `dist`
- [ ] Add acceptance checklist from `PROJECT_SNAPSHOT.md` (enrich, preview, covers)
- [ ] Install `@vercel/node` as devDependency (TypeScript types for handlers)

**Exit:** Baseline documented; team aligned on serverless (not Next.js).

---

### Phase 1 — `vercel.json` + scaffold `api/` (1 day)

- [ ] Create `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] Add `api/_lib/env.ts` and `api/_lib/response.ts`
- [ ] Add health check `api/health.ts` → `{ ok: true }` for smoke testing
- [ ] Deploy preview; confirm `/api/health` returns JSON and SPA still loads

**Exit:** Vercel runs one serverless function alongside static `dist/`.

---

### Phase 2 — Extract handlers + wire dev plugin (2–3 days)

- [ ] Create `server/handlers/` with pure functions extracted from `api-plugin.ts`
- [ ] Refactor `api-plugin.ts` to call handlers (no behavior change)
- [ ] Run full local smoke test on `npm run dev` — must be identical to before
- [ ] Add Vercel wrappers: `api/enrich.ts`, `api/play/audio.ts`, `api/spotify/audio.ts`, `api/album-info.ts`, `api/lastfm/vibe.ts`, `api/lastfm/similar.ts`
- [ ] Deploy preview; test each endpoint with curl or browser

**Exit:** All existing dev API routes work locally **and** on Vercel preview.

---

### Phase 3 — Frontend always uses `/api` (1 day)

- [ ] Update `src/lib/api.ts`:
  - Remove `if (import.meta.env.DEV)` guard in `fetchEnrichment`
  - Always `fetch('/api/enrich')`; keep `clientEnrichment` as catch fallback
  - Same for any other DEV-only API branches
- [ ] Verify production bundle **includes** `/api/enrich` fetch (intentionally this time)
- [ ] Update `ENRICHMENT_ESTIMATE_HINT` copy — only shown on API failure, not by default
- [ ] Redeploy; run acceptance checklist on preview URL

**Exit:** Production enrichment uses serverless; estimates only on failure.

---

### Phase 4 — Server-side Discogs (2 days, optional but recommended)

- [ ] Add `api/discogs/search.ts`, `api/discogs/release/[id].ts`, `api/discogs/collection.ts`
- [ ] Refactor `src/lib/discogsDirect.ts` → thin client calling `/api/discogs/*`
- [ ] Remove `VITE_DISCOGS_TOKEN` from Vercel env and `.env.example`
- [ ] Grep client bundle: no `discogs.com` token, no `VITE_DISCOGS`

**Exit:** Discogs token server-only; search/import/barcode still work.

---

### Phase 5 — Dev workflow polish + docs (1 day)

- [ ] Document two dev options in `README.md`:
  - **Default:** `npm run dev` (Vite + api-plugin) — fastest
  - **Optional:** `vercel dev` — mirrors production serverless exactly
- [ ] Update `PROJECT_SNAPSHOT.md` and `.env.example`
- [ ] Remove or archive `MIGRATION_PLAN.md` Next.js notes as deferred
- [ ] Production deploy + final QA

**Exit:** Docs match reality; production fully functional.

---

### Total effort

| Phase | Days |
|-------|------|
| 0 | 0.5 |
| 1 | 1 |
| 2 | 2–3 |
| 3 | 1 |
| 4 | 2 |
| 5 | 1 |
| **Total** | **~7–8 days** |

---

## Important Gotchas (Vite + Vercel Serverless)

### 1. Function timeout (critical for `/api/play/audio`)

| Plan | Default timeout |
|------|-----------------|
| Vercel Hobby | **10 seconds** per function |
| Vercel Pro | Configurable up to 60s |

`play-audio.ts` does Spotify then YouTube with retries. Client allows ~22s, but **the serverless function may be killed at 10s on Hobby**.

**Mitigations:**
- Optimize handler: fail fast on Spotify miss; cap YouTube lookup time inside handler (e.g. 6s total budget)
- Set `maxDuration` in route config (Pro only): `export const config = { maxDuration: 30 }`
- Return partial errors quickly; let client retry
- Test on Vercel preview early in Phase 2

### 2. No persistent in-memory cache

`api-plugin.ts` uses `discogsReleaseCache = new Map()` — **this does not survive across serverless invocations**.

**Mitigations:**
- Accept cold-cache on each request (acceptable for enrich)
- Later: Vercel KV or Supabase cache table if rate limits hurt
- Do not rely on module-level Maps for correctness

### 3. Cold starts

First request after idle may be slow (500ms–2s). Enrichment sequential calls amplify this.

**Mitigations:**
- Keep handlers lean; lazy-import heavy modules if needed
- Show existing loading UI (`enriching` states already handle this)
- Consider warming critical paths post-deploy (optional)

### 4. `api/` folder location

- Must be at **repository root**, sibling to `package.json`
- **Not** inside `src/` — Vercel will not auto-detect it there
- Files in `api/_lib/` are not exposed as routes (underscore prefix convention)

### 5. SPA routing vs API

Without `vercel.json` rewrites, refreshing `/collection` or deep links return 404.

The rewrite rule must **exclude** `/api/*` from the SPA fallback.

### 6. TypeScript in `api/`

- Vercel compiles `api/*.ts` automatically
- Ensure `server/` imports don't pull in Vite-specific code (`import.meta.env`)
- Use `process.env.DISCOGS_TOKEN` in handlers via `api/_lib/env.ts`

### 7. `import.meta.env.DEV` in client

After Phase 3, client must not skip API calls in production. Grep for other `import.meta.env.DEV` API guards.

### 8. CORS

Same-origin deployment (SPA + API on one Vercel domain) — **no CORS needed**. If you later split domains, add `api/_lib/cors.ts`.

### 9. Local dev parity

| Command | API source |
|---------|------------|
| `npm run dev` | `server/api-plugin.ts` (Vite middleware) |
| `vercel dev` | `api/*.ts` (serverless emulation) |

After Phase 2, both should call the same `server/handlers/*`. If behavior diverges, bug is in the wrapper layer.

### 10. Do not re-add removed routes

- `/api/image` — covers use direct `i.discogs.com` (`discogsCover.ts`)
- `/api/discogs/*` as a Vite-only proxy — replace with serverless handlers in Phase 4, not client token

### 11. Bundle analysis

After Phase 3–4, confirm client JS does **not** contain:
- `VITE_DISCOGS_TOKEN` value
- Spotify secret
- Last.fm key

### 12. `vercel.json` vs Vercel dashboard

If build settings are configured in the Vercel UI **and** `vercel.json`, file wins for overlapping keys. Pick one source of truth (recommend `vercel.json` in repo).

---

## `vercel.json` (full reference)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": null,
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

`framework: null` prevents Vercel from auto-detecting Next.js or overwriting output directory.

---

## Suggested first PR

```
feat(api): add Vercel serverless scaffold and health endpoint

- vercel.json with SPA rewrites
- api/_lib/env.ts, api/_lib/response.ts
- api/health.ts
- @vercel/node devDependency
- No behavior change to frontend yet
```

Second PR: extract `server/handlers/` + `api/enrich.ts` (prove one full route end-to-end).

---

## Acceptance checklist (production)

After Phase 3 deploy:

- [ ] `GET /api/health` → 200
- [ ] Sign in; collection loads
- [ ] Discogs search returns results
- [ ] Cover images load (`i.discogs.com`)
- [ ] Enrich release → BPM/key with `bpmEstimated: false` when Spotify hits
- [ ] Spotify preview plays
- [ ] YouTube fallback plays (test a track with no preview)
- [ ] Last.fm vibe discovery returns tracks
- [ ] No 404 on `/api/enrich` in Network tab
- [ ] Client bundle has no Discogs/Spotify secrets (Phase 4)

---

## Related documents

| File | Role |
|------|------|
| `PROJECT_SNAPSHOT.md` | Current architecture baseline |
| `MIGRATION_PLAN.md` | Deferred Next.js path |
| `server/api-plugin.ts` | Route logic to extract |
| `src/lib/api.ts` | Client facade to update in Phase 3 |
| `.env.example` | Env var template to update |

---

*This plan delivers a real production backend with minimal frontend churn. Ship Phase 1–3 first; Phase 4 (server Discogs) secures the token. Defer Next.js until there is a separate reason to change the frontend framework.*