# MyVinyl — Agent Context (read this first, every task)

## Workspace scope
All file operations must stay inside `/Users/juliangallagher/my-vinyl`. When searching or creating files, always use full paths starting with `/Users/juliangallagher/my-vinyl/`. Never use relative paths or `**/*` globs. Never scan the parent directory or home folder.

## Product
Premium dark-themed vinyl collection manager for collectors/DJs (500–2000+ records). USP: help people **feel** their records again — vibe tags, character, BPM, Camelot, smart play recommendations. Warm, moody, premium UX; vinyl-first (condition, format, crate location).

## Stack (today — not the future Next.js plan)
Vite · React 19 · TypeScript · Tailwind v4 · Framer Motion · Sonner. **No database** — `localStorage` via `src/lib/storage.ts`. Dev API: Vite middleware in `server/api-plugin.ts` (port **5174**).

## Core user loop (optimise for this)
Add record (Discogs/manual) → Browse/filter → Play Next recommendations → Print crate labels

## Roadmap phase
**Phase 2 — Adding records** (Discogs import, manual add, metadata). Don't jump to labels/backend migration unless asked.

## Data model (running app)
Single flattened type: `VinylRecord` in `src/lib/types.ts`. Persisted under keys `myvinyl:records` / `myvinyl:settings`. State hook: `src/hooks/useCollection.ts`.

**Rule for future work:** Discogs = catalog; Spotify/Last.fm = enrichment; user edits stay on the copy — never mutate immutable catalog fields. Summary: `SCHEMA.md` · Drizzle DDL: `docs/schema-full.md` (only when implementing tables).

## File map
| Area | Path |
|------|------|
| App shell | `src/App.tsx` |
| Collection state | `src/hooks/useCollection.ts`, `src/lib/storage.ts` |
| Types | `src/lib/types.ts` |
| Recommendations | `src/lib/recommendations.ts`, `src/lib/camelot.ts`, `src/lib/vibes.ts` |
| Client API | `src/lib/api.ts`, `src/lib/discogs.ts` |
| UI | `src/components/*` |
| Server routes | `server/api-plugin.ts`, `server/discogs.ts`, `server/spotify.ts`, `server/lastfm.ts`, `server/bpm.ts` |

## API routes (`/api/*`, keys in `.env.local`)
`discogs/search`, `discogs` (legacy), `image`, `enrich`, `spotify/audio`, `lastfm/similar`, `lastfm/vibe`

## Commands
`npm run dev` · `npm run build` · `npm run lint`

## Env (see `.env.example`)
`DISCOGS_TOKEN`, `LASTFM_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`

## Implementation rules
- Match existing patterns; minimal focused diffs; no drive-by refactors
- Large libraries: avoid loading entire collection into heavy derived state without need
- Verify with `npm run build` after substantive changes

## Deep docs (load on demand — do NOT read every task)
| When | Read |
|------|------|
| Product/UX/copy decisions | `MISSION.md` |
| Sequencing / phase scope | `ROADMAP.md` |
| Data model principles & types | `SCHEMA.md` |
| Drizzle table definitions | `docs/schema-full.md` |
| Human quick start | `docs/README.md` |