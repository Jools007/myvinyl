import { buildSignedGetHeaders, type DiscogsOAuthCredentials } from './oauth';

const DISCOGS_API = 'https://api.discogs.com';

export type DiscogsPriceSuggestion = {
  currency: string;
  value: number;
};

export type DiscogsPriceSuggestions = Record<string, DiscogsPriceSuggestion>;

function parsePriceEntry(raw: unknown): DiscogsPriceSuggestion | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { currency: 'USD', value: raw };
  }
  if (typeof raw !== 'object') return null;
  const row = raw as { currency?: string; value?: number };
  if (typeof row.value !== 'number' || !Number.isFinite(row.value)) return null;
  return {
    currency: typeof row.currency === 'string' && row.currency.trim() ? row.currency : 'USD',
    value: row.value,
  };
}

function discogsErrorMessage(status: number, text: string): string {
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    const detail = json.message ?? json.error;
    if (detail) return detail;
  } catch {
    /* plain text */
  }
  return text.trim() || `Discogs request failed (${status})`;
}

export function normalizePriceSuggestions(payload: unknown): DiscogsPriceSuggestions {
  if (!payload || typeof payload !== 'object') return {};
  const out: DiscogsPriceSuggestions = {};
  for (const [condition, raw] of Object.entries(payload as Record<string, unknown>)) {
    const parsed = parsePriceEntry(raw);
    if (parsed) out[condition] = parsed;
  }
  return out;
}

export async function fetchDiscogsPriceSuggestions(
  releaseId: number,
  auth: {
    oauth?: DiscogsOAuthCredentials;
    token?: string;
  }
): Promise<DiscogsPriceSuggestions> {
  const url = `${DISCOGS_API}/marketplace/price_suggestions/${releaseId}`;

  const attempts: { label: string; headers: Record<string, string> }[] = [];

  if (auth.oauth?.consumerKey && auth.oauth.consumerSecret) {
    attempts.push({
      label: 'oauth',
      headers: buildSignedGetHeaders(url, auth.oauth),
    });
  }

  if (auth.token) {
    attempts.push({
      label: 'token',
      headers: {
        'User-Agent': 'MyVinyl/1.0 +https://myvinyl.app',
        Accept: 'application/vnd.discogs.v2.discogs+json',
        Authorization: `Discogs token=${auth.token}`,
      },
    });
  }

  if (attempts.length === 0) {
    throw new Error('Discogs credentials not configured');
  }

  let lastError = 'Discogs price suggestions failed';
  let saw404 = false;

  for (const attempt of attempts) {
    const res = await fetch(url, { headers: attempt.headers });
    if (res.ok) {
      const data = (await res.json()) as unknown;
      return normalizePriceSuggestions(data);
    }

    const text = await res.text();
    lastError = discogsErrorMessage(res.status, text);

    if (res.status === 401 || res.status === 403 || res.status === 404) {
      if (res.status === 404) saw404 = true;
      continue;
    }
    if (res.status === 429) {
      throw new Error('Discogs rate limit — try again shortly');
    }
    throw new Error(lastError);
  }

  if (saw404 && /seller settings/i.test(lastError)) {
    throw new Error(lastError);
  }

  if (saw404) {
    throw new Error('No marketplace price data for this release');
  }

  throw new Error(lastError);
}