import { hashTrackSeed } from './camelot-wheel';

/** Soft BPM hints when Spotify audio-features are unavailable (403 on new apps). */
const GENRE_BPM: [string, number][] = [
  ['techno', 130],
  ['house', 124],
  ['deep house', 122],
  ['disco', 118],
  ['funk', 110],
  ['soul', 98],
  ['jazz', 110],
  ['hard rock', 122],
  ['rock', 118],
  ['metal', 128],
  ['punk', 132],
  ['pop', 112],
  ['blues', 95],
  ['country', 105],
  ['folk', 100],
  ['hip hop', 92],
  ['hip-hop', 92],
  ['rap', 92],
  ['trip-hop', 92],
  ['trip hop', 92],
  ['downtempo', 88],
  ['chillout', 86],
  ['nu jazz', 98],
  ['nu-jazz', 98],
  ['lounge', 95],
  ['ambient', 80],
  ['dub', 85],
  ['reggae', 85],
  ['latin', 100],
  ['garage', 132],
  ['drum and bass', 174],
  ['dnb', 174],
];

export function estimateBpmFromGenres(genres: string[]): number | undefined {
  const text = genres.join(' ').toLowerCase();
  for (const [key, bpm] of GENRE_BPM) {
    if (text.includes(key)) return bpm;
  }
  return undefined;
}

/** Genre Camelot hints — only used when keyFallback is on and APIs found nothing. */
const GENRE_CAMELOT: [string, string][] = [
  ['tech house', '8A'],
  ['deep house', '10A'],
  ['house', '8A'],
  ['techno', '8A'],
  ['minimal', '9A'],
  ['garage', '5A'],
  ['drum and bass', '4A'],
  ['dnb', '4A'],
  ['soul', '8B'],
  ['smooth', '8B'],
  ['quiet storm', '8B'],
  ['r&b', '5B'],
  ['rnb', '5B'],
  ['disco', '10B'],
  ['funk', '5B'],
  ['jazz', '3B'],
  ['hip hop', '4A'],
  ['hip-hop', '4A'],
  ['rap', '4A'],
  ['trip-hop', '6A'],
  ['trip hop', '6A'],
  ['downtempo', '6A'],
  ['chillout', '6A'],
  ['nu jazz', '3B'],
  ['nu-jazz', '3B'],
  ['lounge', '3B'],
  ['ambient', '6A'],
  ['dub', '6A'],
  ['reggae', '10A'],
  ['latin', '9A'],
  ['trance', '7B'],
  ['electro', '8A'],
  ['hard rock', '7A'],
  ['rock', '5A'],
  ['metal', '7A'],
  ['punk', '4A'],
  ['pop', '9B'],
  ['blues', '3B'],
  ['country', '10B'],
  ['folk', '6A'],
  ['progressive', '6A'],
  ['psychedelic', '6A'],
];

const DEFAULT_CAMELOT_POOL = ['5A', '7A', '9B', '3B', '10B', '8B'] as const;

/** Stable Camelot when genre text has no explicit mapping (still uses keyFallback). */
export function defaultCamelotForGenres(genres: string[]): string {
  const text = genres.join(' ').toLowerCase().trim();
  const h = hashTrackSeed(text || 'vinyl', 'album');
  return DEFAULT_CAMELOT_POOL[h % DEFAULT_CAMELOT_POOL.length];
}

export function estimateCamelotFromGenres(genres: string[]): string | undefined {
  const text = genres.join(' ').toLowerCase();
  for (const [key, camelot] of GENRE_CAMELOT) {
    if (text.includes(key)) return camelot;
  }
  return undefined;
}

export function extractBpmFromText(text: string): number | undefined {
  const bpmMatch = text.match(/\b(\d{2,3})\s*bpm\b/i);
  if (bpmMatch) {
    const n = parseInt(bpmMatch[1], 10);
    if (n >= 60 && n <= 200) return n;
  }
  return undefined;
}

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

  // Pop, rock, house, techno on vinyl — typical DJ-usable range
  if (bpm > 148) return false;
  if (bpm < 68 && !text.includes('jazz') && !text.includes('soul')) return false;

  return true;
}