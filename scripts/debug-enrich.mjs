import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env.local');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const { getRelease } = await import('../server/discogs.ts');
const { collectEnrichmentCandidates } = await import('../server/enrich-candidates.ts');
const { pickBestBpm, pickBestKey, scoreBpmCandidate } = await import('../server/enrich-scoring.ts');

async function main() {
  const title = process.argv[2] || 'Your Love Is King';
  const position = process.argv[3] || 'A1';
  const release = await getRelease(process.env.DISCOGS_TOKEN, 8131475);
  const genres = [...(release.genres || []), ...(release.styles || [])];

  const ctx = {
    artist: 'Sade',
    trackTitle: title,
    albumTitle: 'The Best Of Sade',
    trackPosition: position,
    genres,
    discogsTracklist: release.tracklist,
    spotifyId: process.env.SPOTIFY_CLIENT_ID,
    spotifySecret: process.env.SPOTIFY_CLIENT_SECRET,
    lastfmKey: process.env.LASTFM_API_KEY,
  };

  const { resolveDiscogsHint } = await import('../server/track-match.ts');
  const { collectSpotifyCandidates, getSpotifyAlbumTrackMap } = await import('../server/spotify.ts');
  const { getDeezerAlbumBpmMap, collectDeezerTrackCandidates } = await import('../server/deezer.ts');
  const { getTrackInfo } = await import('../server/lastfm.ts');

  console.log('hint', resolveDiscogsHint(release.tracklist, title, position));
  const lastfm = await getTrackInfo(process.env.LASTFM_API_KEY, 'Sade', title, ctx.albumTitle);
  console.log('lastfm album', lastfm?.album, 'wiki len', lastfm?.wikiText?.length);

  const sm = await getSpotifyAlbumTrackMap(ctx.spotifyId, ctx.spotifySecret, 'Sade', ctx.albumTitle, genres);
  console.log('spotify album map size', sm.size, 'keys sample', [...sm.keys()].slice(0, 5));

  const st = await collectSpotifyCandidates(ctx.spotifyId, ctx.spotifySecret, 'Sade', title, { albumTitle: ctx.albumTitle, genres });
  console.log('spotify track candidates', st.length, st.map(r => ({ bpm: r.bpm, key: r.camelotKey, album: r.albumName, name: r.spotifyTrackName })));

  const dm = await getDeezerAlbumBpmMap('Sade', ctx.albumTitle, genres);
  console.log('deezer album map size', dm.size);
  console.log('deezer A1 lookup', (await import('../server/track-match.ts')).lookupInAlbumMap(dm, 'Your Love Is King', 1, { vinylPosition: 'A1' }));
  console.log('deezer keys', [...dm.keys()]);

  const dt = await collectDeezerTrackCandidates('Sade', title, [ctx.albumTitle, lastfm?.album].filter(Boolean), genres);
  console.log('deezer tracks', dt);

  const { bpm, key, studioAlbum } = await collectEnrichmentCandidates(ctx);
  console.log('studioAlbum:', studioAlbum);
  console.log('\nBPM candidates:');
  for (const c of bpm) {
    console.log(' ', c, 'score=', scoreBpmCandidate(c, genres));
  }
  console.log('\nKey candidates:', key);
  console.log('\nPick:', pickBestBpm(bpm, genres), pickBestKey(key, genres));
}

main().catch(console.error);