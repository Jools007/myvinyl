import { withTimeout } from '../enrich-timeout';
import { getAlbumInfo, getArtistInfo } from '../lastfm';
import { composeCharacterDescription } from './compose';
import { fetchListenBrainzReleaseGroupTags } from './listenbrainz';
import { lookupMusicBrainzAlbum } from './musicbrainz';
import { fetchWikipediaAlbumExtract } from './wikipedia';

export type AlbumCharacterInput = {
  artist: string;
  album: string;
  year?: string;
  /** Comma-separated or repeated query values — Discogs genres/styles already on the record. */
  genres?: string[];
};

export type AlbumCharacterEnv = {
  lastfmKey?: string;
};

export type AlbumCharacterResult = {
  description: string | null;
  tags: string[];
  sources: string[];
};

export async function resolveAlbumCharacter(
  input: AlbumCharacterInput,
  env: AlbumCharacterEnv
): Promise<AlbumCharacterResult> {
  const artist = input.artist.trim();
  const album = input.album.trim();
  const discogsGenres = (input.genres ?? []).map((g) => g.trim()).filter(Boolean);

  const [wikipediaExtract, lastfmInfo, lastfmArtist, mbMatch] = await Promise.all([
    fetchWikipediaAlbumExtract(artist, album),
    env.lastfmKey
      ? withTimeout(getAlbumInfo(env.lastfmKey, artist, album), 6000, null)
      : Promise.resolve(null),
    env.lastfmKey && artist.toLowerCase() !== 'various'
      ? withTimeout(getArtistInfo(env.lastfmKey, artist), 6000, null)
      : Promise.resolve(null),
    lookupMusicBrainzAlbum(artist, album),
  ]);

  const listenBrainzTags = mbMatch?.releaseGroupMbid
    ? await fetchListenBrainzReleaseGroupTags(mbMatch.releaseGroupMbid)
    : [];

  const composed = composeCharacterDescription({
    artist,
    album,
    year: input.year,
    wikipediaExtract: wikipediaExtract ?? undefined,
    lastfmWiki: lastfmInfo?.wikiText || lastfmArtist?.wikiText,
    lastfmTags: [...new Set([...(lastfmInfo?.tags ?? []), ...(lastfmArtist?.tags ?? [])])],
    musicBrainzTags: mbMatch?.tags,
    listenBrainzTags,
    discogsGenres,
  });

  return {
    description: composed.description || null,
    tags: composed.tags,
    sources: composed.sources,
  };
}