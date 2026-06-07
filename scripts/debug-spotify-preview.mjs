import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const id = process.env.SPOTIFY_CLIENT_ID;
const sec = process.env.SPOTIFY_CLIENT_SECRET;
if (!id || !sec) {
  console.error('Missing Spotify credentials');
  process.exit(1);
}

const {
  resolveTrackPreview,
  searchTracks,
  getSpotifyAlbumTrackMap,
  isSpotifyRateLimited,
} = await import('../server/spotify.ts');

async function rawSearch(q) {
  const creds = Buffer.from(`${id}:${sec}`).toString('base64');
  const tokRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  console.log('token status', tokRes.status);
  const tok = (await tokRes.json()).access_token;
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=3`,
    { headers: { Authorization: `Bearer ${tok}` } }
  );
  console.log('search status', res.status, res.statusText);
  const body = await res.json();
  console.log(
    'items',
    body.tracks?.items?.map((t) => ({ name: t.name, preview: Boolean(t.preview_url) }))
  );
}

console.log('rate limited?', isSpotifyRateLimited());
await rawSearch('Madonna Like A Virgin');

const cases = [
  ['Sade', 'Your Love Is King', 'Diamond Life'],
  ['Madonna', 'Lucky Star', 'Madonna'],
  ['Madonna', 'Like A Virgin', 'Like A Virgin'],
];

for (const [artist, title, album] of cases) {
  console.log('\n===', artist, '-', title, '@', album, '===');
  const map = await getSpotifyAlbumTrackMap(id, sec, artist, album);
  console.log('album map size', map.size);
  const r = await resolveTrackPreview(id, sec, artist, title, album);
  console.log('resolve', r);
  const tr = await searchTracks(id, sec, `track:"${title}" artist:"${artist}"`, 6);
  console.log(
    'search samples',
    tr.map((t) => ({ name: t.name, preview: Boolean(t.preview_url), id: t.id }))
  );
}