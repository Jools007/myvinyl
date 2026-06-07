# MyVinyl

A premium vinyl collection manager for collectors and DJs. Browse your crate, enrich tracks with BPM and Camelot keys, get play recommendations, scan barcodes, import from Discogs, and print crate labels.

## Stack

- **Frontend:** Vite, React 19, TypeScript, Tailwind CSS v4, Framer Motion
- **Data:** Supabase (auth + `records` table)
- **APIs:** Discogs, Spotify, Last.fm (via Vite dev middleware in `server/`)

## Prerequisites

- Node.js 20+
- npm
- A [Supabase](https://supabase.com) project
- API keys for optional features (Discogs, Spotify, Last.fm) — see `.env.example`

## Quick start

```bash
git clone <your-repo-url>
cd my-vinyl
npm install
cp .env.example .env.local
```

Fill in `.env.local` with your keys (at minimum Supabase and Discogs tokens), then:

```bash
npm run dev
```

Open [http://localhost:5174](http://localhost:5174).

## Environment variables

Copy `.env.example` to `.env.local` for local development. **Do not commit** `.env` or `.env.local`.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `VITE_DISCOGS_TOKEN` | Yes* | Client-side Discogs API token (`VITE_` prefix required) |
| `DISCOGS_TOKEN` | Yes* | Server-side Discogs token (enrichment, image proxy) |
| `SPOTIFY_CLIENT_ID` | No | Spotify preview / BPM lookup |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify preview / BPM lookup |
| `LASTFM_API_KEY` | No | Vibe tags and album info |
| `YOUTUBE_API_KEY` | No | YouTube audio fallback |

\*Discogs tokens can be the same personal access token from [Discogs Developer Settings](https://www.discogs.com/settings/developers).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port 5174) |
| `npm run build` | Typecheck and production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## Deployment

1. Build the app: `npm run build`
2. Deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages, etc.)
3. Set environment variables in your host's dashboard — all `VITE_*` vars must be present **at build time**
4. For production API routes (`/api/enrich`, `/api/play/audio`, etc.), you will need a Node-compatible host or a separate backend that runs the logic in `server/` — the Vite plugin only serves those routes during `npm run dev`

## Project structure

```
src/           React app (components, hooks, lib)
server/        Dev-only API middleware (Discogs, Spotify, enrichment)
public/        Static assets
dist/          Production build output (generated)
```

## License

Private — all rights reserved.