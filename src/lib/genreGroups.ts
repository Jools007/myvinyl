import { cleanFilterToken, parseFilterList } from './filterLabels';
import type { VinylRecord } from './types';

function norm(raw: string): string {
  return cleanFilterToken(raw)
    .toLowerCase()
    .replace(/\//g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Ordered: specific subgenres before broader parents. */
const GENRE_MATCHERS: { label: string; test: (t: string) => boolean }[] = [
  { label: 'Deep House', test: (t) => /deep house|soulful house|garage house|lo fi house/.test(t) },
  { label: 'Tech House', test: (t) => /tech house|minimal house|microhouse/.test(t) },
  {
    label: 'House',
    test: (t) =>
      /\bhouse\b|acid house|chicago house|funky house|vocal house|progressive house|electro house|tribal house|future house|balearic|ghetto house/.test(
        t
      ),
  },
  {
    label: 'Techno',
    test: (t) => /\btechno\b|minimal techno|detroit techno|industrial techno|hard techno|acid techno/.test(t),
  },
  { label: 'Trance', test: (t) => /\btrance\b|psytrance|psy trance|goa trance/.test(t) },
  { label: 'Drum & Bass', test: (t) => /drum n bass|drum and bass|jungle|breakcore|neurofunk/.test(t) },
  { label: 'Breakbeat', test: (t) => /breakbeat|broken beat|big beat|uk breaks/.test(t) },
  { label: 'Dubstep', test: (t) => /dubstep|grime|uk garage|2 step|2step/.test(t) },
  { label: 'Ambient', test: (t) => /\bambient\b|drone|new age|illbient|dark ambient/.test(t) },
  {
    label: 'Downtempo',
    test: (t) => /downtempo|trip hop|chillout|chill out|lounge|nu jazz|acid jazz/.test(t),
  },
  { label: 'Disco', test: (t) => /\bdisco\b|boogie|italo disco|nu disco|post disco/.test(t) },
  { label: 'Funk', test: (t) => /\bfunk\b|p funk|p-funk|go-go|gogo/.test(t) },
  { label: 'Soul', test: (t) => /\bsoul\b|r&b|rnb|rhythm and blues|neo soul|motown/.test(t) },
  { label: 'Jazz', test: (t) => /\bjazz\b|bebop|hard bop|swing|bossa|fusion|modal/.test(t) },
  { label: 'Hip Hop', test: (t) => /hip hop|hip-hop|rap|boom bap|trap\b/.test(t) },
  { label: 'Reggae', test: (t) => /reggae|dub\b|dancehall|lovers rock|roots reggae|ska\b/.test(t) },
  { label: 'Latin', test: (t) => /latin|salsa|bossa nova|samba|tango|cumbia|reggaeton|mpb/.test(t) },
  {
    label: 'Rock',
    test: (t) =>
      /\brock\b|indie rock|post punk|punk|alternative rock|metal|grunge|shoegaze|psychedelic rock/.test(t),
  },
  { label: 'Pop', test: (t) => /\bpop\b|synth pop|synthpop|new wave|electropop/.test(t) },
  { label: 'Blues', test: (t) => /\bblues\b|delta blues|chicago blues/.test(t) },
  { label: 'Classical', test: (t) => /classical|orchestral|opera|baroque|chamber music|contemporary classical/.test(t) },
  {
    label: 'Folk',
    test: (t) => /\bfolk\b|country|bluegrass|americana|singer songwriter|world music|afrobeat/.test(t),
  },
  {
    label: 'Electronic',
    test: (t) =>
      /\belectronic\b|electronica|electro\b|idm|leftfield|experimental|edm|dance\b|beats|soundtrack|score/.test(
        t
      ),
  },
];

export const GENRE_FILTER_LABELS = [...GENRE_MATCHERS.map((m) => m.label), 'Other'];

const BROAD_PARENT_GENRES = new Set([
  'electronic',
  'jazz',
  'rock',
  'pop',
  'funk',
  'soul',
  'classical',
  'folk',
  'hip hop',
  'reggae',
  'latin',
  'blues',
  'country',
  'stage screen',
  'non music',
  "children's",
]);

/** Map a raw Discogs genre/style to a broader filter bucket. */
export function groupGenreLabel(raw: unknown): string {
  const token = parseFilterList(raw)[0] ?? cleanFilterToken(String(raw ?? ''));
  const base = norm(token);
  if (!base) return 'Other';

  for (const { label, test } of GENRE_MATCHERS) {
    if (test(base)) return label;
  }

  if (BROAD_PARENT_GENRES.has(base)) {
    return titleCase(base);
  }

  if (base.length <= 18 && !/\d/.test(base)) {
    return titleCase(base);
  }

  return 'Other';
}

/** Unique grouped genre labels present in the collection, in DJ-friendly order. */
export function collectGroupedGenreOptions(records: VinylRecord[]): string[] {
  const set = new Set<string>();
  for (const record of records) {
    for (const g of record.genres) {
      for (const token of parseFilterList(g)) {
        set.add(groupGenreLabel(token));
      }
    }
  }

  const order = new Map(GENRE_FILTER_LABELS.map((label, index) => [label, index]));
  return Array.from(set).sort((a, b) => {
    const ai = order.get(a) ?? 998;
    const bi = order.get(b) ?? 998;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

/** Primary grouped label for shelf / insight bucketing (first genre on release). */
export function primaryGroupedGenre(record: VinylRecord): string {
  const first = record.genres.find((g) => parseFilterList(g).length > 0);
  if (!first) return 'Other';
  return groupGenreLabel(first);
}

export function recordMatchesGroupedGenre(record: VinylRecord, filterGenre: string): boolean {
  const target = filterGenre.trim();
  if (!target) return true;
  return record.genres.some((g) =>
    parseFilterList(g).some((token) => groupGenreLabel(token) === target)
  );
}