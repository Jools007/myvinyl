import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAlbumDescriptionCache,
  fetchAlbumCharacterDescription,
  registerCharacterBlurbPersister,
} from './albumDescription';
import type { VinylRecord } from './types';

vi.mock('./api', () => ({
  cleanAlbumText: (text: string) => text.trim(),
  fetchAlbumCharacter: vi.fn(async () => ({
    description: 'Classic dub reggae vibes with smooth soulful beats.',
    tags: ['dub'],
    sources: ['wikipedia'],
  })),
}));

const persistedId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

const source = {
  id: persistedId,
  artist: 'The Congos',
  title: 'Heart of the Congos',
  year: '1977',
  genres: ['Reggae'],
} satisfies Pick<
  VinylRecord,
  'id' | 'artist' | 'title' | 'year' | 'genres' | 'characterBlurb'
>;

describe('albumDescription auto-persist', () => {
  beforeEach(() => {
    clearAlbumDescriptionCache();
    registerCharacterBlurbPersister(null);
  });

  afterEach(() => {
    registerCharacterBlurbPersister(null);
    clearAlbumDescriptionCache();
  });

  it('persists the first resolved blurb for saved records', async () => {
    const persist = vi.fn();
    registerCharacterBlurbPersister(persist);

    const text = await fetchAlbumCharacterDescription(source);

    expect(text).toContain('Classic dub reggae');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(source, text);
  });

  it('does not persist draft ids from the add modal', async () => {
    const persist = vi.fn();
    registerCharacterBlurbPersister(persist);

    await fetchAlbumCharacterDescription({
      ...source,
      id: '1234567',
    });

    expect(persist).not.toHaveBeenCalled();
  });

  it('skips persist when characterBlurb is already stored', async () => {
    const persist = vi.fn();
    registerCharacterBlurbPersister(persist);

    await fetchAlbumCharacterDescription({
      ...source,
      characterBlurb: 'Already saved copy.',
    });

    expect(persist).not.toHaveBeenCalled();
  });
});