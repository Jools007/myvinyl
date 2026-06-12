/** DJ-style genre lane matching for recommendations (not strict taxonomy). */

const DOWNTEMPO_LANE = [
  'downtempo',
  'trip hop',
  'trip-hop',
  'triphop',
  'chillout',
  'chill out',
  'nu jazz',
  'nu-jazz',
  'lounge',
  'acid jazz',
  'dub',
  'ambient',
  'illbient',
  'electronic',
] as const;

const HOUSE_LANE = ['house', 'tech house', 'deep house', 'garage', 'disco house'] as const;
const TECHNO_LANE = ['techno', 'minimal', 'industrial', 'trance'] as const;

function genreText(genres: string[]): string {
  return genres.join(' ').toLowerCase();
}

function laneHit(text: string, markers: readonly string[]): boolean {
  return markers.some((m) => text.includes(m));
}

/** Positive = same lane; negative = clash (e.g. house after downtempo anchor). */
export function genreAffinityScore(anchorGenres: string[], candidateGenres: string[]): number {
  const a = genreText(anchorGenres);
  const b = genreText(candidateGenres);
  if (!a.trim() || !b.trim()) return 0;

  const anchorDowntempo = laneHit(a, DOWNTEMPO_LANE);
  const candDowntempo = laneHit(b, DOWNTEMPO_LANE);
  if (anchorDowntempo && candDowntempo) return 12;
  if (anchorDowntempo && laneHit(b, HOUSE_LANE)) return -18;
  if (anchorDowntempo && laneHit(b, TECHNO_LANE)) return -20;

  const anchorHouse = laneHit(a, HOUSE_LANE);
  const candHouse = laneHit(b, HOUSE_LANE);
  if (anchorHouse && candHouse) return 8;
  if (anchorHouse && anchorDowntempo === false && candDowntempo) return -8;

  const shared = anchorGenres.filter((g) =>
    candidateGenres.some((x) => x.toLowerCase() === g.toLowerCase())
  );
  return shared.length > 0 ? 4 : 0;
}

export function isDowntempoLane(genres: string[]): boolean {
  return laneHit(genreText(genres), DOWNTEMPO_LANE);
}