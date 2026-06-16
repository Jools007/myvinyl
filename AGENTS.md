# MyVinyl — Agent guide

Quick reference for AI agents and humans working in this repo.

## Project

| Item | Value |
|------|--------|
| Path | `/Users/juliangallagher/my-vinyl` |
| Repo | `https://github.com/Jools007/myvinyl.git` |
| Production | `https://myvinyl-nine.vercel.app` |
| Vercel project | `jools007-projects1/myvinyl` |

## Session anchor (paste after context compaction)

```text
my-vinyl | main | Vercel: myvinyl-nine.vercel.app
Local: npm run dev → http://127.0.0.1:5174
Stack: Vite + React 19 + Supabase + Vercel serverless /api/*
```

## Commands

```bash
npm run dev      # Local app + server/api-plugin.ts (full API surface)
npm run build    # tsc + vite build + bundle Vercel API routes (see scripts/build-vercel-apis.mjs)
npm run lint
node scripts/sync-vercel-env.mjs   # Push .env.local secrets to Vercel Production + Preview
npx vercel --prod   # Deploy current directory to production (requires Vercel CLI login)
```

## Architecture: two API layers

| Environment | `/api/*` served by |
|-------------|-------------------|
| **Local dev** | `server/api-plugin.ts` (Vite plugin) — all routes |
| **Vercel** | `api/` serverless functions + `vercel.json` rewrites |

**Do not assume** a route that works in dev exists on Vercel. Check `api/` and `vercel.json` before changing client fetch paths.

### Vercel route map

| Route | Handler |
|-------|---------|
| `/api/enrich` | rewrite → `api/health.ts` |
| `/api/discogs/search` (incl. barcode) | rewrite → `api/health.ts` |
| `/api/discogs/release/:id` | rewrite → `api/health.ts?releaseId=` |
| `/api/discogs/collection` | `api/discogs/collection.js` (bundled) |
| `/api/play/audio` | `api/play/audio.js` (bundled from `*.entry.ts`) |
| `/api/spotify/audio` | `api/spotify/audio.js` (bundled) |
| `/api/lastfm/vibe` | `api/lastfm/vibe.js` (bundled) |
| `/api/lastfm/similar` | `api/lastfm/similar.js` (bundled) |
| `/api/album-info` | `api/album-info.js` (bundled) |
| `/api/image` | `api/image.js` (bundled) |

Discogs client fallbacks (`src/lib/discogsDirect.ts`) activate on API **404/503** when `VITE_DISCOGS_TOKEN` is set at build time.

## Environment variables

Copy `.env.example` → `.env.local` for local dev. **Never commit** secrets.

### Build-time (Vercel: set before deploy; changing requires rebuild)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DISCOGS_TOKEN` — search, import, barcode fallback

### Runtime server (Vercel dashboard; not `VITE_`)

- `DISCOGS_TOKEN` — server Discogs (search/import/enrich when not using client fallback)
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — previews + play + enrich
- `LASTFM_API_KEY` — vibe discovery, album info, enrich
- `YOUTUBE_API_KEY` — optional; improves play/audio YouTube fallback

`DISCOGS_TOKEN` and `VITE_DISCOGS_TOKEN` are usually the same Discogs personal token.

## Pre-deploy smoke test (production or preview)

After `npm run build` and deploy, verify on the live URL:

1. Sign in (Supabase)
2. Collection loads
3. Discogs search (hero)
4. Collection filter search
5. Discogs import (one page)
6. Barcode scan → Discogs hit
7. Play one track (`/api/play/audio`)
8. Enrich one track (`/api/enrich`)
9. Optional: vibe discovery (`/api/lastfm/vibe`)

Quick API probes (replace origin):

```bash
curl -s "https://myvinyl-nine.vercel.app/api/health"
curl -s "https://myvinyl-nine.vercel.app/api/discogs/search?q=moodymann&per_page=1" | head -c 200
```

## Safe deploy workflow

1. `npm run build` — must pass locally (bundles `scripts/api-entries/*` → `api/**/*.js`)
2. Confirm Vercel **Production** server env vars are non-empty (`DISCOGS_TOKEN`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `LASTFM_API_KEY`). After `vercel env add`, redeploy.
3. `npx vercel deploy` — preview URL; run smoke tests
4. `npx vercel --prod` — only after preview passes
5. Ensure **Preview** env vars match Production if using preview deploys (`npx vercel env ls`)

### Env sanity check (runtime)

Bundled routes log `[route] env configured: { SPOTIFY_CLIENT_ID: true, ... }` in Vercel logs. If a key is `false`, the route returns 503 even when the dashboard lists the variable (empty placeholder values count as unset).

## UI / collection layout

- Hero + filters: `src/components/CollectionHero.tsx`, `CollectionFilters.tsx`, `src/index.css` (`.collection-*`)
- Hero height: `--hero-height` in `.collection-page`

## Playback (read before touching Play preview)

**If preview stops ~2s or stutters:** read `docs/PLAYBACK_DEBUG.md` (full runbook), then `docs/PLAYBACK_BASELINE.md` and `src/lib/playbackConfig.ts`.

- Known-good: commit `adfecc2` · Broken by: `9d1e21c` (routing + `left:-9999px` YouTube CSS)
- `useTrackPreview()` **only** in `PlayNextPanel` — never `App.tsx`
- `.play-dj__yt-root` must be **320×180 in-viewport** (`overflow:visible`) — **never** `0×0 overflow:hidden` or `left:-9999px` on the host

## Docs map

| File | Use when |
|------|----------|
| `docs/PLAYBACK_DEBUG.md` | Playback fixes, symptom table, dev debug workflow |
| `docs/PLAYBACK_BASELINE.md` | CSS host sizing, restore procedure |
| `CONTEXT.md` | Product + code orientation |
| `PROJECT_SNAPSHOT.md` | Architecture deep-dive (may lag `api/`) |
| `SERVERLESS_MIGRATION_PLAN.md` | API migration history |
| `docs/guest-crates/2026-06-16-design.md` | Guest crates spec (import → demo → claim) |
| `docs/guest-crates/CHANGELOG.md` | Phase ship log + verify checklist |
| `docs/AGENTS.md` | Legacy short workflow pointer |

## Vercel bundling rule

Serverless routes that import `api/_lib/*` **must** be bundled to a single `.js` file before deploy (`npm run build`). Edit sources in `scripts/api-entries/`; outputs land in `api/**/*.js`. Hobby plan: max 12 functions — keep entry sources **outside** `api/` so Vercel does not count them as extra functions.

## Rules for agents

- Minimal diffs; match existing patterns
- UI work: verify desktop + mobile in browser when possible
- API/deploy work: parity between `server/api-plugin.ts` and `api/` before claiming production fix
- Do not remove `VITE_DISCOGS_TOKEN` until server routes are proven on Vercel