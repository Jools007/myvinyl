/**
 * Exercises the shipped Vite dev proxy route (server/api-plugin.ts) end-to-end.
 * Default dev (no API key): auto-fixture → expect 200 + stores.
 * RECORD_LOCATOR_STRICT_LIVE=1: expect 503 (start dev with RECORD_LOCATOR_FIXTURE=0 and no key).
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
const body = { latitude: 51.5074, longitude: -0.1278, radiusMeters: 3000 };
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

const lines = [
  `POST ${baseUrl}/api/record-locator/places`,
  `RECORD_LOCATOR_STRICT_LIVE=${strictLive ? '1' : 'unset'}`,
  `status: ${response.status}`,
  `body: ${JSON.stringify(payload)}`,
  strictLive
    ? response.status === 503
      ? 'result: strict live — 503 not configured (expected)'
      : 'result: strict live — expected 503'
    : response.status === 200 && Array.isArray(payload.stores)
      ? `result: dev auto-fixture — stores_returned=${payload.stores.length}`
      : 'result: dev default — expected 200 + stores',
];

const output = `${lines.join('\n')}\n`;
console.log(output);
fs.writeFileSync(path.join(scratch, 'proxy-curl.log'), output);

const ok = strictLive
  ? response.status === 503
  : response.status === 200 && Array.isArray(payload.stores);
if (!ok) process.exit(1);