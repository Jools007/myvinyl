import { describe, expect, it } from 'vitest';
import { buildAppHref, parseAppLocation } from './appRoute';
import {
  generateShareToken,
  isShareToken,
  parseShareToken,
  shareAbsoluteUrl,
  sharePath,
} from './shareRoute';

describe('share routes', () => {
  it('parses a public share path and ignores other routes', () => {
    const token = 'abcdefghijklmnopqrstuvwx';
    expect(parseShareToken(`/s/${token}`)).toBe(token);
    expect(parseShareToken(`/s/${token}/`)).toBe(token);
    expect(parseShareToken('/collection')).toBeNull();
    expect(parseShareToken('/s/short')).toBeNull();
    expect(parseShareToken(`/s/${token}/insights`)).toBe(token);
    expect(parseShareToken(`/s/${token}/play`)).toBe(token);
    expect(parseShareToken('/s/short/insights')).toBeNull();
    expect(parseShareToken('/crates/my-crate')).toBeNull();
  });

  it('keeps share subpages inside the shared app shell', () => {
    const token = 'abcdefghijklmnopqrstuvwx';
    const recordId = '11111111-1111-4111-8111-111111111111';
    const trackId = '22222222-2222-4222-8222-222222222222';

    expect(buildAppHref(parseAppLocation(`/s/${token}`))).toBe(`/s/${token}`);
    expect(buildAppHref(parseAppLocation(`/s/${token}/insights`))).toBe(`/s/${token}/insights`);
    expect(buildAppHref(parseAppLocation(`/s/${token}/labels`))).toBe(`/s/${token}/labels`);
    expect(parseAppLocation(`/s/${token}/play`).page).toBe('play');
    expect(parseAppLocation(`/s/${token}/play`).shareToken).toBe(token);
    expect(parseAppLocation('/collection').shareToken).toBeNull();

    const play = parseAppLocation(
      `/s/${token}/play/${recordId}/${trackId}`,
      `?release=${recordId}&edit=1`
    );
    expect(play.page).toBe('play');
    expect(play.playSelection).toEqual({ recordId, trackId });
    expect(play.releaseId).toBe(recordId);
    expect(play.releaseEdit).toBe(false);
    expect(buildAppHref(play)).toBe(
      `/s/${token}/play/${recordId}/${trackId}?release=${recordId}`
    );
  });

  it('builds an absolute share URL', () => {
    const token = 'abcdefghijklmnopqrstuvwx';
    expect(sharePath(token)).toBe(`/s/${token}`);
    expect(shareAbsoluteUrl(token, 'http://127.0.0.1:5174')).toBe(
      `http://127.0.0.1:5174/s/${token}`
    );
  });

  it('generates a URL-safe token', () => {
    const token = generateShareToken();
    expect(isShareToken(token)).toBe(true);
    expect(token).not.toMatch(/[+/=]/);
  });
});
