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

function albumTitleCandidates(artist: string, album: string): string[] {
  const a = artist.trim();
  const t = album.trim();
  const out = [t];
  if (a) {
    out.push(`${t} (${a} album)`);
    out.push(`${t} (${a} Album)`);
  }
  return [...new Set(out)];
}

/** First-paragraph album extract when a Wikipedia page exists. */
export async function fetchWikipediaAlbumExtract(
  artist: string,
  album: string
): Promise<string | null> {
  for (const title of albumTitleCandidates(artist, album)) {
    const extract = await withTimeout(fetchSummary(title), 4500, null);
    if (extract) return extract;
  }
  return null;
}