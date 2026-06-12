/** Map Last.fm tags / Discogs genres to MyVinyl vibe tag suggestions. */

const TAG_TO_VIBE: [string, string][] = [
  ['trip-hop', 'Late-night'],
  ['trip hop', 'Late-night'],
  ['downtempo', 'Deep'],
  ['chillout', 'Late-night'],
  ['chill out', 'Late-night'],
  ['nu jazz', 'Soulful'],
  ['nu-jazz', 'Soulful'],
  ['lounge', 'Sunset'],
  ['ambient', 'Deep'],
  ['soul', 'Soulful'],
  ['funk', 'Groovy'],
  ['disco', 'Groovy'],
  ['house', 'Peak-time'],
  ['deep house', 'Deep'],
  ['techno', 'Hypnotic'],
  ['minimal', 'Hypnotic'],
  ['drum and bass', 'Raw'],
  ['dnb', 'Raw'],
  ['jazz', 'Melodic'],
  ['hip hop', 'Groovy'],
  ['hip-hop', 'Groovy'],
  ['dub', 'Deep'],
  ['electronic', 'Hypnotic'],
  ['instrumental', 'Deep'],
  ['vocal', 'Soulful'],
];

const ALLOWED = new Set([
  'Peak-time',
  'Warm-up',
  'Deep',
  'Melodic',
  'Raw',
  'Uplifting',
  'Late-night',
  'Sunset',
  'Warehouse',
  'Soulful',
  'Hypnotic',
  'Groovy',
]);

export function mapTagsToVibeHints(tags: string[], genres: string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const sources = [...tags, ...genres];

  for (const raw of sources) {
    const text = raw.trim().toLowerCase();
    if (!text) continue;
    for (const [needle, vibe] of TAG_TO_VIBE) {
      if (!text.includes(needle) || !ALLOWED.has(vibe) || seen.has(vibe)) continue;
      seen.add(vibe);
      out.push(vibe);
      if (out.length >= 4) return out;
    }
  }

  return out;
}