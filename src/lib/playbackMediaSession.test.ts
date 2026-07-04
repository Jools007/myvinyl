import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindPlaybackMediaSessionHandlers,
  isPlaybackMediaSessionSupported,
  updatePlaybackMediaSession,
} from './playbackMediaSession';

describe('playbackMediaSession', () => {
  const originalMediaSession = navigator.mediaSession;

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: originalMediaSession,
    });
  });

  it('no-ops when Media Session is unavailable', () => {
    Reflect.deleteProperty(navigator, 'mediaSession');
    expect(isPlaybackMediaSessionSupported()).toBe(false);
    expect(() => updatePlaybackMediaSession(null)).not.toThrow();
    expect(() => bindPlaybackMediaSessionHandlers({})).not.toThrow();
  });

  it('sets metadata and playback state when supported', () => {
    class MockMediaMetadata {
      title: string;
      artist: string;
      album: string;
      artwork?: MediaImage[];

      constructor(init: MediaMetadataInit) {
        this.title = init.title ?? '';
        this.artist = init.artist ?? '';
        this.album = init.album ?? '';
        this.artwork = init.artwork;
      }
    }

    vi.stubGlobal('MediaMetadata', MockMediaMetadata);

    const setActionHandler = vi.fn();
    const session = {
      metadata: null as MediaMetadata | null,
      playbackState: 'none' as MediaSessionPlaybackState,
      setActionHandler,
    };
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: session,
    });

    updatePlaybackMediaSession(
      {
        title: 'Teardrop',
        artist: 'Massive Attack',
        album: 'Mezzanine',
        artworkUrl: '/cover.jpg',
      },
      'playing'
    );

    expect(session.playbackState).toBe('playing');
    expect(session.metadata?.title).toBe('Teardrop');
    expect(session.metadata?.artist).toBe('Massive Attack');
    expect(session.metadata?.artwork?.[0]?.src).toContain('/cover.jpg');

    const onPlay = vi.fn();
    const unbind = bindPlaybackMediaSessionHandlers({ onPlay });
    expect(setActionHandler).toHaveBeenCalledWith('play', onPlay);
    unbind();
    expect(setActionHandler).toHaveBeenCalledWith('play', null);
  });
});