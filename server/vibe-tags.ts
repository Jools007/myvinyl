/** Map Last.fm tags / Discogs genres to MyVinyl vibe tag suggestions. */

const TAG_TO_VIBE: [string, string][] = [
  ['trip-hop', 'Trip-Hop'],
  ['trip hop', 'Trip-Hop'],
  ['triphop', 'Trip-Hop'],
  ['downtempo', 'Deep'],
  ['chillout', 'Chillout'],
  ['chill out', 'Chillout'],
  ['stoner rock', 'Stoner'],
  ['stoner', 'Stoner'],
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
  'Chillout',
  'Stoner',
  'Trip-Hop',
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