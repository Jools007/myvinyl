import { camelotDistance, resolveTrackCamelot } from './camelot';
import { recommendNext } from './recommendations';
import { playSelectionKey, type PlaySelection, type ResolvedPlaySelection } from './playSession';
import type { Track, VinylRecord } from './types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Distance band from the now-playing disc — closer = stronger mix match. */
export type OrbitRing = 'inner' | 'mid' | 'outer';

/** Short compatibility label shown on satellite corners in Mix Mode. */
export type OrbitGlyph = 'locked' | 'lift' | 'flow' | 'dig' | 'mystery';

/** Compatibility ring color on mini vinyl sleeves. */
export type OrbitRingTone = 'teal' | 'violet' | 'amber' | 'muted';

/** One record floating on the orbit field. */
export type OrbitSatellite = {
  record: VinylRecord;
  track: Track;
  /** Selection key (`recordId:trackId`) for React keys and selection state. */
  key: string;
  /** Match score from `recommendNext` / cold-start ranking. */
  score: number;
  /** 0-based rank within the current layout (0 = best match). */
  rank: number;
  ring: OrbitRing;
  /** Position on the orbit field, degrees (0° = 3 o'clock, clockwise). */
  angleDeg: number;
  glyph: OrbitGlyph;
  ringTone: OrbitRingTone;
  /** True when not played in 30+ days and marked as the single ✦ dig highlight. */
  isForgottenGem: boolean;
};

/** Full orbit state for one Mix Mode render pass. */
export type OrbitLayout = {
  satellites: OrbitSatellite[];
  /** True when nothing is anchored — show starter picks on the inner ring only. */
  coldStart: boolean;
};

export type AssignOrbitLayoutInput = {
  collection: VinylRecord[];
  /** Currently playing selection, or null before the first spin. */
  anchor: ResolvedPlaySelection | null;
  /** Records already played this Mix session — omitted from new suggestions. */
  mixTrail: PlaySelection[];
  /** Extra omissions (e.g. queued tracks). */
  exclude?: PlaySelection[];
  /** Use thumb-biased arc (mobile) vs full 360° (desktop). */
  mobile?: boolean;
};

export type PolarPoint = {
  /** Center x in px, relative to the orbit field origin (top-left of field). */
  x: number;
  /** Center y in px, relative to the orbit field origin. */
  y: number;
};

/** Default orbit radii (px) — keep in sync with `.mix-orbit` CSS variables. */
export const ORBIT_RADIUS_PX = {
  mobile: { inner: 85, mid: 120, outer: 155 },
  desktop: { inner: 100, mid: 140, outer: 180 },
} as const;

/** Unicode glyphs for satellite corners (Mix Mode UI). */
export const ORBIT_GLYPH_CHAR: Record<OrbitGlyph, string> = {
  locked: '◎',
  lift: '↗',
  flow: '~',
  dig: '✦',
  mystery: '?',
};

/** Human-readable whisper labels for the focus chip. */
export const ORBIT_GLYPH_LABEL: Record<OrbitGlyph, string> = {
  locked: 'locked',
  lift: 'lift',
  flow: 'flow',
  dig: 'dig',
  mystery: 'mystery',
};

// -----------------------------------------------------------------------------
// Layout entry point
// -----------------------------------------------------------------------------

/**
 * Build a complete orbit layout: score candidates, assign rings by rank, and
 * place each satellite at an angle ready for `polarToPosition`.
 */
export function assignOrbitLayout(input: AssignOrbitLayoutInput): OrbitLayout {
  const { collection, anchor, mixTrail, exclude = [], mobile = false } = input;

  const coldStart = isOrbitColdStart(collection, anchor);
  const limit = coldStart ? 3 : 6;

  const omit: PlaySelection[] = [
    ...mixTrail,
    ...exclude,
    ...(anchor
      ? [{ recordId: anchor.record.id, trackId: anchor.track.id }]
      : []),
  ];

  const suggestions = recommendNext(collection, anchor, limit, omit);

  const forgottenKey = pickForgottenGemKey(suggestions, anchor);

  const satellites: OrbitSatellite[] = suggestions.map((suggestion, rank) => {
    const key = playSelectionKey({
      recordId: suggestion.record.id,
      trackId: suggestion.track.id,
    });
    const ring = coldStart ? 'inner' : ringForRank(rank);
    const isForgottenGem = key === forgottenKey;

    return {
      record: suggestion.record,
      track: suggestion.track,
      key,
      score: suggestion.score,
      rank,
      ring,
      angleDeg: 0, // filled in below
      glyph: getOrbitGlyph(anchor, suggestion.record, suggestion.track, {
        isForgottenGem,
      }),
      ringTone: getOrbitRingTone(anchor, suggestion.record, suggestion.track),
      isForgottenGem,
    };
  });

  assignOrbitAngles(satellites, { mobile, coldStart });

  return { satellites, coldStart };
}

// -----------------------------------------------------------------------------
// Ring assignment
// -----------------------------------------------------------------------------

/** Map sorted rank → inner / mid / outer band (final spec). */
export function ringForRank(rank: number): OrbitRing {
  if (rank <= 1) return 'inner';
  if (rank <= 4) return 'mid';
  return 'outer';
}

/** Pixel radius for a ring band at the current breakpoint. */
export function orbitRadiusForRing(ring: OrbitRing, mobile: boolean): number {
  const table = mobile ? ORBIT_RADIUS_PX.mobile : ORBIT_RADIUS_PX.desktop;
  return table[ring];
}

// -----------------------------------------------------------------------------
// Glyph & ring tone
// -----------------------------------------------------------------------------

export type OrbitGlyphOptions = {
  /** When true, prefer the ✦ dig glyph (at most one per layout). */
  isForgottenGem?: boolean;
};

/**
 * Pick the single-character compatibility glyph for a satellite.
 * With no anchor (cold start), uses track metadata only.
 */
export function getOrbitGlyph(
  anchor: ResolvedPlaySelection | null,
  record: VinylRecord,
  track: Track,
  opts: OrbitGlyphOptions = {}
): OrbitGlyph {
  if (opts.isForgottenGem) return 'dig';

  const hasBpm = track.bpm != null;
  const hasKey = Boolean(resolveTrackCamelot(track).code);

  if (!anchor) {
    if (hasBpm && hasKey) return 'flow';
    if (hasBpm || hasKey) return 'flow';
    if (track.vibeTags?.length || record.genres.length) return 'flow';
    return 'mystery';
  }

  const anchorTrack = anchor.track;
  const keyDist = camelotDistance(
    resolveTrackCamelot(anchorTrack).code,
    resolveTrackCamelot(track).code
  );

  if (keyDist === 0) return 'locked';
  if (keyDist === 1) return 'lift';

  const bpmDelta =
    anchorTrack.bpm != null && track.bpm != null
      ? Math.abs(anchorTrack.bpm - track.bpm)
      : null;

  const vibeOverlap = countVibeOverlap(anchorTrack, track);
  const genreOverlap = countGenreOverlap(anchor.record, record);

  if ((bpmDelta != null && bpmDelta <= 5) || vibeOverlap > 0 || genreOverlap > 0) {
    return 'flow';
  }

  if (!hasBpm && !hasKey) return 'mystery';

  return 'flow';
}

/**
 * Pick the compatibility ring stroke color for a satellite sleeve.
 */
export function getOrbitRingTone(
  anchor: ResolvedPlaySelection | null,
  record: VinylRecord,
  track: Track
): OrbitRingTone {
  if (!anchor) {
    const hasKey = Boolean(resolveTrackCamelot(track).code);
    return hasKey ? 'teal' : record.genres.length ? 'amber' : 'muted';
  }

  const keyDist = camelotDistance(
    resolveTrackCamelot(anchor.track).code,
    resolveTrackCamelot(track).code
  );

  if (keyDist <= 1) return 'teal';
  if (keyDist === 2) return 'violet';

  const vibeOverlap = countVibeOverlap(anchor.track, track);
  const genreOverlap = countGenreOverlap(anchor.record, record);

  if (vibeOverlap > 0 || genreOverlap > 0) return 'amber';

  return 'muted';
}

// -----------------------------------------------------------------------------
// Polar positioning
// -----------------------------------------------------------------------------

/**
 * Convert orbit polar coordinates to a pixel center point.
 *
 * Angles use the standard math convention converted for screen layout:
 * - 0° = 3 o'clock (east)
 * - 90° = 6 o'clock (south) — bottom center on screen
 * - angles increase clockwise
 *
 * Pass the returned `{ x, y }` as `left` / `top` with `transform: translate(-50%, -50%)`
 * on the satellite element.
 */
export function polarToPosition(
  angleDeg: number,
  radiusPx: number,
  center: { x: number; y: number }
): PolarPoint {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radiusPx * Math.cos(rad),
    y: center.y + radiusPx * Math.sin(rad),
  };
}

// -----------------------------------------------------------------------------
// Focus chip helpers (used by Mix UI)
// -----------------------------------------------------------------------------

/** Signed BPM difference vs anchor; null when either side is missing. */
export function orbitBpmDelta(
  anchor: ResolvedPlaySelection | null,
  track: Track
): number | null {
  if (!anchor || anchor.track.bpm == null || track.bpm == null) return null;
  return track.bpm - anchor.track.bpm;
}

/** Format BPM delta for the focus chip, e.g. "+1 BPM" or "−3 BPM". */
export function formatOrbitBpmDelta(delta: number | null): string | null {
  if (delta == null) return null;
  if (delta === 0) return '0 BPM';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${Math.abs(delta)} BPM`;
}

/**
 * Suggested hero disc spin duration (seconds) when a satellite is selected.
 * Clamped ±0.2s around the default `--play-disc-spin` (3.4s).
 */
export function orbitDiscSpinSec(
  anchor: ResolvedPlaySelection | null,
  track: Track,
  baseSec = 3.4
): number {
  const delta = orbitBpmDelta(anchor, track);
  if (delta == null) return baseSec;
  const adjust = Math.max(-0.2, Math.min(0.2, (-delta / 5) * 0.1));
  return Math.round((baseSec + adjust) * 10) / 10;
}

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

const MOBILE_ARC_START_DEG = 40;
const MOBILE_ARC_END_DEG = 140;
const MOBILE_BEST_ANGLE_DEG = 90;
const MIN_MOBILE_SEPARATION_DEG = 20;

function isOrbitColdStart(
  collection: VinylRecord[],
  anchor: ResolvedPlaySelection | null
): boolean {
  if (anchor) return false;
  // `recommendNext` falls back to last-played when anchor is null; cold start
  // only when there is no meaningful anchor at all.
  const played = collection.some((r) => r.lastPlayedAt);
  return !played;
}

function pickForgottenGemKey(
  suggestions: { record: VinylRecord; track: Track }[],
  anchor: ResolvedPlaySelection | null
): string | null {
  if (!anchor) return null;

  const thirtyDaysMs = 30 * 86400000;
  const now = Date.now();

  for (const { record, track } of suggestions) {
    if (!record.lastPlayedAt) continue;
    const playedAt = Date.parse(record.lastPlayedAt);
    if (Number.isNaN(playedAt)) continue;
    if (now - playedAt >= thirtyDaysMs) {
      return playSelectionKey({ recordId: record.id, trackId: track.id });
    }
  }

  return null;
}

function countVibeOverlap(a: Track, b: Track): number {
  const setB = new Set((b.vibeTags ?? []).map((t) => t.toLowerCase()));
  return (a.vibeTags ?? []).filter((t) => setB.has(t.toLowerCase())).length;
}

function countGenreOverlap(a: VinylRecord, b: VinylRecord): number {
  const setB = new Set(b.genres.map((g) => g.toLowerCase()));
  return a.genres.filter((g) => setB.has(g.toLowerCase())).length;
}

/**
 * Assign `angleDeg` on each satellite after rings are known.
 * Mobile: all satellites share the thumb arc; rank #0 sits at 6 o'clock.
 * Desktop: each ring band is spread across the full circle, staggered by band.
 */
function assignOrbitAngles(
  satellites: OrbitSatellite[],
  opts: { mobile: boolean; coldStart: boolean }
): void {
  if (!satellites.length) return;

  if (opts.mobile) {
    assignThumbArcAngles(satellites);
    return;
  }

  assignDesktopAngles(satellites);
}

/** Bottom-weighted arc for one-handed use — each ring gets its own spread. */
function assignThumbArcAngles(satellites: OrbitSatellite[]): void {
  const ringArc: Record<OrbitRing, { start: number; end: number; best: number }> = {
    inner: { start: MOBILE_ARC_START_DEG, end: MOBILE_ARC_END_DEG, best: MOBILE_BEST_ANGLE_DEG },
    mid: { start: 48, end: 132, best: 92 },
    outer: { start: 32, end: 148, best: 94 },
  };

  const ringOrder: OrbitRing[] = ['inner', 'mid', 'outer'];

  for (const ring of ringOrder) {
    const band = satellites
      .filter((s) => s.ring === ring)
      .slice()
      .sort((a, b) => a.rank - b.rank);
    if (!band.length) continue;

    const { start, end, best } = ringArc[ring];
    const angles = spreadAnglesInArc(band.length, start, end, best);
    band.forEach((satellite, i) => {
      satellite.angleDeg = angles[i] ?? best;
    });
  }
}

function spreadAnglesInArc(
  count: number,
  startDeg: number,
  endDeg: number,
  bestDeg: number
): number[] {
  if (count === 1) return [bestDeg];

  const arcSpan = endDeg - startDeg;
  const step = Math.max(MIN_MOBILE_SEPARATION_DEG, arcSpan / Math.max(1, count - 1));

  const angles: number[] = [bestDeg];
  let offset = 1;
  while (angles.length < count) {
    const delta = step * offset;
    if (angles.length < count) {
      angles.push(Math.min(bestDeg + delta, endDeg));
    }
    if (angles.length < count) {
      angles.push(Math.max(bestDeg - delta, startDeg));
    }
    offset += 1;
  }

  return angles.slice(0, count);
}

/** Even distribution per ring on the full 360°, staggered for a constellation feel. */
function assignDesktopAngles(satellites: OrbitSatellite[]): void {
  const ringOrder: OrbitRing[] = ['inner', 'mid', 'outer'];
  const ringPhase: Record<OrbitRing, number> = {
    inner: 98,
    mid: 18,
    outer: 242,
  };
  const ringStagger: Record<OrbitRing, number> = {
    inner: 0,
    mid: 17,
    outer: 31,
  };

  for (const ring of ringOrder) {
    const band = satellites
      .filter((s) => s.ring === ring)
      .slice()
      .sort((a, b) => a.rank - b.rank);
    if (!band.length) continue;

    const step = band.length === 1 ? 0 : 360 / band.length;
    band.forEach((satellite, i) => {
      const wobble = (satellite.rank % 3) * 4 - 4;
      satellite.angleDeg = (ringPhase[ring] + ringStagger[ring] + step * i + wobble + 360) % 360;
    });
  }
}