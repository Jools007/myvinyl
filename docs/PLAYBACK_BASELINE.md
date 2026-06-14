# Playback baseline

Reference when preview audio stutters, stops after ~2s, or regresses after Play UI changes.

## Known-good snapshot

| Item | Value |
|------|--------|
| **Last verified commit** | `adfecc2` |
| **Regression introduced** | `9d1e21c` (Play browse tabs + URL routing) |
| **Canonical config** | `src/lib/playbackConfig.ts` |

## Architecture (do not violate)

1. **`useTrackPreview()` only in `PlayNextPanel`** — not in `App.tsx`.
2. **One load path** — `useEffect` on `nowKey` in `PlayNextPanel`:
   ```ts
   void preview.load(record, track, autoplay, false);
   ```
3. **`App.tsx` never calls** `preview.load()` or `preview.reset()`.
4. **Autoplay flag** — set via `autoplayPendingRef` in `handlePlay` (browse ▶) only.
5. **Sound** — user enables via preview play bar (`handlePreviewToggle` → `load(..., true, true)` or `toggle()`).

## Critical files

| File | Role |
|------|------|
| `src/components/PlayNextPanel.tsx` | Owns preview hook + load effect |
| `src/hooks/useTrackPreview.ts` | Spotify + YouTube attach (match `adfecc2` sound logic) |
| `src/lib/youtubePlayer.ts` | IFrame API on desktop/localhost; iOS uses `enablejsapi` embed |
| `src/index.css` | `.play-dj__yt-host` desktop positioning (see below) |
| `src/lib/playbackConfig.ts` | Frozen rules (this doc's source of truth) |

## Desktop YouTube CSS (root cause of ~2s stop)

**Working (`adfecc2`):** iframe in viewport, visually hidden via clip:

```css
.play-dj__yt-host {
  position: fixed;
  width: 320px;
  height: 180px;
  right: 0;
  bottom: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  overflow: hidden;
  pointer-events: none;
}
```

**Broken (`9d1e21c`):** `left: -9999px` — Chrome pauses off-screen embed media after ~2 seconds.

iOS uses `.play-dj__yt-host--touch` (off-screen is OK for WebKit gesture path).

## Local dev smoke test

```bash
npm run dev   # http://127.0.0.1:5174
```

1. Sign in, open **Play**
2. Hit **▶** on a Recently added / Mix partners row
3. Audio plays **> 10 seconds** without stopping
4. Press preview **play** if muted — sound continues
5. Console: Roboto font / `compute-pressure` warnings are **harmless** (YouTube embed noise)

API probe:

```bash
curl -s "http://127.0.0.1:5174/api/play/audio?artist=Massive%20Attack&title=Teardrop"
```

## Restore procedure

```bash
git checkout adfecc2 -- \
  src/hooks/useTrackPreview.ts \
  src/lib/youtubePlayer.ts \
  src/components/PlayNextPanel.tsx  # then re-apply non-playback Play UI changes carefully
```

Then re-apply CSS fix for `.play-dj__yt-host` if needed (see above).

## Safe to ignore in console

- `[Intervention] Slow network` + Roboto `.woff2` (YouTube embed fonts)
- `compute-pressure` policy violation in `base.js` (YouTube player)