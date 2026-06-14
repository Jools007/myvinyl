#!/usr/bin/env node
/**
 * Smoke-test /api/play/audio — especially excludeVideoIds (dev api-plugin parity).
 * Usage: node scripts/verify-playback-api.mjs [baseUrl]
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:5174').replace(/\/$/, '');

async function get(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} → non-JSON (${res.status}): ${text.slice(0, 120)}`);
  }
  return { status: res.status, body };
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

console.log(`Playback API verify @ ${base}`);

const teardrop = await get(
  '/api/play/audio?artist=Massive%20Attack&title=Teardrop'
);
assert(teardrop.status === 200, `Teardrop should 200, got ${teardrop.status}`);
assert(teardrop.body.videoId, 'Teardrop missing videoId');
console.log('OK Teardrop →', teardrop.body.videoId);

const cymande = await get('/api/play/audio?artist=Cymande&title=Zion%20I');
assert(cymande.status === 200, `Cymande should 200, got ${cymande.status}`);
const blocked = cymande.body.videoId;
assert(blocked, 'Cymande missing videoId');
console.log('OK Cymande →', blocked);

const cymandeAlt = await get(
  `/api/play/audio?artist=Cymande&title=Zion%20I&excludeVideoIds=${blocked}`
);
assert(cymandeAlt.status === 200, `Cymande exclude should 200, got ${cymandeAlt.status}`);
const alt = cymandeAlt.body.videoId;
assert(alt, 'Cymande exclude missing videoId');
assert(
  alt !== blocked,
  `excludeVideoIds ignored: got same videoId ${blocked} (dev api-plugin must forward excludes)`
);
console.log('OK Cymande exclude →', alt, `(≠ ${blocked})`);

console.log('\nAll playback API checks passed.');