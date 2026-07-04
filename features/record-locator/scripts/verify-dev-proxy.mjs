/**
 * Exercises the shipped Vite dev proxy route (server/api-plugin.ts) end-to-end.
 * Without RECORD_LOCATOR_FIXTURE: expect 503 (handler not configured).
 * With RECORD_LOCATOR_FIXTURE=1: expect 200 + stores from fixture normalization.
 */
import fs from 'fs';
import path from 'path';

const baseUrl = process.env.RECORD_LOCATOR_URL ?? 'http://localhost:5174';
const scratch = process.env.RECORD_LOCATOR_SCRATCH;
if (!scratch) {
  console.error('RECORD_LOCATOR_SCRATCH required');
  process.exit(1);
}

const useFixture = process.env.RECORD_LOCATOR_FIXTURE === '1';
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
  `RECORD_LOCATOR_FIXTURE=${useFixture ? '1' : 'unset'}`,
  `status: ${response.status}`,
  `body: ${JSON.stringify(payload)}`,
  useFixture
    ? response.status === 200
      ? `result: fixture path — stores_returned=${Array.isArray(payload.stores) ? payload.stores.length : 0}`
      : 'result: fixture mode expected 200'
    : response.status === 503
      ? 'result: no fixture — 503 not configured (expected)'
      : 'result: no fixture — expected 503',
];

const output = `${lines.join('\n')}\n`;
console.log(output);
fs.writeFileSync(path.join(scratch, 'proxy-curl.log'), output);

const ok = useFixture ? response.status === 200 && Array.isArray(payload.stores) : response.status === 503;
if (!ok) process.exit(1);