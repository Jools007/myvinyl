import { isPressingNotes } from './pressing-notes';

export type CharacterSignals = {
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
]);

const MOOD_BY_TAG: [string, string][] = [
  ['dub', 'deep'],
  ['roots reggae', 'soulful'],
  ['reggae', 'warm'],
  ['soul', 'soulful'],
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

function shortenWikiProse(text: string, tags: string[]): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || isPressingNotes(clean)) return null;

  const genreMatch = clean.match(/\bis an?\s+([^.]{3,80}?)\s+album\b/i);
  const genrePhrase = genreMatch?.[1]?.trim();

  const producerMatch = clean.match(/\bproduced by\s+([^.;]{3,50})/i);
  let producer = producerMatch?.[1]?.trim();
  if (producer) {
    producer = producer
      .replace(/\bat his\b.*/i, '')
      .replace(/\bat the\b.*/i, '')
      .trim();
    if (producer.length > 36) producer = producer.slice(0, 36).trim();
  }

  const tagPhrase = joinTags(tags) || genrePhrase;
  const mood = pickMood(tags.length ? tags : genrePhrase ? [genrePhrase] : []);

  if (tagPhrase && producer) {
    return `${capitalizePhrase(tagPhrase)} — ${producer}, ${mood} vibes`;
  }
  if (tagPhrase) {
    return `${capitalizePhrase(tagPhrase)} — ${mood} vibes`;
  }

  const firstSentence = clean.split(/\.\s/)[0]?.trim();
  if (firstSentence && firstSentence.length >= 24 && !isPressingNotes(firstSentence)) {
    return firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`;
  }

  return null;
}

function clampDescription(text: string, max = 520): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}…`;
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

  const wiki =
    signals.wikipediaExtract && !isPressingNotes(signals.wikipediaExtract)
      ? signals.wikipediaExtract
      : undefined;
  const lastfm =
    signals.lastfmWiki && !isPressingNotes(signals.lastfmWiki) ? signals.lastfmWiki : undefined;

  const prose = shortenWikiProse(wiki ?? lastfm ?? '', tags);
  if (prose) {
    return {
      description: clampDescription(prose),
      tags,
      sources: [...new Set(sources)],
    };
  }

  if (tags.length > 0) {
    const mood = pickMood(tags);
    const phrase = `${capitalizePhrase(joinTags(tags))} — ${mood} vibes`;
    return {
      description: clampDescription(phrase),
      tags,
      sources: [...new Set(sources.filter((s) => s !== 'wikipedia' && s !== 'lastfm-wiki'))],
    };
  }

  return { description: '', tags: [], sources: [] };
}