import type { VinylRecord } from '../../../types';

/** Canonical fixture set for QC regression (40×30 master labels). */
export const QC_FIXTURE_RECORDS = {
  full: {
    id: 'qc-full',
    artist: 'Daft Punk',
    title: 'Discovery',
    year: '2001',
    format: '2×LP',
    genres: ['Electronic', 'House'],
    condition: 'VG+',
    addedAt: '2026-01-01T00:00:00.000Z',
    notes: 'Paid £22 at Honest Jons.',
    labelDescription: 'Peak-time opener. Crisp press.',
    labelDisplay: {
      titleLayout: 'artist-album',
      showBpm: true,
      showKey: true,
      showVibes: true,
    },
    tracks: [
      {
        id: 't1',
        title: 'One More Time',
        bpm: 123,
        camelotKey: '9B',
        vibeTags: ['Peak', 'Anthem', 'French'],
        isPrimary: true,
      },
    ],
  } satisfies VinylRecord,

  minimal: {
    id: 'qc-minimal',
    artist: 'Unknown',
    title: 'Untitled',
    genres: [],
    condition: 'NM',
    addedAt: '2026-01-01T00:00:00.000Z',
    tracks: [],
  } satisfies VinylRecord,

  longTitle: {
    id: 'qc-long',
    artist: 'The Alan Parsons Project',
    title: 'Tales of Mystery and Imagination Edgar Allan Poe',
    year: '1976',
    format: 'LP',
    genres: ['Progressive Rock'],
    condition: 'VG',
    addedAt: '2026-01-01T00:00:00.000Z',
    tracks: [
      { id: 't1', title: 'A Dream Within a Dream', vibeTags: [], isPrimary: true },
    ],
  } satisfies VinylRecord,
} as const;

export type QcFixtureId = keyof typeof QC_FIXTURE_RECORDS;