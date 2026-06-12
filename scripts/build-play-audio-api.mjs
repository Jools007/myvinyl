/**
 * Bundle api/play/audio.entry.ts → api/play/audio.js for Vercel.
 * Vercel serverless only ships the route file; _lib helpers are not resolved at runtime
 * unless inlined. esbuild produces one deployable module.
 */
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'api/play/audio.entry.ts');
const outfile = path.join(root, 'api/play/audio.js');

const result = await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  logLevel: 'info',
  banner: {
    js: '// Bundled for Vercel — edit api/play/audio.entry.ts and api/_lib/play-audio/*, then npm run build',
  },
});

if (result.errors.length) {
  process.exit(1);
}

console.log(`Bundled play-audio API → ${path.relative(root, outfile)}`);