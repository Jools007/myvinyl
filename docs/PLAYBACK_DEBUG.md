# Playback debug & settings reference

Runbook for YouTube/Spotify preview on **Play**. Use when audio is silent, stops after a few seconds, wrong track plays, or load feels stuck.

**Last stable deploy:** `9b91c23` (2026-06-14) → https://myvinyl-nine.vercel.app  
**Do not change production to debug** — use local dev + this doc.

---

## Settings & config files (where rules live)

| File | Purpose |
|------|---------|
| `src/lib/playbackConfig.ts` | Frozen architecture rules (hook owner, CSS, localhost vs prod player mode). Update when behaviour intentionally changes. |
| `src/lib/playbackDevice.ts` | Host detection: `localhost`, loopback redirect, iOS, simple-embed flag. |
| `src/lib/playbackCache.ts` | Session cache for resolved Spotify/YouTube ids (invalidated on embed error 150). |
| `src/lib/playbackDiagnostics.ts` | Dev-only event log + `window.__MYVINYL_PLAYBACK__` (tree-shaken in prod). |
| `src/hooks/useTrackPreview.ts` | Load/attach/play state machine, API fetch, race guards. |
| `src/lib/youtubePlayer.ts` | YouTube player: localhost iframe, prod YT.Player + iframe fallback on error 150. |
| `api/_lib/play-audio/youtube.ts` | Server YouTube search, scoring, VA/soundtrack handling. |
| `api/_lib/play-audio/resolve.ts` | Spotify-first then YouTube; soundtrack priority phase. |
| `docs/PLAYBACK_BASELINE.md` | Older baseline (CSS 2s clip, `adfecc2` restore) — still valid for host sizing. |

**UI (dev only):**

| File | Purpose |
|------|---------|
| `src/components/play/PlaybackDebugBar.tsx` | “Copy debug info”, video ids, try alternate (not rendered in prod). |
| `src/components/PlayNextPanel.tsx` | Owns `useTrackPreview()` + single `nowKey` load effect. |

---

## Environment matrix (what should work)

| Environment | YouTube mode | Sound on browse ▶ | Notes |
|-------------|--------------|-------------------|--------|
| **localhost:5174** | `iframe` (`yt_local_iframe`) | Unmuted if browse autoplay (`autoplay, autoplay` in load) | Prefer `http://localhost:5174` — not `127.0.0.1` (YT origin issues). |
| **Production** | `api` (YT.Player) | Unmuted on browse autoplay | Error 150 mid-play → iframe fallback at current time. |
| **iOS** | `jsapi` (enablejsapi embed) | Gesture-dependent | Off-screen host OK. |

**Healthy debug signals**

- `youtubeMode`: `iframe` (local) or `api` (prod)
- `yt_iframe_play` / `yt_play` with `sound: true` after user or browse intent
- `attachedVideoId` === `lastApiVideoId`
- `activelyPlaying: true` while UI `status: playing`
- No `failedVideoIds` unless user hit embed block

---

## Underlying issues (root causes we hit)

### 1. YouTube host clipped or off-screen (~2s silence)

Chrome pauses embed audio when the iframe has **no real viewport surface** (0×0 root, `overflow:hidden`, or `left:-9999px`).

**Symptom:** Plays briefly then stops; `elapsed` stuck; UI may still show `playing`.  
**Check:** `ytRoot` / `ytHosts` in debug JSON — need **320×180**, `overflow: visible` on `.play-dj__yt-root`.  
**See:** `docs/PLAYBACK_BASELINE.md` CSS section.

### 2. YT.Player + VEVO / restrictive embeds (error 150)

`YT.Player` can reach `PLAYING` then fire **error 150** ~3s in; state drops to `UNSTARTED (-1)`.

**Symptom:** `yt_error_ignored` or `yt_error_fallback`, then silence.  
**Mitigations:**
- API deprioritises VEVO / lyric videos; prefers Topic / official audio / soundtrack-titled results.
- **Localhost:** skip YT.Player entirely → plain iframe + src reload (`yt_local_iframe`).
- **Prod:** on 150 while playing → `yt_error_fallback` → iframe resume at `getCurrentTime()`.

### 3. Wrong YouTube video (especially compilations)

Artist `"Various"` + soundtrack albums matched **title-only** uploads (wrong performer).

**Symptom:** Audio plays but wrong song; API title looks plausible.  
**Mitigations:** Album+title+`soundtrack` queries first; penalise title-only matches without album/soundtrack context (`hasSoundtrackContext`).

### 4. Load races when switching tracks quickly

Multiple `load_start` from React effect + URL sync; stale track cache load could clear `loadInFlight` and reset `activeKeyRef`.

**Symptom:** `load_stale`, `video_mismatch_reattach`, stuck `loading`, muted autoplay lost.  
**Mitigations:**
- `load_skip: stale_track` — ignore previous track while new track in flight.
- Per-key generation (`loadGenByKeyRef`) — only winning generation applies API result.
- `clearInFlight` only when generation still current.
- `effectLoadedKeyRef` — skip duplicate effect loads for same `nowKey`.
- Session cache must not clear another key’s in-flight lock.

### 5. Browse autoplay muted on 2nd track

Browse ▶ is a user gesture but load passed `enableSound: false`.

**Symptom:** `yt_play` `sound: false`, `mute=1` in iframe URL; user must tap again.  
**Fix:** `PlayNextPanel` → `preview.load(..., autoplay, autoplay)` for browse autoplay.

### 6. `127.0.0.1` vs `localhost`

IFrame API origin mismatch on loopback IP; spurious 150 on all videos.

**Fix:** `redirectLoopbackToLocalhost()` in `main.tsx`; Vite `open: http://localhost:5174/`.

### 7. Slow first play (~8–12s)

Dominated by **`/api/play/audio`** YouTube search (InnerTube + embed checks). Not iframe mount.

**Mitigations:** Parallel-first API for normal artists; session cache + prefetch for queue; revisit = `load_source: cache`.

---

## Fixes applied (2026-06-14 session)

| Area | Change |
|------|--------|
| `youtubePlayer.ts` | Localhost → simple iframe; prod 150 → iframe fallback; VEVO ignore rules |
| `useTrackPreview.ts` | Load generation, stale_track, session YouTube cache, pending autoplay |
| `PlayNextPanel.tsx` | Browse sound on autoplay; dev-only debug bar; effect dedupe |
| `api/.../youtube.ts` | VA/soundtrack queries, scoring, generic title guard, faster path for non-VA |
| `api/.../resolve.ts` | Soundtrack-priority phase before primary race |
| `playbackCache.ts` | Remember YouTube ids per session; invalidate on 150 |
| `usePlaybackPrefetch.ts` | Prefetch fills cache for queue |
| Prod deploy | `9b91c23` — debug UI stripped from production build |

---

## Symptom → likely cause → what to check

| Symptom | Likely cause | Debug clues |
|---------|--------------|-------------|
| Silent, UI says playing | Clipped host or 150 drop | `ytRoot` 0×0; `playerState` -1; no `activelyPlaying` |
| Stops ~3s on VEVO | Error 150 | `yt_error_*`; video id VEVO-style title |
| Wrong song | VA/generic API pick | `lastApiTitle` wrong; artist `Various` |
| Stuck `loading` | Stale load / cache race | `load_stale`; prior track `load_source: cache` |
| 2nd track muted | enableSound false on autoplay | First `yt_play` has `sound: false` |
| Slow new track | API search | Gap `load_start` → `api_result` > 5s; no `load_source: cache` |
| Works local, broken prod | Different player path | `youtubeMode: api` on prod — check 150 fallback events |

---

## Dev debug workflow

### 1. Copy debug info (UI)

Local dev only: **Dev playback** bar → **Copy debug info** → paste JSON.

### 2. Console (local dev)

```js
__MYVINYL_PLAYBACK__.report()   // full JSON
__MYVINYL_PLAYBACK__.events()  // event list only
__MYVINYL_PLAYBACK__.snapshot() // current state
```

Console also logs `[playback] <event>` when `import.meta.env.DEV`.

### 3. API probe (no browser)

```bash
curl -s "http://localhost:5174/api/play/audio?artist=Stevie%20Wonder&title=Do%20I%20Do&album=Do%20I%20Do"
curl -s "https://myvinyl-nine.vercel.app/api/play/audio?artist=Various&title=Son%20Of%20A%20Preacher%20Man&album=Pulp%20Fiction%20(Music%20From%20The%20Motion%20Picture)"
```

### 4. Local smoke test

```bash
npm run dev   # http://localhost:5174
```

1. Play ▶ from browse — sound without second tap  
2. Switch 2–3 tracks — correct audio, no stuck loading  
3. Let one track run **> 10s**  
4. Re-select earlier track — should see `load_source: cache` (fast)

---

## Event glossary (common `events[]` entries)

| Event | Meaning |
|-------|---------|
| `load_start` | `preview.load()` began |
| `load_skip` | Deduped load (`in_flight`, `stale_track`, `already_attached`) |
| `load_stale` | API returned but generation superseded |
| `load_source: cache` | Skipped API — session cache hit |
| `api_result` | `/api/play/audio` response |
| `youtube_attach` | New player for video id |
| `youtube_attach_skip` | Same key+video — no rebuild |
| `video_mismatch_reattach` | Attached id ≠ API id — reattach |
| `yt_local_iframe` | Localhost simple embed path |
| `yt_player_create` | Player ctor (always logged; mode may still be iframe) |
| `yt_ready` | Player ready to accept play |
| `yt_iframe_play` | Iframe src reload for play/seek |
| `yt_iframe_play_confirmed` | Optimistic play confirmed on load |
| `yt_play` | User or autoplay play() |
| `yt_error_fallback` | Prod: 150 during play → iframe recovery |
| `yt_api_dropped` | API player fell to UNSTARTED after play |
| `yt_destroy` | Player torn down (track change) |

**YouTube `playerState`:** `-1` UNSTARTED, `1` PLAYING, `2` PAUSED, `3` BUFFERING.

---

## Architecture guards (do not break)

1. **`useTrackPreview()` only in `PlayNextPanel`** — not `App.tsx`.
2. **Single load effect** on `nowKey` — `App` must not call `preview.load()` / `preview.reset()`.
3. **Rebuild API after server changes:** `npm run build` bundles `api/_lib/*` → `api/play/audio.js` for Vercel.
4. **Debug/diagnostics stay dev-only** — `import.meta.env.DEV`; prod has no debug bar.

---

## What still needs improvement (known gaps)

- **First-play latency** — API search is the bottleneck; prefetch helps queue not first click.
- **Iframe seek reloads** — repeated `yt_iframe_play` with `start=N` on scrub (noisy logs; usually harmless).
- **`playbackConfig.ts`** — keep in sync with `PlayNextPanel` load args when behaviour changes.
- **Try alternate video** — only in dev debug bar; prod users retry via play button after error.

---

## Related commits

| Commit | Notes |
|--------|--------|
| `adfecc2` | Last known-good simple iframe localhost |
| `9d1e21c` | Play URL routing regression |
| `9b91c23` | 2026-06-14 playback fix batch + prod deploy |

For CSS/host regression restore steps, see `docs/PLAYBACK_BASELINE.md`.