import { isPressingNotes } from './pressing-notes';

export type CharacterSignals = {
  artist?: string;
  album?: string;
  year?: string;
  wikipediaExtract?: string;
  lastfmWiki?: string;
  lastfmTags?: string[];
  musicBrainzTags?: string[];
  listenBrainzTags?: Array<{ tag: string; count: number }>;
  discogsGenres?: string[];
};

export type CharacterComposeResult = {
  description: string;
  tags: string[];
  sources: string[];
};

const NOISE_TAGS = new Set([
  'album',
  'seen live',
  'favourite',
  'favorite',
  'owned',
  'vinyl',
  'cd',
  'my vinyl',
  'all',
  'various',
  'various artists',
]);

const MOOD_BY_TAG: [string, string][] = [
  ['drum n bass', 'rolling'],
  ['drum and bass', 'rolling'],
  ['breakbeat', 'break-driven'],
  ['speed garage', 'late-night'],
  ['dub', 'deep'],
  ['roots reggae', 'soulful'],
  ['reggae', 'warm'],
  ['soul', 'soulful'],
  ['r&b', 'soulful'],
  ['jazz', 'late-night'],
  ['house', 'hypnotic'],
  ['techno', 'driving'],
  ['ambient', 'spacious'],
  ['funk', 'groovy'],
  ['disco', 'glittering'],
  ['hip hop', 'groovy'],
  ['hip-hop', 'groovy'],
  ['trip hop', 'moody'],
  ['trip-hop', 'moody'],
  ['downtempo', 'smooth'],
  ['electronic', 'electronic'],
];

const RELEASE_BOILERPLATE =
  /^(the album was released|it was released|released in|released on|this album was released|the record was released|the song was released)/i;

const MUSICAL_WORDS = [
  'sound',
  'music',
  'vocal',
  'guitar',
  'bass',
  'drum',
  'beat',
  'soul',
  'funk',
  'produced',
  'features',
  'style',
  'genre',
  'lyric',
  'melod',
  'rhythm',
  'groove',
  'atmospher',
  'energy',
  'landmark',
  'classic',
  'influence',
  'textures',
  'harmon',
  'sample',
  'synth',
  'mix',
  'anthem',
];

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function rankTags(signals: CharacterSignals): string[] {
  const scores = new Map<string, number>();

  const bump = (raw: string, weight: number) => {
    const tag = normalizeTag(raw);
    if (!tag || NOISE_TAGS.has(tag)) return;
    scores.set(tag, (scores.get(tag) ?? 0) + weight);
  };

  for (const g of signals.discogsGenres ?? []) bump(g, 3);
  for (const t of signals.musicBrainzTags ?? []) bump(t, 4);
  for (const row of signals.listenBrainzTags ?? []) bump(row.tag, 3 + Math.min(row.count, 5));
  for (const t of signals.lastfmTags ?? []) bump(t, 2);

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 6);
}

function pickMood(tags: string[]): string {
  const text = tags.join(' ');
  for (const [needle, mood] of MOOD_BY_TAG) {
    if (text.includes(needle)) return mood;
  }
  return 'characterful';
}

function capitalizePhrase(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinTags(tags: string[]): string {
  const top = tags.slice(0, 3);
  if (top.length === 0) return '';
  if (top.length === 1) return top[0];
  if (top.length === 2) return `${top[0]} & ${top[1]}`;
  return `${top[0]}, ${top[1]} & ${top[2]}`;
}

function cleanSourceProse(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\buser-contributed text\b/gi, ' ')
    .replace(/\bread more on last\.fm\b.*$/i, ' ')
    .replace(/^[^.]{0,80}\bprofile:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  return cleanSourceProse(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 16);
}

function musicalSentenceScore(sentence: string): number {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const word of MUSICAL_WORDS) {
    if (lower.includes(word)) score += 2;
  }
  if (/\b(single|ep|album|record|song|compilation)\b/i.test(sentence)) score += 1;
  if (RELEASE_BOILERPLATE.test(sentence)) score -= 4;
  return score;
}

function ensureSentenceEnd(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function extractRichProse(text: string, maxLen = 500): string | null {
  const clean = cleanSourceProse(text);
  if (!clean || isPressingNotes(clean) || clean.length < 48) return null;

  const sentences = splitSentences(clean);
  if (sentences.length === 0) return null;

  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: musicalSentenceScore(sentence) + (index === 0 ? 3 : 0),
      skip: RELEASE_BOILERPLATE.test(sentence),
    }))
    .filter((row) => !row.skip)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const picked: string[] = [];
  const opener = sentences[0];
  if (opener && !RELEASE_BOILERPLATE.test(opener)) {
    picked.push(opener);
  }

  for (const row of ranked) {
    if (picked.length >= 3) break;
    if (picked.includes(row.sentence)) continue;
    if (row.score <= 0 && picked.length >= 2) continue;
    picked.push(row.sentence);
  }

  if (picked.length === 0) {
    const fallback = sentences.filter((s) => !RELEASE_BOILERPLATE.test(s)).slice(0, 2);
    if (fallback.length === 0) return null;
    return clampDescription(fallback.map(ensureSentenceEnd).join(' '), maxLen);
  }

  picked.sort((a, b) => sentences.indexOf(a) - sentences.indexOf(b));
  const joined = picked.map(ensureSentenceEnd).join(' ');
  return clampDescription(joined, maxLen);
}

function composeTagFallback(signals: CharacterSignals, tags: string[]): string {
  const mood = pickMood(tags);
  const tagLine = capitalizePhrase(joinTags(tags));
  const artist = signals.artist?.trim();
  const album = signals.album?.trim();
  const year = signals.year?.trim();

  const parts: string[] = [];
  if (tagLine) parts.push(`${tagLine} record`);
  if (artist && album) {
    parts.push(`by ${artist}`);
  } else if (artist) {
    parts.push(`from ${artist}`);
  }
  if (year && /^\d{4}$/.test(year)) parts.push(`(${year})`);
  parts.push(`— ${mood} energy`);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function clampDescription(text: string, max = 520): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '));
  if (lastStop > max * 0.55) {
    return `${slice.slice(0, lastStop + 1).trim()}…`;
  }
  return `${slice.trim()}…`;
}

export function composeCharacterDescription(signals: CharacterSignals): CharacterComposeResult {
  const tags = rankTags(signals);
  const sources: string[] = [];

  if (signals.wikipediaExtract) sources.push('wikipedia');
  if (signals.lastfmWiki) sources.push('lastfm-wiki');
  if (signals.lastfmTags?.length) sources.push('lastfm-tags');
  if (signals.musicBrainzTags?.length) sources.push('musicbrainz-tags');
  if (signals.listenBrainzTags?.length) sources.push('listenbrainz-tags');
  if (signals.discogsGenres?.length) sources.push('discogs-genres');

  const proseCandidates = [signals.wikipediaExtract, signals.lastfmWiki].filter(
    (text): text is string => {
      if (!text?.trim()) return false;
      return !isPressingNotes(text);
    }
  );

  for (const candidate of proseCandidates) {
    const rich = extractRichProse(candidate);
    if (rich && rich.length >= 72) {
      return {
        description: rich,
        tags,
        sources: [...new Set(sources)],
      };
    }
  }

  if (tags.length > 0) {
    return {
      description: clampDescription(composeTagFallback(signals, tags)),
      tags,
      sources: [...new Set(sources.filter((s) => s !== 'wikipedia' && s !== 'lastfm-wiki'))],
    };
  }

  return { description: '', tags: [], sources: [] };
}