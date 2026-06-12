/**
 * DJ beatgrid compatibility — programmed/grid tempo vs human-drummed drift.
 *
 * Same nominal BPM is not enough: electronic tracks sit on a fixed grid; live bands
 * push/pull tempo. Mixing grid ↔ live causes phase slip even when harmonic/BPM match.
 */

export type RhythmSource = 'grid' | 'live' | 'hybrid' | 'unknown';

const GRID_MARKERS = [
  'house',
  'techno',
  'trance',
  'electro',
  'electronic',
  'edm',
  'dance',
  'club',
  'dubstep',
  'drum n bass',
  'drum and bass',
  'dnb',
  'breakbeat',
  'breaks',
  'break beat',
  'trip hop',
  'trip-hop',
  'triphop',
  'downtempo',
  'ambient',
  'idm',
  'minimal',
  'tech house',
  'deep house',
  'garage',
  'uk garage',
  'hardstyle',
  'hard dance',
  'synth',
  'synth-pop',
  'synthpop',
  'eurodance',
  'euro house',
  'italo',
  'disco house',
  'progressive house',
  'acid house',
  'acid',
  'jungle',
  'footwork',
  'grime',
  'electroclash',
  'nu-disco',
  'nu disco',
  'leftfield',
  'balearic',
  'illbient',
  'glitch',
  'dub techno',
  'minimal techno',
] as const;

const LIVE_MARKERS = [
  'rock',
  'latin',
  'jazz',
  'fusion',
  'blues',
  'metal',
  'punk',
  'prog',
  'progressive rock',
  'classic rock',
  'hard rock',
  'psychedelic',
  'grunge',
  'soul',
  'r&b',
  'rnb',
  'motown',
  'gospel',
  'country',
  'folk',
  'bluegrass',
  'reggae',
  'ska',
  'calypso',
  'salsa',
  'samba',
  'bossa nova',
  'bossa',
  'afrobeat',
  'afro-beat',
  'afro cuban',
  'flamenco',
  'live',
  'unplugged',
  'acoustic',
  'latin jazz',
  'jazz-funk',
  'jazz funk',
  'smooth jazz',
  'contemporary jazz',
  'free jazz',
  'bebop',
  'swing',
  'big band',
  'soundtrack',
  'orchestral',
  'world',
  'rumba',
  'mambo',
  'cha-cha',
] as const;

const HYBRID_MARKERS = [
  'disco',
  'funk',
  'hip hop',
  'hip-hop',
  'pop',
  'new wave',
  'post-punk',
  'indie',
  'alternative',
  'nu jazz',
  'nu-jazz',
  'acid jazz',
  'boogie',
  'freestyle',
] as const;

function markerHits(text: string, markers: readonly string[]): number {
  return markers.filter((m) => text.includes(m)).length;
}

function buildRhythmText(genres: string[], artist?: string): string {
  return [artist ?? '', ...genres].join(' ').toLowerCase();
}

/** Classify how steady the underlying drum tempo is for DJ beatmatching. */
export function classifyRhythmSource(genres: string[], artist?: string): RhythmSource {
  const text = buildRhythmText(genres, artist);
  if (!text.trim()) return 'unknown';

  const gridHits = markerHits(text, GRID_MARKERS);
  const liveHits = markerHits(text, LIVE_MARKERS);
  const hybridHits = markerHits(text, HYBRID_MARKERS);

  const hasElectronicLane =
    text.includes('electronic') ||
    text.includes('trip hop') ||
    text.includes('trip-hop') ||
    text.includes('downtempo') ||
    text.includes('house') ||
    text.includes('techno');

  if (gridHits > 0 && liveHits === 0) return 'grid';
  if (liveHits > 0 && gridHits === 0) return 'live';

  if (gridHits > 0 && liveHits > 0) {
    return hasElectronicLane ? 'grid' : 'hybrid';
  }

  if (hybridHits > 0) return 'hybrid';
  if (gridHits > 0) return 'grid';
  if (liveHits > 0) return 'live';

  return 'unknown';
}

export function isGridRhythmSource(genres: string[], artist?: string): boolean {
  return classifyRhythmSource(genres, artist) === 'grid';
}

export function isLiveRhythmSource(genres: string[], artist?: string): boolean {
  return classifyRhythmSource(genres, artist) === 'live';
}

/**
 * Score adjustment for mix partners. -999 = hard exclude (grid ↔ live).
 */
export function rhythmCompatibilityScore(
  anchorGenres: string[],
  candidateGenres: string[],
  anchorArtist?: string,
  candidateArtist?: string
): number {
  const anchor = classifyRhythmSource(anchorGenres, anchorArtist);
  const candidate = classifyRhythmSource(candidateGenres, candidateArtist);

  if (anchor === 'grid' && candidate === 'live') return -999;
  if (anchor === 'live' && candidate === 'grid') return -999;

  if (anchor === 'grid' && candidate === 'grid') return 14;
  if (anchor === 'live' && candidate === 'live') return 10;

  if (anchor === 'hybrid' && candidate === 'hybrid') return 4;
  if (anchor === 'grid' && candidate === 'hybrid') return -6;
  if (anchor === 'live' && candidate === 'hybrid') return -4;
  if (anchor === 'hybrid' && candidate === 'grid') return -6;
  if (anchor === 'hybrid' && candidate === 'live') return -4;

  return 0;
}

export function isRhythmMixPartner(
  anchorGenres: string[],
  candidateGenres: string[],
  anchorArtist?: string,
  candidateArtist?: string
): boolean {
  return (
    rhythmCompatibilityScore(anchorGenres, candidateGenres, anchorArtist, candidateArtist) > -999
  );
}

export function rhythmMismatchReason(
  anchorGenres: string[],
  candidateGenres: string[],
  anchorArtist?: string,
  candidateArtist?: string
): string | null {
  const anchor = classifyRhythmSource(anchorGenres, anchorArtist);
  const candidate = classifyRhythmSource(candidateGenres, candidateArtist);

  if (anchor === 'grid' && candidate === 'live') {
    return 'Live drums — tempo drifts off the grid';
  }
  if (anchor === 'live' && candidate === 'grid') {
    return 'Electronic grid — hard to blend with live drums';
  }
  return null;
}