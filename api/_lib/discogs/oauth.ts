import crypto from 'crypto';

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function signingKey(consumerSecret: string, tokenSecret = ''): string {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
}

export type DiscogsOAuthCredentials = {
  consumerKey: string;
  consumerSecret: string;
  accessToken?: string;
  accessTokenSecret?: string;
};

export function signDiscogsOAuthRequest(opts: {
  method: string;
  url: string;
  credentials: DiscogsOAuthCredentials;
  queryParams?: Record<string, string>;
}): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: opts.credentials.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
  };

  if (opts.credentials.accessToken) {
    oauthParams.oauth_token = opts.credentials.accessToken;
  }

  const allParams = { ...oauthParams, ...(opts.queryParams ?? {}) };
  const paramString = Object.keys(allParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join('&');

  const baseUrl = opts.url.split('?')[0];
  const signatureBase = [
    opts.method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join('&');

  const signature = crypto
    .createHmac('sha1', signingKey(opts.credentials.consumerSecret, opts.credentials.accessTokenSecret))
    .update(signatureBase)
    .digest('base64');

  return { ...oauthParams, oauth_signature: signature };
}

export function buildOAuthAuthorizationHeader(params: Record<string, string>): string {
  const header = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(params[key])}"`)
    .join(', ');
  return `OAuth ${header}`;
}

export function buildSignedGetHeaders(
  url: string,
  credentials: DiscogsOAuthCredentials
): Record<string, string> {
  const oauthParams = signDiscogsOAuthRequest({
    method: 'GET',
    url,
    credentials,
  });
  return {
    'User-Agent': 'MyVinyl/1.0 +https://myvinyl.app',
    Accept: 'application/vnd.discogs.v2.discogs+json',
    Authorization: buildOAuthAuthorizationHeader(oauthParams),
  };
}