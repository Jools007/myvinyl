---
name: my-vinyl
description: >
  MyVinyl app workflow — ship to production, polish UI, and navigate the repo.
  Use when the user says ship, deploy, prod, myvinyl, my-vinyl, insights, collection
  layout, vercel, or runs /my-vinyl. Load BEFORE deploys and broad UI passes.
  Owner uses Grok CLI for execution and browser for visual review (not Cursor).
---

# MyVinyl — ship & work in this repo

**Repo:** `/Users/juliangallagher/my-vinyl`  
**Prod:** https://myvinyl-nine.vercel.app  
**Local:** `npm run dev` → http://127.0.0.1:5174 (user checks UI in browser)

Read `AGENTS.md` for API routes, env vars, and playback rules. This skill is the **short deploy + UI map**.

## User preferences

- **Execute here (CLI):** edit files, run builds, commit, deploy
- **Review in browser:** desktop + mobile screenshots or live check
- **Do not assume Cursor** — user does not use it
- **Deploy when asked** — run commands yourself; do not only instruct
- **Minimal diffs** — match existing patterns; no drive-by refactors

## Production exclusions (never ship)

| Item | Rule |
|------|------|
| `PlaybackDebugBar` | Dev only — gated by `import.meta.env.DEV` in `PlayNextPanel.tsx` and `PlaybackDebugBar.tsx`. Verify prod build: no `Dev playback` / `Copy debug info` in `dist/` |
| `playbackDiagnostics` / `playbackDevice` | Dev-only logging — do not expose UI in prod |
| Scanner on-device debug panel | OK in prod (user-facing diagnostics); separate from playback debug |

Before claiming prod is clean: `npm run build && rg -l "Dev playback" dist/` must return nothing.

## Deploy workflow

Run from repo root:

```bash
cd /Users/juliangallagher/my-vinyl
npm run build          # must pass (tsc + vite + api bundle)
git status             # commit intentional changes only
git add <files>
git commit -m "..."    # complete sentences, why not just what
git push origin main
vercel --prod          # or: npx vercel --prod
```

**Order:** build locally → commit → push → prod deploy.

**Preview first** (optional, for risky API/playback changes):

```bash
npx vercel deploy      # preview URL → smoke test → then --prod
```

After deploy, confirm alias: `https://myvinyl-nine.vercel.app`

### Quick smoke (prod)

1. Collection loads
2. Insights page renders charts
3. Play one track preview
4. Discogs search in header

```bash
curl -s "https://myvinyl-nine.vercel.app/api/health"
```

## Key file map

### Insights (v2)

| Area | Paths |
|------|--------|
| Dashboard | `src/components/InsightsDashboard.tsx` |
| Charts | `src/components/insights/InsightChartJs.tsx`, `useChartTheme.ts` |
| Data | `src/lib/collectionInsights.ts`, `curatedTracks.ts`, `variousArtist.ts` |
| Explorer modal | `src/components/insights/InsightExplorer.tsx` |
| Styles | `src/index.css` — `.insights-v2-*`, `.insights-page` |

Shelf vs picks: shelf = ownership charts; picks = manual BPM + G/VG/VG+ ratings (`curated`).

### Collection page

| Area | Paths |
|------|--------|
| Hero (desktop only) | `src/components/CollectionHero.tsx` — hidden `<640px` via CSS |
| Filters | `src/components/CollectionFilters.tsx` |
| Styles | `src/index.css` — `.collection-page`, `.collection-hero*`, `.collection-toolbar*` |

**Mobile hero bug pattern:** never set `display:flex` on `.collection-hero__copy` outside `@media (min-width: 640px)` — it overrides Tailwind `hidden` and stacks text.

### Navigation

| Area | Paths |
|------|--------|
| Component | `src/components/Navigation.tsx` |
| Layout | `src/index.css` — `.app-nav__grid` |

Breakpoints: two-row nav (brand · pills · actions / search) below 1120px; single row above.

### Playback (touch only with care)

Read `docs/PLAYBACK_DEBUG.md` first. `useTrackPreview()` lives in `PlayNextPanel` only. `.play-dj__yt-root` must stay 320×180 in-viewport.

## UI verification checklist

When user sends a screenshot or says “balance” / “mobile broken”:

1. Identify viewport (mobile `<640`, tablet `640–1119`, desktop `1120+`)
2. Check for CSS overriding utility `hidden` / `sm:block`
3. Fix layout structure before font tweaks
4. Run `npm run build`
5. Ask if user wants prod deploy

## Session anchor (after context loss)

```text
my-vinyl | main | prod: myvinyl-nine.vercel.app
Local: npm run dev → :5174
Stack: Vite + React 19 + Supabase + Vercel /api/*
Latest insights/collection work: .grok/skills/my-vinyl/
```

## Related skills

- **Barcode issues:** `/barcode-scanner` — do not mix scanner changes into deploy skill flow

## Example short prompts

- `/my-vinyl ship to prod, no debug UI`
- `/my-vinyl fix insights mobile KPI spacing`
- `/my-vinyl deploy — build, commit, push, vercel --prod`