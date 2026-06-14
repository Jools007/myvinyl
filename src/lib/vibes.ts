import { getPrimaryTrack } from './tracks';
import type { StarterVibe, VinylRecord } from './types';

export const STARTER_VIBES: {
  id: StarterVibe;
  label: string;
  emoji: string;
  description: string;
  keywords: string[];
  lastfmTag: string;
  accent: string;
}[] = [
  { id: 'soul', label: 'Soul', emoji: '✦', description: 'Warm grooves & heartfelt vocals', keywords: ['soul', 'motown', 'r&b', 'groove'], lastfmTag: 'soul', accent: '#e8a87c' },
  { id: 'jazz', label: 'Jazz', emoji: '◈', description: 'Swing, fusion & late-night moods', keywords: ['jazz', 'bebop', 'fusion', 'modal'], lastfmTag: 'jazz', accent: '#7eb8da' },
  { id: 'house', label: 'House', emoji: '◎', description: 'Four-on-the-floor & deep chords', keywords: ['house', 'deep house', 'garage', 'disco house'], lastfmTag: 'house', accent: '#9b7ede' },
  { id: 'hip-hop', label: 'Hip-Hop', emoji: '▣', description: 'Boom bap, breaks & lyrical flow', keywords: ['hip hop', 'rap', 'boom bap', 'beats'], lastfmTag: 'hip-hop', accent: '#d4a574' },
  { id: 'techno', label: 'Techno', emoji: '⬡', description: 'Driving kicks & hypnotic synths', keywords: ['techno', 'minimal', 'industrial', 'detroit'], lastfmTag: 'techno', accent: '#6ec9c9' },
  { id: 'disco', label: 'Disco', emoji: '◇', description: 'Glitter floors & string sections', keywords: ['disco', 'boogie', 'nu-disco', 'funk'], lastfmTag: 'disco', accent: '#f0c674' },
  { id: 'funk', label: 'Funk', emoji: '◆', description: 'Slap bass & tight horn sections', keywords: ['funk', 'p-funk', 'breaks', 'groove'], lastfmTag: 'funk', accent: '#e07a5f' },
  { id: 'ambient', label: 'Ambient', emoji: '○', description: 'Textures, space & slow evolution', keywords: ['ambient', 'drone', 'experimental', 'chill'], lastfmTag: 'ambient', accent: '#81b29a' },
  { id: 'latin', label: 'Latin', emoji: '◉', description: 'Percussion, salsa & tropical heat', keywords: ['latin', 'salsa', 'bossa', 'cumbia'], lastfmTag: 'latin', accent: '#f28482' },
  { id: 'reggae', label: 'Reggae', emoji: '▲', description: 'Roots, dub & island rhythms', keywords: ['reggae', 'dub', 'roots', 'dancehall'], lastfmTag: 'reggae', accent: '#57cc99' },
];

export function vibeConfig(id: StarterVibe) {
  return STARTER_VIBES.find((v) => v.id === id)!;
}

function recordText(r: VinylRecord): string {
  const vibes = getPrimaryTrack(r)?.vibeTags ?? [];
  return [...r.genres, ...vibes, r.artist, r.title].join(' ').toLowerCase();
}

export function scoreRecordForVibe(record: VinylRecord, vibe: StarterVibe): number {
  const cfg = vibeConfig(vibe);
  const text = recordText(record);
  let score = 0;
  for (const kw of cfg.keywords) {
    if (text.includes(kw)) score += 3;
  }
  if (
    (getPrimaryTrack(record)?.vibeTags ?? []).some((t) =>
      cfg.keywords.some((k) => t.toLowerCase().includes(k))
    )
  ) {
    score += 5;
  }
  return score;
}

export function suggestForStarterVibe(
  records: VinylRecord[],
  vibe: StarterVibe,
  limit = 8
): VinylRecord[] {
  return [...records]
    .map((r) => ({ r, score: scoreRecordForVibe(r, vibe) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}

/** Max vibe tags per track in add/edit flows. */
export const MAX_VIBE_TAGS = 6;

/**
 * Curated crate tags — genre-first (aligned with STARTER_VIBES), plus a few set moods.
 * Kept short so mobile add modal stays scannable at the turntable.
 */
export const VIBE_TAG_SUGGESTIONS = [
  'Jazz',
  'Hip-Hop',
  'Trip-Hop',
  'Soul',
  'Funk',
  'House',
  'Disco',
  'Techno',
  'Latin',
  'Reggae',
  'Ambient',
  'Chillout',
  'Stoner',
  'Deep',
  'Late-night',
] as const;

export type VibeTagSuggestion = (typeof VIBE_TAG_SUGGESTIONS)[number];

const VIBE_SUGGESTION_LOOKUP = new Map(
  VIBE_TAG_SUGGESTIONS.map((tag) => [tag.toLowerCase(), tag])
);

/** Map enrichment / legacy labels onto curated chips where possible. */
const VIBE_TAG_ALIASES: Record<string, VibeTagSuggestion> = {
  jazzy: 'Jazz',
  jazz: 'Jazz',
  bebop: 'Jazz',
  'hip hop': 'Hip-Hop',
  hiphop: 'Hip-Hop',
  'hip-hop': 'Hip-Hop',
  rap: 'Hip-Hop',
  boombap: 'Hip-Hop',
  'boom bap': 'Hip-Hop',
  'trip hop': 'Trip-Hop',
  'trip-hop': 'Trip-Hop',
  triphop: 'Trip-Hop',
  soulful: 'Soul',
  motown: 'Soul',
  groovy: 'Funk',
  boogie: 'Disco',
  'nu-disco': 'Disco',
  'deep house': 'Deep',
  hypnotic: 'Deep',
  raw: 'Techno',
  industrial: 'Techno',
  'peak-time': 'Late-night',
  'peak time': 'Late-night',
  'late night': 'Late-night',
  warmup: 'Deep',
  'warm-up': 'Deep',
  uplifting: 'Soul',
  melodic: 'Deep',
  warehouse: 'Techno',
  sunset: 'Ambient',
  chill: 'Chillout',
  chillout: 'Chillout',
  'chill out': 'Chillout',
  downtempo: 'Chillout',
  stoner: 'Stoner',
  'stoner rock': 'Stoner',
  stonerrock: 'Stoner',
};

export function isVibeTagSuggestion(tag: string): tag is VibeTagSuggestion {
  return VIBE_SUGGESTION_LOOKUP.has(tag.toLowerCase());
}

/** Canonical chip label, alias mapping, or trimmed custom text. */
export function canonicalVibeTag(tag: string): string {
  const trimmed = tag.trim();
  if (!trimmed) return '';

  const direct = VIBE_SUGGESTION_LOOKUP.get(trimmed.toLowerCase());
  if (direct) return direct;

  const alias = VIBE_TAG_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  return trimmed;
}

/** Pick curated suggestions from API enrichment without clobbering user choices. */
export function vibesFromEnrichment(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const out: string[] = [];
  for (const raw of tags) {
    const canonical = canonicalVibeTag(raw);
    if (!canonical || !isVibeTagSuggestion(canonical)) continue;
    if (!out.includes(canonical)) out.push(canonical);
    if (out.length >= MAX_VIBE_TAGS) break;
  }
  return out;
}