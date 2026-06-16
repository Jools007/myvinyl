import { fetchDiscogsPriceSuggestions } from '../../api/_lib/discogs/priceSuggestions';
import type { DiscogsOAuthCredentials } from '../../api/_lib/discogs/oauth';

type DiscogsPriceEnv = {
  DISCOGS_TOKEN?: string;
  DISCOGS_CONSUMER_KEY?: string;
  DISCOGS_CONSUMER_SECRET?: string;
  DISCOGS_OAUTH_ACCESS_TOKEN?: string;
  DISCOGS_OAUTH_ACCESS_TOKEN_SECRET?: string;
};

export class PriceSuggestionsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceSuggestionsValidationError';
  }
}

export class PriceSuggestionsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceSuggestionsConfigError';
  }
}

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readDiscogsOAuth(env: DiscogsPriceEnv): DiscogsOAuthCredentials | undefined {
  const consumerKey = trimEnv(env.DISCOGS_CONSUMER_KEY);
  const consumerSecret = trimEnv(env.DISCOGS_CONSUMER_SECRET);
  if (!consumerKey || !consumerSecret) return undefined;
  return {
    consumerKey,
    consumerSecret,
    accessToken: trimEnv(env.DISCOGS_OAUTH_ACCESS_TOKEN),
    accessTokenSecret: trimEnv(env.DISCOGS_OAUTH_ACCESS_TOKEN_SECRET),
  };
}

export async function handleDiscogsPriceSuggestions(env: DiscogsPriceEnv, releaseId: number) {
  const oauth = readDiscogsOAuth(env);
  const token = trimEnv(env.DISCOGS_TOKEN);

  if (!oauth && !token) {
    throw new PriceSuggestionsConfigError(
      'Discogs OAuth not configured (DISCOGS_CONSUMER_KEY / DISCOGS_CONSUMER_SECRET)'
    );
  }

  const suggestions = await fetchDiscogsPriceSuggestions(releaseId, { oauth, token });

  return {
    releaseId,
    suggestions,
    currency: Object.values(suggestions)[0]?.currency ?? 'USD',
  };
}

export function parsePriceSuggestionsReleaseId(raw: string | null | undefined): number {
  const releaseId = parseInt(raw ?? '', 10);
  if (!Number.isFinite(releaseId) || releaseId <= 0) {
    throw new PriceSuggestionsValidationError('Valid releaseId required');
  }
  return releaseId;
}

export function priceSuggestionsErrorStatus(message: string): number {
  if (message.includes('rate limit')) return 429;
  if (message.includes('not found') || message.includes('No marketplace price data')) return 404;
  if (message.includes('not configured')) return 503;
  return 502;
}