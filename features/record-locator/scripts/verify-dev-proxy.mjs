/**
 * Exercises the shipped Vite dev proxy route (server/api-plugin.ts) end-to-end.
 * Default: expect 200 + real OSM-backed stores near the probe coordinates.
 * RECORD_LOCATOR_STRICT_LIVE=1: expect 502/503 when dev has RECORD_LOCATOR_FIXTURE=0 and no Google key.
 */
import fs from 'fs';
import path from 'path';

const baseUrl = process.env.RECORD_LOCATOR_URL ?? 'http://localhost:5174';
const scratch = process.env.RECORD_LOCATOR_SCRATCH;
if (!scratch) {
  console.error('RECORD_LOCATOR_SCRATCH required');
  process.exit(1);
}

const strictLive = process.env.RECORD_LOCATOR_STRICT_LIVE === '1';
const body = { latitude: 54.6872, longitude: 25.2797, radiusMeters: 12000 };
const response = await fetch(`${baseUrl}/api/record-locator/places`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

const storeCount = Array.isArray(payload.stores) ? payload.stores.length : 0;
const lines = [
  `POST ${baseUrl}/api/record-locator/places`,
  `probe: Vilnius (${body.latitude}, ${body.longitude})`,
  `RECORD_LOCATOR_STRICT_LIVE=${strictLive ? '1' : 'unset'}`,
  `status: ${response.status}`,
  `source: ${payload.meta?.source ?? 'unknown'}`,
  `location: ${payload.meta?.locationLabel ?? 'n/a'}`,
  `stores_returned: ${storeCount}`,
  strictLive
    ? response.status >= 500
      ? 'result: strict live — error expected without Google key'
      : 'result: strict live — expected failure without Google key'
    : response.status === 200 && storeCount > 0
      ? `result: local OSM/Google search — first=${payload.stores?.[0]?.name ?? 'n/a'}`
      : 'result: expected 200 + local stores',
];

const output = `${lines.join('\n')}\n`;
console.log(output);
fs.writeFileSync(path.join(scratch, 'proxy-curl.log'), output);

const ok = strictLive
  ? response.status >= 500
  : response.status === 200 && storeCount > 0;
if (!ok) process.exit(1);