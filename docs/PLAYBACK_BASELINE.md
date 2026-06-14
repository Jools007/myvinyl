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
| `src/lib/youtubePlayer.ts` | `preferSimpleIframe()` on localhost; IFrame API on prod |
| `src/index.css` | `.play-dj__yt-host` desktop positioning (see below) |
| `src/lib/playbackConfig.ts` | Frozen rules (this doc's source of truth) |

## Desktop YouTube CSS (root cause of ~2s stop)

**Working:** root has a real in-viewport render surface; host is nearly invisible inside it:

```css
.play-dj__yt-root {
  position: fixed;
  right: 0;
  bottom: 0;
  width: 320px;
  height: 180px;
  overflow: visible;
}
.play-dj__yt-host {
  position: absolute;
  inset: 0;
  opacity: 0.01;
}
```

**Broken:** `0×0` + `overflow:hidden` on `.play-dj__yt-root`, or `left: -9999px` on the host — Chrome pauses clipped/off-screen embed media after ~2 seconds.

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