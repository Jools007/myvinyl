/**
 * UI probe through the real Vite dev proxy — no page.route mocks.
 * Requires dev server started with RECORD_LOCATOR_FIXTURE=1.
 */
import { chromium } from 'playwright';
import path from 'path';

const scratch = process.env.RECORD_LOCATOR_SCRATCH;
if (!scratch) {
  console.error('RECORD_LOCATOR_SCRATCH env var required');
  process.exit(1);
}

if (process.env.RECORD_LOCATOR_FIXTURE !== '1') {
  console.error('RECORD_LOCATOR_FIXTURE=1 required on the dev server (not just this script)');
  process.exit(1);
}

const url = process.env.RECORD_LOCATOR_URL ?? 'http://localhost:5174/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  geolocation: { latitude: 51.5, longitude: -0.12 },
  permissions: ['geolocation'],
});
const page = await context.newPage();
const consoleErrors = [];
const proxyRequests = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('request', (req) => {
  if (req.url().includes('/api/record-locator/')) {
    proxyRequests.push({ url: req.url(), method: req.method() });
  }
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
await page.getByTestId('record-locator-launcher').click();
await page.waitForSelector('[data-testid="record-locator-modal"]');
await page.waitForSelector('[data-testid="record-locator-shop-list"] .record-locator-card');

const shopCardsLoaded = await page.locator('.record-locator-card').count();
await page.getByTestId('record-locator-open-now-filter').click();
const shopCardsFiltered = await page.locator('.record-locator-card').count();

await page.locator('.record-locator-card').nth(0).click();
await page.locator('.record-locator-card').nth(1).click();
await page.getByRole('button', { name: /Plan walking route/ }).click();
await page.waitForSelector('[data-testid="record-locator-route-result"]');

const mapPane = await page.locator('[data-testid="record-locator-map-pane"], .leaflet-container').count();
await page.screenshot({ path: path.join(scratch, 'locator-launch.png'), fullPage: true });

const result = {
  url,
  fixtureMode: true,
  proxyRequests,
  shopCardsLoaded,
  shopCardsFiltered,
  mapMarkers: mapPane,
  routeRendered: await page.getByTestId('record-locator-route-result').isVisible(),
  consoleErrors,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();

if (proxyRequests.length < 2 || shopCardsLoaded < 2 || shopCardsFiltered >= shopCardsLoaded) {
  process.exit(1);
}