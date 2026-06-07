import type { Track } from './types';

/** Camelot wheel adjacency for harmonic mixing */
const WHEEL: Record<string, { num: number; letter: 'A' | 'B' }> = {};

for (let n = 1; n <= 12; n++) {
  WHEEL[`${n}A`] = { num: n, letter: 'A' };
  WHEEL[`${n}B`] = { num: n, letter: 'B' };
}

const MAJOR: Record<string, string> = {
  C: '8B',
  'C#': '3B',
  Db: '3B',
  D: '10B',
  'D#': '5B',
  Eb: '5B',
  E: '12B',
  F: '7B',
  'F#': '2B',
  Gb: '2B',
  G: '9B',
  'G#': '4B',
  Ab: '4B',
  A: '11B',
  'A#': '6B',
  Bb: '6B',
  B: '1B',
};

const MINOR: Record<string, string> = {
  C: '5A',
  'C#': '12A',
  Db: '12A',
  D: '7A',
  'D#': '2A',
  Eb: '2A',
  E: '9A',
  F: '4A',
  'F#': '11A',
  Gb: '11A',
  G: '6A',
  'G#': '1A',
  Ab: '1A',
  A: '8A',
  'A#': '3A',
  Bb: '3A',
  B: '10A',
};

export function musicalKeyToCamelot(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const text = raw.trim();

  const camelot = text.match(/^(\d{1,2})([AB])$/i);
  if (camelot) {
    const n = parseInt(camelot[1], 10);
    if (n >= 1 && n <= 12) return `${n}${camelot[2].toUpperCase()}`;
  }

  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/♯/g, '#')
    .replace(/♭/g, 'b')
    .trim();

  const majorMinor = normalized.match(/^([A-G](?:#|b)?)\s*(major|maj|minor|min|m)$/i);
  if (majorMinor) {
    const letter = majorMinor[1].charAt(0).toUpperCase() + majorMinor[1].slice(1);
    const table = /minor|min|m/i.test(majorMinor[2]) ? MINOR : MAJOR;
    return table[letter];
  }

  const compact = normalized.match(/^([A-G](?:#|b)?)(m|min)$/i);
  if (compact) {
    const letter = compact[1].charAt(0).toUpperCase() + compact[1].slice(1);
    return MINOR[letter];
  }

  return undefined;
}

export function parseCamelot(key?: string): { num: number; letter: 'A' | 'B' } | null {
  if (!key) return null;
  const m = key.trim().match(/^(\d{1,2})([AB])$/i);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 12) return null;
  return { num, letter: m[2].toUpperCase() as 'A' | 'B' };
}

/** DJ-facing Camelot code (8A) — never raw musical key in the UI. */
export function resolveTrackCamelot(
  track: Pick<Track, 'camelotKey' | 'musicalKey' | 'keyEstimated'> | null | undefined
): { code?: string; estimated?: boolean } {
  if (!track) return {};
  if (track.camelotKey && parseCamelot(track.camelotKey)) {
    return {
      code: track.camelotKey.trim().toUpperCase(),
      estimated: track.keyEstimated,
    };
  }
  const fromMusical = musicalKeyToCamelot(track.musicalKey);
  if (fromMusical) {
    return { code: fromMusical, estimated: true };
  }
  const converted = musicalKeyToCamelot(track.camelotKey);
  if (converted) {
    return { code: converted, estimated: track.keyEstimated };
  }
  return {};
}

export function camelotDistance(a?: string, b?: string): number {
  const pa = parseCamelot(a);
  const pb = parseCamelot(b);
  if (!pa || !pb) return 99;
  if (pa.num === pb.num && pa.letter === pb.letter) return 0;
  if (pa.num === pb.num) return 1;
  const diff = Math.min(
    Math.abs(pa.num - pb.num),
    12 - Math.abs(pa.num - pb.num)
  );
  if (diff === 1) return 2;
  if (diff === 2) return 4;
  return 6 + diff;
}

export function isCompatibleKey(a?: string, b?: string): boolean {
  return camelotDistance(a, b) <= 2;
}

export const CAMELOT_KEYS = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  return [`${n}A`, `${n}B`] as const;
}).flat();