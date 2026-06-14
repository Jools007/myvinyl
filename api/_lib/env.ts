import type { DiscogsOAuthCredentials } from './discogs/oauth';

export type ApiEnv = {
  discogsToken?: string;
  discogsOAuth?: DiscogsOAuthCredentials;
  spotifyId?: string;
  spotifySecret?: string;
  lastfmKey?: string;
  youtubeApiKey?: string;
};

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Server-only secrets — never use VITE_ prefix here. */
function readDiscogsOAuth(): DiscogsOAuthCredentials | undefined {
  const consumerKey = readEnv('DISCOGS_CONSUMER_KEY');
  const consumerSecret = readEnv('DISCOGS_CONSUMER_SECRET');
  if (!consumerKey || !consumerSecret) return undefined;
  return {
    consumerKey,
    consumerSecret,
    accessToken: readEnv('DISCOGS_OAUTH_ACCESS_TOKEN'),
    accessTokenSecret: readEnv('DISCOGS_OAUTH_ACCESS_TOKEN_SECRET'),
  };
}

export function getApiEnv(): ApiEnv {
  return {
    discogsToken: readEnv('DISCOGS_TOKEN'),
    discogsOAuth: readDiscogsOAuth(),
    spotifyId: readEnv('SPOTIFY_CLIENT_ID'),
    spotifySecret: readEnv('SPOTIFY_CLIENT_SECRET'),
    lastfmKey: readEnv('LASTFM_API_KEY'),
    youtubeApiKey: readEnv('YOUTUBE_API_KEY'),
  };
}

/** Log which server env vars are set (never log secret values). */
export function logApiEnvStatus(route: string): void {
  const env = getApiEnv();
  console.error(`[${route}] env configured:`, {
    DISCOGS_TOKEN: Boolean(env.discogsToken),
    DISCOGS_CONSUMER_KEY: Boolean(env.discogsOAuth?.consumerKey),
    DISCOGS_CONSUMER_SECRET: Boolean(env.discogsOAuth?.consumerSecret),
    DISCOGS_OAUTH_ACCESS_TOKEN: Boolean(env.discogsOAuth?.accessToken),
    SPOTIFY_CLIENT_ID: Boolean(env.spotifyId),
    SPOTIFY_CLIENT_SECRET: Boolean(env.spotifySecret),
    LASTFM_API_KEY: Boolean(env.lastfmKey),
    YOUTUBE_API_KEY: Boolean(env.youtubeApiKey),
  });
}