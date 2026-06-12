# Brainstorm: Play / DJ features for collectors who spin

**Status:** Research captured — not approved for implementation  
**Date:** 2026-06-12  
**Context:** User finds Mix Orbit superfluous; principle (surface compatible next records) is good. Target persona: vinyl collector who DJs at home, not club booth software.

---

## North star

> "I'm spinning 8A at 124 BPM — show me what in my collection mixes cleanly, let me build tonight's crate, and draw the key path I'll walk at the turntable."

---

## Why orbit feels wrong

- DJs think in **named Camelot rules** (same code, ±1, A↔B, +2 energy boost), not spatial proximity ([Mixed In Key](https://mixedinkey.com/harmonic-mixing-guide/), [VibesDJ Camelot guide](https://vibesdj.io/learn/techniques/camelot-wheel))
- Vinyl workflow is **prep-first**: pull 8–20 records before session; BPM/key on sleeves ([vinyl org threads](https://www.reddit.com/r/Beatmatch/comments/vwmhgz/vinyl_djs_do_you_catalogize_bpm_for_your_tunes/))
- Digital pattern that transfers: **tiered compatible-tracks list** beside now-playing (Rekordbox/Serato), not solar-system layout
- my-vinyl **Queue mode + Insights** (wheel, `getMixPicks`, `buildCrateJourney`) are already more DJ-literal than orbit
- Orbit glyphs (`locked`, `flow`, `dig`) are poetic, not booth vocabulary

## What collectors who DJ actually need

### Session & prep (biggest gap)
- **Session Crate** — tonight's pull list (8–20 records), reorderable, save/resume, printable
- **Key path strip** — linear `8A → 9A → 9B → 10B` with BPM under each step
- **Pull from shelf** — mark records in tonight's stack vs full library
- **Resume last session** — multi-evening listening arcs

### Now-playing → next record
- **Tiered compatibility list** from current track:
  - Perfect: same key
  - Smooth: ±1 or relative (A↔B)
  - Stretch: +2 wheel step or wider BPM gap
- **Explicit reasons** on every row ("Relative key · 8B", "+3 BPM")
- **Per-track matching** — not primary-track-only
- **BPM delta + key relationship** always visible (sleeve-sticker mental model)

### Visual representations that parse quickly
- **Camelot wheel as collection map** — cell size = owned tracks; tap → compatible neighbors + counts (Insights Keys model → feed Play)
- **BPM × Key heatmap** — highlight now-playing cell + compatible adjacent cells
- **Compatibility density graph** — which key clusters connect in *this* library
- **Set arc preview** — BPM/key sparkline across planned path

### Bridge Insights ↔ Play
- **One object: Session Crate** — built in Insights, consumed in Play
- Wheel tap / journey builder / roulette → **add to crate** (not only filter)
- Health nudge when metadata incomplete: "42 tracks need key/BPM — matches incomplete"

### Collector-specific (not club DJ)
- Flow + discovery over beatmatch/phrase UI
- Forgotten-gem bias inside compatible tiers (unplayed / 30+ days)
- Printable crate card, large BPM/key type, phone-on-table while at decks
- `lastPlayedAt` → "compatible neighbor not spun in 8 months"

## Deprioritise / remove

- Orbit as hero Play UI
- Gamified spin without reasons
- Scores without labels
- Primary-track-only matching
- Preview-first Play (supplement only)

## Quick wins vs bigger bets

| Quick win | Bigger bet |
|-----------|------------|
| Default Play to Queue; demote Mix/orbit | Session Crate entity (save, resume, print) |
| Glyphs → DJ transition labels | BPM × Key heatmap on Play |
| Wheel partner tap → queue/crate | Collection compatibility graph |
| Journey → "Load tonight's crate" | Shelf pull mode + export |

## Existing code to leverage

- `src/lib/recommendations.ts` — `scoreNextPlay`, `recommendNext`, reason strings
- `src/lib/insightInteractions.ts` — `getMixPicks`, `buildCrateJourney`, harmonic partners
- `src/components/InsightsDashboard.tsx` — harmonic wheel, health, explorer dock
- `src/components/PlayNextPanel.tsx` — Queue mode (keep); Mix/orbit (demote)
- `src/lib/fullMetadataEnrichment.ts` — BPM/key coverage gates match quality

## Cheap validation before build

1. "How many records do you pull before a session?" (expect 5–25)
2. "What do you read on the sleeve?" (BPM, key, vibe)
3. Paper prototype: Session Crate card with 4 records + key path

## Related conversation

- Insights v2 shipped: charts, explorer dock, playful tools, filter toolbar
- Metadata enrichment: unenriched-only, background, cancel
- User advised next: tighten Insights → Play loop; orbit not the hero