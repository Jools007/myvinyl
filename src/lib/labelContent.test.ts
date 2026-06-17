import { describe, expect, it } from 'vitest';
import {
  LABEL_DESCRIPTION_MAX,
  resolveDefaultStickerDescription,
  resolveStickerDescription,
} from './labelContent';
import type { VinylRecord } from './types';

const record = {
  id: 'r1',
  artist: 'Artist',
  title: 'Album',
  genres: ['House'],
  condition: 'NM',
  addedAt: '2026-01-01T00:00:00.000Z',
  tracks: [],
} satisfies VinylRecord;

describe('resolveStickerDescription', () => {
  it('prefers manual label copy over album description', () => {
    const text = resolveStickerDescription(
      { ...record, labelDescription: 'Manual note' },
      { baseDescription: 'Album blurb from Last.fm' }
    );
    expect(text).toBe('Manual note');
  });

  it('uses album description when no manual copy exists', () => {
    const base = 'A'.repeat(300);
    const text = resolveStickerDescription(record, { baseDescription: base });
    expect(text).toHaveLength(LABEL_DESCRIPTION_MAX);
    expect(text).toBe(base.slice(0, LABEL_DESCRIPTION_MAX));
  });

  it('falls back to metadata when album copy is missing', () => {
    const withMeta = {
      ...record,
      format: 'LP',
      year: '2015',
      genres: ['Funk / Soul', 'Rhythm & Blues'],
    };
    expect(resolveStickerDescription(withMeta)).toBe(
      'LP · 2015 · Funk / Soul, Rhythm & Blues'
    );
    expect(resolveStickerDescription(withMeta, { baseDescription: '   ' })).toBe(
      'LP · 2015 · Funk / Soul, Rhythm & Blues'
    );
  });

  it('returns blank when no manual, album, or metadata copy exists', () => {
    expect(
      resolveStickerDescription({
        ...record,
        format: undefined,
        year: undefined,
        genres: [],
      })
    ).toBe('');
  });

  it('uses draft text in modal preview mode', () => {
    const text = resolveStickerDescription(record, {
      description: 'Live draft',
      useDescriptionDraft: true,
      baseDescription: 'Album blurb',
    });
    expect(text).toBe('Live draft');
  });

  it('falls back to album description when draft is empty', () => {
    const text = resolveStickerDescription(record, {
      description: '',
      useDescriptionDraft: true,
      baseDescription: 'Album blurb',
    });
    expect(text).toBe('Album blurb');
  });

  it('falls back to metadata when draft is empty and album copy is missing', () => {
    const withMeta = {
      ...record,
      format: 'LP',
      year: '2015',
      genres: ['Funk / Soul'],
    };
    const text = resolveStickerDescription(withMeta, {
      description: '',
      useDescriptionDraft: true,
    });
    expect(text).toBe('LP · 2015 · Funk / Soul');
  });
});

describe('resolveDefaultStickerDescription', () => {
  it('prefers album blurb over metadata', () => {
    const withMeta = {
      ...record,
      format: 'LP',
      year: '2015',
      genres: ['Soul'],
    };
    expect(resolveDefaultStickerDescription(withMeta, 'Live set from 1971')).toBe(
      'Live set from 1971'
    );
  });
});