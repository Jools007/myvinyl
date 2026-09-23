import { describe, expect, it } from 'vitest';
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
    expect(parseShareToken(`/s/${token}/edit`)).toBeNull();
    expect(parseShareToken('/crates/my-crate')).toBeNull();
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
