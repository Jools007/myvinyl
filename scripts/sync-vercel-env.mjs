/**
 * Sync server secrets from .env / .env.local to Vercel (Production + Preview).
 * Run: node scripts/sync-vercel-env.mjs
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) out[key] = val;
  }
  return out;
}

const env = {
  ...parseEnv(resolve(root, '.env')),
  ...parseEnv(resolve(root, '.env.local')),
};

const SERVER_KEYS = [
  'DISCOGS_TOKEN',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'LASTFM_API_KEY',
  'YOUTUBE_API_KEY',
];

const BUILD_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_DISCOGS_TOKEN',
];

const TARGETS = ['production', 'preview'];

function upsert(key, value, target) {
  try {
    execSync(`npx vercel env rm ${key} ${target} --yes`, { cwd: root, stdio: 'pipe' });
  } catch {
    /* not set yet */
  }
  execSync(`npx vercel env add ${key} ${target}`, {
    cwd: root,
    input: value,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

for (const target of TARGETS) {
  console.log(`\n=== ${target} ===`);
  for (const key of [...SERVER_KEYS, ...BUILD_KEYS]) {
    const value = env[key];
    if (!value) {
      console.log(`skip ${key} (not in .env.local)`);
      continue;
    }
    upsert(key, value, target);
    console.log(`synced ${key} (${value.length} chars)`);
  }
}

console.log('\nDone. Redeploy for runtime secrets to apply: npx vercel --prod');