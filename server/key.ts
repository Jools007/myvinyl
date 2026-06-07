/** Parse Camelot (8A), musical key text, or Spotify-style tokens → Camelot code. */
export function toCamelotKey(raw?: string): string | undefined {
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
    return pitchToCamelot(majorMinor[1], /minor|min|m/i.test(majorMinor[2]));
  }

  const compact = normalized.match(/^([A-G](?:#|b)?)(m|min)$/i);
  if (compact) {
    return pitchToCamelot(compact[1], true);
  }

  return undefined;
}

/** Open-key / Camelot wheel (matches server/spotify.ts CAMELOT table). */
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

function pitchToCamelot(pitch: string, isMinor: boolean): string | undefined {
  const letter = pitch.charAt(0).toUpperCase();
  const accidental = pitch.slice(1).replace(/♯/g, '#').replace(/♭/g, 'b');
  const p = `${letter}${accidental}`;
  const table = isMinor ? MINOR : MAJOR;
  return table[p];
}

export function extractKeyFromText(text: string): string | undefined {
  if (!text) return undefined;

  const camelot = text.match(/\b(\d{1,2})\s*([AB])\b/i);
  if (camelot) return toCamelotKey(`${camelot[1]}${camelot[2]}`);

  const keyPhrase = text.match(
    /\b(?:key|camelot|mixed in key)[:\s]+(\d{1,2}[AB]|[A-G](?:#|b)?\s*(?:major|minor|maj|min|m))\b/i
  );
  if (keyPhrase) return toCamelotKey(keyPhrase[1]);

  const musical = text.match(/\b([A-G](?:#|b)?)\s*(major|minor|maj|min|m)\b/i);
  if (musical) return toCamelotKey(`${musical[1]} ${musical[2]}`);

  const compactMinor = text.match(/\b([A-G](?:#|b)?)\s*m\b/i);
  if (compactMinor) return toCamelotKey(`${compactMinor[1]} minor`);

  return undefined;
}