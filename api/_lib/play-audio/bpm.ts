/** Reject obvious mis-matches (e.g. Deezer 150 BPM on a pop ballad). */
export function isPlausibleTrackBpm(bpm: number, genres: string[] = []): boolean {
  if (!Number.isFinite(bpm) || bpm < 55 || bpm > 210) return false;

  const text = genres.join(' ').toLowerCase();

  if (text.includes('drum and bass') || text.includes('dnb')) {
    return bpm >= 155 && bpm <= 190;
  }
  if (text.includes('gabber') || text.includes('hardcore')) {
    return bpm >= 145 && bpm <= 220;
  }
  if (text.includes('ambient') || text.includes('downtempo')) {
    return bpm >= 55 && bpm <= 105;
  }

  if (
    text.includes('soul') ||
    text.includes('smooth') ||
    text.includes('r&b') ||
    text.includes('rnb') ||
    text.includes('quiet storm') ||
    text.includes('ballad')
  ) {
    return bpm >= 65 && bpm <= 120;
  }

  if (text.includes('jazz') || text.includes('bossa') || text.includes('lounge')) {
    return bpm >= 60 && bpm <= 130;
  }

  if (bpm > 148) return false;
  if (bpm < 68 && !text.includes('jazz') && !text.includes('soul')) return false;

  return true;
}