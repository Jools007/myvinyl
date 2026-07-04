import { afterEach, describe, expect, it, vi } from 'vitest';
import { isIOSPlaybackPrimed, primeIOSAudioSession } from './iosPlaybackEngine';

describe('iosPlaybackEngine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not prime on desktop user agents', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15'
    );
    primeIOSAudioSession({ title: 'A', artist: 'B', album: 'C' });
    expect(isIOSPlaybackPrimed()).toBe(false);
  });
});