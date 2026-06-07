import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const { resolvePlayableAudio } = await import('../server/play-audio.ts');

const cases = [
  { artist: 'Sade', title: 'Your Love Is King', album: 'Diamond Life' },
  { artist: 'Madonna', title: 'Lucky Star', album: 'Madonna' },
  { artist: 'Madonna', title: 'Lucky Star (Remastered)', album: 'Like a Virgin' },
];

for (const c of cases) {
  console.log('\n==========', c.artist, '-', c.title, '@', c.album, '==========');
  const r = await resolvePlayableAudio({
    ...c,
    spotifyId: process.env.SPOTIFY_CLIENT_ID,
    spotifySecret: process.env.SPOTIFY_CLIENT_SECRET,
    youtubeApiKey: process.env.YOUTUBE_API_KEY,
  });
  console.log('RESULT:', r);
}