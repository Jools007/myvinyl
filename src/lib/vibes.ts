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

export const VIBE_TAG_SUGGESTIONS = [
  'Peak-time', 'Warm-up', 'Deep', 'Melodic', 'Raw', 'Uplifting',
  'Late-night', 'Sunset', 'Warehouse', 'Soulful', 'Hypnotic', 'Groovy',
];