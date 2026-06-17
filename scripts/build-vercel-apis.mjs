/**
 * Bundle Vercel serverless routes into single .js files under api/.
 * Source lives in scripts/api-entries/ so Vercel does not count them as extra functions.
 */
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const routes = [
  { entry: 'scripts/api-entries/play/audio.entry.ts', outfile: 'api/play/audio.js' },
  { entry: 'scripts/api-entries/spotify/audio.entry.ts', outfile: 'api/spotify/audio.js' },
  { entry: 'scripts/api-entries/lastfm/vibe.entry.ts', outfile: 'api/lastfm/vibe.js' },
  { entry: 'scripts/api-entries/lastfm/similar.entry.ts', outfile: 'api/lastfm/similar.js' },
  { entry: 'scripts/api-entries/discogs/collection.entry.ts', outfile: 'api/discogs/collection.js' },
  {
    entry: 'scripts/api-entries/discogs/price-suggestions.entry.ts',
    outfile: 'api/discogs/price-suggestions.js',
  },
  { entry: 'scripts/api-entries/image.entry.ts', outfile: 'api/image.js' },
  { entry: 'scripts/api-entries/album-info.entry.ts', outfile: 'api/album-info.js' },
  {
    entry: 'scripts/api-entries/album-character.entry.ts',
    outfile: 'api/album-character.js',
  },
  { entry: 'scripts/api-entries/enrich.entry.ts', outfile: 'api/enrich.js' },
];

for (const { entry, outfile } of routes) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(root, outfile),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    logLevel: 'info',
    banner: {
      js: `// Bundled for Vercel — edit ${entry} and npm run build`,
    },
  });

  if (result.errors.length) {
    process.exit(1);
  }

  console.log(`Bundled ${entry} → ${outfile}`);
}