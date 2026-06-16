#!/usr/bin/env node
/**
 * Audit guest-crate tracklist persistence in Supabase.
 *
 * Usage (service role — Supabase Dashboard → Settings → API → service_role):
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-guest-tracklists.mjs [crate-slug]
 *
 * Loads VITE_SUPABASE_URL from .env / .env.local when unset.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const slugArg = process.argv[2] ?? 'keendigger';

function loadEnv(file) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const url = process.env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_URL). Add service role key from Supabase dashboard.'
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: crates, error: crateErr } = await sb
  .from('collections')
  .select('id,name,slug,discogs_username,record_count,kind,owner_user_id')
  .or(`slug.ilike.%${slugArg}%,discogs_username.ilike.%${slugArg}%`);

if (crateErr) {
  console.error('collections query failed:', crateErr.message);
  process.exit(1);
}

if (!crates?.length) {
  const { data: guests } = await sb
    .from('collections')
    .select('id,name,slug,discogs_username,record_count')
    .eq('kind', 'guest');
  console.log('No crate matched slug/username:', slugArg);
  console.log('Guest crates in project:', guests ?? []);
  process.exit(0);
}

for (const crate of crates) {
  console.log('\n===', crate.name, `(${crate.slug})`, '===');
  console.log('id:', crate.id, '| listed count:', crate.record_count);

  const { data: rows, error: recErr } = await sb
    .from('records')
    .select('id,title,artist,discogs_id,tracklist')
    .eq('collection_id', crate.id);

  if (recErr) {
    console.error('records query failed:', recErr.message);
    continue;
  }

  const records = rows ?? [];
  let multi = 0;
  let single = 0;
  let empty = 0;
  let totalTracks = 0;
  const samples = [];

  for (const row of records) {
    const tracks = Array.isArray(row.tracklist) ? row.tracklist : [];
    const n = tracks.length;
    totalTracks += n;
    if (n === 0) empty += 1;
    else if (n === 1) single += 1;
    else {
      multi += 1;
      if (samples.length < 5) {
        samples.push({
          artist: row.artist,
          title: row.title,
          discogsId: row.discogs_id,
          tracks: n,
        });
      }
    }
  }

  console.log('records in DB:', records.length);
  console.log('total tracks in tracklist JSON:', totalTracks);
  console.log('multi-track releases (>1):', multi);
  console.log('single-track placeholder (=1):', single);
  console.log('empty tracklist (=0):', empty);
  if (samples.length) {
    console.log('sample enriched releases:');
    for (const s of samples) console.log(' ', s);
  }
}