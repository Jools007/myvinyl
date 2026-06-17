import { withTimeout } from '../enrich-timeout';

const USER_AGENT =
  'MyVinyl/1.0 (https://myvinyl-nine.vercel.app; album-character; contact@myvinyl.local)';

type WikiSummary = {
  extract?: string;
  description?: string;
  title?: string;
};

async function fetchSummary(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as WikiSummary;
  const extract = data.extract?.replace(/\s+/g, ' ').trim();
  return extract || null;
}

async function searchWikipediaTitles(query: string, limit = 5): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(limit),
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { search?: { title: string }[] };
  };
  return (data.query?.search ?? []).map((hit) => hit.title).filter(Boolean);
}

function albumTitleCandidates(artist: string, album: string): string[] {
  const a = artist.trim();
  const t = album.trim();
  const out: string[] = [];
  if (t) out.push(t);
  if (a && t) {
    out.push(`${t} (${a} album)`);
    out.push(`${t} (${a} Album)`);
    out.push(`${t} (${a} song)`);
    out.push(`${t} (${a} single)`);
  }
  return [...new Set(out)];
}

function searchQueries(artist: string, album: string): string[] {
  const a = artist.trim();
  const t = album.trim();
  const queries: string[] = [];
  if (a && t) queries.push(`${t} ${a} album`);
  if (a && t) queries.push(`"${t}" ${a}`);
  if (t) queries.push(`${t} album`);
  return [...new Set(queries)];
}

function looksLikeMusicArticle(extract: string, artist: string, album: string): boolean {
  const text = extract.toLowerCase();
  const a = artist.trim().toLowerCase();
  const t = album.trim().toLowerCase();
  const musicHints = ['album', 'song', 'single', 'ep', 'record', 'studio', 'music', 'released'];
  const hasMusic = musicHints.some((hint) => text.includes(hint));
  const mentionsArtist = !a || a === 'various' || text.includes(a);
  const mentionsAlbum = !t || text.includes(t);
  return hasMusic && mentionsArtist && mentionsAlbum;
}

/** First-paragraph album extract when a Wikipedia page exists. */
export async function fetchWikipediaAlbumExtract(
  artist: string,
  album: string
): Promise<string | null> {
  for (const title of albumTitleCandidates(artist, album)) {
    const extract = await withTimeout(fetchSummary(title), 4500, null);
    if (extract && looksLikeMusicArticle(extract, artist, album)) return extract;
  }

  for (const query of searchQueries(artist, album)) {
    const titles = await withTimeout(searchWikipediaTitles(query), 4500, []);
    for (const title of titles) {
      const extract = await withTimeout(fetchSummary(title), 4500, null);
      if (extract && looksLikeMusicArticle(extract, artist, album)) return extract;
    }
  }

  return null;
}